// Service worker: relays the keyboard command / toolbar action to the
// active tab's content script. Works the same in Chrome, Edge and Firefox.

const api = typeof browser !== "undefined" ? browser : chrome;

async function sendToActiveTab(message) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await api.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // The content script may not be present (e.g. the page was open before
    // the extension was installed, or it is a restricted page). Try to
    // inject it on demand, then retry.
    try {
      await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await api.tabs.sendMessage(tab.id, message);
    } catch (err) {
      // Restricted page (chrome://, addons gallery, PDF viewer, etc.).
    }
  }
}

api.commands.onCommand.addListener((command) => {
  if (command === "toggle-search") sendToActiveTab({ action: "toggle" });
});
