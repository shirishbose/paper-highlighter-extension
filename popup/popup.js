// popup.js - Controller for extension popup with Academic Scholar Library

document.addEventListener('DOMContentLoaded', async () => {
  let activeTab = null;
  let currentPageData = { url: '', title: '', paper: null, highlights: [] };
  let allStoredPages = [];
  let scholarPapers = [];

  // DOM Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const currentBadge = document.getElementById('current-badge');
  const allBadge = document.getElementById('all-badge');
  const scholarBadge = document.getElementById('scholar-badge');

  const currentPageTitle = document.getElementById('current-page-title');
  const currentPageUrl = document.getElementById('current-page-url');
  const currentEmptyState = document.getElementById('current-empty-state');
  const currentHighlightsList = document.getElementById('current-highlights-list');
  const btnClearPage = document.getElementById('btn-clear-page');

  const allEmptyState = document.getElementById('all-empty-state');
  const allPagesList = document.getElementById('all-pages-list');
  const allSearchInput = document.getElementById('all-search-input');

  const scholarEmptyState = document.getElementById('scholar-empty-state');
  const scholarPapersList = document.getElementById('scholar-papers-list');
  const scholarSearchInput = document.getElementById('scholar-search-input');

  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnExportDropdown = document.getElementById('btn-export-dropdown');
  const exportMenu = document.getElementById('export-menu');
  const btnExportTxtPage = document.getElementById('btn-export-txt-page');
  const btnExportTxtAll = document.getElementById('btn-export-txt-all');
  const btnDownloadPageTxt = document.getElementById('btn-download-page-txt');
  const btnExportBibtex = document.getElementById('btn-export-bibtex');
  const btnExportMdPage = document.getElementById('btn-export-md-page');
  const btnExportMdAll = document.getElementById('btn-export-md-all');
  const btnExportJson = document.getElementById('btn-export-json');

  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    });
  }

  // --- Tab Navigation ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.add('hidden'));

      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.remove('hidden');

      if (btn.dataset.tab === 'tab-all') {
        loadAllSavedData();
      } else if (btn.dataset.tab === 'tab-scholar') {
        loadScholarLibraryData();
      }
    });
  });

  // --- Export Menu Toggle ---
  btnExportDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    exportMenu.classList.add('hidden');
  });

  // --- Initialize Current Page Tab ---
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      activeTab = tabs[0];
      await loadCurrentPageData();
    }
  } catch (e) {
    console.error('Error fetching active tab:', e);
  }

  loadBadges();

  async function loadCurrentPageData() {
    if (!activeTab || !activeTab.id) return;

    currentPageTitle.textContent = activeTab.title || 'Webpage';
    currentPageUrl.textContent = activeTab.url || '';

    if (activeTab.url.startsWith('brave://') || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://')) {
      currentPageTitle.textContent = 'Browser Internal Page';
      currentPageUrl.textContent = 'Highlighter is disabled on internal browser pages.';
      currentEmptyState.classList.remove('hidden');
      btnClearPage.style.display = 'none';
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_HIGHLIGHTS" });
      if (response && response.highlights) {
        currentPageData = response;
      } else {
        currentPageData = await fetchFromStorageForUrl(activeTab.url);
      }
    } catch (e) {
      currentPageData = await fetchFromStorageForUrl(activeTab.url);
    }

    if (currentPageData.paper && currentPageData.paper.title) {
      currentPageTitle.innerHTML = `${escapeHtml(currentPageData.paper.title)} <span class="page-paper-badge">PAPER</span>`;
    }

    renderCurrentPageHighlights();
  }

  async function fetchFromStorageForUrl(rawUrl) {
    const cleanUrl = cleanUrlForStorage(rawUrl);
    const key = 'hl_page_' + encodeURIComponent(cleanUrl);
    return new Promise((resolve) => {
      chrome.storage.local.get([key, 'hl_page_index'], (res) => {
        const list = res[key] || [];
        const index = res.hl_page_index || [];
        const meta = index.find(p => p.url === cleanUrl) || {};
        resolve({
          url: cleanUrl,
          title: meta.title || (activeTab ? activeTab.title : cleanUrl),
          paper: meta.paper || null,
          highlights: list
        });
      });
    });
  }

  function cleanUrlForStorage(urlStr) {
    try {
      const u = new URL(urlStr);
      const cleanParams = new URLSearchParams();
      for (const [k, v] of u.searchParams.entries()) {
        if (!k.startsWith('utm_') && !['fbclid', 'gclid', 'ref', 'source'].includes(k)) {
          cleanParams.append(k, v);
        }
      }
      const qs = cleanParams.toString();
      return u.origin + u.pathname + (qs ? '?' + qs : '');
    } catch (e) {
      return urlStr;
    }
  }

  function renderCurrentPageHighlights() {
    const list = currentPageData.highlights || [];
    currentBadge.textContent = list.length;

    if (list.length === 0) {
      currentEmptyState.classList.remove('hidden');
      currentHighlightsList.innerHTML = '';
      btnClearPage.style.display = 'none';
      return;
    }

    currentEmptyState.classList.add('hidden');
    btnClearPage.style.display = 'block';

    currentHighlightsList.innerHTML = list.map(hl => {
      const color = hl.color || 'yellow';
      const formattedDate = hl.createdAt ? new Date(hl.createdAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';

      const paper = hl.paper || currentPageData.paper;
      const paperUrl = (paper && paper.paperUrl) ? paper.paperUrl : '';
      const pdfUrl = (paper && paper.pdfUrl) ? paper.pdfUrl : '';
      const scholarUrl = (paper && paper.scholarSearchUrl) ? paper.scholarSearchUrl : (paper && paper.title ? `https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}` : '');
      const paperLabel = (paper && paper.doi) ? `DOI: ${paper.doi}` : ((paper && paper.arxivId) ? `arXiv:${paper.arxivId}` : 'Paper Link');

      return `
        <div class="highlight-card" data-id="${hl.id}">
          <div class="hl-card-header">
            <span class="color-dot-indicator hl-dot-${color}" title="Color: ${color}"></span>
            <span class="hl-timestamp">${formattedDate}</span>
            <div class="hl-card-actions">
              <button class="card-btn jump-btn" data-id="${hl.id}" title="Jump to highlight on page">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 4 4 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
              <button class="card-btn copy-btn" data-quote="${escapeHtml(hl.exact)}" data-comment="${escapeHtml(hl.comment || '')}" data-paper="${escapeHtml(paperUrl)}" title="Copy quote & paper link">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 2a2 2 0 00-2 2v2H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-2V4a2 2 0 00-2-2H8zm0 2h4v2H8V4zm-3 4h8v8H5V8zm10 2v5h1V6h-7v2h6z"/>
                </svg>
              </button>
              <button class="card-btn delete-btn" data-id="${hl.id}" title="Delete highlight">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="hl-card-quote">"${escapeHtml(hl.exact)}"</div>
          ${hl.comment && hl.comment.trim().length > 0 ? `
            <div class="hl-card-comment">
              <span class="comment-icon">💬</span>
              <span>${escapeHtml(hl.comment)}</span>
            </div>
          ` : ''}
          ${paperUrl ? `
            <div class="hl-paper-badge-row">
              <a href="${escapeHtml(paperUrl)}" target="_blank" class="hl-paper-link-btn" title="${escapeHtml(paper && paper.title ? paper.title : paperUrl)}">
                📄 ${escapeHtml(paperLabel)}
              </a>
              ${pdfUrl ? `
                <a href="${escapeHtml(pdfUrl)}" target="_blank" class="hl-pdf-link-btn" title="Download direct PDF">
                  ⬇️ PDF
                </a>
              ` : ''}
              ${scholarUrl ? `
                <a href="${escapeHtml(scholarUrl)}" target="_blank" class="hl-paper-link-btn" style="color: #2563eb; background-color: #eff6ff; border-color: #bfdbfe;" title="Find on Google Scholar">
                  🎓 Scholar
                </a>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Attach listeners
    currentHighlightsList.querySelectorAll('.jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, { action: "SCROLL_TO_HIGHLIGHT", id });
        }
      });
    });

    currentHighlightsList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const quote = btn.dataset.quote;
        const comment = btn.dataset.comment;
        const paper = btn.dataset.paper;
        let text = `"${quote}"`;
        if (comment) text += `\nNote: ${comment}`;
        if (paper) text += `\nPaper Link: ${paper}`;
        navigator.clipboard.writeText(text);
        btn.style.color = '#16a34a';
        setTimeout(() => { btn.style.color = ''; }, 1000);
      });
    });

    currentHighlightsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (activeTab && activeTab.id) {
          await chrome.tabs.sendMessage(activeTab.id, { action: "DELETE_HIGHLIGHT", id }).catch(() => {});
        }
        currentPageData.highlights = currentPageData.highlights.filter(h => h.id !== id);
        renderCurrentPageHighlights();
        loadBadges();
      });
    });
  }

  // Clear Page Highlights
  btnClearPage.addEventListener('click', async () => {
    if (!confirm("Remove all highlights from this page?")) return;
    if (activeTab && activeTab.id) {
      await chrome.tabs.sendMessage(activeTab.id, { action: "CLEAR_ALL_ON_PAGE" }).catch(() => {});
    }
    currentPageData.highlights = [];
    renderCurrentPageHighlights();
    loadBadges();
  });

  // --- Badge Counts ---
  async function loadBadges() {
    chrome.storage.local.get(null, (items) => {
      const pageIndex = items.hl_page_index || [];
      const totalHl = pageIndex.reduce((sum, item) => sum + (item.count || 0), 0);
      allBadge.textContent = totalHl;

      let scholarCount = 0;
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && Array.isArray(value)) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          const meta = pageIndex.find(p => p.url === rawUrl) || {};
          const isPaper = (meta.paper && (meta.paper.isPaper || meta.paper.doi)) ||
                          value.some(h => h.paper && (h.paper.isPaper || h.paper.doi));
          if (isPaper) scholarCount++;
        }
      }
      if (scholarBadge) scholarBadge.textContent = scholarCount;
    });
  }

  // --- All Saved Highlights (General Library) ---
  async function loadAllSavedData() {
    chrome.storage.local.get(null, (items) => {
      allStoredPages = [];
      const pageIndex = items.hl_page_index || [];

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && Array.isArray(value) && value.length > 0) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          const meta = pageIndex.find(p => p.url === rawUrl) || {};
          allStoredPages.push({
            url: rawUrl,
            title: meta.title || rawUrl,
            paper: meta.paper || null,
            highlights: value,
            lastUpdated: meta.updatedAt || new Date().toISOString()
          });
        }
      }

      renderAllSavedPages(allStoredPages);
    });
  }

  function renderAllSavedPages(pages) {
    if (pages.length === 0) {
      allEmptyState.classList.remove('hidden');
      allPagesList.innerHTML = '';
      return;
    }

    allEmptyState.classList.add('hidden');

    allPagesList.innerHTML = pages.map(page => {
      const isPaper = page.paper && (page.paper.isPaper || page.paper.doi);
      const paperUrl = (page.paper && page.paper.paperUrl) ? page.paper.paperUrl : page.url;

      return `
        <div class="page-group-card">
          <div class="page-group-header">
            <div>
              <a href="${escapeHtml(paperUrl)}" target="_blank" class="page-group-title" title="${escapeHtml(paperUrl)}">
                ${escapeHtml(page.title)}
              </a>
              <span class="hl-timestamp">
                ${isPaper ? '<span class="page-paper-badge">PAPER</span> ' : ''}${new URL(page.url).hostname}
              </span>
            </div>
            <span class="page-group-badge">${page.highlights.length} ${page.highlights.length === 1 ? 'highlight' : 'highlights'}</span>
          </div>
          <div class="page-group-items">
            ${page.highlights.map(hl => {
              const color = hl.color || 'yellow';
              const hlPaper = hl.paper || page.paper;
              const hlPaperUrl = (hlPaper && hlPaper.paperUrl) ? hlPaper.paperUrl : '';
              const hlPdfUrl = (hlPaper && hlPaper.pdfUrl) ? hlPaper.pdfUrl : '';

              return `
                <div class="highlight-card">
                  <div class="hl-card-header">
                    <span class="color-dot-indicator hl-dot-${color}"></span>
                  </div>
                  <div class="hl-card-quote">"${escapeHtml(hl.exact)}"</div>
                  ${hl.comment ? `
                    <div class="hl-card-comment">
                      <span class="comment-icon">💬</span>
                      <span>${escapeHtml(hl.comment)}</span>
                    </div>
                  ` : ''}
                  ${hlPaperUrl ? `
                    <div class="hl-paper-badge-row">
                      <a href="${escapeHtml(hlPaperUrl)}" target="_blank" class="hl-paper-link-btn">
                        📄 Paper Link
                      </a>
                      ${hlPdfUrl ? `
                        <a href="${escapeHtml(hlPdfUrl)}" target="_blank" class="hl-pdf-link-btn">
                          ⬇️ PDF
                        </a>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Scholar Library Tab ---
  async function loadScholarLibraryData() {
    chrome.storage.local.get(null, (items) => {
      scholarPapers = [];
      const pageIndex = items.hl_page_index || [];

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && Array.isArray(value) && value.length > 0) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          const meta = pageIndex.find(p => p.url === rawUrl) || {};
          const isPaper = (meta.paper && (meta.paper.isPaper || meta.paper.doi)) ||
                          value.some(h => h.paper && (h.paper.isPaper || h.paper.doi));

          if (isPaper) {
            scholarPapers.push({
              url: rawUrl,
              title: (meta.paper && meta.paper.title) ? meta.paper.title : (meta.title || rawUrl),
              paper: meta.paper || (value.find(h => h.paper)?.paper) || { paperUrl: rawUrl },
              highlights: value,
              lastUpdated: meta.updatedAt || new Date().toISOString()
            });
          }
        }
      }

      renderScholarLibrary(scholarPapers);
    });
  }

  function renderScholarLibrary(papers) {
    if (papers.length === 0) {
      scholarEmptyState.classList.remove('hidden');
      scholarPapersList.innerHTML = '';
      return;
    }

    scholarEmptyState.classList.add('hidden');

    scholarPapersList.innerHTML = papers.map(item => {
      const p = item.paper || {};
      const paperUrl = p.paperUrl || item.url;
      const pdfUrl = p.pdfUrl || '';
      const scholarUrl = p.scholarSearchUrl || `https://scholar.google.com/scholar?q=${encodeURIComponent(item.title)}`;
      const bibtex = p.bibtex || generateBibTeXFallback(item.title, p.authors, p.journal, p.year, p.doi, paperUrl);

      return `
        <div class="page-group-card">
          <div class="page-group-header">
            <div>
              <a href="${escapeHtml(paperUrl)}" target="_blank" class="page-group-title" title="${escapeHtml(paperUrl)}">
                🎓 ${escapeHtml(item.title)}
              </a>
              ${p.authors ? `<div class="dash-paper-authors" style="font-size: 11px; color: #475569; margin-top: 2px;">${escapeHtml(p.authors)}</div>` : ''}
              ${p.journal ? `<div style="font-size: 10px; color: #64748b;">${escapeHtml(p.journal)}${p.year ? ` (${escapeHtml(p.year)})` : ''}</div>` : ''}
              <div class="hl-paper-badge-row" style="margin-top: 6px;">
                <a href="${escapeHtml(paperUrl)}" target="_blank" class="hl-paper-link-btn">
                  📄 ${p.doi ? `DOI: ${escapeHtml(p.doi)}` : 'Paper Link'}
                </a>
                ${pdfUrl ? `
                  <a href="${escapeHtml(pdfUrl)}" target="_blank" class="hl-pdf-link-btn">
                    ⬇️ PDF
                  </a>
                ` : ''}
                <a href="${escapeHtml(scholarUrl)}" target="_blank" class="hl-paper-link-btn" style="color: #2563eb; background-color: #eff6ff; border-color: #bfdbfe;">
                  🎓 Google Scholar
                </a>
                <button class="hl-paper-link-btn btn-copy-bibtex" data-bibtex="${escapeHtml(bibtex)}" style="cursor: pointer; background: #faf5ff; color: #7e22ce; border-color: #e9d5ff;">
                  📋 BibTeX
                </button>
              </div>
            </div>
            <span class="page-group-badge">${item.highlights.length} ${item.highlights.length === 1 ? 'highlight' : 'highlights'}</span>
          </div>

          <div class="page-group-items" style="margin-top: 8px;">
            ${item.highlights.map(hl => {
              const color = hl.color || 'yellow';
              return `
                <div class="highlight-card">
                  <div class="hl-card-header">
                    <span class="color-dot-indicator hl-dot-${color}"></span>
                  </div>
                  <div class="hl-card-quote">"${escapeHtml(hl.exact)}"</div>
                  ${hl.comment ? `
                    <div class="hl-card-comment">
                      <span class="comment-icon">💬</span>
                      <span>${escapeHtml(hl.comment)}</span>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Attach BibTeX copy listener
    scholarPapersList.querySelectorAll('.btn-copy-bibtex').forEach(btn => {
      btn.addEventListener('click', () => {
        const bib = btn.dataset.bibtex;
        navigator.clipboard.writeText(bib);
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '📋 BibTeX'; }, 1200);
      });
    });
  }

  // Scholar Search
  if (scholarSearchInput) {
    scholarSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderScholarLibrary(scholarPapers);
        return;
      }
      const filtered = scholarPapers.filter(item => {
        const p = item.paper || {};
        return (
          item.title.toLowerCase().includes(q) ||
          (p.authors && p.authors.toLowerCase().includes(q)) ||
          (p.journal && p.journal.toLowerCase().includes(q)) ||
          (p.doi && p.doi.toLowerCase().includes(q)) ||
          item.highlights.some(h => h.exact.toLowerCase().includes(q) || (h.comment && h.comment.toLowerCase().includes(q)))
        );
      });
      renderScholarLibrary(filtered);
    });
  }

  // --- Export Functionality ---
  btnExportBibtex.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      let bibtexFile = `% Academic Scholar Library BibTeX Export\n% Generated on ${new Date().toLocaleString()}\n\n`;
      let count = 0;
      const pageIndex = items.hl_page_index || [];

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && Array.isArray(value) && value.length > 0) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          const meta = pageIndex.find(p => p.url === rawUrl) || {};
          const paper = meta.paper || (value.find(h => h.paper)?.paper);

          if (paper && (paper.isPaper || paper.doi)) {
            const entry = paper.bibtex || generateBibTeXFallback(meta.title || rawUrl, paper.authors, paper.journal, paper.year, paper.doi, paper.paperUrl);
            bibtexFile += entry + "\n\n";
            count++;
          }
        }
      }

      if (count === 0) {
        alert("No academic papers in your Scholar Library yet to export.");
        return;
      }

      downloadFile(bibtexFile, 'scholar_library.bib', 'text/plain');
      exportMenu.classList.add('hidden');
    });
  });

  // --- Export Plain Text (.txt) ---
  if (btnDownloadPageTxt) {
    btnDownloadPageTxt.addEventListener('click', () => {
      exportCurrentPageText();
    });
  }

  if (btnExportTxtPage) {
    btnExportTxtPage.addEventListener('click', () => {
      exportCurrentPageText();
      exportMenu.classList.add('hidden');
    });
  }

  function exportCurrentPageText() {
    if (!currentPageData.highlights || currentPageData.highlights.length === 0) {
      alert("No highlights on this page to export.");
      return;
    }
    const txt = buildTextForPages([currentPageData]);
    downloadFile(txt, `notes_${sanitizeFilename(currentPageData.title || 'paper')}.txt`, 'text/plain;charset=utf-8');
  }

  if (btnExportTxtAll) {
    btnExportTxtAll.addEventListener('click', () => {
      chrome.storage.local.get(null, (items) => {
        const pages = [];
        const pageIndex = items.hl_page_index || [];

        for (const [key, value] of Object.entries(items)) {
          if (key.startsWith('hl_page_') && Array.isArray(value) && value.length > 0) {
            const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
            const meta = pageIndex.find(p => p.url === rawUrl) || {};
            pages.push({
              url: rawUrl,
              title: meta.title || rawUrl,
              paper: meta.paper || null,
              highlights: value
            });
          }
        }

        if (pages.length === 0) {
          alert("No saved highlights to export.");
          return;
        }

        const txt = buildTextForPages(pages);
        downloadFile(txt, 'all_paper_notes.txt', 'text/plain;charset=utf-8');
        exportMenu.classList.add('hidden');
      });
    });
  }

  // --- Export Markdown ---
  btnExportMdPage.addEventListener('click', () => {
    if (!currentPageData.highlights || currentPageData.highlights.length === 0) {
      alert("No highlights on this page to export.");
      return;
    }
    const md = buildMarkdownForPages([currentPageData]);
    downloadFile(md, `highlights_${sanitizeFilename(currentPageData.title || 'paper')}.md`, 'text/markdown');
    exportMenu.classList.add('hidden');
  });

  btnExportMdAll.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      const pages = [];
      const pageIndex = items.hl_page_index || [];

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && Array.isArray(value) && value.length > 0) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          const meta = pageIndex.find(p => p.url === rawUrl) || {};
          pages.push({
            url: rawUrl,
            title: meta.title || rawUrl,
            paper: meta.paper || null,
            highlights: value
          });
        }
      }

      if (pages.length === 0) {
        alert("No saved highlights to export.");
        return;
      }

      const md = buildMarkdownForPages(pages);
      downloadFile(md, 'all_paper_highlights.md', 'text/markdown');
      exportMenu.classList.add('hidden');
    });
  });

  btnExportJson.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: "1.2",
        data: items
      };
      const json = JSON.stringify(exportData, null, 2);
      downloadFile(json, 'scholar_library_backup.json', 'application/json');
      exportMenu.classList.add('hidden');
    });
  });

  function generateBibTeXFallback(title, authors, journal, year, doi, url) {
    const firstAuthor = authors ? authors.split(',')[0].trim().split(' ').pop().toLowerCase() : 'paper';
    const y = year || new Date().getFullYear();
    const citeKey = `${firstAuthor}${y}`;
    return `@article{${citeKey},\n  title = {${title || 'Untitled'}},\n  author = {${authors || 'Unknown'}},\n  journal = {${journal || ''}},\n  year = {${y}},\n  ${doi ? `doi = {${doi}},\n  ` : ''}url = {${url || ''}}\n}`;
  }

  function buildMarkdownForPages(pages) {
    let md = `# Research Paper Highlights & Scholar Library\n\n`;
    pages.forEach(p => {
      const paper = p.paper;
      const paperUrl = (paper && paper.paperUrl) ? paper.paperUrl : p.url;
      md += `## [${p.title}](${paperUrl})\n\n`;

      if (paper) {
        if (paper.paperUrl) md += `- **Paper Link:** [${paper.paperUrl}](${paper.paperUrl})\n`;
        if (paper.pdfUrl) md += `- **Direct PDF:** [Download PDF](${paper.pdfUrl})\n`;
        if (paper.scholarSearchUrl) md += `- **Google Scholar:** [Search Citations](${paper.scholarSearchUrl})\n`;
        if (paper.doi) md += `- **DOI:** \`${paper.doi}\`\n`;
        if (paper.authors) md += `- **Authors:** ${paper.authors}\n`;
        if (paper.journal) md += `- **Journal / Venue:** ${paper.journal}\n`;
        md += `\n`;
      }

      p.highlights.forEach((hl) => {
        md += `> ${hl.exact.replace(/\n/g, '\n> ')}\n\n`;
        if (hl.comment && hl.comment.trim()) {
          md += `**Note:** ${hl.comment}\n\n`;
        }
        if (hl.createdAt) {
          md += `*Saved: ${new Date(hl.createdAt).toLocaleString()}*\n\n`;
        }
        md += `---\n\n`;
      });
    });
    return md;
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
          const color = (hl.color || 'yellow').toUpperCase();
          const dateStr = hl.createdAt ? new Date(hl.createdAt).toLocaleString() : '';
          txt += `  --- Highlight ${hIdx + 1} (${color}) ${dateStr ? `[${dateStr}]` : ''} ---\n`;
          txt += `  EXCERPT:\n`;
          txt += `  "${hl.exact.replace(/\n/g, '\n  ')}"\n\n`;

          if (hl.comment && hl.comment.trim()) {
            txt += `  MY NOTE / COMMENT:\n`;
            txt += `  ${hl.comment.replace(/\n/g, '\n  ')}\n\n`;
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

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 30);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
