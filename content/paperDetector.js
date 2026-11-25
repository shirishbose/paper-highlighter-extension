// paperDetector.js - Extract academic paper links, Google Scholar citations, and metadata

const WebHighlighterPaperDetector = (() => {
  // If running on a verification or challenge frame, abort immediately
  try {
    const url = (window.location.href || '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    if (url.includes('challenges.cloudflare.com') || url.includes('recaptcha') || url.includes('/verification') || title.includes('are you a robot')) {
      return { detectPaperMetadata: () => null, generateBibTeX: () => '' };
    }
  } catch (e) {}
  // Extract DOI from string
  function extractDoi(str) {
    if (!str) return '';
    const match = str.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
    if (match) {
      return match[1].replace(/[.,;)]+$/, '');
    }
    return '';
  }

  // Get meta tag content
  function getMeta(names) {
    if (!Array.isArray(names)) names = [names];
    for (const name of names) {
      const el = document.querySelector(`meta[name="${name}" i], meta[property="${name}" i]`);
      if (el && el.content && el.content.trim()) {
        return el.content.trim();
      }
    }
    return '';
  }

  function getAllMeta(name) {
    const els = document.querySelectorAll(`meta[name="${name}" i], meta[property="${name}" i]`);
    const results = [];
    els.forEach(el => {
      if (el.content && el.content.trim()) {
        results.push(el.content.trim());
      }
    });
    return results;
  }

  // Build clean BibTeX entry
  function generateBibTeX(paper) {
    if (!paper) return '';
    const firstAuthor = paper.authors ? paper.authors.split(',')[0].trim().split(' ').pop().toLowerCase() : 'paper';
    const year = paper.year || new Date().getFullYear();
    const citeKey = `${firstAuthor}${year}`;

    let bib = `@article{${citeKey},\n`;
    bib += `  title = {${paper.title || 'Untitled'}},\n`;
    if (paper.authors) bib += `  author = {${paper.authors}},\n`;
    if (paper.journal) bib += `  journal = {${paper.journal}},\n`;
    if (paper.year) bib += `  year = {${paper.year}},\n`;
    if (paper.doi) bib += `  doi = {${paper.doi}},\n`;
    if (paper.paperUrl) bib += `  url = {${paper.paperUrl}},\n`;
    bib = bib.replace(/,\n$/, '\n') + `}`;
    return bib;
  }

  // Detect paper info from current webpage or target node context
  function detectPaperMetadata(targetNode = null) {
    const url = window.location.href;
    const hostname = window.location.hostname.toLowerCase();

    let isPaper = false;
    let paperUrl = '';
    let pdfUrl = '';
    let doi = '';
    let arxivId = '';
    let title = '';
    let authors = [];
    let journal = '';
    let year = '';
    let citedByCount = '';
    let citedByUrl = '';

    // SPECIAL: Google Scholar (scholar.google.com)
    if (hostname.includes('scholar.google')) {
      isPaper = true;
      let resultCard = null;

      if (targetNode) {
        resultCard = targetNode.closest ? targetNode.closest('.gs_r') : (targetNode.parentElement ? targetNode.parentElement.closest('.gs_r') : null);
      }
      if (!resultCard) {
        // Find first search result
        resultCard = document.querySelector('.gs_r.gs_or');
      }

      if (resultCard) {
        const titleLink = resultCard.querySelector('.gs_rt a, .gs_rt');
        if (titleLink) {
          title = titleLink.textContent.replace(/^\[[A-Z]+\]\s*/i, '').trim();
          if (titleLink.tagName.toLowerCase() === 'a' && titleLink.href) {
            paperUrl = titleLink.href;
          }
        }

        // Direct PDF on Google Scholar (right column)
        const pdfLinkEl = resultCard.querySelector('.gs_or_ggsm a, .gs_ggsd a');
        if (pdfLinkEl && pdfLinkEl.href) {
          pdfUrl = pdfLinkEl.href;
        }

        // Author & Journal info line: "A Vaswani, N Shazeer - NeurIPS, 2017 - ..."
        const authorLine = resultCard.querySelector('.gs_a');
        if (authorLine) {
          const parts = authorLine.textContent.split(' - ');
          if (parts[0]) authors = parts[0].split(',').map(a => a.trim());
          if (parts[1]) {
            journal = parts[1].trim();
            const yearMatch = journal.match(/\b(19\d\d|20\d\d)\b/);
            if (yearMatch) year = yearMatch[1];
          }
        }

        // Cited By link
        const citedByEl = resultCard.querySelector('a[href*="cites="]');
        if (citedByEl) {
          citedByUrl = citedByEl.href;
          const countMatch = citedByEl.textContent.match(/\d[\d,]*/);
          if (countMatch) citedByCount = countMatch[0];
        }
      }
    }

    // 1. Meta tags (Highwire Press, Google Scholar, Dublin Core, PRISM)
    if (!title) {
      const metaTitle = getMeta(['citation_title', 'dc.title', 'dcterms.title', 'og:title']);
      if (metaTitle) title = metaTitle;
    }
    if (!pdfUrl) {
      const metaPdf = getMeta(['citation_pdf_url', 'dc.relation.pdf']);
      if (metaPdf) pdfUrl = metaPdf;
    }
    if (!doi) {
      const metaDoi = getMeta(['citation_doi', 'dc.identifier.doi', 'dc.identifier', 'prism.doi']);
      if (metaDoi) doi = extractDoi(metaDoi);
    }
    if (authors.length === 0) {
      authors = getAllMeta('citation_author');
    }
    if (!journal) {
      const metaJournal = getMeta(['citation_journal_title', 'citation_conference_title', 'prism.publicationName']);
      if (metaJournal) journal = metaJournal;
    }
    if (!year) {
      const metaDate = getMeta(['citation_publication_date', 'citation_date', 'dc.date']);
      if (metaDate) {
        const yMatch = metaDate.match(/\b(19\d\d|20\d\d)\b/);
        if (yMatch) year = yMatch[1];
      }
    }
    if (!arxivId) {
      const metaArxiv = getMeta(['citation_arxiv_id']);
      if (metaArxiv) arxivId = metaArxiv;
    }

    // 2. Domain-specific extraction
    // arXiv
    if (hostname.includes('arxiv.org')) {
      isPaper = true;
      const match = url.match(/arxiv\.org\/(abs|html|pdf)\/([0-9]+\.[0-9]+(v[0-9]+)?)/i);
      if (match) {
        arxivId = match[2];
        paperUrl = `https://arxiv.org/abs/${arxivId}`;
        pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
      }
      const titleEl = document.querySelector('h1.title');
      if (titleEl) {
        title = titleEl.textContent.replace(/^Title:\s*/i, '').trim();
      }
      const authorEls = document.querySelectorAll('.authors a');
      if (authorEls.length > 0 && authors.length === 0) {
        authorEls.forEach(a => authors.push(a.textContent.trim()));
      }
    }

    // PubMed / PMC
    else if (hostname.includes('ncbi.nlm.nih.gov') || hostname.includes('pubmed.ncbi.nlm.nih.gov')) {
      isPaper = true;
      const doiLink = document.querySelector('a.id-link[href*="doi.org"], .citation-doi a, a[href*="doi.org"]');
      if (doiLink) {
        doi = extractDoi(doiLink.href) || doi;
      }
      const pdfLink = document.querySelector('a.link-item.pmc-pdf, a[href*=".pdf"], a.pdf-link');
      if (pdfLink && pdfLink.href) {
        pdfUrl = pdfLink.href;
      }
      if (!title) {
        const h1 = document.querySelector('h1.heading-title, h1.article-title, h1');
        if (h1) title = h1.textContent.trim();
      }
    }

    // bioRxiv / medRxiv
    else if (hostname.includes('biorxiv.org') || hostname.includes('medrxiv.org')) {
      isPaper = true;
      const pdfLink = document.querySelector('a.article-dl-pdf-link, a[href*=".full.pdf"]');
      if (pdfLink && pdfLink.href) {
        pdfUrl = pdfLink.href;
      }
      if (!doi) {
        const doiEl = document.querySelector('.highwire-cite-metadata-doi');
        if (doiEl) doi = extractDoi(doiEl.textContent);
      }
    }

    // Nature, Science, IEEE, ScienceDirect, Springer, etc.
    else if (!hostname.includes('scholar.google')) {
      const urlDoi = extractDoi(url);
      if (urlDoi) {
        doi = urlDoi;
        isPaper = true;
      }

      if (!doi) {
        const anyDoiLink = document.querySelector('a[href*="doi.org/10."]');
        if (anyDoiLink) {
          doi = extractDoi(anyDoiLink.href);
        }
      }

      if (!pdfUrl) {
        const anyPdfLink = document.querySelector('a[href$=".pdf"], a[data-download-pdf="true"], a[href*="/pdf/"], a.pdf-download-btn');
        if (anyPdfLink && anyPdfLink.href && !anyPdfLink.href.startsWith('javascript:')) {
          pdfUrl = anyPdfLink.href;
        }
      }
    }

    // 3. Extract Journal Cover / Banner / Logo Image
    let journalImage = '';
    let journalImageType = 'cover'; // 'cover' or 'banner'

    if (hostname.includes('sciencedirect.com')) {
      const coverEl = document.querySelector('a.publication-title-link img, img[src*="ars.els-cdn.com/content/image"], .publication-brand img, .publication-cover-image img, img.cover-img, img[alt*="cover" i], a[href*="/journal/"] img');
      if (coverEl && coverEl.src) {
        journalImage = coverEl.src;
        journalImageType = 'cover';
      }
    } else if (hostname.includes('wiley.com')) {
      const bannerEl = document.querySelector('img[src*="journal-banners"], .journal-header img, .banner-image img, header img[src*="onlinelibrary"]');
      if (bannerEl && bannerEl.src) {
        journalImage = bannerEl.src;
        journalImageType = 'banner';
      } else {
        const coverEl = document.querySelector('.cover-image img, img[alt*="cover" i]');
        if (coverEl && coverEl.src) {
          journalImage = coverEl.src;
          journalImageType = 'cover';
        }
      }
    } else if (hostname.includes('nature.com') || hostname.includes('springer.com') || hostname.includes('springeropen.com')) {
      // Direct high-res journal covers for Nature Portfolio
      if (url.includes('s41561') || url.includes('/ngeo') || (journal && journal.toLowerCase().includes('nature geoscience'))) {
        journalImage = 'https://media.springernature.com/w440/springer-static/cover-hires/journal/41561';
        journalImageType = 'cover';
      } else if (url.includes('s41586') || (journal && journal.toLowerCase() === 'nature')) {
        journalImage = 'https://media.springernature.com/w440/springer-static/cover-hires/journal/41586';
        journalImageType = 'cover';
      } else if (url.includes('s41467') || (journal && journal.toLowerCase().includes('nature communications'))) {
        journalImage = 'https://media.springernature.com/w440/springer-static/cover-hires/journal/41467';
        journalImageType = 'cover';
      } else if (url.includes('s43247') || (journal && journal.toLowerCase().includes('communications earth'))) {
        journalImage = 'https://media.springernature.com/w440/springer-static/cover-hires/journal/43247';
        journalImageType = 'cover';
      }

      if (!journalImage) {
        const el = document.querySelector('.c-journal-header img, header .c-header__logo img, picture.c-header__logo img, .c-article-header picture img, .c-article-header__logo img, img[class*="cover"], img[src*="cover-hires"], img[src*="springer-static"]');
        if (el && el.src) {
          journalImage = el.src;
          journalImageType = 'cover';
        }
      }
    } else if (hostname.includes('oup.com')) {
      const el = document.querySelector('.widget-IssueCover img, img[src*="journal_issue_covers"], .al-header-logo img, .journal-logo img');
      if (el && el.src) {
        journalImage = el.src;
        journalImageType = 'cover';
      }
    } else if (hostname.includes('arxiv.org')) {
      journalImage = 'https://static.arxiv.org/static/browse/0.3.4/images/arxiv-logo-web.svg';
      journalImageType = 'banner';
    }

    if (!journalImage) {
      const ogImg = getMeta(['og:image', 'twitter:image']);
      if (ogImg && !ogImg.includes('favicon') && !ogImg.includes('default-logo') && !ogImg.includes('fallback') && (ogImg.startsWith('http://') || ogImg.startsWith('https://'))) {
        journalImage = ogImg;
        journalImageType = 'banner';
      }
    }

    // 4. Fallback resolution
    if (doi && !paperUrl) {
      paperUrl = `https://doi.org/${doi}`;
      isPaper = true;
    }

    if (arxivId && !paperUrl) {
      paperUrl = `https://arxiv.org/abs/${arxivId}`;
      isPaper = true;
    }

    if (!paperUrl) {
      paperUrl = window.location.href;
    }

    if (!title) {
      const h1 = document.querySelector('h1');
      title = (h1 ? h1.textContent.trim() : document.title) || paperUrl;
    }

    // If PDF, DOI, arXiv, or citation meta tags exist, mark as academic paper
    if (doi || arxivId || journal || (pdfUrl && pdfUrl.endsWith('.pdf')) || hostname.includes('scholar.google')) {
      isPaper = true;
    }

    // Google Scholar Search URL for this paper
    const cleanTitle = title.replace(/\s+/g, ' ').trim();
    const scholarSearchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(cleanTitle)}`;

    if (pdfUrl && !pdfUrl.startsWith('http')) {
      try {
        pdfUrl = new URL(pdfUrl, window.location.href).href;
      } catch (e) {}
    }

    const paperObj = {
      isPaper,
      paperUrl,
      pdfUrl,
      doi,
      arxivId,
      title: cleanTitle,
      authors: Array.isArray(authors) ? authors.slice(0, 8).join(', ') : (authors || ''),
      journal,
      journalImage,
      journalImageType,
      year,
      citedByCount,
      citedByUrl,
      scholarSearchUrl
    };

    paperObj.bibtex = generateBibTeX(paperObj);
    return paperObj;
  }

  return {
    detectPaperMetadata,
    extractDoi,
    generateBibTeX
  };
})();

window.WebHighlighterPaperDetector = WebHighlighterPaperDetector;
