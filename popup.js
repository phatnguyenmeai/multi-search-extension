// Popup: quick launcher + settings for the highlight palette and Ctrl+F behaviour.

const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULT_PALETTE = [
  "#ffd54f", "#80d8ff", "#ff8a80", "#b9f6ca",
  "#ea80fc", "#ffab40", "#84ffff", "#f48fb1"
];

const paletteEl = document.getElementById("palette");
const interceptEl = document.getElementById("intercept");
const statusEl = document.getElementById("status");
const savedEl = document.getElementById("saved");

let palette = DEFAULT_PALETTE.slice();

function renderPalette() {
  paletteEl.textContent = "";
  palette.forEach((color, index) => {
    const input = document.createElement("input");
    input.type = "color";
    input.value = color;
    input.addEventListener("input", () => {
      palette[index] = input.value;
      savePalette();
    });
    paletteEl.appendChild(input);
  });
}

function savePalette() {
  api.storage.local.set({ palette }, () => {
    savedEl.textContent = "Saved";
    setTimeout(() => (savedEl.textContent = ""), 1200);
    notifyContent();
  });
}

function notifyContent() {
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].id) return;
    api.tabs.sendMessage(tabs[0].id, { action: "settings-updated" }, () => {
      void api.runtime.lastError; // ignore: content script may be absent
    });
  });
}

document.getElementById("open").addEventListener("click", () => {
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    api.tabs.sendMessage(tab.id, { action: "open" }, () => {
      if (api.runtime.lastError) {
        // Page predates the extension or is restricted — inject on demand.
        api.scripting
          .insertCSS({
            target: { tabId: tab.id, allFrames: true },
            files: ["content.css"]
          })
          .then(() =>
            api.scripting.executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: ["content.js"]
            })
          )
          .then(() => api.tabs.sendMessage(tab.id, { action: "open" }))
          .then(() => window.close())
          .catch(() => {
            statusEl.textContent = "Can't run on this page. Try a normal website.";
          });
      } else {
        window.close();
      }
    });
  });
});

document.getElementById("reset").addEventListener("click", () => {
  palette = DEFAULT_PALETTE.slice();
  renderPalette();
  savePalette();
});

interceptEl.addEventListener("change", () => {
  api.storage.local.set({ interceptCtrlF: interceptEl.checked }, notifyContent);
});

api.storage.local.get(["palette", "interceptCtrlF"], (data) => {
  if (Array.isArray(data.palette) && data.palette.length) palette = data.palette;
  interceptEl.checked = data.interceptCtrlF !== false;
  renderPalette();
});
