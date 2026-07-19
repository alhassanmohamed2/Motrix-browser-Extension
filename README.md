# Motrix Browser Extension

A powerful Chrome/Chromium extension that integrates your browser with the [Motrix](https://motrix.app/) download manager. Intercept downloads, download videos with a single click, and manage everything through a sleek dark-themed interface.

## Features

- **Smart Download Interception** — Automatically catches browser downloads and sends them to Motrix. Only intercepts user-initiated downloads to prevent unwanted triggers.
- **Video Download Overlay** — Hover over any HTML5 `<video>` element on any website to reveal a download button. Supports multiple sources/quality selection.
- **Right-Click Context Menu** — Right-click any link, image, video, or audio to "Download with Motrix".
- **Direct URL Download** — Paste any URL directly into the popup and send it to Motrix.
- **Download History** — View your 5 most recent downloads in the popup, with full history tracked (last 50).
- **Connection Status** — Real-time Motrix connection indicator with badge icon on the toolbar.
- **Keyboard Shortcut** — `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) opens the extension popup.
- **Import/Export Settings** — Back up and restore your configuration.
- **Test Connection** — Verify Motrix connectivity directly from the settings page with response time.

## Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this directory.
5. Ensure Motrix is running with RPC enabled.

## Requirements

- [Motrix](https://motrix.app/) download manager (must be running)
- RPC listening must be enabled in Motrix settings
- Chrome/Chromium-based browser (Chrome, Edge, Brave, etc.)

## Configuration

Click the extension icon → **Settings** to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| RPC Server URL | `http://localhost:16800/jsonrpc` | Motrix's JSON-RPC endpoint |
| Minimum File Size | `0 MB` | Files smaller than this won't be intercepted (0 = all) |
| Excluded Extensions | *(none)* | Comma-separated list of file extensions to skip |
| Video Overlay | `Enabled` | Show download button on video elements |

## File Structure

```
├── manifest.json      # Extension manifest (MV3)
├── background.js      # Service worker — download interception, RPC, history
├── popup.html/css/js   # Extension popup UI
├── options.html/css/js # Settings page
├── content.js          # Video overlay content script
├── content.css         # Video overlay styles
├── icons/              # Extension icons (16, 48, 128px)
└── README.md
```

## Security Notes

- The extension only communicates with your local Motrix instance via JSON-RPC.
- No external CDN dependencies — all assets are bundled locally.
- Download interception only fires for user-initiated actions (clicks, context menu, explicit URL entry).
- The video overlay respects your privacy and doesn't track browsing behavior.

## License

MIT
