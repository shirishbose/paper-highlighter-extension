# Brave Web Highlighter & Research Annotator

A fast, lightweight, and privacy-respecting browser extension for **Brave Browser** (and all Chromium browsers: Chrome, Edge, Arc, Vivaldi). It brings the sleek **Microsoft Edge text-selection mini-menu** to all webpages, research journals, and academic articles.

Highlight text, attach comments, automatically capture paper citations (DOIs, arXiv, PubMed, direct PDFs), and export notes to **Plain Text (`.txt`)**, **BibTeX (`.bib`)**, or **Markdown (`.md`)**.

---

## ⚡ Fast 30-Second Installation

Works identically on **Windows**, **Linux**, and **macOS**. No technical setup or build tools required.

### Step 1: Download the Extension
Choose **Option A** (Easiest) or **Option B**:

- **Option A (No Git needed)**:
  1. Download the latest **`web-highlighter-extension-v1.4.0.zip`** from the [GitHub Releases page](https://github.com/shirishbose/paper-highlighter-extension/releases).
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

### 🔄 Updating the Extension (for Git users)
Whenever updates are published, pull the latest changes and reload:
```bash
cd paper-highlighter-extension
git pull origin main
```
Then go to `brave://extensions` (or `chrome://extensions`) and click the 🔄 **Reload** button on the extension card. *(Your saved highlights and notes will remain completely safe).*

---

## 🚀 How to Use

### 1. Highlight Text & Minimalist Mini-Menu
- Drag your mouse to select any text on any webpage or paper.
- A floating mini-menu pops up right above your selection with **subtle, clean circular color dots**.
- Highlights on the webpage appear in a clean, flat **2D marker style** (without shaded bottom borders).
- Choose from **8 preset colors** (`🟡 Yellow`, `🟢 Green`, `🔵 Blue`, `🟣 Purple`, `🌸 Pink`, `🟠 Orange`, `🔴 Red`, `🔷 Teal`) or pick any custom hex shade using the **🎨 Native Color Wheel**.
- **Instant Color Switch**: Click on any existing highlight on a page and tap another color circle to change color instantly.

### 2. Multi-Line Notes & Tag Management
- Click the `💬 Note` button in the floating menu.
- A spacious multi-line textarea opens to capture detailed thoughts and observations.
- Add tags (`#thesis`, `#methodology`, `#intro`) by typing and pressing `Enter`. Tags are saved and searchable across the dashboard.

### 3. In-Page Collapsible Side Panel & AI Portal (Gemini / ChatGPT / Claude)
- Click the **📑 side tab** pinned to the right edge of your screen (or click the Side Panel icon in the mini-menu) to open the slide-out panel.
- **Highlights & Notes Tab**: Browse, jump to, and edit all highlights and tags on the current page.
- **AI Assistant Tab**: Connect with your existing accounts on **Google Gemini**, **ChatGPT**, or **Claude**. Select research prompt templates (Summary, Methodology Analysis, Critical Peer-Review, or BibTeX Notes) and launch the portal with your context in 1 click.
- **Account Sync Tab**: Connect your **Gmail account** to track and sync your research annotations across browsers.

### 4. Visual Blocks Dashboard & Tag Sorting
- Click the extension icon and select **Dashboard** to view your library organized in a modern **Cards/Blocks Grid**.
- Filter by tags using the interactive **Tag Cloud** in the sidebar.
- Sort pages by **Most Recent**, **Most Highlights**, **Tags (A-Z)**, or **Page Title**.
- Expand any page block to view, edit, or copy individual highlights and notes.

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
