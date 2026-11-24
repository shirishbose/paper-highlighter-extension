// content.js - Microsoft Edge-style Text Selection Mini-Menu Highlighter

(() => {
  if (window.__webHighlighterInjected) return;
  window.__webHighlighterInjected = true;

  console.log("[Brave Highlighter] Extension active on:", window.location.href);

  function getCleanUrl() {
    try {
      const u = new URL(window.location.href);
      const cleanParams = new URLSearchParams();
      for (const [key, value] of u.searchParams.entries()) {
        if (!key.startsWith('utm_') && !['fbclid', 'gclid', 'ref', 'source'].includes(key)) {
          cleanParams.append(key, value);
        }
      }
      const qs = cleanParams.toString();
      return u.origin + u.pathname + (qs ? '?' + qs : '');
    } catch (e) {
      return window.location.href;
    }
  }

  const currentUrl = getCleanUrl();
  let currentHighlights = [];
  let detectedPaper = null;

  // Active state
  let edgeMenu = null;
  let activeSelectionRange = null;
  let currentTargetHighlight = null;

  // --- Storage Helpers (Auto-Save) ---
  function getStorageKey() {
    return 'hl_page_' + encodeURIComponent(currentUrl);
  }

  async function loadHighlightsFromStorage() {
    return new Promise((resolve) => {
      const key = getStorageKey();
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || []);
      });
    });
  }

  async function saveHighlightsToStorage(highlights) {
    return new Promise((resolve) => {
      const key = getStorageKey();
      const data = {};
      data[key] = highlights;

      chrome.storage.local.set(data, () => {
        updatePageIndex(highlights.length);
        updateExtensionBadge(highlights.length);
        resolve();
      });
    });
  }

  async function updatePageIndex(count) {
    chrome.storage.local.get(['hl_page_index'], (result) => {
      let index = result.hl_page_index || [];
      index = index.filter(item => item.url !== currentUrl);
      if (count > 0) {
        index.unshift({
          url: currentUrl,
          title: (detectedPaper && detectedPaper.title) ? detectedPaper.title : (document.title || currentUrl),
          count: count,
          paper: detectedPaper || null,
          updatedAt: new Date().toISOString()
        });
      }
      chrome.storage.local.set({ hl_page_index: index });
    });
  }

  function updateExtensionBadge(count) {
    chrome.runtime.sendMessage({
      action: "UPDATE_BADGE",
      count: count
    }).catch(() => {});
  }

  // --- Initial Setup & Restoration ---
  async function init() {
    if (window.WebHighlighterPaperDetector) {
      detectedPaper = window.WebHighlighterPaperDetector.detectPaperMetadata();
    }

    createEdgeMenu();

    currentHighlights = await loadHighlightsFromStorage();

    restoreAllHighlights();
    setTimeout(restoreAllHighlights, 500);
    setTimeout(restoreAllHighlights, 1500);

    updateExtensionBadge(currentHighlights.length);
  }

  function restoreAllHighlights() {
    if (!currentHighlights || currentHighlights.length === 0) return;

    currentHighlights.forEach(hl => {
      const existing = document.querySelector(`mark[data-hl-id="${hl.id}"]`);
      if (existing) return;

      const marks = window.WebHighlighterAnchor.restoreHighlight(hl);
      if (marks && marks.length > 0) {
        marks.forEach(mark => attachMarkListeners(mark, hl.id));
        if (hl.comment && hl.comment.trim().length > 0) {
          marks[marks.length - 1].classList.add('web-hl-has-comment');
        }
      }
    });
  }

  // --- Create Edge-Style Mini Menu ---
  function createEdgeMenu() {
    if (document.getElementById('web-hl-edge-menu')) {
      edgeMenu = document.getElementById('web-hl-edge-menu');
      return;
    }

    edgeMenu = document.createElement('div');
    edgeMenu.id = 'web-hl-edge-menu';
    edgeMenu.innerHTML = `
      <div class="web-hl-edge-main-row">
        <div class="web-hl-edge-colors">
          <button class="web-hl-edge-dot hl-yellow" data-color="yellow" title="Yellow"></button>
          <button class="web-hl-edge-dot hl-green" data-color="green" title="Green"></button>
          <button class="web-hl-edge-dot hl-blue" data-color="blue" title="Blue"></button>
          <button class="web-hl-edge-dot hl-purple" data-color="purple" title="Purple"></button>
          <button class="web-hl-edge-dot hl-pink" data-color="pink" title="Pink"></button>
          <button class="web-hl-edge-dot hl-orange" data-color="orange" title="Orange"></button>
          <button class="web-hl-edge-dot hl-red" data-color="red" title="Red"></button>
          <button class="web-hl-edge-dot hl-teal" data-color="teal" title="Teal"></button>
          <button class="web-hl-colorwheel-btn" title="Pick custom color">
            <input type="color" class="web-hl-colorwheel-picker" value="#a855f7" style="position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;" />
          </button>
        </div>
        <div class="web-hl-edge-divider"></div>
        <button class="web-hl-edge-btn btn-comment" title="Add / View Note">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
          </svg>
        </button>
        <button class="web-hl-edge-btn btn-delete" title="Delete highlight" style="display: none;">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </button>
        <button class="web-hl-edge-btn btn-copy" title="Copy text">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 2a2 2 0 00-2 2v2H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-2V4a2 2 0 00-2-2H8zm0 2h4v2H8V4zm-3 4h8v8H5V8zm10 2v5h1V6h-7v2h6z"/>
          </svg>
        </button>
      </div>
      <div class="web-hl-edge-comment-drawer" style="display: none;">
        <input type="text" class="web-hl-edge-comment-input" placeholder="Type a comment (auto-saves)..." />
      </div>
    `;
    document.body.appendChild(edgeMenu);

    // Color buttons: highlight or change color
    edgeMenu.querySelectorAll('.web-hl-edge-dot').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = btn.dataset.color;

        if (currentTargetHighlight) {
          changeHighlightColor(currentTargetHighlight.id, color);
        } else {
          performHighlight(color);
        }
      });
    });

    // Custom colorwheel picker
    const colorwheelBtn = edgeMenu.querySelector('.web-hl-colorwheel-btn');
    const colorPicker = edgeMenu.querySelector('.web-hl-colorwheel-picker');

    colorwheelBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      colorPicker.click();
    });

    colorPicker.addEventListener('input', (e) => {
      const chosenColor = e.target.value;
      if (currentTargetHighlight) {
        changeHighlightColor(currentTargetHighlight.id, chosenColor);
      }
    });

    colorPicker.addEventListener('change', (e) => {
      const chosenColor = e.target.value;
      if (currentTargetHighlight) {
        changeHighlightColor(currentTargetHighlight.id, chosenColor);
      } else if (activeSelectionRange) {
        performHighlight(chosenColor);
      }
    });

    // Toggle inline comment drawer
    const commentBtn = edgeMenu.querySelector('.btn-comment');
    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    const commentInput = edgeMenu.querySelector('.web-hl-edge-comment-input');

    commentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!currentTargetHighlight && activeSelectionRange) {
        performHighlight('yellow');
      }

      if (commentDrawer.style.display === 'none') {
        commentDrawer.style.display = 'block';
        if (currentTargetHighlight) {
          commentInput.value = currentTargetHighlight.comment || '';
        }
        setTimeout(() => commentInput.focus(), 30);
      } else {
        commentDrawer.style.display = 'none';
      }
    });

    // Auto-save comment on typing
    commentInput.addEventListener('input', () => {
      if (!currentTargetHighlight) return;
      const text = commentInput.value.trim();
      currentTargetHighlight.comment = text;
      currentTargetHighlight.updatedAt = new Date().toISOString();
      saveHighlightsToStorage(currentHighlights);

      const marks = document.querySelectorAll(`mark[data-hl-id="${currentTargetHighlight.id}"]`);
      if (marks.length > 0) {
        if (text.length > 0) {
          marks[marks.length - 1].classList.add('web-hl-has-comment');
          commentBtn.classList.add('has-note');
        } else {
          marks[marks.length - 1].classList.remove('web-hl-has-comment');
          commentBtn.classList.remove('has-note');
        }
      }
    });

    // Delete Highlight button
    const deleteBtn = edgeMenu.querySelector('.btn-delete');
    deleteBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentTargetHighlight) {
        deleteHighlight(currentTargetHighlight.id);
        hideEdgeMenu();
      }
    });

    // Copy text button
    const copyBtn = edgeMenu.querySelector('.btn-copy');
    copyBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let textToCopy = '';
      if (currentTargetHighlight) {
        textToCopy = currentTargetHighlight.exact;
        if (currentTargetHighlight.comment) textToCopy += `\nNote: ${currentTargetHighlight.comment}`;
      } else if (activeSelectionRange) {
        textToCopy = activeSelectionRange.toString().trim();
      }

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy);
        copyBtn.style.color = '#16a34a';
        setTimeout(() => { copyBtn.style.color = ''; }, 1000);
      }
    });
  }

  // --- Selection Tracking (Automatic Pop at Selection Side) ---
  let selectionDebounce = null;

  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(handleSelectionUpdated, 100);
  });

  document.addEventListener('mouseup', (e) => {
    if (e.target.closest && e.target.closest('#web-hl-edge-menu')) return;
    setTimeout(handleSelectionUpdated, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest && e.target.closest('#web-hl-edge-menu')) return;
    if (e.target.closest && e.target.closest('mark.web-hl-mark')) return;
    hideEdgeMenu();
  });

  function handleSelectionUpdated() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      if (!currentTargetHighlight) {
        hideEdgeMenu();
      }
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) {
      if (!currentTargetHighlight) hideEdgeMenu();
      return;
    }

    const range = selection.getRangeAt(0);
    activeSelectionRange = range.cloneRange();
    currentTargetHighlight = null;

    showEdgeMenuForSelection(range);
  }

  function updateMenuColorSelection(selectedColor) {
    if (!edgeMenu) return;
    const standardColors = ['yellow', 'green', 'blue', 'purple', 'pink', 'orange', 'red', 'teal'];
    const dots = edgeMenu.querySelectorAll('.web-hl-edge-dot');
    const wheelBtn = edgeMenu.querySelector('.web-hl-colorwheel-btn');
    const picker = edgeMenu.querySelector('.web-hl-colorwheel-picker');

    dots.forEach(d => {
      if (d.dataset.color === selectedColor) {
        d.classList.add('active-selected');
      } else {
        d.classList.remove('active-selected');
      }
    });

    if (wheelBtn) {
      if (selectedColor && !standardColors.includes(selectedColor)) {
        wheelBtn.classList.add('active-selected');
        wheelBtn.style.setProperty('--custom-color', selectedColor);
        if (picker) picker.value = selectedColor;
        wheelBtn.title = `Custom color: ${selectedColor} (click to change)`;
      } else {
        wheelBtn.classList.remove('active-selected');
        wheelBtn.style.removeProperty('--custom-color');
        wheelBtn.title = 'Pick custom color';
      }
    }
  }

  function showEdgeMenuForSelection(range) {
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideEdgeMenu();
      return;
    }

    const deleteBtn = edgeMenu.querySelector('.btn-delete');
    deleteBtn.style.display = 'none';

    const commentBtn = edgeMenu.querySelector('.btn-comment');
    commentBtn.classList.remove('has-note');

    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    commentDrawer.style.display = 'none';

    updateMenuColorSelection(null);

    positionMenuNearRect(rect);
  }

  function showEdgeMenuForHighlight(hl, markElement) {
    currentTargetHighlight = hl;
    activeSelectionRange = null;

    const rect = markElement.getBoundingClientRect();

    // Show Delete button (options increase!)
    const deleteBtn = edgeMenu.querySelector('.btn-delete');
    deleteBtn.style.display = 'flex';

    // Mark current color active
    updateMenuColorSelection(hl.color);

    const commentBtn = edgeMenu.querySelector('.btn-comment');
    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    const commentInput = edgeMenu.querySelector('.web-hl-edge-comment-input');

    if (hl.comment && hl.comment.trim().length > 0) {
      commentBtn.classList.add('has-note');
      commentDrawer.style.display = 'block';
      commentInput.value = hl.comment;
    } else {
      commentBtn.classList.remove('has-note');
      commentDrawer.style.display = 'none';
      commentInput.value = '';
    }

    positionMenuNearRect(rect);
  }

  function positionMenuNearRect(rect) {
    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const menuWidth = 350;
    const menuHeight = 36;

    // Horizontally aligned with selection
    let left = rect.left + scrollX + (rect.width / 2) - (menuWidth / 2);

    // Vertically floats above selection
    let top = rect.top + scrollY - menuHeight - 8;

    // If too close to viewport top, float below selection
    if (rect.top < menuHeight + 12) {
      top = rect.bottom + scrollY + 8;
    }

    // Boundary protections
    if (left < scrollX + 8) left = scrollX + 8;
    const maxLeft = scrollX + (window.innerWidth || document.documentElement.clientWidth) - menuWidth - 8;
    if (left > maxLeft) left = maxLeft;

    edgeMenu.style.setProperty('top', `${Math.round(top)}px`, 'important');
    edgeMenu.style.setProperty('left', `${Math.round(left)}px`, 'important');
    edgeMenu.classList.add('web-hl-visible');
  }

  function hideEdgeMenu() {
    if (edgeMenu) {
      edgeMenu.classList.remove('web-hl-visible');
      edgeMenu.querySelector('.web-hl-edge-comment-drawer').style.display = 'none';
      currentTargetHighlight = null;
    }
  }

  // --- Perform Highlighting & Auto-Save ---
  function performHighlight(color = 'yellow') {
    const selection = window.getSelection();
    let range = activeSelectionRange;
    if (!range && selection && !selection.isCollapsed && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    }

    if (!range || range.toString().trim().length === 0) {
      hideEdgeMenu();
      return;
    }

    if (!detectedPaper && window.WebHighlighterPaperDetector) {
      detectedPaper = window.WebHighlighterPaperDetector.detectPaperMetadata();
    }

    const anchor = window.WebHighlighterAnchor.createAnchor(range, color, '', detectedPaper);
    const marks = window.WebHighlighterAnchor.wrapRange(range, anchor.id, color);

    if (marks.length === 0) {
      hideEdgeMenu();
      return;
    }

    marks.forEach(m => attachMarkListeners(m, anchor.id));

    currentHighlights.push(anchor);
    saveHighlightsToStorage(currentHighlights); // AUTO-SAVED!

    selection.removeAllRanges();
    activeSelectionRange = null;

    // Show menu with increased options (delete button unlocked)
    showEdgeMenuForHighlight(anchor, marks[marks.length - 1]);
  }

  function changeHighlightColor(highlightId, newColor) {
    const hl = currentHighlights.find(h => h.id === highlightId);
    if (!hl) return;

    hl.color = newColor;
    hl.updatedAt = new Date().toISOString();

    const marks = document.querySelectorAll(`mark[data-hl-id="${highlightId}"]`);
    marks.forEach(m => {
      if (window.WebHighlighterAnchor && window.WebHighlighterAnchor.applyMarkColor) {
        window.WebHighlighterAnchor.applyMarkColor(m, newColor);
      } else {
        m.dataset.color = newColor;
        m.className = `web-hl-mark web-hl-color-${newColor}`;
      }
      if (hl.comment && hl.comment.trim().length > 0) {
        m.classList.add('web-hl-has-comment');
      }
    });

    updateMenuColorSelection(newColor);
    saveHighlightsToStorage(currentHighlights); // AUTO-SAVED!
  }

  function deleteHighlight(highlightId) {
    window.WebHighlighterAnchor.removeHighlightFromDOM(highlightId);
    currentHighlights = currentHighlights.filter(h => h.id !== highlightId);
    saveHighlightsToStorage(currentHighlights); // AUTO-SAVED!
  }

  function attachMarkListeners(mark, highlightId) {
    mark.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hl = currentHighlights.find(h => h.id === highlightId);
      if (hl) {
        showEdgeMenuForHighlight(hl, mark);
      }
    });
  }

  function scrollToHighlight(highlightId) {
    const mark = document.querySelector(`mark[data-hl-id="${highlightId}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      mark.classList.remove('web-hl-pulse');
      void mark.offsetWidth;
      mark.classList.add('web-hl-pulse');
      setTimeout(() => mark.classList.remove('web-hl-pulse'), 2500);
      const hl = currentHighlights.find(h => h.id === highlightId);
      if (hl) showEdgeMenuForHighlight(hl, mark);
    }
  }

  // --- Extension Messages ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "HIGHLIGHT_SELECTION") {
      performHighlight(message.color || 'yellow');
      sendResponse({ success: true });
    } else if (message.action === "GET_PAGE_HIGHLIGHTS") {
      sendResponse({
        url: currentUrl,
        title: (detectedPaper && detectedPaper.title) ? detectedPaper.title : (document.title || currentUrl),
        paper: detectedPaper || null,
        highlights: currentHighlights
      });
    } else if (message.action === "SCROLL_TO_HIGHLIGHT") {
      scrollToHighlight(message.id);
      sendResponse({ success: true });
    } else if (message.action === "DELETE_HIGHLIGHT") {
      deleteHighlight(message.id);
      hideEdgeMenu();
      sendResponse({ success: true });
    } else if (message.action === "CLEAR_ALL_ON_PAGE") {
      currentHighlights.forEach(hl => window.WebHighlighterAnchor.removeHighlightFromDOM(hl.id));
      currentHighlights = [];
      saveHighlightsToStorage([]);
      hideEdgeMenu();
      sendResponse({ success: true });
    }
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
