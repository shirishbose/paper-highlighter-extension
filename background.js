// background.js - Service worker for Brave Web Highlighter

// Setup context menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "web-hl-root",
    title: "Web Highlighter",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    parentId: "web-hl-root",
    id: "web-hl-yellow",
    title: "Highlight (Yellow)",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    parentId: "web-hl-root",
    id: "web-hl-green",
    title: "Highlight (Green)",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    parentId: "web-hl-root",
    id: "web-hl-blue",
    title: "Highlight (Blue)",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    parentId: "web-hl-root",
    id: "web-hl-pink",
    title: "Highlight (Pink)",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    parentId: "web-hl-root",
    id: "web-hl-comment",
    title: "Highlight & Add Note...",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  const colorMap = {
    "web-hl-yellow": "yellow",
    "web-hl-green": "green",
    "web-hl-blue": "blue",
    "web-hl-pink": "pink"
  };

  if (colorMap[info.menuItemId]) {
    chrome.tabs.sendMessage(tab.id, {
      action: "HIGHLIGHT_SELECTION",
      color: colorMap[info.menuItemId],
      openComment: false
    }).catch(() => {});
  } else if (info.menuItemId === "web-hl-comment") {
    chrome.tabs.sendMessage(tab.id, {
      action: "HIGHLIGHT_SELECTION",
      color: "yellow",
      openComment: true
    }).catch(() => {});
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "highlight_selection") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "HIGHLIGHT_SELECTION",
          color: "yellow"
        }).catch(() => {});
      }
    });
  } else if (command === "toggle_sidebar") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "TOGGLE_SIDEBAR"
        }).catch(() => {});
      }
    });
  }
});

// Update badge count
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "UPDATE_BADGE") {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      const count = message.count || 0;
      const text = count > 0 ? String(count) : "";
      chrome.action.setBadgeText({ tabId, text });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563EB" });
    }
    sendResponse({ success: true });
  }
});
