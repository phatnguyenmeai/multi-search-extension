// Multi Search content script.
// Intercepts Ctrl+F, shows a multi-term search bar, and highlights every
// term in its own colour. Cross-browser: Chrome, Edge and Firefox.

(function () {
  if (window.__multiSearchInjected) return;
  window.__multiSearchInjected = true;

  const api = typeof browser !== "undefined" ? browser : chrome;

  const PANEL_ID = "multi-search-panel";
  const HL_CLASS = "multi-search-hl";
  const CURRENT_CLASS = "multi-search-current";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "SELECT"]);

  const DEFAULT_PALETTE = [
    "#ffd54f", "#80d8ff", "#ff8a80", "#b9f6ca",
    "#ea80fc", "#ffab40", "#84ffff", "#f48fb1"
  ];

  const settings = {
    palette: DEFAULT_PALETTE.slice(),
    interceptCtrlF: true
  };

  const state = {
    open: false,
    terms: [],            // [{ query, color, enabled }]
    matchCase: false,
    wholeWord: false,
    matches: [],          // highlight spans in DOM order
    currentIndex: -1
  };

  let panel = null;
  let rowsEl = null;
  let searchTimer = null;

  // ---- settings persistence ------------------------------------------------

  function loadSettings() {
    return new Promise((resolve) => {
      api.storage.local.get(
        ["palette", "interceptCtrlF", "lastTerms", "matchCase", "wholeWord"],
        (data) => {
          if (Array.isArray(data.palette) && data.palette.length) {
            settings.palette = data.palette;
          }
          if (typeof data.interceptCtrlF === "boolean") {
            settings.interceptCtrlF = data.interceptCtrlF;
          }
          if (typeof data.matchCase === "boolean") state.matchCase = data.matchCase;
          if (typeof data.wholeWord === "boolean") state.wholeWord = data.wholeWord;
          if (Array.isArray(data.lastTerms) && data.lastTerms.length) {
            state.terms = data.lastTerms.map((t, i) => ({
              query: typeof t.query === "string" ? t.query : "",
              color: typeof t.color === "string" ? t.color : nextColor(i),
              enabled: t.enabled !== false
            }));
          }
          resolve();
        }
      );
    });
  }

  function persist() {
    api.storage.local.set({
      lastTerms: state.terms,
      matchCase: state.matchCase,
      wholeWord: state.wholeWord
    });
  }

  function nextColor(index) {
    return settings.palette[index % settings.palette.length];
  }

  // ---- highlighting --------------------------------------------------------

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildRegex(query) {
    let pattern = escapeRegExp(query);
    if (state.wholeWord) pattern = "\\b" + pattern + "\\b";
    return new RegExp(pattern, "g" + (state.matchCase ? "" : "i"));
  }

  function textColorFor(hex) {
    const c = hex.replace("#", "");
    if (c.length < 6) return "#000";
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#101010" : "#ffffff";
  }

  function clearHighlights() {
    const spans = document.querySelectorAll("span." + HL_CLASS);
    const parents = new Set();
    spans.forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parents.add(parent);
    });
    parents.forEach((p) => p.normalize());
    state.matches = [];
    state.currentIndex = -1;
  }

  function collectTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("#" + PANEL_ID)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[contenteditable='true']")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function runSearch() {
    clearHighlights();

    const active = state.terms
      .map((term, index) => ({ term, index }))
      .filter((x) => x.term.enabled && x.term.query.trim() !== "");

    if (active.length === 0) {
      updateCounts();
      return;
    }

    let compiled;
    try {
      compiled = active.map((x) => ({
        regex: buildRegex(x.term.query),
        color: x.term.color,
        termIndex: x.index
      }));
    } catch (e) {
      updateCounts();
      return;
    }

    const textNodes = collectTextNodes();

    textNodes.forEach((node) => {
      const text = node.nodeValue;
      const found = [];

      compiled.forEach((c) => {
        c.regex.lastIndex = 0;
        let m;
        while ((m = c.regex.exec(text))) {
          if (m[0].length === 0) { c.regex.lastIndex++; continue; }
          found.push({
            start: m.index,
            end: m.index + m[0].length,
            color: c.color,
            termIndex: c.termIndex
          });
        }
      });

      if (found.length === 0) return;

      // Keep earliest, longest match when terms overlap.
      found.sort((a, b) => a.start - b.start || b.end - a.end);
      const chosen = [];
      let lastEnd = -1;
      found.forEach((mm) => {
        if (mm.start >= lastEnd) { chosen.push(mm); lastEnd = mm.end; }
      });

      const frag = document.createDocumentFragment();
      let pos = 0;
      chosen.forEach((mm) => {
        if (mm.start > pos) {
          frag.appendChild(document.createTextNode(text.slice(pos, mm.start)));
        }
        const span = document.createElement("span");
        span.className = HL_CLASS;
        span.dataset.termIndex = String(mm.termIndex);
        span.style.backgroundColor = mm.color;
        span.style.color = textColorFor(mm.color);
        span.textContent = text.slice(mm.start, mm.end);
        frag.appendChild(span);
        pos = mm.end;
      });
      if (pos < text.length) {
        frag.appendChild(document.createTextNode(text.slice(pos)));
      }
      node.parentNode.replaceChild(frag, node);
    });

    state.matches = Array.from(document.querySelectorAll("span." + HL_CLASS));
    state.currentIndex = state.matches.length ? 0 : -1;
    applyCurrent(false);
    updateCounts();
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 180);
  }

  // ---- navigation ----------------------------------------------------------

  function applyCurrent(scroll) {
    state.matches.forEach((el) => el.classList.remove(CURRENT_CLASS));
    if (state.currentIndex < 0 || state.currentIndex >= state.matches.length) return;
    const el = state.matches[state.currentIndex];
    el.classList.add(CURRENT_CLASS);
    if (scroll) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }

  function step(delta) {
    if (state.matches.length === 0) return;
    state.currentIndex =
      (state.currentIndex + delta + state.matches.length) % state.matches.length;
    applyCurrent(true);
    updateCounts();
  }

  // ---- panel UI ------------------------------------------------------------

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ms-header">
        <span class="ms-title">Multi Search</span>
        <div class="ms-tools">
          <button class="ms-opt" data-opt="matchCase" title="Match case">Aa</button>
          <button class="ms-opt" data-opt="wholeWord" title="Whole word">&#8220;ab&#8221;</button>
          <span class="ms-total" id="ms-total">0 matches</span>
          <button class="ms-nav" id="ms-prev" title="Previous (Shift+Enter)">&#9650;</button>
          <button class="ms-nav" id="ms-next" title="Next (Enter)">&#9660;</button>
          <button class="ms-close" id="ms-close" title="Close (Esc)">&#10005;</button>
        </div>
      </div>
      <div class="ms-rows" id="ms-rows"></div>
      <div class="ms-footer">
        <button class="ms-add" id="ms-add">+ Add search term</button>
      </div>`;

    document.documentElement.appendChild(panel);
    rowsEl = panel.querySelector("#ms-rows");

    panel.querySelector("#ms-close").addEventListener("click", closePanel);
    panel.querySelector("#ms-prev").addEventListener("click", () => step(-1));
    panel.querySelector("#ms-next").addEventListener("click", () => step(1));
    panel.querySelector("#ms-add").addEventListener("click", () => {
      addTerm("");
      renderRows();
      const inputs = rowsEl.querySelectorAll(".ms-input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    panel.querySelectorAll(".ms-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const opt = btn.dataset.opt;
        state[opt] = !state[opt];
        syncOptButtons();
        persist();
        runSearch();
      });
    });

    // Keep the panel from leaking page key handlers.
    panel.addEventListener("keydown", (e) => e.stopPropagation());
  }

  function syncOptButtons() {
    panel.querySelectorAll(".ms-opt").forEach((btn) => {
      btn.classList.toggle("ms-active", !!state[btn.dataset.opt]);
    });
  }

  function addTerm(query) {
    state.terms.push({
      query: query || "",
      color: nextColor(state.terms.length),
      enabled: true
    });
  }

  function renderRows() {
    rowsEl.textContent = "";
    state.terms.forEach((term, index) => {
      const row = document.createElement("div");
      row.className = "ms-row";

      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.className = "ms-enabled";
      enabled.checked = term.enabled;
      enabled.title = "Enable/disable this term";
      enabled.addEventListener("change", () => {
        term.enabled = enabled.checked;
        persist();
        runSearch();
      });

      const input = document.createElement("input");
      input.type = "text";
      input.className = "ms-input";
      input.placeholder = "Search text…";
      input.value = term.query;
      input.addEventListener("input", () => {
        term.query = input.value;
        persist();
        scheduleSearch();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          clearTimeout(searchTimer);
          if (state.matches.length === 0) runSearch();
          step(e.shiftKey ? -1 : 1);
        } else if (e.key === "Escape") {
          e.preventDefault();
          closePanel();
        }
      });

      const color = document.createElement("input");
      color.type = "color";
      color.className = "ms-color";
      color.value = term.color;
      color.title = "Highlight colour";
      color.addEventListener("input", () => {
        term.color = color.value;
        persist();
        runSearch();
      });

      const count = document.createElement("span");
      count.className = "ms-count";
      count.dataset.index = String(index);
      count.textContent = "0";

      const remove = document.createElement("button");
      remove.className = "ms-remove";
      remove.title = "Remove term";
      remove.innerHTML = "&#10005;";
      remove.addEventListener("click", () => {
        state.terms.splice(index, 1);
        if (state.terms.length === 0) addTerm("");
        renderRows();
        persist();
        runSearch();
      });

      row.append(enabled, input, color, count, remove);
      rowsEl.appendChild(row);
    });
    updateCounts();
  }

  function updateCounts() {
    if (!panel) return;
    const perTerm = state.terms.map(() => 0);
    state.matches.forEach((el) => {
      const i = parseInt(el.dataset.termIndex, 10);
      if (!Number.isNaN(i) && i < perTerm.length) perTerm[i]++;
    });
    rowsEl.querySelectorAll(".ms-count").forEach((el) => {
      const i = parseInt(el.dataset.index, 10);
      el.textContent = String(perTerm[i] || 0);
    });
    const total = state.matches.length;
    const totalEl = panel.querySelector("#ms-total");
    if (total === 0) {
      totalEl.textContent = "0 matches";
    } else {
      totalEl.textContent = (state.currentIndex + 1) + " / " + total;
    }
  }

  // ---- open / close --------------------------------------------------------

  function openPanel() {
    if (!panel) buildPanel();
    if (state.terms.length === 0) addTerm("");
    panel.classList.add("ms-visible");
    state.open = true;
    syncOptButtons();
    renderRows();
    runSearch();
    const first = rowsEl.querySelector(".ms-input");
    if (first) { first.focus(); first.select(); }
  }

  function closePanel() {
    state.open = false;
    if (panel) panel.classList.remove("ms-visible");
    clearHighlights();
    persist();
  }

  function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
  }

  // ---- keyboard interception ----------------------------------------------

  document.addEventListener(
    "keydown",
    (e) => {
      const isFind =
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey && !e.altKey &&
        (e.key === "f" || e.key === "F");

      if (isFind && settings.interceptCtrlF) {
        e.preventDefault();
        e.stopPropagation();
        openPanel();
        return;
      }
      if (e.key === "Escape" && state.open) {
        closePanel();
      }
    },
    true
  );

  // ---- messaging -----------------------------------------------------------

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return;
    if (msg.action === "toggle") togglePanel();
    else if (msg.action === "open") openPanel();
    else if (msg.action === "settings-updated") {
      loadSettings().then(() => {
        if (state.open) runSearch();
      });
    }
    sendResponse({ ok: true });
    return true;
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.palette) settings.palette = changes.palette.newValue || DEFAULT_PALETTE.slice();
    if (changes.interceptCtrlF) settings.interceptCtrlF = changes.interceptCtrlF.newValue !== false;
  });

  loadSettings();
})();
