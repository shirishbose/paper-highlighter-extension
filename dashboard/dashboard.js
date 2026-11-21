// dashboard.js - Full-page Annotations & Library Dashboard with Academic Paper Support

document.addEventListener('DOMContentLoaded', () => {
  let allPagesData = [];
  let currentColorFilter = 'all';
  let filterOnlyNotes = false;
  let filterOnlyPapers = false;

  // DOM Elements
  const statTotalHighlights = document.getElementById('stat-total-highlights');
  const statTotalNotes = document.getElementById('stat-total-notes');
  const statTotalPapers = document.getElementById('stat-total-papers');

  const colorFilterButtons = document.querySelectorAll('.color-filter-btn');
  const filterHasNotesCheckbox = document.getElementById('filter-has-notes');
  const filterOnlyPapersCheckbox = document.getElementById('filter-only-papers');
  const searchInput = document.getElementById('dashboard-search-input');

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

      let totalHighlights = 0;
      let totalNotes = 0;
      let totalPapers = 0;

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('hl_page_') && Array.isArray(value) && value.length > 0) {
          const rawUrl = decodeURIComponent(key.replace('hl_page_', ''));
          const meta = pageIndex.find(p => p.url === rawUrl) || {};

          totalHighlights += value.length;
          totalNotes += value.filter(h => h.comment && h.comment.trim().length > 0).length;

          const isPaper = (meta.paper && (meta.paper.isPaper || meta.paper.doi)) ||
                          value.some(h => h.paper && (h.paper.isPaper || h.paper.doi));
          if (isPaper) totalPapers++;

          allPagesData.push({
            url: rawUrl,
            title: meta.title || rawUrl,
            paper: meta.paper || null,
            highlights: value,
            lastUpdated: meta.updatedAt || new Date().toISOString()
          });
        }
      }

      // Update stats
      statTotalHighlights.textContent = totalHighlights;
      statTotalNotes.textContent = totalNotes;
      if (statTotalPapers) statTotalPapers.textContent = totalPapers;

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

        if (query) {
          const quoteMatch = hl.exact.toLowerCase().includes(query);
          const commentMatch = hl.comment && hl.comment.toLowerCase().includes(query);
          return quoteMatch || commentMatch || pageTitleMatch || pageUrlMatch || paperMatch;
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

    renderFeed(filteredPages);
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

      const paper = page.paper;
      const paperUrl = (paper && paper.paperUrl) ? paper.paperUrl : page.url;
      const pdfUrl = (paper && paper.pdfUrl) ? paper.pdfUrl : '';
      const scholarUrl = (paper && paper.scholarSearchUrl) ? paper.scholarSearchUrl : `https://scholar.google.com/scholar?q=${encodeURIComponent(page.title)}`;
      const bibtex = (paper && paper.bibtex) ? paper.bibtex : generateBibTeXFallback(page.title, paper?.authors, paper?.journal, paper?.year, paper?.doi, paperUrl);

      return `
        <div class="dash-page-card" data-url="${escapeHtml(page.url)}">
          <div class="dash-page-header">
            <div>
              <a href="${escapeHtml(paperUrl)}" target="_blank" class="dash-page-title">${escapeHtml(page.title)}</a>
              <a href="${escapeHtml(page.url)}" target="_blank" class="dash-page-url">
                ${escapeHtml(hostname)} &bull; ${page.highlights.length} ${page.highlights.length === 1 ? 'highlight' : 'highlights'}
              </a>
              ${paper && paper.authors ? `<div class="dash-paper-authors">${escapeHtml(paper.authors)}</div>` : ''}
              ${(paper && (paper.paperUrl || paper.pdfUrl || paper.doi)) ? `
                <div class="dash-paper-meta-row">
                  <a href="${escapeHtml(paperUrl)}" target="_blank" class="dash-paper-tag">
                    📄 ${paper.doi ? `DOI: ${escapeHtml(paper.doi)}` : 'Paper Link'}
                  </a>
                  ${pdfUrl ? `
                    <a href="${escapeHtml(pdfUrl)}" target="_blank" class="dash-pdf-tag">
                      ⬇️ Download PDF
                    </a>
                  ` : ''}
                  <a href="${escapeHtml(scholarUrl)}" target="_blank" class="dash-paper-tag" style="background-color: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">
                    🎓 Google Scholar
                  </a>
                  <button class="dash-paper-tag btn-copy-bibtex-card" data-bibtex="${escapeHtml(bibtex)}" style="cursor: pointer; background-color: #faf5ff; color: #7e22ce; border-color: #e9d5ff;">
                    📋 Copy BibTeX
                  </button>
                </div>
              ` : ''}
            </div>
            <button class="dash-delete-page-btn" data-url="${escapeHtml(page.url)}" title="Delete all highlights for this page">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
          <div class="dash-page-highlights">
            ${page.highlights.map(hl => {
              const color = hl.color || 'yellow';
              const dateStr = hl.createdAt ? new Date(hl.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
              }) : '';

              const hlPaper = hl.paper || page.paper;
              const hlPaperUrl = (hlPaper && hlPaper.paperUrl) ? hlPaper.paperUrl : '';
              const hlPdfUrl = (hlPaper && hlPaper.pdfUrl) ? hlPaper.pdfUrl : '';

              return `
                <div class="dash-hl-item" data-id="${hl.id}" data-url="${escapeHtml(page.url)}">
                  <div class="dash-hl-meta">
                    <span class="dash-color-pill pill-${color}">${color}</span>
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
                  ${hlPaperUrl ? `
                    <div class="dash-paper-meta-row" style="margin-top: 8px;">
                      <a href="${escapeHtml(hlPaperUrl)}" target="_blank" class="dash-paper-tag">
                        📄 Paper Link
                      </a>
                      ${hlPdfUrl ? `
                        <a href="${escapeHtml(hlPdfUrl)}" target="_blank" class="dash-pdf-tag">
                          ⬇️ PDF
                        </a>
                      ` : ''}
                    </div>
                  ` : ''}
                  <div class="dash-hl-footer">
                    <button class="dash-hl-btn btn-edit-comment" data-id="${hl.id}">Edit Note</button>
                    <button class="dash-hl-btn btn-save-comment" data-id="${hl.id}" style="display: none; color: #2563eb; font-weight: 600;">Save Note</button>
                    <button class="dash-hl-btn btn-copy-quote" data-quote="${escapeHtml(hl.exact)}" data-comment="${escapeHtml(hl.comment || '')}" data-paper="${escapeHtml(hlPaperUrl)}">Copy</button>
                    <button class="dash-hl-btn delete-hl-btn" data-id="${hl.id}">Delete</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    attachCardEventListeners();
  }

  function attachCardEventListeners() {
    // Copy BibTeX on paper cards
    pagesFeed.querySelectorAll('.btn-copy-bibtex-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const bib = btn.dataset.bibtex;
        navigator.clipboard.writeText(bib);
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy BibTeX'; }, 1200);
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

      page.highlights.forEach(hl => {
        md += `> ${hl.exact.replace(/\n/g, '\n> ')}\n\n`;
        if (hl.comment && hl.comment.trim()) {
          md += `**Note:** ${hl.comment}\n\n`;
        }
        if (hl.paper && hl.paper.paperUrl && hl.paper.paperUrl !== paperUrl) {
          md += `*Paper Link: [${hl.paper.paperUrl}](${hl.paper.paperUrl})*\n\n`;
        }
        if (hl.createdAt) {
          md += `*Saved: ${new Date(hl.createdAt).toLocaleString()}*\n\n`;
        }
        md += `---\n\n`;
      });
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

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
