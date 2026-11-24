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

  // Active state
  let edgeMenu = null;
  let activeSelectionRange = null;
  let currentTargetHighlight = null;

  // Side Panel state
  let sidePanel = null;
  let sidePanelToggle = null;
  let activeSidePanelTab = 'highlights';
  let activeAiPlatform = 'gemini';
  let currentUserProfile = { email: '', syncedAt: '' };

  // --- Storage Helpers (Auto-Save & Profile) ---
  function getStorageKey() {
    return 'hl_page_' + encodeURIComponent(currentUrl);
  }

  async function loadUserProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['hl_user_profile'], (result) => {
        currentUserProfile = result.hl_user_profile || { email: '', syncedAt: '' };
        resolve(currentUserProfile);
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
        if (sidePanel) renderSidePanelHighlights();
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

  // --- Initial Setup & Restoration ---
  async function init() {
    if (window.WebHighlighterPaperDetector) {
      detectedPaper = window.WebHighlighterPaperDetector.detectPaperMetadata();
    }

    await loadUserProfile();
    createEdgeMenu();
    createSidePanel();

    currentHighlights = await loadHighlightsFromStorage();

    restoreAllHighlights();
    setTimeout(restoreAllHighlights, 500);
    setTimeout(restoreAllHighlights, 1500);

    updateExtensionBadge(currentHighlights.length);
    renderSidePanelHighlights();
    updateAccountSyncStatusUI();
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

  // --- Create Selection Mini Menu ---
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
          <div class="web-hl-colorwheel-wrap" title="Custom color picker">
            <input type="color" class="web-hl-colorwheel-picker" value="#a855f7" />
          </div>
        </div>
        <div class="web-hl-edge-divider"></div>
        <button class="web-hl-edge-btn btn-comment" title="Add / View Note & Tags">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
          </svg>
        </button>
        <button class="web-hl-edge-btn btn-sidepanel" title="Open Side Panel & AI">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 2v8h7V6H4zm9 0v8h3V6h-3z" clip-rule="evenodd"/>
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
        <textarea class="web-hl-edge-comment-textarea" placeholder="Add a note (auto-saves)..." rows="3"></textarea>
        <div class="web-hl-edge-tags-section">
          <div class="web-hl-tags-chips"></div>
          <input type="text" class="web-hl-edge-tag-input" placeholder="+ Add tag (Enter)" />
        </div>
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
      if (currentTargetHighlight) {
        changeHighlightColor(currentTargetHighlight.id, chosenColor);
      } else if (activeSelectionRange) {
        performHighlight(chosenColor);
      }
    });

    // Toggle inline comment drawer
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

    // Tag input in menu drawer
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

  function renderMenuTagChips(tags) {
    if (!edgeMenu) return;
    const chipsContainer = edgeMenu.querySelector('.web-hl-tags-chips');
    if (!chipsContainer) return;

    chipsContainer.innerHTML = (tags || []).map(t => `
      <span class="web-hl-chip">
        #${escapeHtml(t)}
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
  }

  // --- In-Page Side Panel Implementation ---
  function createSidePanel() {
    if (document.getElementById('web-hl-sidepanel')) return;

    // Toggle button on right screen edge
    sidePanelToggle = document.createElement('div');
    sidePanelToggle.id = 'web-hl-sidebar-toggle';
    sidePanelToggle.title = 'Open Web Highlights & AI Side Panel';
    sidePanelToggle.innerHTML = `
      <span class="toggle-icon">📑</span>
      <span class="toggle-badge">${currentHighlights.length}</span>
    `;
    sidePanelToggle.addEventListener('click', () => {
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
        <button class="web-hl-panel-tab-btn" data-tab="ai">🤖 AI Portal</button>
        <button class="web-hl-panel-tab-btn" data-tab="account">👤 Sync</button>
      </div>
      <div class="web-hl-panel-body">
        <!-- Highlights Tab -->
        <div class="web-hl-tab-content active" id="tab-content-highlights">
          <div style="font-size: 11.5px; color: #64748b; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(detectedPaper && detectedPaper.title ? detectedPaper.title : document.title || currentUrl)}
          </div>
          <div id="panel-highlights-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>

        <!-- AI Assistant Tab -->
        <div class="web-hl-tab-content" id="tab-content-ai">
          <div style="font-size: 12px; font-weight: 600; color: #334155;">Select AI Model Portal:</div>
          <div class="web-hl-ai-selector-row">
            <button class="web-hl-ai-btn active" data-ai="gemini">Gemini</button>
            <button class="web-hl-ai-btn" data-ai="chatgpt">ChatGPT</button>
            <button class="web-hl-ai-btn" data-ai="claude">Claude</button>
          </div>
          <div style="font-size: 11.5px; color: #64748b;">Instant Research Prompt Templates:</div>
          <div class="web-hl-ai-prompt-templates">
            <button class="web-hl-ai-template-btn" data-template="summary">⚡ Summarize all highlights</button>
            <button class="web-hl-ai-template-btn" data-template="methodology">🔬 Explain methodology &amp; equations</button>
            <button class="web-hl-ai-template-btn" data-template="critique">💡 Cross-examine findings &amp; assumptions</button>
            <button class="web-hl-ai-template-btn" data-template="bibnote">📝 Draft literature review citation note</button>
          </div>
          <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">Context &amp; Prompt Editor:</div>
          <textarea class="web-hl-ai-textarea" id="panel-ai-prompt-text"></textarea>
          <button class="web-hl-ai-portal-action" id="panel-btn-launch-ai">
            <span>🚀 Open in <span id="panel-active-ai-name">Gemini</span> Portal</span>
          </button>
          <div id="panel-ai-toast" style="display:none; font-size:11.5px; color:#16a34a; text-align:center; padding: 4px;">
            ✓ Prompt copied to clipboard! Paste directly in the portal.
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

    // Close button
    sidePanel.querySelector('.web-hl-panel-close').addEventListener('click', closeSidePanel);

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

    // AI model selector buttons
    sidePanel.querySelectorAll('.web-hl-ai-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sidePanel.querySelectorAll('.web-hl-ai-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeAiPlatform = btn.dataset.ai;
        const nameMap = { gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude' };
        sidePanel.querySelector('#panel-active-ai-name').textContent = nameMap[activeAiPlatform] || 'AI';
      });
    });

    // AI prompt templates
    sidePanel.querySelectorAll('.web-hl-ai-template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const template = btn.dataset.template;
        generateAiPrompt(template);
      });
    });

    // AI portal launch action
    const launchAiBtn = sidePanel.querySelector('#panel-btn-launch-ai');
    launchAiBtn.addEventListener('click', () => {
      launchAiPortal();
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

    generateAiPrompt('summary');
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
  }

  function closeSidePanel() {
    if (sidePanel) sidePanel.classList.remove('open');
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
        ? hl.tags.map(t => `<span class="web-hl-chip">#${escapeHtml(t)}</span>`).join(' ')
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

  function generateAiPrompt(template) {
    if (!sidePanel) return;
    const textarea = sidePanel.querySelector('#panel-ai-prompt-text');
    if (!textarea) return;

    const title = (detectedPaper && detectedPaper.title) ? detectedPaper.title : document.title || currentUrl;
    const quotes = currentHighlights.map((h, i) => `[Quote ${i + 1}]: "${h.exact}"${h.comment ? ` (Note: ${h.comment})` : ''}`).join('\n');

    let prompt = '';
    if (template === 'summary') {
      prompt = `Please provide a rigorous academic summary of the key findings from this paper:\n\nTitle: ${title}\nURL: ${currentUrl}\n\nCollected Highlights & Notes:\n${quotes}\n\nSummarize the core hypothesis, methodology, results, and broader implications.`;
    } else if (template === 'methodology') {
      prompt = `Analyze the methodology, equations, and experimental framework based on the following research quotes:\n\nTitle: ${title}\n\nQuotes:\n${quotes}\n\nExplain how the analysis is constructed, the parameters used, and any methodological subtleties.`;
    } else if (template === 'critique') {
      prompt = `Act as an expert peer reviewer (EPSL/JGR Solid Earth). Critically examine the following findings and claims:\n\nTitle: ${title}\n\nQuotes:\n${quotes}\n\nIdentify unsupported assumptions, resolution/data limitations, potential reviewer objections, and rock-physics/physical discrepancies.`;
    } else if (template === 'bibnote') {
      prompt = `Draft an organized literature review note for my thesis including a BibTeX entry and 3 key takeaways for:\n\nTitle: ${title}\nURL: ${currentUrl}\n\nHighlights:\n${quotes}`;
    }

    textarea.value = prompt;
  }

  function launchAiPortal() {
    if (!sidePanel) return;
    const textarea = sidePanel.querySelector('#panel-ai-prompt-text');
    const toast = sidePanel.querySelector('#panel-ai-toast');
    const promptText = textarea ? textarea.value : '';

    if (promptText) {
      navigator.clipboard.writeText(promptText);
      if (toast) {
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    }

    const portalUrls = {
      gemini: 'https://gemini.google.com/app',
      chatgpt: 'https://chatgpt.com/',
      claude: 'https://claude.ai/new'
    };

    const targetUrl = portalUrls[activeAiPlatform] || 'https://gemini.google.com/app';
    window.open(targetUrl, '_blank');
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
        if (picker) picker.value = selectedColor;
        wheelWrap.title = `Custom color: ${selectedColor} (click to change)`;
      } else {
        wheelWrap.classList.remove('active-selected');
        wheelWrap.title = 'Pick custom color';
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
    const commentTextarea = edgeMenu.querySelector('.web-hl-edge-comment-textarea');

    renderMenuTagChips(hl.tags || []);

    if (hl.comment && hl.comment.trim().length > 0) {
      commentBtn.classList.add('has-note');
      commentDrawer.style.display = 'flex';
      commentTextarea.value = hl.comment;
    } else {
      commentBtn.classList.remove('has-note');
      commentDrawer.style.display = 'none';
      commentTextarea.value = '';
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
