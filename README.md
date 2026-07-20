# Motrix Browser Extension

A powerful Chrome/Chromium extension that integrates your browser with the [Motrix](https://motrix.app/) download manager. Intercept downloads, download videos with a single click, and manage everything through a sleek dark-themed interface.

## Features

- **Smart Download Interception** — Automatically catches browser downloads and sends them to Motrix. Only intercepts user-initiated downloads to prevent unwanted triggers.
- **YouTube & Video Support (via yt-dlp)** — Built-in bridge to `yt-dlp` allows you to download videos directly from YouTube, Twitter, and other complex sites. (Requires running the native host installer).
- **Video Download Overlay** — Hover over any HTML5 `<video>` element on any website to reveal a download button. Supports multiple sources/quality selection.
- **Right-Click Context Menu** — Right-click any link, image, video, or page to "Download with Motrix".
- **Direct URL Download** — Paste any URL directly into the popup and send it to Motrix.
- **Download History** — View your 5 most recent downloads in the popup, with full history tracked (last 50).
- **Connection Status** — Real-time Motrix connection indicator with badge icon on the toolbar.
- **Keyboard Shortcut** — `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) opens the extension popup.
- **Import/Export Settings** — Back up and restore your configuration.
- **Test Connection** — Verify Motrix connectivity directly from the settings page with response time.

## 🚀 Installation & Setup (One-Click)

The Motrix extension requires Motrix to be installed on your computer. To get the **full experience** (including YouTube video downloading), we provide a 1-click install script that sets up the `yt-dlp` bridge automatically.

### Easy Install (Linux/macOS)
1. Open Chrome/Brave/Edge and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this extension's directory.
4. Open your terminal, navigate to the extension folder, and run the automated installer:
   ```bash
   cd "/path/to/Motrix browser Extenstion/native-host"
   ./install.sh
   ```
   *(The script will automatically find your extension ID, install yt-dlp if missing, and configure Chrome!)*
5. Ensure the [Motrix app](https://motrix.app/) is running on your computer.
6. Click the extension's icon in your browser to verify it says **"Connected"**.

## 📖 How to Use

### 1. Auto-Intercept Downloads
By default, the extension automatically intercepts any file you click to download in your browser and sends it directly to Motrix. 
* To pause this, simply click the extension icon and toggle the switch off.
* You can configure a **Minimum File Size** in the extension Settings so small files (like images) download normally in the browser, while large files go to Motrix.

### 2. Download YouTube & Other Streaming Videos
Hover your mouse over any video player (on YouTube, Twitter, etc.). A sleek floating panel will appear in the top-left corner of the video.
* Click **✨ Fetch Qualities (yt-dlp)**.
* The extension will ask `yt-dlp` in the background for all available pre-merged video qualities (e.g., `720p .mp4`, `360p .mp4`).
* Click **Download** next to your preferred quality to instantly send it to Motrix!

### 3. Right-Click Context Menu
Right-click on any download link, image, or video, and select **Download with Motrix**.
You can also right-click anywhere on a webpage and select **Send page URL to Motrix** (useful for sending video pages).

### 4. Direct URL Entry
Click the extension icon in your browser toolbar to open the popup. Paste any download URL (or YouTube link) into the text box and hit **Download**.

## ⚙️ Configuration Options

Click the extension icon → **Settings** (gear icon) to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| RPC Server URL | `http://localhost:16800/jsonrpc` | Motrix's JSON-RPC endpoint. Leave this default unless you changed it in Motrix. |
| Minimum File Size | `0 MB` | Files smaller than this won't be intercepted (0 = intercept all). |
| Excluded Extensions | *(none)* | Comma-separated list of file extensions to skip (e.g., `jpg, png, html`). |
| Video Overlay | `Enabled` | Shows the floating download button on video elements. |

## 🚀 Recent Improvements (v2.0 Update)

This extension was recently rewritten and massively upgraded to provide a premium experience:
- **`yt-dlp` Native Bridge:** The biggest addition! The extension now natively communicates with `yt-dlp` on your OS. It automatically extracts direct `.mp4` streams from complex sites like YouTube, Twitter, and TikTok. 
- **LinkedIn Video Scraper:** Integrated the `foogaro` python logic into the Native Host! LinkedIn hides its MP4s behind auth walls and broken HLS chunks. The extension now silently fetches LinkedIn's public SSR HTML, extracts the true `.mp4` URL using the `data-sources` attribute, and sends it directly to Motrix!
- **Auto-Organization:** Downloads are now automatically categorized into neat subfolders inside your Motrix download directory based on file extension (e.g., `Videos`, `Images`, `Audio`, `Documents`, `Programs`, `Archives`).
- **Quality Selector:** When hovering over a YouTube video, a new "Fetch Qualities" button queries `yt-dlp` and lets you choose your preferred resolution (e.g., 1080p, 720p) before sending to Motrix.
- **Smart Download Interception:** Fixed a critical bug where background browser downloads were blindly intercepted. The extension now strictly tracks user intent (clicks, context menus) to prevent unwanted triggers and silent failures.
- **IDM-Style Video Overlay:** Hovering over any HTML5 video on any website now reveals a sleek, glassmorphism floating panel to download the video directly.
- **Zero-Config Installer:** The Native Host installer script was upgraded to automatically scan browser preferences and find your Extension ID, making setup a true 1-click experience.
- **Premium UI Overhaul:** The popup and options pages were completely redesigned with a modern dark theme, hover animations, toast notifications, and a live Motrix connection status badge.
- **Download History:** Added a history panel in the popup to track and manage your recently sent downloads.

## 🔒 Security Notes

- The extension only communicates with your local Motrix instance via JSON-RPC.
- The `yt-dlp` bridge runs locally on your PC. No cloud APIs are used, preserving your privacy.
- Download interception only fires for user-initiated actions to prevent invisible downloads.
- No external CDN dependencies — all assets are bundled locally.

## License
MIT
