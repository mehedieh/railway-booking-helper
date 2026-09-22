// background.js - only job: show a system notification when the page asks for one.

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "NOTIFY") return;
  const tabId = sender.tab ? sender.tab.id : 0;
  chrome.notifications.create(`bdrail-${tabId}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: String(msg.title || "BD Rail Booking Helper"),
    message: String(msg.message || ""),
    priority: 2,
    requireInteraction: true
  });
});

// Clicking the notification jumps back to the railway tab.
chrome.notifications.onClicked.addListener(async (id) => {
  const m = /^bdrail-(\d+)-/.exec(id);
  if (m) {
    try {
      const tab = await chrome.tabs.update(Number(m[1]), { active: true });
      if (tab && tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) { /* tab was closed */ }
  }
  chrome.notifications.clear(id);
});
