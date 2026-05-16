// Service worker: relays the keyboard command / toolbar action to the active
// tab, and routes messages between the content scripts running in each frame
// (the top frame owns the UI; child frames highlight their own documents).
// Works the same in Chrome, Edge and Firefox.

const api = typeof browser !== "undefined" ? browser : chrome;

async function sendToActiveTab(message) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await api.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // Content script not present (page predates install, or restricted page).
    try {
      await api.scripting.insertCSS({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.css"]
      });
      await api.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.js"]
      });
      await api.tabs.sendMessage(tab.id, message);
    } catch (err) {
      // Restricted page (chrome://, add-ons gallery, PDF viewer, etc.).
    }
  }
}

api.commands.onCommand.addListener((command) => {
  if (command === "toggle-search") sendToActiveTab({ action: "toggle" });
});

// Routes frame-to-frame coordination messages.
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;
  const tabId = sender.tab && sender.tab.id;

  if (msg.action === "ms-whoami") {
    // Lets a child frame learn its own frameId.
    sendResponse({ frameId: sender.frameId });
    return true;
  }

  if (tabId == null) return;

  if (msg.action === "ms-broadcast") {
    // Deliver to every frame in the tab (including the top frame).
    api.tabs
      .sendMessage(tabId, { action: "ms-frame", payload: msg.payload })
      .catch(() => {});
  } else if (msg.action === "ms-to-top") {
    // Deliver to the top frame, tagged with the sending frame's id.
    api.tabs
      .sendMessage(
        tabId,
        { action: "ms-from-frame", frameId: sender.frameId, payload: msg.payload },
        { frameId: 0 }
      )
      .catch(() => {});
  }
});
