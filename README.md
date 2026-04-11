# FullPiP — Picture-in-Picture

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/Version-4.0.0--Beta-orange?style=flat-square)](https://github.com/krittaphato3/PiPExtension/releases)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

Smart multi-window PiP for Chrome. Open a video in Picture-in-Picture, then open **another** — it automatically creates additional windows instead of replacing the first one.

## How It Works

1. **First PiP** → Opens using Chrome's native Document PiP API (best quality)
2. **Second PiP** → Automatically opens as a popup window (no replacement)
3. **Third, Fourth, Fifth…** → Each gets its own independent window

Everything is automatic. No configuration needed.

## Quick Start

| What You Want | How To Do It |
|---|---|
| Open a video in PiP | **Right-click** the video → **FullPiP: Pop Video** |
| Quick PiP toggle | Press **Alt + P** |
| Pick any element | **Right-click** page → **FullPiP: Picker Mode** (or **Alt + K**) |
| Multi-monitor PiP | **Right-click** video → submenu with monitor list |
| Close all PiP | Press **Alt + Shift + P** |

## Features

### Automatic Multi-Window
Chrome only allows **one** native PiP window at a time. FullPiP works around this by detecting when a PiP is already open and automatically opening additional windows as borderless popups that look and behave just like native PiP.

### Scale Modes
Choose how content fills the PiP window:
- **Normal** — Natural size, centered, black bars where content doesn't fill (default)
- **Fit** — Scales to fit entirely within window, may letterbox
- **Fill** — Scales to fill entire window, may crop
- **Stretch** — Stretches to fill window, may distort

### Live Video Sync
Popup PiP windows sync playback with the original video — play, pause, seek, and volume changes are mirrored in both directions.

### Multi-Monitor Support
Send PiP windows to specific monitors. Right-click a video and use the monitor submenu, or use the extension popup to choose a target display.

### Customization
- **Background** — Auto, Black, White, or Checkerboard
- **Zoom & Pan** — Scroll to zoom, arrow keys to pan, double-click to reset
- **Max Windows** — Limit simultaneous PiP windows (1–5)
- **Edge Resistance** — Prevent image from being dragged outside the window
- **Smart Zoom** — Prevent zooming out below 100%

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + P` | Toggle PiP for main video |
| `Alt + K` | Toggle Picker Mode |
| `Alt + Shift + P` | Close all PiP windows |
| `+` / `-` | Zoom in / out (inside PiP) |
| `Arrow Keys` | Pan (when zoomed) |
| `Double Click` | Reset view |
| `0` | Reset zoom and pan to defaults |
| `F` | Cycle scale mode (inside popup PiP) |
| `M` | Toggle mute (inside popup PiP) |
| `Space` | Play / Pause (inside popup PiP) |
| `Escape` | Close PiP window |

## Installation

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the extension folder

## Project Structure

| File | Role |
|---|---|
| `manifest.json` | Extension config (MV3) |
| `background.js` | Service worker — context menus, shortcuts, message routing, cross-tab PiP state |
| `content.js` | Page-level script — media detection, PiP orchestration, live sync |
| `lib/pipFactory.js` | Hybrid PiP engine — conditional native/popup routing, state management |
| `popup.html` / `popup.js` | Extension popup — media list, settings, multi-monitor controls |
| `player.html` / `player.js` | Borderless video proxy for popup PiP windows |
| `style.css` | Popup theme (dark/light) |
| `logo.svg` | Extension icon |

### How the Hybrid PiP Engine Works

```
User requests PiP
        │
        ▼
Check: Is a native Document PiP window already open?
        │
   ┌────┴────┐
   ▼         ▼
  NO         YES
   │         │
   ▼         ▼
Native    Popup Window
PiP       (chrome.windows.create)
request   → No replacement
Window()  → Supports positioning
```

State is tracked across tabs via `chrome.storage.local`, so the extension knows if **any** tab has a native PiP open — not just the current tab.

## Testing

Run the unit tests (Node.js required):

```bash
node tests/test-pipFactory.js
```

Tests cover: configuration values, `_shouldUsePopup` routing logic, cross-tab state manager lifecycle, proxy detection for all video formats, URL extraction from video elements, `getPipState()`, `create()` edge cases, and `closeAllPip()` context safety.

## Troubleshooting

**No PiP window opens**
- Some sites block PiP (Netflix, Disney+, etc.)
- Try right-clicking the video directly instead of using Alt+P

**Second PiP replaces the first**
- This was a known issue in v3.x — fixed in v4.0.0
- Make sure you've reloaded the extension after updating

**Popup PiP shows a download instead of video**
- Raw video files (.mp4, .webm) trigger browser downloads without the player proxy
- FullPiP automatically routes these through `player.html` — if this fails, try a different video source

**Settings not syncing across devices**
- Settings save instantly locally; cross-device sync happens after 2 seconds of inactivity
- Open the popup to trigger a sync flush

## Changelog

### v4.0.0 Beta — April 2026
- **Unified PiP routing** — All PiP opens now go through `PiPFactory.create()`, fixing tracking gaps
- **Cross-tab state sync** — `NativePipStateManager` tracks native PiP across all tabs via `chrome.storage.local`
- **Context-aware API** — `pipFactory.js` detects content script vs service worker context and routes accordingly
- **Normal scale mode** — New default: natural size, centered, black bars (no forced fitting)
- **Blob URL support** — YouTube and MediaSource videos now work correctly via native Document PiP (blob URLs can't load in popups)
- **Duplicate prevention** — Same video cannot be opened as PiP twice; shows "This video is already open in PiP"
- **Auto-increment positioning** — Popup windows cascade with offset to avoid overlap
- **Service worker safety** — All `window`/`document` access guarded for service worker context
- **Cleaner popup UI** — Simplified settings layout with collapsible sections, clear language
- **Reliable message handling** — All async message handlers have `.catch()` to prevent hanging responses
- **No more destructive fallback** — Failed popup attempts no longer close existing PiP windows
- **Memory leak fixes** — Video sync listeners cleaned up on both source and target pagehide
- **Edge resistance** — Properly prevents dragging content outside the PiP window
- **Settings cache** — Now reads from both `local` and `sync` storage for instant responsiveness
- **MV3 compliance** — Promise-based context menu setup, removed dead code, proper error handling

### v3.1.0
- Port-based service worker keep-alive
- Dual-storage architecture (local + sync)
- Media list caching

### v3.0.0
- Full customization system
- Settings export/import
- Toast notifications
- Multi-PiP support
- Complete UI redesign

---

<div align="center">

**FullPiP v4.0.0 Beta** — Made by [krittaphato3](https://github.com/krittaphato3)

Found a bug? [Report it](https://github.com/krittaphato3/PiPExtension/issues) · [Suggest a feature](https://github.com/krittaphato3/PiPExtension/issues)

</div>
