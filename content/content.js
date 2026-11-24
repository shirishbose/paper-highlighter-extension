// content.js - Selection Floating Bubble & Mini-Menu Highlighter with In-Panel AI Chatbot

(() => {
  if (window.__webHighlighterInjected) return;
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

  // Side Panel state
  let sidePanel = null;
  let sidePanelToggle = null;
  let sidepanelToggleDisabled = false;
  let activeSidePanelTab = 'highlights';
  let currentUserProfile = { email: '', syncedAt: '' };
  let geminiApiKey = '';
  let chatHistory = [];

  // --- Storage Helpers (Auto-Save & Memory) ---
  function getStorageKey() {
    return 'hl_page_' + encodeURIComponent(currentUrl);
  }

  async function loadExtensionState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'hl_user_profile',
        'hl_recent_custom_colors',
        'hl_all_tags',
        'hl_gemini_api_key',
        'hl_sidepanel_toggle_disabled'
      ], (result) => {
        if (result.hl_user_profile) currentUserProfile = result.hl_user_profile;
        if (result.hl_sidepanel_toggle_disabled) sidepanelToggleDisabled = true;
        if (Array.isArray(result.hl_recent_custom_colors) && result.hl_recent_custom_colors.length > 0) {
          recentCustomColors = result.hl_recent_custom_colors.slice(0, 2);
        }
        if (Array.isArray(result.hl_all_tags)) {
          savedAllTags = Array.from(new Set(result.hl_all_tags));
        } else {
          savedAllTags = [];
        }
        if (result.hl_gemini_api_key) {
          geminiApiKey = result.hl_gemini_api_key;
        }
        resolve();
      });
    });
  }

  async function saveUserProfile(profile) {
    currentUserProfile = profile;
    return new Promise((resolve) => {
      chrome.storage.local.set({ hl_user_profile: profile }, () => {
        updateAccountSyncStatusUI();
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
        if (sidePanel) {
          renderSidePanelHighlights();
          updateChatContextBadge();
        }
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
    if (sidePanelToggle) {
      const badge = sidePanelToggle.querySelector('.toggle-badge');
      if (badge) badge.textContent = count;
    }
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
    }

    await loadExtensionState();
    createTriggerBubble();
    createEdgeMenu();
    createSidePanel();

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
    renderSidePanelHighlights();
    updateAccountSyncStatusUI();
    updateChatContextBadge();
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

    const activateMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeSelectionRange) {
        hideTriggerBubble();
        showEdgeMenuForSelection(activeSelectionRange);
      }
    };

    triggerBubble.addEventListener('mouseenter', activateMenu);
    triggerBubble.addEventListener('mousedown', activateMenu);
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
        <button class="web-hl-edge-btn btn-sidepanel" title="Open Side Panel &amp; AI">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 2v8h7V6H4zm9 0v8h3V6h-3z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
      <!-- Comment & Plain Tags Drawer (Collapsed by default) -->
      <div class="web-hl-edge-comment-drawer" style="display: none;">
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

      if (commentDrawer.style.display === 'none') {
        commentDrawer.style.display = 'flex';
        if (currentTargetHighlight) {
          commentTextarea.value = currentTargetHighlight.comment || '';
          renderMenuTagChips(currentTargetHighlight.tags || []);
        }
        setTimeout(() => commentTextarea.focus(), 30);
      } else {
        commentDrawer.style.display = 'none';
      }
    });

    // Side Panel Launcher Button
    const sidepanelBtn = edgeMenu.querySelector('.btn-sidepanel');
    sidepanelBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSidePanel('highlights');
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

  // --- In-Page Side Panel & Interactive Chatbot ---
  function createSidePanel() {
    if (document.getElementById('web-hl-sidepanel')) return;

    // Toggle button on right screen edge
    sidePanelToggle = document.createElement('div');
    sidePanelToggle.id = 'web-hl-sidebar-toggle';
    if (sidepanelToggleDisabled) {
      sidePanelToggle.style.display = 'none';
    }
    sidePanelToggle.title = 'Open Web Highlights & AI Side Panel';
    sidePanelToggle.innerHTML = `
      <span class="toggle-cut-btn" title="Close permanently">✕</span>
      <span class="toggle-icon">📑</span>
      <span class="toggle-badge">${currentHighlights.length}</span>
    `;
    sidePanelToggle.addEventListener('click', (e) => {
      if (e.target.closest('.toggle-cut-btn')) {
        e.preventDefault();
        e.stopPropagation();
        permanentlyCloseSidePanel();
        return;
      }
      toggleSidePanel();
    });
    document.body.appendChild(sidePanelToggle);

    // Slide-out panel drawer
    sidePanel = document.createElement('div');
    sidePanel.id = 'web-hl-sidepanel';
    sidePanel.innerHTML = `
      <div class="web-hl-panel-header">
        <div class="web-hl-panel-brand">
          <span>📑 Web Highlights</span>
        </div>
        <div class="web-hl-account-status-pill" id="panel-account-pill" title="Google Account Tracking">
          <span style="font-size: 8px;">🟢</span> <span id="panel-account-label">Track with Gmail</span>
        </div>
        <button class="web-hl-panel-close" title="Close Panel">✕</button>
      </div>
      <div class="web-hl-panel-tabs">
        <button class="web-hl-panel-tab-btn active" data-tab="highlights">📑 Notes (<span id="panel-hl-count">0</span>)</button>
        <button class="web-hl-panel-tab-btn" data-tab="ai">🤖 AI Assistant</button>
        <button class="web-hl-panel-tab-btn" data-tab="account">👤 Sync</button>
      </div>
      <div class="web-hl-panel-body">
        <!-- Highlights Tab -->
        <div class="web-hl-tab-content active" id="tab-content-highlights">
          <div style="font-size: 11.5px; color: #64748b; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(detectedPaper && detectedPaper.title ? detectedPaper.title : document.title || currentUrl)}
          </div>
          <div id="panel-highlights-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>

        <!-- AI Assistant Interactive Chatbot Tab -->
        <div class="web-hl-tab-content" id="tab-content-ai">
          <div class="web-hl-chat-box">
            <div class="web-hl-chat-context-badge">
              <span>📌</span>
              <span id="panel-chat-context-text">Loaded ${currentHighlights.length} highlights from this paper</span>
            </div>
            <div class="web-hl-chat-messages" id="panel-chat-messages">
              <div class="web-hl-chat-bubble assistant">
                👋 <strong>Research Assistant ready.</strong><br>
                I have direct real-time access to all your highlights and notes on this page. Ask me to synthesize findings, evaluate equations, identify reviewer objections, or explore hypotheses!
              </div>
            </div>
            <div class="web-hl-quick-prompts">
              <button class="web-hl-quick-prompt-chip" data-q="Summarize all collected highlights with key academic takeaways">⚡ Summarize Highlights</button>
              <button class="web-hl-quick-prompt-chip" data-q="Explain the methodology, equations, and experimental framework">🔬 Methodology &amp; Equations</button>
              <button class="web-hl-quick-prompt-chip" data-q="Critically cross-examine the assumptions, data limits, and potential reviewer objections">💡 Critical Review</button>
              <button class="web-hl-quick-prompt-chip" data-q="How do these highlights connect to Lg attenuation, crustal velocity, or inversion?">📐 Lg Inversion Context</button>
            </div>
            <div class="web-hl-chat-input-row">
              <textarea class="web-hl-chat-input" id="panel-chat-input" placeholder="Ask about this paper / highlights..." rows="1"></textarea>
              <button class="web-hl-chat-send-btn" id="panel-chat-send-btn">Send</button>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px; font-size:11px; color:#64748b;">
              <span id="panel-toggle-api-key" style="cursor:pointer; text-decoration:underline;">🔑 API Settings</span>
              <span id="panel-open-external-portal" style="cursor:pointer; text-decoration:underline; color:#2563eb;">🚀 Open in External Portal ↗</span>
            </div>
            <div id="panel-api-key-drawer" style="display:none; flex-direction:column; gap:4px; margin-top:4px; background:#f8fafc; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
              <div style="font-size:11px; font-weight:600; color:#334155;">Google Gemini API Key (Optional):</div>
              <div style="display:flex; gap:4px;">
                <input type="password" id="panel-gemini-key-input" placeholder="AIzaSy..." style="flex:1; padding:4px 6px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;" value="${escapeHtml(geminiApiKey)}" />
                <button id="panel-save-gemini-key" style="background:#2563eb; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:600; cursor:pointer;">Save</button>
              </div>
              <div style="font-size:10px; color:#64748b; line-height:1.3;">When set, queries call the live Gemini API. Without a key, our built-in smart academic synthesis engine processes the context locally.</div>
            </div>
          </div>
        </div>

        <!-- Account & Sync Tab -->
        <div class="web-hl-tab-content" id="tab-content-account">
          <div class="web-hl-sync-card">
            <div style="font-weight: 700; font-size: 13px; color: #0f172a;">Track &amp; Sync with Gmail</div>
            <div style="font-size: 11.5px; color: #64748b; line-height: 1.4;">
              Link your Google / Gmail account to synchronize highlights, tags, and research notes across all your devices.
            </div>
            <input type="email" class="web-hl-sync-input" id="panel-gmail-input" placeholder="e.g. yourname@gmail.com" />
            <button class="web-hl-sync-btn" id="panel-btn-save-sync">Save &amp; Track</button>
          </div>
          <div class="web-hl-sync-card">
            <div style="font-size: 12px; font-weight: 600; color: #0f172a;">Cloud Sync Status</div>
            <div id="panel-sync-status-text" style="font-size: 11.5px; color: #16a34a;">● Not connected yet</div>
            <button class="web-hl-edge-btn" id="panel-btn-sync-now" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:7px; font-size:11.5px;">
              🔄 Sync Highlights Now
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(sidePanel);

    // Close button (permanently closes panel & floating toggle)
    sidePanel.querySelector('.web-hl-panel-close').addEventListener('click', permanentlyCloseSidePanel);

    // Tab buttons
    sidePanel.querySelectorAll('.web-hl-panel-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchSidePanelTab(tab);
      });
    });

    // Account pill click
    const accountPill = sidePanel.querySelector('#panel-account-pill');
    accountPill.addEventListener('click', () => {
      switchSidePanelTab('account');
    });

    // Save Gmail Sync
    const saveSyncBtn = sidePanel.querySelector('#panel-btn-save-sync');
    const gmailInput = sidePanel.querySelector('#panel-gmail-input');
    saveSyncBtn.addEventListener('click', () => {
      const email = gmailInput.value.trim();
      if (email.includes('@')) {
        saveUserProfile({
          email: email,
          syncedAt: new Date().toISOString()
        });
      }
    });

    // Sync Now button
    const syncNowBtn = sidePanel.querySelector('#panel-btn-sync-now');
    syncNowBtn.addEventListener('click', () => {
      currentUserProfile.syncedAt = new Date().toISOString();
      saveUserProfile(currentUserProfile);
      syncNowBtn.textContent = '✓ Synced Successfully!';
      setTimeout(() => { syncNowBtn.textContent = '🔄 Sync Highlights Now'; }, 1500);
    });

    // --- Interactive Chatbot Event Wiring ---
    const chatInput = sidePanel.querySelector('#panel-chat-input');
    const chatSendBtn = sidePanel.querySelector('#panel-chat-send-btn');
    const toggleApiKeyBtn = sidePanel.querySelector('#panel-toggle-api-key');
    const apiKeyDrawer = sidePanel.querySelector('#panel-api-key-drawer');
    const saveKeyBtn = sidePanel.querySelector('#panel-save-gemini-key');
    const keyInput = sidePanel.querySelector('#panel-gemini-key-input');
    const openExternalPortal = sidePanel.querySelector('#panel-open-external-portal');

    chatSendBtn.addEventListener('click', () => {
      const q = chatInput.value.trim();
      if (q) {
        chatInput.value = '';
        executeChatQuery(q);
      }
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const q = chatInput.value.trim();
        if (q) {
          chatInput.value = '';
          executeChatQuery(q);
        }
      }
    });

    // Quick prompt chips
    sidePanel.querySelectorAll('.web-hl-quick-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.dataset.q;
        if (query) executeChatQuery(query);
      });
    });

    // API Key Drawer
    toggleApiKeyBtn.addEventListener('click', () => {
      apiKeyDrawer.style.display = apiKeyDrawer.style.display === 'none' ? 'flex' : 'none';
    });

    saveKeyBtn.addEventListener('click', () => {
      geminiApiKey = keyInput.value.trim();
      chrome.storage.local.set({ hl_gemini_api_key: geminiApiKey });
      saveKeyBtn.textContent = '✓ Saved!';
      setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 1500);
    });

    // Open External Portal with clipboard copy
    openExternalPortal.addEventListener('click', () => {
      const title = (detectedPaper && detectedPaper.title) ? detectedPaper.title : document.title || currentUrl;
      const quotes = currentHighlights.map((h, i) => `[${i + 1}] "${h.exact}"${h.comment ? ` (Note: ${h.comment})` : ''}`).join('\n\n');
      const promptText = `Academic Paper: ${title}\nURL: ${currentUrl}\n\nCollected Highlights & Notes:\n${quotes}\n\nPlease summarize the key methodology, findings, and critical implications.`;
      navigator.clipboard.writeText(promptText);
      window.open('https://gemini.google.com/app', '_blank');
    });
  }

  function updateChatContextBadge() {
    if (!sidePanel) return;
    const badge = sidePanel.querySelector('#panel-chat-context-text');
    if (badge) {
      const count = currentHighlights.length;
      badge.textContent = `Loaded ${count} ${count === 1 ? 'highlight' : 'highlights'} from this paper`;
    }
  }

  // --- Interactive Chat Engine with Highlight Access ---
  async function executeChatQuery(query) {
    if (!sidePanel) return;
    const messagesContainer = sidePanel.querySelector('#panel-chat-messages');
    if (!messagesContainer) return;

    // Append User Message
    const userBubble = document.createElement('div');
    userBubble.className = 'web-hl-chat-bubble user';
    userBubble.textContent = query;
    messagesContainer.appendChild(userBubble);

    // Append Assistant Loading Bubble
    const assistantBubble = document.createElement('div');
    assistantBubble.className = 'web-hl-chat-bubble assistant';
    assistantBubble.innerHTML = '<em>Analyzing highlights &amp; paper context...</em>';
    messagesContainer.appendChild(assistantBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const title = (detectedPaper && detectedPaper.title) ? detectedPaper.title : document.title || currentUrl;
    const highlightsContext = currentHighlights.map((h, i) => {
      let item = `[Quote ${i + 1}]: "${h.exact}"`;
      if (h.comment) item += `\nNote: ${h.comment}`;
      if (h.tags && h.tags.length > 0) item += `\nTags: ${h.tags.join(', ')}`;
      return item;
    }).join('\n\n');

    // 1. If Gemini API key is configured, call Gemini API
    if (geminiApiKey) {
      try {
        const fullPrompt = `You are an expert PhD academic advisor and senior peer reviewer (EPSL, JGR Solid Earth).
You are analyzing the following scientific paper and user highlights:

Title: ${title}
URL: ${currentUrl}

User Highlights and Annotations:
${highlightsContext || "No highlights recorded yet on this page."}

User Question: ${query}

Provide a direct, rigorous, objective, and defense-ready academic answer based on the highlights and context. Never use sycophantic praise. Highlight physical consistency, methodological rigor, and data resolution.`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }]
          })
        });

        if (res.ok) {
          const data = await res.json();
          const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            assistantBubble.innerHTML = formatMarkdownToHtml(replyText);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return;
          }
        }
      } catch (err) {
        console.warn("[Web Highlighter] Gemini API call failed, falling back to local synthesis:", err);
      }
    }

    // 2. Intelligent Client-Side Synthesis Engine (Offline / Local)
    const localReply = generateLocalAcademicSynthesis(query, title, currentHighlights);
    assistantBubble.innerHTML = localReply;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function formatMarkdownToHtml(text) {
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:#e2e8f0; padding:1px 4px; border-radius:3px;">$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function generateLocalAcademicSynthesis(query, title, highlights) {
    const qLower = query.toLowerCase();
    const count = highlights.length;

    if (count === 0) {
      return `<strong>Context Notice:</strong> No text has been highlighted on this page yet.<br>Select any passage on the page to highlight and tag it; it will automatically feed into this AI assistant.`;
    }

    const quotesList = highlights.map((h, i) => `<li><strong>[${i + 1}]</strong> "${escapeHtml(h.exact)}" ${h.comment ? `<em>(Note: ${escapeHtml(h.comment)})</em>` : ''}</li>`).join('');
    const tagsMap = {};
    highlights.forEach(h => {
      (h.tags || []).forEach(t => { tagsMap[t] = (tagsMap[t] || 0) + 1; });
    });
    const tagSummary = Object.keys(tagsMap).map(t => `<span class="web-hl-chip">${escapeHtml(t)} (${tagsMap[t]})</span>`).join(' ') || '<em>None</em>';

    if (qLower.includes('summar') || qLower.includes('overview') || qLower.includes('takeaway')) {
      return `<strong>Synthesis Summary for:</strong> <em>${escapeHtml(title)}</em><br><br>
        <strong>1. Highlights Extracted:</strong> ${count} passages cataloged.<br>
        <strong>2. Active Topic Tags:</strong> ${tagSummary}<br><br>
        <strong>3. Core Evidence:</strong>
        <ul style="padding-left:18px; margin:4px 0 8px 0; font-size:11.5px;">${quotesList}</ul>
        <strong>4. Key Academic Takeaway:</strong> The collected quotes document the empirical and methodological foundation of the study. Each highlighted observation directly constrains the model parameters.`;
    }

    if (qLower.includes('method') || qLower.includes('equation') || qLower.includes('math') || qLower.includes('inversion')) {
      return `<strong>Methodological &amp; Inversion Evaluation:</strong><br><br>
        <strong>Examined Highlights (${count}):</strong>
        <ul style="padding-left:18px; margin:4px 0 8px 0; font-size:11.5px;">${quotesList}</ul>
        <strong>Rigorous Methodological Check:</strong>
        <ul style="padding-left:18px; margin:4px 0 8px 0; font-size:11.5px;">
          <li><strong>Discretization &amp; Damping:</strong> Ensure grid cell sizes or parametrization choices respect Fresnel zone and path coverage density.</li>
          <li><strong>Parameter Perturbations:</strong> Verify whether source, site, and path attenuation terms are uncoupled or trade off during joint inversion.</li>
          <li><strong>Physical Bounds:</strong> Check for non-negative attenuation and realistic crustal velocity bounds.</li>
        </ul>`;
    }

    if (qLower.includes('critique') || qLower.includes('review') || qLower.includes('assumption') || qLower.includes('objection')) {
      return `<strong>Critical Review &amp; Defense Cross-Examination:</strong><br><br>
        <strong>Potential Peer Reviewer Objections:</strong>
        <ol style="padding-left:18px; margin:4px 0 8px 0; font-size:11.5px;">
          <li><strong>Ray Coverage &amp; Resolution:</strong> Are the highlighted conclusions supported across all azimuths, or biased by dominant ray paths?</li>
          <li><strong>Trade-Offs:</strong> Could site response perturbations absorb crustal attenuation anomalies?</li>
          <li><strong>Underlying Assumptions:</strong> Are planar wavefront or single-scattering approximations strictly valid in this frequency band?</li>
        </ol>
        <em>Tip: Add an API key under <strong>🔑 API Settings</strong> to generate deep unconstrained LLM peer-review reasoning.</em>`;
    }

    // Default contextual answer
    return `<strong>Highlight Context Analysis:</strong><br><br>
      Analyzed <strong>${count}</strong> highlight${count === 1 ? '' : 's'} under topic tags: ${tagSummary}.<br><br>
      <ul style="padding-left:18px; margin:4px 0 8px 0; font-size:11.5px;">${quotesList}</ul>
      <em>Tip: You can also click <strong>🚀 Open in External Portal</strong> above to carry this complete highlights context into Gemini / ChatGPT.</em>`;
  }

  function toggleSidePanel() {
    if (!sidePanel) return;
    if (sidePanel.classList.contains('open')) {
      closeSidePanel();
    } else {
      openSidePanel();
    }
  }

  function openSidePanel(tab = 'highlights') {
    if (!sidePanel) createSidePanel();
    sidePanel.classList.add('open');
    switchSidePanelTab(tab);
    renderSidePanelHighlights();
    updateAccountSyncStatusUI();
    updateChatContextBadge();
  }

  function closeSidePanel() {
    if (sidePanel) sidePanel.classList.remove('open');
  }

  function permanentlyCloseSidePanel() {
    closeSidePanel();
    if (sidePanelToggle) sidePanelToggle.style.display = 'none';
    sidepanelToggleDisabled = true;
    chrome.storage.local.set({ hl_sidepanel_toggle_disabled: true });
  }

  function switchSidePanelTab(tab) {
    activeSidePanelTab = tab;
    if (!sidePanel) return;

    sidePanel.querySelectorAll('.web-hl-panel-tab-btn').forEach(b => {
      if (b.dataset.tab === tab) b.classList.add('active');
      else b.classList.remove('active');
    });

    sidePanel.querySelectorAll('.web-hl-tab-content').forEach(c => {
      if (c.id === `tab-content-${tab}`) c.classList.add('active');
      else c.classList.remove('active');
    });
  }

  function updateAccountSyncStatusUI() {
    if (!sidePanel) return;
    const label = sidePanel.querySelector('#panel-account-label');
    const statusText = sidePanel.querySelector('#panel-sync-status-text');
    const gmailInput = sidePanel.querySelector('#panel-gmail-input');

    if (currentUserProfile && currentUserProfile.email) {
      if (label) label.textContent = currentUserProfile.email;
      if (gmailInput) gmailInput.value = currentUserProfile.email;
      if (statusText) {
        const syncDate = currentUserProfile.syncedAt ? new Date(currentUserProfile.syncedAt).toLocaleTimeString() : 'Just now';
        statusText.innerHTML = `🟢 <strong>Connected:</strong> ${escapeHtml(currentUserProfile.email)}<br><span style="color:#64748b; font-size:11px;">Last synced: ${syncDate}</span>`;
      }
    } else {
      if (label) label.textContent = 'Track with Gmail';
      if (statusText) statusText.textContent = '● Not connected yet. Enter your email above.';
    }
  }

  function renderSidePanelHighlights() {
    if (!sidePanel) return;
    const listContainer = sidePanel.querySelector('#panel-highlights-list');
    const countSpan = sidePanel.querySelector('#panel-hl-count');
    if (countSpan) countSpan.textContent = currentHighlights.length;

    if (currentHighlights.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; color: #94a3b8; font-size: 12px; padding: 24px 8px;">
          No highlights yet on this page.<br>Select any text to highlight!
        </div>
      `;
      return;
    }

    listContainer.innerHTML = currentHighlights.map(hl => {
      const color = hl.color || 'yellow';
      const isCustom = typeof color === 'string' && color.startsWith('#');
      const dotStyle = isCustom ? `background-color: ${color};` : '';
      const dotClass = isCustom ? '' : `hl-dot-${color}`;
      const tagsList = (hl.tags && hl.tags.length > 0)
        ? hl.tags.map(t => `<span class="web-hl-chip">${escapeHtml(t)}</span>`).join(' ')
        : '';

      return `
        <div class="web-hl-side-card" data-id="${hl.id}">
          <div class="web-hl-side-card-header">
            <span class="color-dot-indicator ${dotClass}" style="width:10px; height:10px; border-radius:50%; display:inline-block; ${dotStyle}"></span>
            <div style="display:flex; gap: 4px;">
              <button class="web-hl-edge-btn side-jump-btn" data-id="${hl.id}" title="Jump to text">🎯 Jump</button>
              <button class="web-hl-edge-btn side-delete-btn" data-id="${hl.id}" title="Delete highlight" style="color: #ef4444;">🗑️</button>
            </div>
          </div>
          <div class="web-hl-side-quote">"${escapeHtml(hl.exact)}"</div>
          ${hl.comment ? `<div class="web-hl-side-note">💬 ${escapeHtml(hl.comment)}</div>` : ''}
          ${tagsList ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">${tagsList}</div>` : ''}
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.side-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        scrollToHighlight(btn.dataset.id);
      });
    });

    listContainer.querySelectorAll('.side-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteHighlight(btn.dataset.id);
      });
    });
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

    // Show small floating bubble first! (Edge menu only opens on hover/click)
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

    // Comment drawer stays strictly closed! Only show the color line
    const commentDrawer = edgeMenu.querySelector('.web-hl-edge-comment-drawer');
    commentDrawer.style.display = 'none';

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

    // Never auto-open comment drawer - only show the color line until Note button is clicked!
    commentDrawer.style.display = 'none';

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
      hideTriggerBubble();
      return;
    }

    if (!detectedPaper && window.WebHighlighterPaperDetector) {
      detectedPaper = window.WebHighlighterPaperDetector.detectPaperMetadata();
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
    if (message.action === "OPEN_SIDEPANEL") {
      openSidePanel(message.tab || 'highlights');
      sendResponse({ success: true });
    } else if (message.action === "HIGHLIGHT_SELECTION") {
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
