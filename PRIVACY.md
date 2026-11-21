# Privacy Policy for Brave Web Highlighter & Notes

**Last Updated:** November 2026

## Overview
Brave Web Highlighter & Notes is an open, privacy-first browser extension designed to help researchers, students, and readers highlight text, write notes, and save citations across webpages and academic articles.

## Data Collection & Storage
- **Zero Remote Data Collection**: The extension does not collect, track, transmit, or sell any personal data, browsing history, or analytics.
- **Local Storage Only**: All highlights, notes, comments, and extracted paper metadata (DOIs, titles, citations) are stored strictly on your local device using the browser's native `chrome.storage.local` API.
- **No Third-Party Transmission**: The extension communicates with no external servers, APIs, analytics providers, or cloud services.

## Permissions Usage
- `storage`: Required exclusively to store your highlights, notes, and preferences locally on your machine.
- `activeTab` & `host_permissions` (`<all_urls>`): Required solely to detect text selections, render the floating highlighter menu, and read citation metadata (e.g., Highwire Press meta tags, DOIs) on the pages you choose to browse.
- `contextMenus`: Required to provide right-click highlight shortcuts.

## Data Deletion & Export
- You have complete control over your data.
- You can delete individual highlights or clear entire page records at any time.
- You can export your data in Plain Text (`.txt`), Markdown (`.md`), BibTeX (`.bib`), or JSON format for local backup.
- Uninstalling the extension completely deletes all local storage associated with it.

## Contact
For bug reports, source code review, or questions, please visit the project repository.
