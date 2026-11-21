# Brave Web Highlighter & Research Annotator

A fast, lightweight, and privacy-respecting browser extension for **Brave Browser** (and all Chromium browsers: Chrome, Edge, Arc, Vivaldi). It brings the sleek **Microsoft Edge text-selection mini-menu** to all webpages, research journals, and academic articles.

Highlight text, attach comments, automatically capture paper citations (DOIs, arXiv, PubMed, direct PDFs), and export notes to **Plain Text (`.txt`)**, **BibTeX (`.bib`)**, or **Markdown (`.md`)**.

---

## ⚡ Fast 30-Second Installation

Works identically on **Windows**, **Linux**, and **macOS**. No technical setup or build tools required.

### Step 1: Download the Extension
Choose **Option A** (Easiest) or **Option B**:

- **Option A (No Git needed)**:
  1. Download the latest **`web-highlighter-extension-v1.2.0.zip`** from the [GitHub Releases page](https://github.com/shirishbose/paper-highlighter-extension/releases).
  2. Extract / Unzip the folder anywhere on your computer (e.g., `Documents` or `Downloads`).

- **Option B (Using Git)**:
  ```bash
  git clone https://github.com/shirishbose/paper-highlighter-extension.git
  ```

---

### Step 2: Load into Brave Browser

1. Open **Brave** and type this into the address bar:
   ```text
   brave://extensions
   ```
   *(For Chrome, use `chrome://extensions`; for Edge, use `edge://extensions`)*.

2. In the top-right corner, toggle **Developer mode** to **ON**.

3. In the top-left corner, click **"Load unpacked"**:
   - **Windows**: Select the extracted `web-highlighter-extension` folder.
   - **Linux**: Select the `web-highlighter-extension` directory.

4. *(Recommended)* Click the **Puzzle icon** in Brave's top toolbar and click the **Pin** icon next to **Brave Web Highlighter & Notes**.

5. *(Optional for local files)* Click **Details** on the extension card and toggle **"Allow access to file URLs"** to **ON** if you read local HTML papers stored on your drive.

**Done! The extension is now active.**

---

## 🚀 How to Use

### 1. Highlight Text (Edge-Style Selection Mini-Menu)
- Drag your mouse to select any text on any webpage or paper.
- A floating mini-menu pops up automatically right above your selection.
- Click any color dot (`🟡 Yellow`, `🟢 Green`, `🔵 Blue`, `🟣 Pink`, `🟠 Orange`):
  - Text highlights instantly.
  - **Auto-saved immediately** to local storage.
  - **Options expand**: The `🗑️ Delete` button appears, allowing you to delete the highlight in 1 click.
  - **Change color**: Click any other color dot to switch colors on the fly.

### 2. Add Comments & Notes
- Click the `💬 Note` button in the floating menu.
- A slim inline comment field slides out right below the mini-menu.
- Type your notes—it **auto-saves continuously** as you type.

### 3. Click Existing Highlights
- Click any highlighted passage on the page anytime to bring back the mini-menu with all options (change color, edit note, delete).
- Click anywhere outside to dismiss the menu.

---

## 📥 Exporting Your Notes

Click the extension icon in Brave's top bar to open the popup:

| Export Format | Purpose | Description |
| :--- | :--- | :--- |
| **Plain Text (`.txt`)** | Standalone Reading | Clean, structured text file with Paper Title, Webpage URL, DOI link, direct PDF link, Google Scholar search link, excerpts, and your notes. |
| **BibTeX (`.bib`)** | LaTeX / Overleaf | Standard `@article{...}` citation entries for direct import into Zotero, Mendeley, or Overleaf. |
| **Markdown (`.md`)** | Obsidian / Notion | Formatted research notes with blockquotes, clickable links, and metadata. |
| **JSON Backup** | Data Portability | Full database backup to transfer highlights across machines. |

---

## 🎓 Academic Research & Scholar Features

- **Automatic Citation Detection**: When reading on **arXiv**, **PubMed / PMC**, **bioRxiv**, **Nature**, **ScienceDirect**, **IEEE**, or **Google Scholar**, the extension automatically detects and saves:
  - Canonical **Paper Link (DOI)** (e.g. `https://doi.org/10.xxxx/...`)
  - **Direct PDF Download Link**
  - **Google Scholar Citation Search Link**
  - **Authors, Journal, and Publication Year**
- **Scholar Library View**: Switch to the **🎓 Scholar** tab in the popup to browse all your saved papers with 1-click `📋 Copy BibTeX` buttons.

---

## 🔒 Privacy & Local Storage

- **100% Offline & Private**: All data is stored strictly on your local device using `chrome.storage.local`.
- **Zero Tracking**: No remote servers, no analytics, no accounts required, no telemetry.

---

## 🛠️ Updating the Extension

If you update the code or pull new changes:
1. Open `brave://extensions`.
2. Click the **Reload** (circular arrow) icon on the extension card.
3. Refresh (<kbd>F5</kbd>) your webpage tabs.
