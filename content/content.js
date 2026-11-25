// content.js - Selection Floating Bubble & Mini-Menu Highlighter with In-Panel AI Chatbot

(() => {
  if (window.__webHighlighterInjected) return;

  // Strict Bot-Challenge & Verification Frame Safety Guard
  // Ensures the extension remains 100% inert during ScienceDirect/Cloudflare "Are you a robot" checks
  function isBotChallengeContext() {
    try {
      const url = (window.location.href || '').toLowerCase();
      const host = (window.location.hostname || '').toLowerCase();
      const title = (document.title || '').toLowerCase();

      const challengeMarkers = [
        'challenges.cloudflare.com',
        'turnstile',
        'recaptcha',
        'hcaptcha',
        'perimeterx',
        'px-cloud',
        '/challenge',
        '/verification',
        'bot-defense',
        'arkoselabs'
      ];

      if (challengeMarkers.some(m => url.includes(m) || host.includes(m))) return true;
      if (title.includes('are you a robot') || title.includes('just a moment') || title.includes('security check')) return true;
    } catch (e) {
      return false;
    }
    return false;
  }

  if (isBotChallengeContext()) {
    return; // Completely inert on verification pages and nested challenge iframes
  }

  window.__webHighlighterInjected = true;

  console.log("[Web Highlighter] Extension active on:", window.location.href);

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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const currentUrl = getCleanUrl();
  let currentHighlights = [];
  let detectedPaper = null;

  // Active UI state
  let triggerBubble = null;
  let edgeMenu = null;
  let activeSelectionRange = null;
  let currentTargetHighlight = null;

  // Colors & Tags memory
  let recentCustomColors = ['#f472b6', '#fb923c'];
  let savedAllTags = [];
  let currentUserProfile = { email: '', syncedAt: '' };

  // --- Storage Helpers (Auto-Save & Memory) ---
  function getStorageKey() {
    return 'hl_page_' + encodeURIComponent(currentUrl);
  }

  async function loadExtensionState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'hl_user_profile',
        'hl_recent_custom_colors',
        'hl_all_tags'
      ], (result) => {
        if (result.hl_user_profile) currentUserProfile = result.hl_user_profile;
        if (Array.isArray(result.hl_recent_custom_colors) && result.hl_recent_custom_colors.length > 0) {
          recentCustomColors = result.hl_recent_custom_colors.slice(0, 2);
        }
        if (Array.isArray(result.hl_all_tags)) {
          savedAllTags = Array.from(new Set(result.hl_all_tags));
        } else {
          savedAllTags = [];
        }
        resolve();
      });
    });
  }

  async function saveUserProfile(profile) {
    currentUserProfile = profile;
    return new Promise((resolve) => {
      chrome.storage.local.set({ hl_user_profile: profile }, () => {
        resolve();
      });
    });
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
    if (!currentUrl || currentUrl === 'index' || !currentUrl.includes('://')) return;
    chrome.storage.local.get(['hl_page_index'], (result) => {
      let index = result.hl_page_index || [];
      // Clean up any phantom or invalid index items
      index = index.filter(item => item && item.url && item.url !== 'index' && item.url.includes('://') && item.url !== currentUrl);
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

  function recordNewTag(tag) {
    if (!tag) return;
    const clean = tag.replace(/^[#,\s]+|[,\s]+$/g, '').trim();
    if (!clean) return;
    if (!savedAllTags.includes(clean)) {
      savedAllTags.push(clean);
      chrome.storage.local.set({ hl_all_tags: savedAllTags });
    }
  }

  function updateRecentCustomColor(color) {
    if (!color) return;
    recentCustomColors = [color, ...recentCustomColors.filter(c => c.toLowerCase() !== color.toLowerCase())].slice(0, 2);
    chrome.storage.local.set({ hl_recent_custom_colors: recentCustomColors });
    updateCustomDotsUI();
  }

  function updateCustomDotsUI() {
    if (!edgeMenu) return;
    const dots = edgeMenu.querySelectorAll('.hl-custom-dot');
    dots.forEach((dot, idx) => {
      const c = recentCustomColors[idx] || (idx === 0 ? '#f472b6' : '#fb923c');
      dot.dataset.color = c;
      dot.style.backgroundColor = c;
      dot.title = `Recent custom color: ${c}`;
    });
  }

  // --- Initial Setup & Restoration ---
  async function init() {
    if (window.WebHighlighterPaperDetector) {
      detectedPaper = window.WebHighlighterPaperDetector.detectPaperMetadata();
      // Asynchronous re-checks to capture lazy-loaded journal cover/banner, authors & DOI
      const checkFresh = () => {
        const fresh = window.WebHighlighterPaperDetector.detectPaperMetadata();
        if (fresh) {
          const hasNewImage = (!detectedPaper || !detectedPaper.journalImage) && fresh.journalImage;
          const hasNewAuthors = (!detectedPaper || !detectedPaper.authors || detectedPaper.authors.length === 0) && fresh.authors && fresh.authors.length > 0;
          const hasNewDoi = (!detectedPaper || !detectedPaper.doi) && fresh.doi;
          if (hasNewImage || hasNewAuthors || hasNewDoi) {
            detectedPaper = Object.assign({}, detectedPaper || {}, fresh);
            if (currentHighlights.length > 0) {
              updatePageIndex(currentHighlights.length);
            }
          }
        }
      };
      setTimeout(checkFresh, 1000);
      setTimeout(checkFresh, 2500);
    }

    await loadExtensionState();
    createTriggerBubble();
    createEdgeMenu();

    currentHighlights = await loadHighlightsFromStorage();

    // Harvest existing tags into savedAllTags
    currentHighlights.forEach(h => {
      if (Array.isArray(h.tags)) {
        h.tags.forEach(t => recordNewTag(t));
      }
    });

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

  // --- Floating Trigger Bubble (Small Icon on Selection) ---
  function createTriggerBubble() {
    if (document.getElementById('web-hl-trigger-bubble')) {
      triggerBubble = document.getElementById('web-hl-trigger-bubble');
      return;
    }

    triggerBubble = document.createElement('div');
    triggerBubble.id = 'web-hl-trigger-bubble';
    triggerBubble.title = 'Highlight / Add Note';
    triggerBubble.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z"/>
        <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd"/>
      </svg>
    `;
    document.body.appendChild(triggerBubble);

    let hoverTimeout = null;

    const openMenu = () => {
      if (activeSelectionRange) {
        hideTriggerBubble();
        showEdgeMenuForSelection(activeSelectionRange);
      }
    };

    triggerBubble.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(openMenu, 100); // 0.1s hover delay
    });

    triggerBubble.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
    });

    triggerBubble.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(hoverTimeout);
      openMenu();
    });
  }

  function hideTriggerBubble() {
    if (triggerBubble) triggerBubble.classList.remove('web-hl-visible');
  }

  function showTriggerBubbleForSelection(range) {
    if (!range) return;
    const rects = range.getClientRects();
    const lastRect = (rects && rects.length > 0) ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!lastRect || (lastRect.width === 0 && lastRect.height === 0)) {
      hideTriggerBubble();
      hideEdgeMenu();
      return;
    }

    if (!triggerBubble) createTriggerBubble();

    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    // Position pen icon immediately after the last character of the selection
    let left = lastRect.right + scrollX + 3;
    let top = lastRect.top + scrollY + (lastRect.height / 2) - 14;

    // Viewport boundary guard
    const maxLeft = scrollX + (window.innerWidth || document.documentElement.clientWidth) - 34;
    if (left > maxLeft) {
      left = lastRect.right + scrollX - 30;
      top = lastRect.bottom + scrollY + 4;
    }

    triggerBubble.style.setProperty('top', `${Math.round(top)}px`, 'important');
    triggerBubble.style.setProperty('left', `${Math.round(left)}px`, 'important');
    triggerBubble.classList.add('web-hl-visible');

    // Keep edge menu hidden while bubble is active
    if (edgeMenu) edgeMenu.classList.remove('web-hl-visible');
  }

  // --- Create Selection Mini Menu ---
  function createEdgeMenu() {
    if (document.getElementById('web-hl-edge-menu')) {
      edgeMenu = document.getElementById('web-hl-edge-menu');
      return;
    }

    const c1 = recentCustomColors[0] || '#f472b6';
    const c2 = recentCustomColors[1] || '#fb923c';

    edgeMenu = document.createElement('div');
    edgeMenu.id = 'web-hl-edge-menu';
    edgeMenu.innerHTML = `
      <div class="web-hl-edge-main-row">
        <!-- 4 Daily Use Colors -->
        <div class="web-hl-edge-colors">
          <button class="web-hl-edge-dot hl-yellow" data-color="yellow" title="Yellow"></button>
          <button class="web-hl-edge-dot hl-green" data-color="green" title="Green"></button>
          <button class="web-hl-edge-dot hl-blue" data-color="blue" title="Blue"></button>
          <button class="web-hl-edge-dot hl-purple" data-color="purple" title="Purple"></button>
        </div>
        <div class="web-hl-edge-divider"></div>
        <!-- 2 Custom Colors (last selected from color wheel) -->
        <div class="web-hl-edge-colors">
          <button class="web-hl-edge-dot hl-custom-dot" data-slot="0" data-color="${c1}" style="background-color: ${c1};" title="Recent custom color: ${c1}"></button>
          <button class="web-hl-edge-dot hl-custom-dot" data-slot="1" data-color="${c2}" style="background-color: ${c2};" title="Recent custom color: ${c2}"></button>
        </div>
        <div class="web-hl-edge-divider"></div>
        <!-- Color Wheel -->
        <div class="web-hl-colorwheel-wrap" title="Custom color wheel picker">
          <input type="color" class="web-hl-colorwheel-picker" value="${c1}" />
        </div>
        <div class="web-hl-edge-divider"></div>
        <!-- Action Buttons -->
        <button class="web-hl-edge-btn btn-comment" title="Add / View Note &amp; Tags">
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
      <!-- Comment & Plain Tags Drawer (Hidden by default, opens only on comment button click) -->
      <div class="web-hl-edge-comment-drawer">
        <textarea class="web-hl-edge-comment-textarea" placeholder="Add a research note (auto-saves)..." rows="3"></textarea>
        <div class="web-hl-edge-tags-section">
          <div class="web-hl-tags-chips"></div>
          <input type="text" class="web-hl-edge-tag-input" placeholder="+ Add tag (e.g. Lg, Methods)" />
        </div>
        <div class="web-hl-suggested-tags"></div>
      </div>
    `;
    document.body.appendChild(edgeMenu);

    // Color buttons (presets + custom dots): highlight or change color
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

    // Custom colorwheel picker (direct native input)
    const colorPicker = edgeMenu.querySelector('.web-hl-colorwheel-picker');
    colorPicker.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    colorPicker.addEventListener('input', (e) => {
      const chosenColor = e.target.value;
      if (currentTargetHighlight) {
        changeHighlightColor(currentTargetHighlight.id, chosenColor);
      }
    });

    colorPicker.addEventListener('change', (e) => {
      const chosenColor = e.target.value;
      updateRecentCustomColor(chosenColor);
      if (currentTargetHighlight) {
        changeHighlightColor(currentTargetHighlight.id, chosenColor);
      } else if (activeSelectionRange) {
        performHighlight(chosenColor);
      }
    });

    // Toggle inline comment drawer - only opens when user clicks Note button
    const commentBtn = edgeMenu.querySelector('.btn-comment');
    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    const commentTextarea = edgeMenu.querySelector('.web-hl-edge-comment-textarea');

    commentBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!currentTargetHighlight && activeSelectionRange) {
        performHighlight('yellow');
      }

      if (!commentDrawer.classList.contains('web-hl-open')) {
        commentDrawer.classList.add('web-hl-open');
        if (currentTargetHighlight) {
          commentTextarea.value = currentTargetHighlight.comment || '';
          renderMenuTagChips(currentTargetHighlight.tags || []);
        }
        setTimeout(() => commentTextarea.focus(), 30);
      } else {
        commentDrawer.classList.remove('web-hl-open');
      }
    });

    // Auto-save comment on typing
    commentTextarea.addEventListener('input', () => {
      if (!currentTargetHighlight) return;
      const text = commentTextarea.value.trim();
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

    // Tag input in menu drawer (plain tags without '#')
    const tagInput = edgeMenu.querySelector('.web-hl-edge-tag-input');
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInput.value.replace(/^[#,\s]+|[,\s]+$/g, '').trim();
        if (val.length > 0 && currentTargetHighlight) {
          currentTargetHighlight.tags = currentTargetHighlight.tags || [];
          if (!currentTargetHighlight.tags.includes(val)) {
            currentTargetHighlight.tags.push(val);
            currentTargetHighlight.updatedAt = new Date().toISOString();
            recordNewTag(val);
            renderMenuTagChips(currentTargetHighlight.tags);
            saveHighlightsToStorage(currentHighlights);
          }
          tagInput.value = '';
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

  // --- Render Plain Tags & Reusable Tag Suggestions ---
  function renderMenuTagChips(tags) {
    if (!edgeMenu) return;
    const chipsContainer = edgeMenu.querySelector('.web-hl-tags-chips');
    const suggestedContainer = edgeMenu.querySelector('.web-hl-suggested-tags');
    if (!chipsContainer) return;

    // Active tags for current highlight (plain text, NO '#')
    chipsContainer.innerHTML = (tags || []).map(t => `
      <span class="web-hl-chip">
        ${escapeHtml(t)}
        <span class="web-hl-chip-del" data-tag="${escapeHtml(t)}">✕</span>
      </span>
    `).join('');

    chipsContainer.querySelectorAll('.web-hl-chip-del').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tagToRemove = btn.dataset.tag;
        if (currentTargetHighlight) {
          currentTargetHighlight.tags = (currentTargetHighlight.tags || []).filter(t => t !== tagToRemove);
          currentTargetHighlight.updatedAt = new Date().toISOString();
          renderMenuTagChips(currentTargetHighlight.tags);
          saveHighlightsToStorage(currentHighlights);
        }
      });
    });

    // Reusable / Saved Tag Options (Only added when user clicks it!)
    if (suggestedContainer) {
      const activeSet = new Set(tags || []);
      const available = savedAllTags.filter(t => !activeSet.has(t));
      if (available.length > 0) {
        suggestedContainer.innerHTML = `
          <span style="font-size:10px; color:#94a3b8; font-weight:600;">OPTIONS (CLICK TO ADD):</span>
          ${available.map(t => `<button type="button" class="web-hl-suggested-tag-btn" data-tag="${escapeHtml(t)}" title="Click to add ${escapeHtml(t)}">+ ${escapeHtml(t)}</button>`).join('')}
        `;
        suggestedContainer.querySelectorAll('.web-hl-suggested-tag-btn').forEach(btn => {
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tagToAdd = btn.dataset.tag;
            if (currentTargetHighlight && tagToAdd) {
              currentTargetHighlight.tags = currentTargetHighlight.tags || [];
              if (!currentTargetHighlight.tags.includes(tagToAdd)) {
                currentTargetHighlight.tags.push(tagToAdd);
                currentTargetHighlight.updatedAt = new Date().toISOString();
                renderMenuTagChips(currentTargetHighlight.tags);
                saveHighlightsToStorage(currentHighlights);
              }
            }
          });
        });
      } else {
        suggestedContainer.innerHTML = '';
      }
    }
  }

  // --- Selection Tracking (Small Hover Icon First) ---
  let selectionDebounce = null;

  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(handleSelectionUpdated, 120);
  });

  document.addEventListener('mouseup', (e) => {
    if (e.target.closest && (e.target.closest('#web-hl-edge-menu') || e.target.closest('#web-hl-trigger-bubble'))) return;
    setTimeout(handleSelectionUpdated, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest && (e.target.closest('#web-hl-edge-menu') || e.target.closest('#web-hl-trigger-bubble'))) return;
    if (e.target.closest && e.target.closest('mark.web-hl-mark')) return;
    hideTriggerBubble();
    hideEdgeMenu();
  });

  function handleSelectionUpdated() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      if (!currentTargetHighlight) {
        hideTriggerBubble();
        hideEdgeMenu();
      }
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) {
      if (!currentTargetHighlight) {
        hideTriggerBubble();
        hideEdgeMenu();
      }
      return;
    }

    const range = selection.getRangeAt(0);
    activeSelectionRange = range.cloneRange();
    currentTargetHighlight = null;

    // Show floating pen bubble immediately after selection ends
    showTriggerBubbleForSelection(range);
  }

  function updateMenuColorSelection(selectedColor) {
    if (!edgeMenu) return;
    const standardColors = ['yellow', 'green', 'blue', 'purple'];
    const dots = edgeMenu.querySelectorAll('.web-hl-edge-dot');
    const wheelWrap = edgeMenu.querySelector('.web-hl-colorwheel-wrap');
    const picker = edgeMenu.querySelector('.web-hl-colorwheel-picker');

    dots.forEach(d => {
      if (d.dataset.color === selectedColor) {
        d.classList.add('active-selected');
      } else {
        d.classList.remove('active-selected');
      }
    });

    if (wheelWrap) {
      if (selectedColor && !standardColors.includes(selectedColor)) {
        wheelWrap.classList.add('active-selected');
        if (picker && selectedColor.startsWith('#')) picker.value = selectedColor;
        wheelWrap.title = `Custom color: ${selectedColor} (click to change)`;
      } else {
        wheelWrap.classList.remove('active-selected');
        wheelWrap.title = 'Custom color wheel picker';
      }
    }
  }

  function showEdgeMenuForSelection(range) {
    if (!range) return;
    const rects = range.getClientRects();
    const lastRect = (rects && rects.length > 0) ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!lastRect || (lastRect.width === 0 && lastRect.height === 0)) {
      hideEdgeMenu();
      return;
    }

    const deleteBtn = edgeMenu.querySelector('.btn-delete');
    deleteBtn.style.display = 'none';

    const commentBtn = edgeMenu.querySelector('.btn-comment');
    commentBtn.classList.remove('has-note');

    // Comment drawer stays strictly closed! Only show the thin color strip
    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    commentDrawer.classList.remove('web-hl-open');

    updateMenuColorSelection(null);
    updateCustomDotsUI();

    positionMenuNearRect(lastRect);
  }

  function showEdgeMenuForHighlight(hl, markElement) {
    hideTriggerBubble();
    currentTargetHighlight = hl;
    activeSelectionRange = null;

    const rect = markElement.getBoundingClientRect();

    // Show Delete button for existing highlight
    const deleteBtn = edgeMenu.querySelector('.btn-delete');
    deleteBtn.style.display = 'flex';

    // Mark active color
    updateMenuColorSelection(hl.color);
    updateCustomDotsUI();

    const commentBtn = edgeMenu.querySelector('.btn-comment');
    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    const commentTextarea = edgeMenu.querySelector('.web-hl-edge-comment-textarea');

    renderMenuTagChips(hl.tags || []);

    if (hl.comment && hl.comment.trim().length > 0) {
      commentBtn.classList.add('has-note');
      commentTextarea.value = hl.comment;
    } else {
      commentBtn.classList.remove('has-note');
      commentTextarea.value = '';
    }

    // Never auto-open comment drawer - only show the thin color strip until Note button is clicked!
    commentDrawer.classList.remove('web-hl-open');

    positionMenuNearRect(rect);
  }

  function positionMenuNearRect(rect) {
    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const menuWidth = 330;
    const menuHeight = 36;

    let left = rect.left + scrollX + (rect.width / 2) - (menuWidth / 2);
    let top = rect.top + scrollY - menuHeight - 8;

    if (rect.top < menuHeight + 12) {
      top = rect.bottom + scrollY + 8;
    }

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
      const drawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
      if (drawer) drawer.classList.remove('web-hl-open');
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
      hideTriggerBubble();
      return;
    }

    if (window.WebHighlighterPaperDetector) {
      const fresh = window.WebHighlighterPaperDetector.detectPaperMetadata();
      if (fresh) {
        detectedPaper = Object.assign({}, detectedPaper || {}, fresh);
      }
    }

    const anchor = window.WebHighlighterAnchor.createAnchor(range, color, '', detectedPaper);
    const marks = window.WebHighlighterAnchor.wrapRange(range, anchor.id, color);

    if (marks.length === 0) {
      hideEdgeMenu();
      hideTriggerBubble();
      return;
    }

    marks.forEach(m => attachMarkListeners(m, anchor.id));

    currentHighlights.push(anchor);
    saveHighlightsToStorage(currentHighlights); // AUTO-SAVED!

    selection.removeAllRanges();
    activeSelectionRange = null;
    hideTriggerBubble();

    // Show menu with delete button available
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
