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
  }
});

// Extension message dispatcher
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
    return false;
  }

  // Handle native file downloads via chrome.downloads API
  if (message.action === "DOWNLOAD_FILE") {
    const { content, filename, mimeType } = message;
    try {
      // Use data URL for reliable transfer
      const base64Data = btoa(unescape(encodeURIComponent(content || '')));
      const dataUrl = `data:${mimeType || 'text/plain;charset=utf-8'};base64,${base64Data}`;

      if (chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download({
          url: dataUrl,
          filename: filename || 'notes.txt',
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download error:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, downloadId });
          }
        });
        return true; // Keep channel open for async response
      } else {
        sendResponse({ success: false, error: "chrome.downloads API not available" });
        return false;
      }
    } catch (err) {
      console.error('Download failed:', err);
      sendResponse({ success: false, error: err.message });
      return false;
    }
  }
});
