// Multi Search content script.
// Runs in every frame. Intercepts Ctrl+F, shows a multi-term search bar in
// the top frame, and highlights every term in its own colour across the main
// document, open Shadow DOM, and same-/cross-origin iframes.
// Cross-browser: Chrome, Edge and Firefox.

(function () {
  if (window.__multiSearchInjected) return;
  window.__multiSearchInjected = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const IS_TOP = window.top === window.self;

  const PANEL_ID = "multi-search-panel";
  const HL_CLASS = "multi-search-hl";
  const CURRENT_CLASS = "multi-search-current";
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "SELECT",
    "IFRAME", "FRAME", "OBJECT", "EMBED"
  ]);

  const DEFAULT_PALETTE = [
    "#ffd54f", "#80d8ff", "#ff8a80", "#b9f6ca",
    "#ea80fc", "#ffab40", "#84ffff", "#f48fb1"
  ];

  const settings = {
    palette: DEFAULT_PALETTE.slice(),
    interceptCtrlF: true
  };

  // Per-frame highlight state.
  const local = {
    matches: []   // highlight spans in this frame, in document order
  };

  let myFrameId = IS_TOP ? 0 : null;

  // ---- frame messaging helpers --------------------------------------------

  function sendBroadcast(payload) {
    api.runtime.sendMessage({ action: "ms-broadcast", payload }, () => {
      void api.runtime.lastError;
    });
  }

  function sendToTop(payload) {
    api.runtime.sendMessage({ action: "ms-to-top", payload }, () => {
      void api.runtime.lastError;
    });
  }

  if (!IS_TOP) {
    api.runtime.sendMessage({ action: "ms-whoami" }, (resp) => {
      if (api.runtime.lastError) return;
      if (resp && typeof resp.frameId === "number") myFrameId = resp.frameId;
    });
  }

  // ---- settings persistence -----------------------------------------------

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
          if (IS_TOP) {
            if (typeof data.matchCase === "boolean") state.matchCase = data.matchCase;
            if (typeof data.wholeWord === "boolean") state.wholeWord = data.wholeWord;
            if (Array.isArray(data.lastTerms) && data.lastTerms.length) {
              state.terms = data.lastTerms.map((t, i) => ({
                query: typeof t.query === "string" ? t.query : "",
                color: typeof t.color === "string" ? t.color : nextColor(i),
                enabled: t.enabled !== false
              }));
            }
          }
          resolve();
        }
      );
    });
  }

  function nextColor(index) {
    return settings.palette[index % settings.palette.length];
  }

  // ---- highlight engine (per frame) ---------------------------------------

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildRegex(query, options) {
    let pattern = escapeRegExp(query);
    if (options.wholeWord) pattern = "\\b" + pattern + "\\b";
    return new RegExp(pattern, "g" + (options.matchCase ? "" : "i"));
  }

  function textColorFor(hex) {
    const c = hex.replace("#", "");
    if (c.length < 6) return "#101010";
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#101010" : "#ffffff";
  }

  // Recursively gather text nodes, descending into open shadow roots.
  function gatherTextNodes(root, out) {
    for (let child = root.firstChild; child; child = child.nextSibling) {
      const type = child.nodeType;
      if (type === Node.TEXT_NODE) {
        const value = child.nodeValue;
        if (value && value.trim()) {
          const parent = child.parentElement;
          if (parent && !SKIP_TAGS.has(parent.nodeName)) out.push(child);
        }
      } else if (type === Node.ELEMENT_NODE) {
        if (SKIP_TAGS.has(child.nodeName)) continue;
        if (child.id === PANEL_ID) continue;
        if (child.isContentEditable) continue;
        if (child.shadowRoot) gatherTextNodes(child.shadowRoot, out);
        gatherTextNodes(child, out);
      }
    }
  }

  function clearHighlights() {
    const parents = new Set();
    local.matches.forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parents.add(parent);
    });
    parents.forEach((p) => p.normalize());
    local.matches = [];
  }

  // Searches this frame's document; returns { total, counts } where counts is
  // indexed by the global term index supplied by the top frame.
  function runLocalSearch(terms, options) {
    clearHighlights();

    const counts = terms.map(() => 0);
    const active = terms
      .map((term, index) => ({ term, index }))
      .filter((x) => x.term.enabled !== false && String(x.term.query).trim() !== "");

    if (active.length === 0) return { total: 0, counts };

    let compiled;
    try {
      compiled = active.map((x) => ({
        regex: buildRegex(x.term.query, options),
        color: x.term.color,
        termIndex: x.index
      }));
    } catch (e) {
      return { total: 0, counts };
    }

    const root = document.body || document.documentElement;
    if (!root) return { total: 0, counts };

    const textNodes = [];
    gatherTextNodes(root, textNodes);

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

      // Keep the earliest, longest match when terms overlap.
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
        local.matches.push(span);
        counts[mm.termIndex]++;
        pos = mm.end;
      });
      if (pos < text.length) {
        frag.appendChild(document.createTextNode(text.slice(pos)));
      }
      node.parentNode.replaceChild(frag, node);
    });

    return { total: local.matches.length, counts };
  }

  function clearLocalCurrent() {
    local.matches.forEach((el) => el.classList.remove(CURRENT_CLASS));
  }

  function applyLocalCurrent(localIndex) {
    clearLocalCurrent();
    if (localIndex < 0 || localIndex >= local.matches.length) return;
    const el = local.matches[localIndex];
    el.classList.add(CURRENT_CLASS);
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }

  // ============ TOP-FRAME-ONLY CODE: panel UI + frame coordination =========

  const state = {
    open: false,
    terms: [],
    matchCase: false,
    wholeWord: false
  };

  // frameId -> { token, total, counts }
  const frameResults = new Map();
  let searchToken = 0;
  let navCursor = 0;
  let initialCurrentDone = false;

  let panel = null;
  let rowsEl = null;
  let searchTimer = null;

  function persist() {
    api.storage.local.set({
      lastTerms: state.terms,
      matchCase: state.matchCase,
      wholeWord: state.wholeWord
    });
  }

  function searchOptions() {
    return { matchCase: state.matchCase, wholeWord: state.wholeWord };
  }

  function broadcastSearch() {
    searchToken++;
    frameResults.clear();
    navCursor = 0;
    initialCurrentDone = false;
    sendBroadcast({
      type: "search",
      token: searchToken,
      terms: state.terms,
      options: searchOptions()
    });
    updateCounts();
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(broadcastSearch, 180);
  }

  function navOrder() {
    return Array.from(frameResults.keys())
      .filter((f) => (frameResults.get(f).total || 0) > 0)
      .sort((a, b) => a - b);
  }

  function aggregate() {
    const perTerm = state.terms.map(() => 0);
    let total = 0;
    frameResults.forEach((r) => {
      total += r.total || 0;
      (r.counts || []).forEach((c, i) => {
        if (i < perTerm.length) perTerm[i] += c;
      });
    });
    return { perTerm, total };
  }

  function step(delta) {
    const order = navOrder();
    const total = order.reduce((s, f) => s + frameResults.get(f).total, 0);
    if (total === 0) return;
    navCursor = (navCursor + delta + total) % total;

    let acc = 0;
    for (const frameId of order) {
      const frameTotal = frameResults.get(frameId).total;
      if (navCursor < acc + frameTotal) {
        sendBroadcast({
          type: "set-current",
          frameId: frameId,
          localIndex: navCursor - acc
        });
        break;
      }
      acc += frameTotal;
    }
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
        <button class="ms-add" id="ms-add" title="Add search term (Ctrl+=)">+ Add search term</button>
      </div>`;

    document.documentElement.appendChild(panel);
    rowsEl = panel.querySelector("#ms-rows");

    panel.querySelector("#ms-close").addEventListener("click", closePanel);
    panel.querySelector("#ms-prev").addEventListener("click", () => step(-1));
    panel.querySelector("#ms-next").addEventListener("click", () => step(1));
    panel.querySelector("#ms-add").addEventListener("click", addTermAndFocus);

    panel.querySelectorAll(".ms-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const opt = btn.dataset.opt;
        state[opt] = !state[opt];
        syncOptButtons();
        persist();
        broadcastSearch();
      });
    });

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
        broadcastSearch();
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
        broadcastSearch();
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
        broadcastSearch();
      });

      row.append(enabled, input, color, count, remove);
      rowsEl.appendChild(row);
    });
    updateCounts();
  }

  function updateCounts() {
    if (!panel) return;
    const { perTerm, total } = aggregate();
    rowsEl.querySelectorAll(".ms-count").forEach((el) => {
      const i = parseInt(el.dataset.index, 10);
      el.textContent = String(perTerm[i] || 0);
    });
    const totalEl = panel.querySelector("#ms-total");
    totalEl.textContent = total === 0
      ? "0 matches"
      : (navCursor + 1) + " / " + total;
  }

  // Append a fresh term and put the cursor in it. Used by the footer button
  // and the Ctrl+= shortcut; only meaningful while the panel is open.
  function addTermAndFocus() {
    if (!IS_TOP || !state.open) return;
    addTerm("");
    renderRows();
    const inputs = rowsEl.querySelectorAll(".ms-input");
    if (inputs.length) {
      const last = inputs[inputs.length - 1];
      last.focus();
      last.scrollIntoView({ block: "nearest" });
    }
    persist();
  }

  function openPanel() {
    if (!IS_TOP) return;
    if (!panel) buildPanel();
    if (state.terms.length === 0) addTerm("");
    panel.classList.add("ms-visible");
    state.open = true;
    syncOptButtons();
    renderRows();
    broadcastSearch();
    const first = rowsEl.querySelector(".ms-input");
    if (first) { first.focus(); first.select(); }
  }

  function closePanel() {
    if (!IS_TOP) return;
    state.open = false;
    if (panel) panel.classList.remove("ms-visible");
    sendBroadcast({ type: "clear" });
    persist();
  }

  function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
  }

  // ---- top-frame: handle results coming back from frames ------------------

  function handleFrameMessage(frameId, payload) {
    if (!IS_TOP || !payload) return;

    if (payload.type === "result") {
      if (payload.token !== searchToken) return;
      frameResults.set(frameId, {
        token: payload.token,
        total: payload.total || 0,
        counts: payload.counts || []
      });
      updateCounts();
      if (!initialCurrentDone) {
        const { total } = aggregate();
        if (total > 0) {
          initialCurrentDone = true;
          navCursor = 0;
          const order = navOrder();
          if (order.length) {
            sendBroadcast({ type: "set-current", frameId: order[0], localIndex: 0 });
          }
        }
      }
    } else if (payload.type === "open-panel") {
      openPanel();
    } else if (payload.type === "add-term") {
      addTermAndFocus();
    } else if (payload.type === "close-panel") {
      closePanel();
    }
  }

  // ============ ALL FRAMES: search execution + keyboard ====================

  function handleBroadcast(payload) {
    if (!payload) return;
    if (payload.type === "search") {
      const result = runLocalSearch(payload.terms, payload.options);
      sendToTop({
        type: "result",
        token: payload.token,
        total: result.total,
        counts: result.counts
      });
    } else if (payload.type === "set-current") {
      if (payload.frameId === myFrameId) applyLocalCurrent(payload.localIndex);
      else clearLocalCurrent();
    } else if (payload.type === "clear") {
      clearHighlights();
    }
  }

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
        if (IS_TOP) openPanel();
        else sendToTop({ type: "open-panel" });
        return;
      }

      // Ctrl+= (or numpad +) adds a new search term. Only acted on while the
      // panel is open, so the browser's zoom shortcut is left alone otherwise.
      const isAddTerm =
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey && !e.altKey &&
        (e.key === "=" || e.key === "+");

      if (isAddTerm) {
        if (IS_TOP) {
          if (!state.open) return;
          e.preventDefault();
          e.stopPropagation();
          addTermAndFocus();
        } else {
          sendToTop({ type: "add-term" });
        }
        return;
      }

      if (e.key === "Escape") {
        if (IS_TOP) {
          if (state.open) closePanel();
        } else {
          sendToTop({ type: "close-panel" });
        }
      }
    },
    true
  );

  // ---- messaging -----------------------------------------------------------

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return;

    if (msg.action === "ms-frame") {
      handleBroadcast(msg.payload);
    } else if (msg.action === "ms-from-frame") {
      handleFrameMessage(msg.frameId, msg.payload);
    } else if (msg.action === "toggle") {
      if (IS_TOP) togglePanel();
    } else if (msg.action === "open") {
      if (IS_TOP) openPanel();
    } else if (msg.action === "settings-updated") {
      loadSettings().then(() => {
        if (IS_TOP && state.open) broadcastSearch();
      });
    }
    sendResponse({ ok: true });
    return true;
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.palette) {
      settings.palette = changes.palette.newValue || DEFAULT_PALETTE.slice();
    }
    if (changes.interceptCtrlF) {
      settings.interceptCtrlF = changes.interceptCtrlF.newValue !== false;
    }
  });

  loadSettings();
})();
