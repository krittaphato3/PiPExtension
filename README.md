# FullPiP Extension

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)
![Version](https://img.shields.io/badge/Version-3.1.0-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

**FullPiP** is a professional-grade Chrome extension that revolutionizes Picture-in-Picture functionality. Go beyond standard video PiP with **Live Image PiP**, **multi-window support**, **real-time synchronization**, and extensive customization options.

---

## Table of Contents

- [What's New](#-whats-new)
- [Features](#-features)
- [Installation](#-installation)
- [Usage Guide](#-usage-guide)
- [Technical Architecture](#-technical-architecture)
- [Configuration Reference](#%EF%B8%8F-configuration-reference)
- [Troubleshooting](#-troubleshooting)
- [Changelog](#-changelog)
- [Author](#-author)
- [License](#-license)

---

## 🚀 What's New

### v3.1.0 — Performance & Reliability Update

#### Service Worker Optimization
- **Port-Based Keep-Alive** — Replaced `setInterval` polling with native `chrome.runtime.connect()` for reliable service worker lifecycle management
- **Zero Polling Overhead** — Eliminated 20-second storage polling; service worker stays alive only while PiP windows are active
- **Automatic Port Lifecycle** — Ports connect/disconnect automatically based on active PiP window count

#### Storage Quota Management
- **Dual-Storage Architecture** — Settings save instantly to `chrome.storage.local` (instant UI feedback) with deferred migration to `chrome.storage.sync` (2000ms debounce)
- **Quota Protection** — Batched sync writes prevent hitting Chrome's strict `storage.sync` write limits
- **Automatic Retry** — Failed sync migrations queue automatically and retry on next save (zero data loss)
- **Faster Load Times** — Settings load from both storage areas simultaneously with local taking precedence

### v3.0.0 — Major Feature Release

#### Major Features
- **🎨 Full Customization** — Every feature is now configurable with user preferences
- **📦 Settings Export/Import** — Backup and restore your settings
- **🔔 Toast Notifications** — Visual feedback for all actions
- **🧹 Memory Leak Fixes** — Proper cleanup and resource management
- **🏷️ PiP Status Indicator** — Real-time active window counter
- **♻️ Media List Cache** — Faster popup loading with configurable cache duration
- **🎯 Picker Mode Shortcut** — Quick access with `Alt+K`
- **❌ Close All PiP** — One-click close with `Alt+Shift+P`
- **🔧 Section Reset** — Reset individual setting categories

#### QOL Improvements
- Visible close button in every PiP window
- Configurable zoom limits and drag behavior
- Smart pan lock (requires zoom > 100% to pan)
- Auto-hide cursor in PiP windows
- Highlight on hover for media items
- Auto-scroll to highlighted media
- Theme support (dark/light mode)

---

## 📋 Features

### 🎥 Enhanced Video PiP
- Native HTML5 `<video>` integration via context menu
- Keyboard shortcut (`Alt+P`) for quick access
- Smart video detection (finds largest/playing video)
- Auto-PiP mode for automatic activation

### 🖼️ Live Image PiP
- **Document PiP API** for always-on-top floating windows
- **Real-time sync** via `MutationObserver` — updates when page content changes
- **Canvas streaming** support for dynamic content
- **Background image detection** for CSS-based images
- **Multi-window support** — open up to 5 simultaneous PiP windows

### 🎯 Picker Mode
- Crosshair cursor for precise element selection
- Visual highlight with "Click to PiP" tooltip
- Works on any DOM element (images, videos, canvas, divs)
- Escape key to cancel

### ⚡ Smart Zoom & Pan

| Action         | Control              |
| -------------- | -------------------- |
| Zoom In        | `+` or `=`           |
| Zoom Out       | `-`                  |
| Reset View     | Double-click or `0`  |
| Pan            | Arrow keys (when zoomed) |
| Drag           | Click + drag (when zoomed > 100%) |

### 🎨 Customization Options

#### Window Behavior
- **Scale Mode** — Fit / Fill / Stretch
- **Initial Size** — Visual / Resolution / Max Screen
- **Background** — Auto / Black / White / Checkerboard
- **Max Windows** — 1–5 simultaneous PiP windows

#### Interaction
- **Lock Position** — Disable dragging (zoom only)
- **Edge Resistance** — Keep content inside window
- **Smart Zoom Limit** — Prevent zoom below 100%
- **Zoom Speed** — 0.1x – 3.0x sensitivity
- **Toast Duration** — 1s – 10s notification display

#### Advanced
- **Highlight on Hover** — Show outline in media list
- **Auto-scroll to Media** — Scroll page when highlighting
- **Cache Media List** — Speed up popup loading
- **Cache Duration** — 5s – 60s

---

## 🛠 Installation

### Quick Install

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the extension folder

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/krittaphato3/PiPExtension.git
cd PiPExtension

# Load in Chrome
# Follow steps 1–4 above
```

---

## 📖 Usage Guide

### Context Menu

| Action        | Method                                              |
| ------------- | --------------------------------------------------- |
| Pop Video     | Right-click video → **FullPiP: Pop Video**          |
| Pop Image     | Right-click image → **FullPiP: Pop Live Image**     |
| Picker Mode   | Right-click page → **FullPiP: Picker Mode**         |

### Keyboard Shortcuts

| Shortcut        | Action                        |
| --------------- | ----------------------------- |
| `Alt+P`         | Toggle PiP for main video     |
| `Alt+K`         | Toggle Picker Mode            |
| `Alt+Shift+P`   | Close all PiP windows         |
| `Escape`        | Close PiP window / Exit Picker |

### Popup Controls

1. Click the **FullPiP icon** in toolbar
2. Browse detected media in **Active Media** section
3. Click ▶️ to play/pause, 📺 for PiP
4. Hover over items to highlight on page

### Settings Management

- **Export** — Download settings as JSON file
- **Import** — Restore settings from JSON backup
- **Reset Section** — Reset individual categories
- **Reset All** — Factory reset (keeps theme)

---

## 🏗 Technical Architecture

### Core Components

| File             | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `manifest.json`  | MV3 configuration with permissions                   |
| `background.js`  | Service worker for menus, shortcuts, messaging & port management |
| `content.js`     | DOM agent with PiP logic, live sync & port-based keep-alive |
| `popup.html`     | Settings UI with media scanner                       |
| `popup.js`       | Media detection, caching, dual-storage settings management |
| `style.css`      | Themed styling with GPU-accelerated animations       |

### Key Technologies

| Technology                    | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `documentPictureInPicture`    | Floating window API                  |
| `MutationObserver`            | Real-time DOM change detection       |
| `chrome.runtime.connect()`    | Persistent service worker keep-alive |
| `chrome.storage.local`        | Instant settings persistence         |
| `chrome.storage.sync`         | Cross-device settings sync (debounced) |
| `chrome.scripting`            | Cross-frame media detection          |
| `canvas.captureStream()`      | Live canvas streaming                |

### Storage Architecture

```
User Interaction
    │
    ├──► chrome.storage.local.set()  ← Immediate (0ms) — UI responsiveness
    │
    └──► pendingSyncUpdates queue
           │
           └──► chrome.storage.sync.set() ← Debounced (2000ms) — Cross-device sync
                    │
                    └──► On failure: re-queue for retry
```

### Permissions

| Permission                     | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `contextMenus`                 | Right-click menu integration         |
| `documentPictureInPicture`     | Floating PiP windows                 |
| `storage`                      | Settings persistence (local + sync)  |
| `activeTab` / `scripting`      | Media detection across frames        |
| `notifications`                | Action feedback (optional)           |

---

## ⚙️ Configuration Reference

### All Settings Keys

```json
{
  "themePref": "dark",
  "autoPipEnabled": false,
  "showNotifications": true,
  "pipScaleMode": "contain",
  "pipInitialSize": "visual",
  "pipBackgroundColor": "auto",
  "pipLockPan": false,
  "pipEdgeLock": false,
  "pipZoomSmartLimit": true,
  "pipZoomSpeed": 1.0,
  "maxPipWindows": 3,
  "toastDuration": 2.5,
  "highlightOnHover": true,
  "autoScrollToMedia": true,
  "cacheMediaList": true,
  "cacheDuration": 15000
}
```

### Settings File Format (Export)

```json
{
  "version": "3.1.0",
  "exportedAt": "2026-04-05T12:00:00.000Z",
  "settings": {
    "// ... all settings above": ""
  }
}
```

---

## 🐛 Troubleshooting

### Common Issues

**"No media found on page"**
- Refresh the page and try again
- Some sites block PiP (e.g., Netflix, Disney+)
- Try Picker Mode (`Alt+K`) for manual selection

**"Content script unavailable"**
- Refresh the page
- Check if extension is enabled in `chrome://extensions/`
- Some pages (`chrome://`, `about:blank`) block extensions

**PiP window closes immediately**
- Browser may have PiP window limit (usually 1–2)
- Check `Max PiP Windows` setting
- Close other PiP windows first

**Settings not syncing across devices**
- Check Chrome sync status in `chrome://settings/syncSetup`
- Settings save locally first; sync migration occurs 2 seconds after interaction stops
- Wait a few seconds for sync to complete before closing popup

### Debug Mode

Open DevTools Console on the extension page:

```
chrome://extensions/ → FullPiP → "Inspect views: background page"
```

Or in the content page console:

```javascript
// View PiP debug stats
window.FullPiPDebug.getState()
window.FullPiPDebug.getErrorRate()
```

---

## 📝 Changelog

### v3.1.0 — April 2026 (Performance Update)
- ⚡ Replaced `setInterval` keep-alive with native `chrome.runtime.connect()` port-based approach
- 💾 Dual-storage architecture: instant `chrome.storage.local` saves + debounced `chrome.storage.sync` migration (2000ms)
- 🔄 Automatic retry for failed sync migrations (zero data loss guarantee)
- 📉 Eliminated 20-second polling overhead; service worker lifecycle now tied to active PiP windows
- 🧹 Optimized `loadSettings()` to merge local + sync storage simultaneously
- 🛡️ Added pending sync queue management for reset/import operations

### v3.0.0 — March 2026 (Major Feature Release)
- ✨ Full customization for all features
- ✨ Settings export/import functionality
- ✨ Toast notifications for all actions
- ✨ PiP status indicator with live count
- ✨ Media list caching with configurable duration
- ✨ Close button in every PiP window
- ✨ Picker mode keyboard shortcut (`Alt+K`)
- ✨ Close all PiP shortcut (`Alt+Shift+P`)
- 🐛 Fixed memory leaks in content script
- 🐛 Fixed zoom constraint (min 1.0)
- 🐛 Fixed multi-frame media detection
- 🎨 Complete UI redesign with themes
- 🎨 Section-based settings reset

### v2.4.2 (Previous)
- Smart zoom limit implementation
- Edge resistance for panning
- Live image synchronization
- Auto-PiP mode

---

## 👨‍💻 Author

**krittaphato3**
- [GitHub Profile](https://github.com/krittaphato3)
- [Report Issues](https://github.com/krittaphato3/PiPExtension/issues)

---

## 📄 License

MIT License — See [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Chrome Document Picture-in-Picture API
- Manifest V3 Specification
- Community contributors and testers

---

<div align="center">

**Enjoy FullPiP?** ⭐ Star this repo and share it!

</div>
