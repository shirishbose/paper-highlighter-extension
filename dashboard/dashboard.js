// dashboard.js - Full-page Annotations & Library Dashboard with Academic Paper Support

document.addEventListener('DOMContentLoaded', () => {
  let allPagesData = [];
  let currentColorFilter = 'all';
  let currentTagFilter = 'all';
  let currentSort = 'recent';
  let filterOnlyNotes = false;
  let filterOnlyPapers = false;
  let currentUserProfile = { email: '', syncedAt: '' };

  // DOM Elements
  const statTotalHighlights = document.getElementById('stat-total-highlights');
  const statTotalNotes = document.getElementById('stat-total-notes');
  const statTotalPapers = document.getElementById('stat-total-papers');

  const colorFilterButtons = document.querySelectorAll('.color-filter-btn');
  const filterHasNotesCheckbox = document.getElementById('filter-has-notes');
  const filterOnlyPapersCheckbox = document.getElementById('filter-only-papers');
  const searchInput = document.getElementById('dashboard-search-input');
  const sortSelect = document.getElementById('dash-sort-select');
  const activeTagBadge = document.getElementById('active-tag-badge');
  const activeTagName = document.getElementById('active-tag-name');
  const btnClearTag = document.getElementById('btn-clear-tag');
  const tagCloudContainer = document.getElementById('dash-tag-cloud');

  // Gmail Auth & Tracking Elements
  const dashAuthLoggedOut = document.getElementById('dash-auth-logged-out');
  const dashAuthLoggedIn = document.getElementById('dash-auth-logged-in');
  const dashLoginEmailInput = document.getElementById('dash-login-email-input');
  const dashBtnGoogleLogin = document.getElementById('dash-btn-google-login');
  const dashUserAvatar = document.getElementById('dash-user-avatar');
  const dashLoggedEmail = document.getElementById('dash-logged-email');
  const dashBtnSyncNow = document.getElementById('dash-btn-sync-now');
  const dashBtnLogout = document.getElementById('dash-btn-logout');

  const pagesFeed = document.getElementById('pages-feed');
  const emptyState = document.getElementById('dash-empty-state');

  const btnExportTxtDash = document.getElementById('btn-export-txt-dash');
  const btnExportBibtexDash = document.getElementById('btn-export-bibtex-dash');
  const btnExportMd = document.getElementById('btn-export-markdown');
  const btnExportJson = document.getElementById('btn-export-json');
  const importJsonFile = document.getElementById('import-json-file');

  // --- Initial Load ---
  loadData();

  function loadData() {
    chrome.storage.local.get(null, (items) => {
      allPagesData = [];
      const pageIndex = items.hl_page_index || [];
      currentUserProfile = items.hl_user_profile || { email: '', syncedAt: '', loggedIn: false };

      // Purge any phantom "index" metadata item from storage permanently
      const cleanedIndex = pageIndex.filter(p => p && p.url && p.url !== 'index' && p.url.includes('://'));
      if (cleanedIndex.length !== pageIndex.length) {
        chrome.storage.local.set({ hl_page_index: cleanedIndex });
      }

      updateAuthUI();

      let totalHighlights = 0;
      let totalNotes = 0;
      let totalPapers = 0;
      const allTagsCountMap = {};

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && key !== 'hl_page_index' && Array.isArray(value) && value.length > 0) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          if (rawUrl === 'index' || !rawUrl.includes('://')) continue;
          const meta = cleanedIndex.find(p => p.url === rawUrl) || {};

          totalHighlights += value.length;
          totalNotes += value.filter(h => h.comment && h.comment.trim().length > 0).length;

          const isPaper = (meta.paper && (meta.paper.isPaper || meta.paper.doi)) ||
                          value.some(h => h.paper && (h.paper.isPaper || h.paper.doi));
          if (isPaper) totalPapers++;

          // Aggregate page tags
          const pageTagsSet = new Set();
          value.forEach(h => {
            if (Array.isArray(h.tags)) {
              h.tags.forEach(t => {
                const cleanT = t.trim();
                if (cleanT) {
                  pageTagsSet.add(cleanT);
                  allTagsCountMap[cleanT] = (allTagsCountMap[cleanT] || 0) + 1;
                }
              });
            }
          });

          allPagesData.push({
            url: rawUrl,
            title: meta.title || rawUrl,
            paper: meta.paper || null,
            highlights: value,
            allTags: Array.from(pageTagsSet),
            lastUpdated: meta.updatedAt || new Date().toISOString()
          });
        }
      }

      // Update stats
      statTotalHighlights.textContent = totalHighlights;
      statTotalNotes.textContent = totalNotes;
      if (statTotalPapers) statTotalPapers.textContent = totalPapers;

      renderTagCloud(allTagsCountMap);
      applyFiltersAndRender();
    });
  }

  function updateAuthUI() {
    if (!dashAuthLoggedOut || !dashAuthLoggedIn) return;
    if (currentUserProfile && currentUserProfile.email && currentUserProfile.loggedIn) {
      dashAuthLoggedOut.style.display = 'none';
      dashAuthLoggedIn.style.display = 'block';
      if (dashLoggedEmail) dashLoggedEmail.textContent = currentUserProfile.email;
      if (dashUserAvatar) {
        const initial = currentUserProfile.email.charAt(0).toUpperCase() || 'G';
        dashUserAvatar.textContent = initial;
      }
    } else {
      dashAuthLoggedOut.style.display = 'block';
      dashAuthLoggedIn.style.display = 'none';
      if (dashLoginEmailInput && currentUserProfile.email) {
        dashLoginEmailInput.value = currentUserProfile.email;
      }
    }
  }

  if (dashBtnGoogleLogin) {
    dashBtnGoogleLogin.addEventListener('click', () => {
      let email = (dashLoginEmailInput ? dashLoginEmailInput.value : '').trim();
      if (!email || !email.includes('@')) {
        email = prompt("Enter your Google / Gmail account to track highlights:", "researcher@gmail.com");
      }
      if (email && email.includes('@')) {
        currentUserProfile = {
          email: email.trim(),
          loggedIn: true,
          syncedAt: new Date().toISOString()
        };
        chrome.storage.local.set({ hl_user_profile: currentUserProfile }, () => {
          updateAuthUI();
        });
      }
    });
  }

  if (dashBtnSyncNow) {
    dashBtnSyncNow.addEventListener('click', () => {
      currentUserProfile.syncedAt = new Date().toISOString();
      chrome.storage.local.set({ hl_user_profile: currentUserProfile }, () => {
        dashBtnSyncNow.textContent = '✓ Synced!';
        setTimeout(() => { dashBtnSyncNow.textContent = '🔄 Sync'; }, 1500);
      });
    });
  }

  if (dashBtnLogout) {
    dashBtnLogout.addEventListener('click', () => {
      currentUserProfile.loggedIn = false;
      chrome.storage.local.set({ hl_user_profile: currentUserProfile }, () => {
        updateAuthUI();
      });
    });
  }

  function renderTagCloud(tagsCountMap) {
    if (!tagCloudContainer) return;
    const tags = Object.keys(tagsCountMap);
    if (tags.length === 0) {
      tagCloudContainer.innerHTML = '<span style="font-size: 11.5px; color: #94a3b8;">No tags yet</span>';
      return;
    }

    tagCloudContainer.innerHTML = tags.map(tag => {
      const count = tagsCountMap[tag];
      const isActive = currentTagFilter === tag ? 'active' : '';
      return `<button class="tag-pill-btn ${isActive}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span style="font-size:10px; opacity:0.75;">(${count})</span></button>`;
    }).join('');

    tagCloudContainer.querySelectorAll('.tag-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        setTagFilter(currentTagFilter === tag ? 'all' : tag);
      });
    });
  }

  function setTagFilter(tag) {
    currentTagFilter = tag;
    if (activeTagBadge && activeTagName) {
      if (tag === 'all') {
        activeTagBadge.style.display = 'none';
      } else {
        activeTagName.textContent = tag;
        activeTagBadge.style.display = 'inline-flex';
      }
    }

    if (tagCloudContainer) {
      tagCloudContainer.querySelectorAll('.tag-pill-btn').forEach(b => {
        if (b.dataset.tag === tag) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    applyFiltersAndRender();
  }

  if (btnClearTag) {
    btnClearTag.addEventListener('click', () => {
      setTagFilter('all');
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFiltersAndRender();
    });
  }

  // --- Filters ---
  colorFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      colorFilterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColorFilter = btn.dataset.color;
      applyFiltersAndRender();
    });
  });

  filterHasNotesCheckbox.addEventListener('change', (e) => {
    filterOnlyNotes = e.target.checked;
    applyFiltersAndRender();
  });

  if (filterOnlyPapersCheckbox) {
    filterOnlyPapersCheckbox.addEventListener('change', (e) => {
      filterOnlyPapers = e.target.checked;
      applyFiltersAndRender();
    });
  }

  searchInput.addEventListener('input', () => {
    applyFiltersAndRender();
  });

  function applyFiltersAndRender() {
    const query = searchInput.value.toLowerCase().trim();

    const filteredPages = allPagesData.map(page => {
      const isPaper = (page.paper && (page.paper.isPaper || page.paper.doi)) ||
                      page.highlights.some(h => h.paper && (h.paper.isPaper || h.paper.doi));

      if (filterOnlyPapers && !isPaper) {
        return null;
      }

      // Tag filter
      if (currentTagFilter !== 'all') {
        const hasTag = (page.allTags || []).includes(currentTagFilter);
        if (!hasTag) return null;
      }

      const pageTitleMatch = page.title.toLowerCase().includes(query);
      const pageUrlMatch = page.url.toLowerCase().includes(query);
      const paperMatch = page.paper && (
        (page.paper.doi && page.paper.doi.toLowerCase().includes(query)) ||
        (page.paper.authors && page.paper.authors.toLowerCase().includes(query)) ||
        (page.paper.journal && page.paper.journal.toLowerCase().includes(query))
      );

      const matchingHighlights = page.highlights.filter(hl => {
        if (currentColorFilter !== 'all' && (hl.color || 'yellow') !== currentColorFilter) {
          return false;
        }

        if (filterOnlyNotes && (!hl.comment || hl.comment.trim().length === 0)) {
          return false;
        }

        if (currentTagFilter !== 'all') {
          if (!Array.isArray(hl.tags) || !hl.tags.includes(currentTagFilter)) {
            return false;
          }
        }

        if (query) {
          const quoteMatch = hl.exact.toLowerCase().includes(query);
          const commentMatch = hl.comment && hl.comment.toLowerCase().includes(query);
          const tagMatch = Array.isArray(hl.tags) && hl.tags.some(t => t.toLowerCase().includes(query));
          return quoteMatch || commentMatch || tagMatch || pageTitleMatch || pageUrlMatch || paperMatch;
        }

        return true;
      });

      if (matchingHighlights.length > 0) {
        return {
          ...page,
          highlights: matchingHighlights
        };
      }
      return null;
    }).filter(Boolean);

    // Sort pages
    filteredPages.sort((a, b) => {
      if (currentSort === 'recent') {
        return new Date(b.lastUpdated) - new Date(a.lastUpdated);
      } else if (currentSort === 'highlights') {
        return b.highlights.length - a.highlights.length;
      } else if (currentSort === 'tags') {
        return (b.allTags || []).length - (a.allTags || []).length;
      } else if (currentSort === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    renderFeed(filteredPages);
  }

  // Academic & Web Publisher Brand Color Mapping
  function getWebsiteBrand(url) {
    let hostname = '';
    try { hostname = new URL(url).hostname.toLowerCase(); } catch(e) { hostname = (url || '').toLowerCase(); }

    // Elsevier / ScienceDirect -> Vibrant Orange
    if (hostname.includes('sciencedirect') || hostname.includes('elsevier')) {
      return {
        name: 'ScienceDirect',
        primaryColor: '#f97316',
        bgLight: '#fff7ed',
        borderColor: '#fdba74',
        textColor: '#c2410c'
      };
    }
    // Nature
    if (hostname.includes('nature.com')) {
      return {
        name: 'Nature',
        primaryColor: '#dc2626',
        bgLight: '#fef2f2',
        borderColor: '#fca5a5',
        textColor: '#b91c1c'
      };
    }
    // SpringerLink
    if (hostname.includes('springer')) {
      return {
        name: 'SpringerLink',
        primaryColor: '#0284c7',
        bgLight: '#f0f9ff',
        borderColor: '#bae6fd',
        textColor: '#0369a1'
      };
    }
    // arXiv
    if (hostname.includes('arxiv')) {
      return {
        name: 'arXiv',
        primaryColor: '#991b1b',
        bgLight: '#fef2f2',
        borderColor: '#fecaca',
        textColor: '#991b1b'
      };
    }
    // IEEE Xplore
    if (hostname.includes('ieee')) {
      return {
        name: 'IEEE Xplore',
        primaryColor: '#0284c7',
        bgLight: '#f0f9ff',
        borderColor: '#7dd3fc',
        textColor: '#075985'
      };
    }
    // ACM Digital Library
    if (hostname.includes('acm.org')) {
      return {
        name: 'ACM',
        primaryColor: '#0d9488',
        bgLight: '#f0fdfa',
        borderColor: '#99f6e4',
        textColor: '#0f766e'
      };
    }
    // PubMed / NCBI / NIH
    if (hostname.includes('ncbi.nlm.nih.gov') || hostname.includes('pubmed')) {
      return {
        name: 'PubMed',
        primaryColor: '#1e3a8a',
        bgLight: '#eff6ff',
        borderColor: '#bfdbfe',
        textColor: '#1e40af'
      };
    }
    // Wiley Online Library
    if (hostname.includes('wiley')) {
      return {
        name: 'Wiley',
        primaryColor: '#7c3aed',
        bgLight: '#faf5ff',
        borderColor: '#ddd6fe',
        textColor: '#6d28d9'
      };
    }
    // Oxford Academic
    if (hostname.includes('oup.com')) {
      return {
        name: 'Oxford Academic',
        primaryColor: '#881337',
        bgLight: '#fff1f2',
        borderColor: '#fecdd3',
        textColor: '#9f1239'
      };
    }
    // Frontiers
    if (hostname.includes('frontiersin')) {
      return {
        name: 'Frontiers',
        primaryColor: '#059669',
        bgLight: '#ecfdf5',
        borderColor: '#a7f3d0',
        textColor: '#047857'
      };
    }
    // Wikipedia
    if (hostname.includes('wikipedia')) {
      return {
        name: 'Wikipedia',
        primaryColor: '#334155',
        bgLight: '#f8fafc',
        borderColor: '#cbd5e1',
        textColor: '#1e293b'
      };
    }

    // Deterministic jewel tones for other websites
    const palettes = [
      { primaryColor: '#2563eb', bgLight: '#eff6ff', borderColor: '#bfdbfe', textColor: '#1d4ed8' },
      { primaryColor: '#059669', bgLight: '#ecfdf5', borderColor: '#a7f3d0', textColor: '#047857' },
      { primaryColor: '#7c3aed', bgLight: '#faf5ff', borderColor: '#ddd6fe', textColor: '#6d28d9' },
      { primaryColor: '#d97706', bgLight: '#fffbeb', borderColor: '#fde68a', textColor: '#b45309' },
      { primaryColor: '#e11d48', bgLight: '#fff1f2', borderColor: '#fecdd3', textColor: '#be123c' },
      { primaryColor: '#0891b2', bgLight: '#ecfeff', borderColor: '#a5f3fc', textColor: '#0e7490' },
      { primaryColor: '#4f46e5', bgLight: '#eef2ff', borderColor: '#c7d2fe', textColor: '#3730a3' }
    ];
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) hash = ((hash << 5) - hash) + hostname.charCodeAt(i);
    const picked = palettes[Math.abs(hash) % palettes.length];
    return {
      name: hostname.replace(/^www\./, ''),
      ...picked
    };
  }

  function renderFeed(pages) {
    if (pages.length === 0) {
      emptyState.classList.remove('hidden');
      pagesFeed.innerHTML = '';
      return;
    }

    emptyState.classList.add('hidden');

    pagesFeed.innerHTML = pages.map(page => {
      let hostname = '';
      try { hostname = new URL(page.url).hostname; } catch(e) { hostname = page.url; }

      const brand = getWebsiteBrand(page.url);
      const paper = page.paper;
      const paperUrl = (paper && paper.paperUrl) ? paper.paperUrl : page.url;
      const pdfUrl = (paper && paper.pdfUrl) ? paper.pdfUrl : '';
      const scholarUrl = (paper && paper.scholarSearchUrl) ? paper.scholarSearchUrl : `https://scholar.google.com/scholar?q=${encodeURIComponent(page.title)}`;
      const bibtex = (paper && paper.bibtex) ? paper.bibtex : generateBibTeXFallback(page.title, paper?.authors, paper?.journal, paper?.year, paper?.doi, paperUrl);

      const notesCount = page.highlights.filter(h => h.comment && h.comment.trim().length > 0).length;
      const dateFormatted = page.lastUpdated ? new Date(page.lastUpdated).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
      }) : '';

      const tagsPills = (page.allTags && page.allTags.length > 0)
        ? page.allTags.map(t => `<span class="dash-block-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')
        : '';

      return `
        <div class="dash-page-block" data-url="${escapeHtml(page.url)}" style="--block-brand-color: ${brand.primaryColor}; --block-brand-border: ${brand.borderColor};">
          <div class="dash-block-top">
            <a href="${escapeHtml(page.url)}" target="_blank" class="dash-block-domain-badge" style="background: ${brand.bgLight}; color: ${brand.textColor}; border: 1px solid ${brand.borderColor}; font-weight: 700;">
              <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background: ${brand.primaryColor}; margin-right: 4px;"></span>
              ${escapeHtml(brand.name || hostname)}
            </a>
            ${paper && paper.doi ? `
              <span class="dash-paper-tag" style="font-size: 10.5px; padding: 1px 6px;">
                📄 DOI: ${escapeHtml(paper.doi)}
              </span>
            ` : ''}
            <button class="dash-delete-page-btn" data-url="${escapeHtml(page.url)}" title="Delete page highlights">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <div class="dash-block-body">
            <a href="${escapeHtml(paperUrl)}" target="_blank" class="dash-block-title" title="${escapeHtml(page.title)}">
              ${escapeHtml(page.title)}
            </a>
            ${paper && paper.authors ? `<div style="font-size: 11.5px; color: #64748b; font-style: italic;">${escapeHtml(paper.authors)}</div>` : ''}

            ${tagsPills ? `<div class="dash-block-tags-row">${tagsPills}</div>` : ''}

            <div class="dash-block-meta-row">
              <span>🟡 ${page.highlights.length} ${page.highlights.length === 1 ? 'highlight' : 'highlights'} &bull; 💬 ${notesCount} ${notesCount === 1 ? 'note' : 'notes'}</span>
              <button class="dash-toggle-highlights-btn" data-url="${escapeHtml(page.url)}">
                View Highlights ▾
              </button>
            </div>
          </div>

          <!-- Collapsible Highlights Drawer -->
          <div class="dash-block-highlights-drawer" style="display: none;">
            ${page.highlights.map(hl => {
              const color = hl.color || 'yellow';
              const dateStr = hl.createdAt ? new Date(hl.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              }) : '';

              const isCustom = typeof color === 'string' && color.startsWith('#');
              const pillHtml = isCustom
                ? `<span class="dash-color-pill" style="background: ${color}26; color: ${color}; border: 1px solid ${color}66;">Custom</span>`
                : `<span class="dash-color-pill pill-${color}">${color}</span>`;

              const hlTags = (hl.tags && hl.tags.length > 0)
                ? hl.tags.map(t => `<span class="dash-block-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')
                : '';

              return `
                <div class="dash-hl-item" data-id="${hl.id}" data-url="${escapeHtml(page.url)}">
                  <div class="dash-hl-meta">
                    ${pillHtml}
                    <span style="font-size: 11px; color: #94a3b8;">${dateStr}</span>
                  </div>
                  <div class="dash-hl-quote">"${escapeHtml(hl.exact)}"</div>
                  <div class="dash-hl-comment-box ${!hl.comment ? 'no-comment' : ''}">
                    <div class="dash-hl-comment-header">
                      <span>💬 Note</span>
                    </div>
                    <div class="dash-comment-view">${escapeHtml(hl.comment || '(No note added)')}</div>
                    <textarea class="dash-comment-edit-area">${escapeHtml(hl.comment || '')}</textarea>
                  </div>
                  ${hlTags ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">${hlTags}</div>` : ''}
                  <div class="dash-hl-footer">
                    <button class="dash-hl-btn btn-edit-comment" data-id="${hl.id}">Edit Note</button>
                    <button class="dash-hl-btn btn-save-comment" data-id="${hl.id}" style="display: none; color: #2563eb; font-weight: 600;">Save Note</button>
                    <button class="dash-hl-btn btn-copy-quote" data-quote="${escapeHtml(hl.exact)}" data-comment="${escapeHtml(hl.comment || '')}">Copy</button>
                    <button class="dash-hl-btn delete-hl-btn" data-id="${hl.id}">Delete</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="dash-block-footer">
            <button class="dash-paper-tag btn-dl-txt-card" data-url="${escapeHtml(page.url)}" style="cursor: pointer; background-color: #f0fdf4; color: #166534; border-color: #bbf7d0;">
              📥 Notes (.txt)
            </button>
            ${paper && paper.bibtex ? `
              <button class="dash-paper-tag btn-copy-bibtex-card" data-bibtex="${escapeHtml(bibtex)}" style="cursor: pointer; background-color: #faf5ff; color: #7e22ce; border-color: #e9d5ff;">
                📋 BibTeX
              </button>
            ` : ''}
            <a href="${escapeHtml(paperUrl)}" target="_blank" class="dash-paper-tag" style="text-decoration:none;">
              Open ↗
            </a>
          </div>
        </div>
      `;
    }).join('');

    attachCardEventListeners();
  }

  function attachCardEventListeners() {
    // Toggle collapsible highlights drawer
    pagesFeed.querySelectorAll('.dash-toggle-highlights-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const block = btn.closest('.dash-page-block');
        const drawer = block.querySelector('.dash-block-highlights-drawer');
        if (drawer.style.display === 'none') {
          drawer.style.display = 'flex';
          btn.textContent = 'Hide Highlights ▴';
        } else {
          drawer.style.display = 'none';
          btn.textContent = 'View Highlights ▾';
        }
      });
    });

    // Tag click filters dashboard
    pagesFeed.querySelectorAll('.dash-block-tag').forEach(tagSpan => {
      tagSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = tagSpan.dataset.tag;
        if (tag) setTagFilter(tag);
      });
    });

    // Copy BibTeX on paper cards
    pagesFeed.querySelectorAll('.btn-copy-bibtex-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const bib = btn.dataset.bibtex;
        navigator.clipboard.writeText(bib);
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy BibTeX'; }, 1200);
      });
    });

    // Download single paper notes
    pagesFeed.querySelectorAll('.btn-dl-txt-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        const page = allPagesData.find(p => p.url === url);
        if (page) {
          const txt = buildTextForPages([page]);
          const safeTitle = (page.title || 'notes').replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 35) || 'paper_notes';
          downloadBlob(txt, `notes_${safeTitle}.txt`, 'text/plain;charset=utf-8');
        }
      });
    });

    // Delete page
    pagesFeed.querySelectorAll('.dash-delete-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (!confirm(`Are you sure you want to delete all highlights for "${url}"?`)) return;

        const key = 'hl_page_' + encodeURIComponent(url);
        chrome.storage.local.remove([key], () => {
          chrome.storage.local.get(['hl_page_index'], (res) => {
            let index = res.hl_page_index || [];
            index = index.filter(p => p.url !== url);
            chrome.storage.local.set({ hl_page_index: index }, () => {
              loadData();
            });
          });
        });
      });
    });

    // Edit and Save comments inline
    pagesFeed.querySelectorAll('.btn-edit-comment').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.dash-hl-item');
        const view = item.querySelector('.dash-comment-view');
        const editArea = item.querySelector('.dash-comment-edit-area');
        const saveBtn = item.querySelector('.btn-save-comment');

        view.style.display = 'none';
        editArea.style.display = 'block';
        editArea.focus();
        btn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
      });
    });

    pagesFeed.querySelectorAll('.btn-save-comment').forEach(saveBtn => {
      saveBtn.addEventListener('click', () => {
        const item = saveBtn.closest('.dash-hl-item');
        const hlId = item.dataset.id;
        const pageUrl = item.dataset.url;
        const editArea = item.querySelector('.dash-comment-edit-area');
        const view = item.querySelector('.dash-comment-view');
        const editBtn = item.querySelector('.btn-edit-comment');

        const newComment = editArea.value.trim();

        const key = 'hl_page_' + encodeURIComponent(pageUrl);
        chrome.storage.local.get([key], (res) => {
          const list = res[key] || [];
          const target = list.find(h => h.id === hlId);
          if (target) {
            target.comment = newComment;
            target.updatedAt = new Date().toISOString();
            const updateObj = {};
            updateObj[key] = list;
            chrome.storage.local.set(updateObj, () => {
              view.textContent = newComment || '(No note added)';
              view.style.display = 'block';
              editArea.style.display = 'none';
              saveBtn.style.display = 'none';
              editBtn.style.display = 'inline-block';
              loadData();
            });
          }
        });
      });
    });

    // Copy Quote
    pagesFeed.querySelectorAll('.btn-copy-quote').forEach(btn => {
      btn.addEventListener('click', () => {
        const quote = btn.dataset.quote;
        const comment = btn.dataset.comment;
        const paper = btn.dataset.paper;
        let text = `"${quote}"`;
        if (comment) text += `\nNote: ${comment}`;
        if (paper) text += `\nPaper Link: ${paper}`;
        navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      });
    });

    // Delete Highlight
    pagesFeed.querySelectorAll('.delete-hl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.dash-hl-item');
        const hlId = item.dataset.id;
        const pageUrl = item.dataset.url;

        const key = 'hl_page_' + encodeURIComponent(pageUrl);
        chrome.storage.local.get([key, 'hl_page_index'], (res) => {
          let list = res[key] || [];
          list = list.filter(h => h.id !== hlId);

          const updateObj = {};
          updateObj[key] = list;

          let index = res.hl_page_index || [];
          const idxItem = index.find(p => p.url === pageUrl);
          if (idxItem) {
            idxItem.count = list.length;
            if (list.length === 0) {
              index = index.filter(p => p.url !== pageUrl);
            }
          }
          updateObj['hl_page_index'] = index;

          chrome.storage.local.set(updateObj, () => {
            loadData();
          });
        });
      });
    });
  }

  // --- Export Plain Text (.txt) ---
  if (btnExportTxtDash) {
    btnExportTxtDash.addEventListener('click', () => {
      if (allPagesData.length === 0) {
        alert("No highlights available to export.");
        return;
      }
      const txt = buildTextForPages(allPagesData);
      downloadBlob(txt, 'all_paper_notes.txt', 'text/plain;charset=utf-8');
    });
  }

  // --- Export BibTeX ---
  if (btnExportBibtexDash) {
    btnExportBibtexDash.addEventListener('click', () => {
      let bibtexContent = `% Academic Scholar Library BibTeX Export\n% Generated on ${new Date().toLocaleString()}\n\n`;
      let count = 0;

      allPagesData.forEach(page => {
        const paper = page.paper;
        if (paper && (paper.isPaper || paper.doi)) {
          const entry = paper.bibtex || generateBibTeXFallback(page.title, paper.authors, paper.journal, paper.year, paper.doi, paper.paperUrl);
          bibtexContent += entry + "\n\n";
          count++;
        }
      });

      if (count === 0) {
        alert("No research papers detected in your Scholar Library yet.");
        return;
      }

      downloadBlob(bibtexContent, 'scholar_library.bib', 'text/plain');
    });
  }

  // --- Export Markdown ---
  btnExportMd.addEventListener('click', () => {
    if (allPagesData.length === 0) {
      alert("No highlights available to export.");
      return;
    }

    let md = `# Research Paper Highlights & Notes Library\n\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

    allPagesData.forEach(page => {
      const paper = page.paper;
      const paperUrl = (paper && paper.paperUrl) ? paper.paperUrl : page.url;
      md += `## [${page.title}](${paperUrl})\n\n`;

      if (paper) {
        if (paper.paperUrl) md += `- **Paper Link:** [${paper.paperUrl}](${paper.paperUrl})\n`;
        if (paper.pdfUrl) md += `- **Direct PDF:** [Download PDF](${paper.pdfUrl})\n`;
        if (paper.doi) md += `- **DOI:** \`${paper.doi}\`\n`;
        if (paper.authors) md += `- **Authors:** ${paper.authors}\n`;
        if (paper.journal) md += `- **Journal / Venue:** ${paper.journal}\n`;
        md += `\n`;
      }

      if (Array.isArray(page.highlights)) {
        page.highlights.forEach(hl => {
          if (!hl) return;
          const quote = (hl.exact || hl.text || hl.quote || '').toString();
          const comment = (hl.comment || '').toString();
          md += `> ${quote.replace(/\n/g, '\n> ')}\n\n`;
          if (comment.trim()) {
            md += `**Note:** ${comment}\n\n`;
          }
          if (hl.paper && hl.paper.paperUrl && hl.paper.paperUrl !== paperUrl) {
            md += `*Paper Link: [${hl.paper.paperUrl}](${hl.paper.paperUrl})*\n\n`;
          }
          if (hl.createdAt) {
            md += `*Saved: ${new Date(hl.createdAt).toLocaleString()}*\n\n`;
          }
          md += `---\n\n`;
        });
      }
    });

    downloadBlob(md, 'research_paper_highlights.md', 'text/markdown');
  });

  // --- Backup JSON ---
  btnExportJson.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      const backup = {
        exportedAt: new Date().toISOString(),
        version: "1.1",
        data: items
      };
      const json = JSON.stringify(backup, null, 2);
      downloadBlob(json, 'paper_highlights_backup.json', 'application/json');
    });
  });

  // --- Restore Backup JSON ---
  importJsonFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.data) {
          chrome.storage.local.set(parsed.data, () => {
            alert("Backup restored successfully!");
            loadData();
          });
        } else {
          alert("Invalid backup file format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function generateBibTeXFallback(title, authors, journal, year, doi, url) {
    const firstAuthor = authors ? authors.split(',')[0].trim().split(' ').pop().toLowerCase() : 'paper';
    const y = year || new Date().getFullYear();
    const citeKey = `${firstAuthor}${y}`;
    return `@article{${citeKey},\n  title = {${title || 'Untitled'}},\n  author = {${authors || 'Unknown'}},\n  journal = {${journal || ''}},\n  year = {${y}},\n  ${doi ? `doi = {${doi}},\n  ` : ''}url = {${url || ''}}\n}`;
  }

  function buildTextForPages(pages) {
    let txt = `================================================================================\n`;
    txt += `RESEARCH HIGHLIGHTS & NOTES EXPORT\n`;
    txt += `Exported: ${new Date().toLocaleString()}\n`;
    txt += `================================================================================\n\n`;

    pages.forEach((page, pIdx) => {
      const paper = page.paper || {};
      const title = page.title || paper.title || page.url;
      const paperUrl = paper.paperUrl || page.url;
      const pdfUrl = paper.pdfUrl || '';
      const doi = paper.doi || '';
      const authors = paper.authors || '';
      const journal = paper.journal || '';
      const year = paper.year || '';
      const scholarUrl = paper.scholarSearchUrl || (title ? `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}` : '');

      txt += `--------------------------------------------------------------------------------\n`;
      txt += `[${pIdx + 1}] ${title}\n`;
      txt += `--------------------------------------------------------------------------------\n`;
      txt += `Webpage URL:     ${page.url}\n`;
      if (paperUrl && paperUrl !== page.url) {
        txt += `Paper Link:      ${paperUrl}\n`;
      }
      if (doi) {
        txt += `DOI:             https://doi.org/${doi}\n`;
      }
      if (pdfUrl) {
        txt += `Direct PDF:      ${pdfUrl}\n`;
      }
      if (scholarUrl) {
        txt += `Google Scholar:  ${scholarUrl}\n`;
      }
      if (authors) {
        txt += `Authors:         ${authors}\n`;
      }
      if (journal || year) {
        txt += `Source/Journal:  ${journal} ${year ? `(${year})` : ''}\n`;
      }
      txt += `Total Notes:     ${page.highlights ? page.highlights.length : 0}\n\n`;

      if (page.highlights && page.highlights.length > 0) {
        page.highlights.forEach((hl, hIdx) => {
          if (!hl) return;
          const color = (hl.color || 'yellow').toUpperCase();
          const dateStr = hl.createdAt ? new Date(hl.createdAt).toLocaleString() : '';
          const quote = (hl.exact || hl.text || hl.quote || '').toString();
          const comment = (hl.comment || '').toString();

          txt += `  --- Highlight ${hIdx + 1} (${color}) ${dateStr ? `[${dateStr}]` : ''} ---\n`;
          txt += `  EXCERPT:\n`;
          txt += `  "${quote.replace(/\n/g, '\n  ')}"\n\n`;

          if (comment.trim()) {
            txt += `  MY NOTE / COMMENT:\n`;
            txt += `  ${comment.replace(/\n/g, '\n  ')}\n\n`;
          }

          if (hl.paper && hl.paper.paperUrl && hl.paper.paperUrl !== paperUrl) {
            txt += `  Attached Link: ${hl.paper.paperUrl}\n\n`;
          }
        });
      } else {
        txt += `  (No highlights recorded for this page)\n\n`;
      }

      txt += `\n`;
    });

    return txt;
  }

  function downloadBlob(content, filename, mimeType = 'text/plain;charset=utf-8') {
    // Strategy 1: Dispatch via background script through chrome.downloads API
    try {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "DOWNLOAD_FILE",
          content: content,
          filename: filename,
          mimeType: mimeType
        }, (res) => {
          if (chrome.runtime.lastError || !res || !res.success) {
            fallbackDirectDownload(content, filename, mimeType);
          }
        });
        return;
      }
    } catch (e) {
      console.warn("Background download failed, using direct download:", e);
    }

    // Strategy 2: Fallback direct download
    fallbackDirectDownload(content, filename, mimeType);
  }

  function fallbackDirectDownload(content, filename, mimeType) {
    try {
      // Use Data URI for standard text files (avoids blob revocation bug in Chromium)
      if (content.length < 1500000) {
        const base64Data = btoa(unescape(encodeURIComponent(content)));
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1500);
        return;
      }
    } catch (err) {
      console.warn("Data URI download failed, trying Blob:", err);
    }

    // Blob URL with 60s delayed revocation (never revoke synchronously!)
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {}
      }, 60000);
    } catch (err) {
      console.error("Direct download failed entirely:", err);
      alert("Download failed: " + err.message);
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
