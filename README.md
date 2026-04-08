# FullPiP Extension

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/Version-3.1.0-green?style=flat-square)](https://github.com/krittaphato3/PiPExtension/releases)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

A professional-grade Chrome extension that enhances Picture-in-Picture (PiP) functionality with multi-window support, real-time synchronization, and extensive customization options.

## Overview

FullPiP extends beyond standard browser PiP capabilities by providing:

- **Multi-window PiP** — Run up to 5 simultaneous PiP windows
- **Live Image PiP** — Real-time synchronized floating windows for images and custom elements
- **Advanced customization** — Configurable window behavior, interaction controls, and visual themes
- **Performance optimized** — Port-based keep-alive with zero polling overhead

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [License](#license)

## Features

### Enhanced Video PiP
- Native HTML5 `<video>` integration via context menu
- Keyboard shortcuts for quick access (`Alt+P`)
- Intelligent video detection (prioritizes largest/playing video)
- Auto-PiP mode for automatic activation on supported pages

### Live Image PiP
- Document Picture-in-Picture API for persistent floating windows
- Real-time content synchronization via `MutationObserver`
- Canvas streaming support for dynamic content
- CSS background image detection
- Multi-window support (configurable up to 5 windows)

### Picker Mode
- Crosshair cursor for precise element selection
- Visual hover highlighting with tooltip feedback
- Compatible with any DOM element (images, videos, canvas, divs)
- Keyboard shortcut (`Alt+K`) for quick access

### Smart Zoom & Pan Controls

| Action         | Control              |
| -------------- | -------------------- |
| Zoom In        | `+` or `=`           |
| Zoom Out       | `-`                  |
| Reset View     | Double-click or `0`  |
| Pan            | Arrow keys (when zoomed) |
| Drag           | Click + drag (zoom > 100%) |

### Customization Options

#### Window Behavior
- **Scale Mode** — Fit / Fill / Stretch
- **Initial Size** — Visual / Resolution / Max Screen
- **Background** — Auto / Black / White / Checkerboard
- **Max Windows** — 1–5 simultaneous PiP windows

#### Interaction Controls
- **Lock Position** — Disable dragging (zoom only)
- **Edge Resistance** — Keep content within window bounds
- **Smart Zoom Limit** — Prevent zoom below 100%
- **Zoom Speed** — 0.1x – 3.0x sensitivity
- **Toast Duration** — 1s – 10s notification display

#### Advanced Settings
- **Highlight on Hover** — Show outline in media list
- **Auto-scroll to Media** — Scroll page when highlighting
- **Cache Media List** — Improve popup loading performance
- **Cache Duration** — 5s – 60s

## Installation

### Quick Install

1. Navigate to `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the extension directory

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/krittaphato3/PiPExtension.git
cd PiPExtension

# Load in Chrome using the steps above
```

## Usage

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

### Popup Interface

1. Click the **FullPiP icon** in the Chrome toolbar
2. Browse detected media in the **Active Media** section
3. Click ▶️ to play/pause, 📺 to open in PiP
4. Hover over items to highlight corresponding elements on the page

### Settings Management

- **Export** — Download current settings as a JSON file
- **Import** — Restore settings from a JSON backup
- **Reset Section** — Reset individual setting categories
- **Reset All** — Restore factory defaults (preserves theme preference)

## Architecture

### Component Overview

| File             | Responsibility                              |
| ---------------- | ------------------------------------------- |
| `manifest.json`  | MV3 configuration, permissions, and metadata |
| `background.js`  | Service worker: context menus, shortcuts, messaging, port lifecycle management |
| `content.js`     | DOM integration: PiP logic, live sync, media detection |
| `popup.html`     | Settings interface and media scanner        |
| `popup.js`       | Media detection, caching, dual-storage settings management |
| `style.css`      | Themed styling with GPU-accelerated animations |

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

## Configuration

### Default Settings

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

### Export Format

```json
{
  "version": "3.1.0",
  "exportedAt": "2026-04-05T12:00:00.000Z",
  "settings": {
    "// ... all settings keys": ""
  }
}
```

## Troubleshooting

### Common Issues

**No media detected on page**
- Refresh the page and retry
- Some sites implement PiP restrictions (e.g., Netflix, Disney+)
- Use Picker Mode (`Alt+K`) for manual element selection

**Content script unavailable**
- Refresh the page
- Verify the extension is enabled in `chrome://extensions/`
- Note: Restricted pages (`chrome://`, `about:blank`) block extension scripts

**PiP window closes immediately**
- Browsers enforce PiP window limits (typically 1–2)
- Verify `Max PiP Windows` setting
- Close existing PiP windows before opening new ones

**Settings not syncing across devices**
- Verify Chrome sync status in `chrome://settings/syncSetup`
- Local save occurs immediately; sync migration triggers after 2 seconds of inactivity
- Allow a few seconds for sync completion before closing the popup

### Debug Mode

Access extension logs via Chrome DevTools:

```
chrome://extensions/ → FullPiP → "Inspect views: background page"
```

Debug utilities available in page console:

```javascript
window.FullPiPDebug.getState()
window.FullPiPDebug.getErrorRate()
```

## Changelog

### v3.1.0 — April 2026 (Performance Update)
- Replaced `setInterval` keep-alive with native `chrome.runtime.connect()` port-based approach
- Dual-storage architecture: instant `chrome.storage.local` saves + debounced `chrome.storage.sync` migration (2000ms)
- Automatic retry for failed sync migrations (zero data loss guarantee)
- Eliminated 20-second polling overhead; service worker lifecycle tied to active PiP windows
- Optimized `loadSettings()` to merge local + sync storage simultaneously
- Added pending sync queue management for reset/import operations

### v3.0.0 — March 2026 (Major Feature Release)
- Full customization for all features
- Settings export/import functionality
- Toast notifications for all actions
- PiP status indicator with live count
- Media list caching with configurable duration
- Close button in every PiP window
- Picker mode keyboard shortcut (`Alt+K`)
- Close all PiP shortcut (`Alt+Shift+P`)
- Fixed memory leaks in content script
- Fixed zoom constraint (min 1.0)
- Fixed multi-frame media detection
- Complete UI redesign with themes
- Section-based settings reset

### v2.4.2
- Smart zoom limit implementation
- Edge resistance for panning
- Live image synchronization
- Auto-PiP mode

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Chrome Document Picture-in-Picture API
- Manifest V3 Specification
- Community contributors and testers

---

<div align="center">

**Enjoy FullPiP?** ⭐ Star this repository and share it!

[Report an Issue](https://github.com/krittaphato3/PiPExtension/issues) · [Request a Feature](https://github.com/krittaphato3/PiPExtension/issues)

</div>
