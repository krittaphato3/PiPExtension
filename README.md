# FullPiP — Picture-in-Picture

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/Version-4.1.0--Beta--2-orange?style=flat-square)](https://github.com/krittaphato3/PiPExtension/releases)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

Smart multi-window PiP for Chrome with **3 engine modes**. Choose how PiP works: Native API, Popup Windows, or Hybrid Smart routing.

## 🎯 What's New in v4.1.0

### PiP Mode System
Choose your PiP engine in Settings:

| Mode | Description | Best For |
|------|-------------|----------|
| **🔵 PiP API (Native)** | Uses Chrome's native PiP API only | Single video, best quality |
| **🟠 Popup Windows** | Opens PiP in popup windows | Multiple simultaneous PiPs, multi-monitor |
| **🟣 Hybrid (Smart)** | Tries native first, falls back to popup | Best of both worlds (default) |

### Key Fixes
- ✅ **YouTube/Streaming sites** - Native PiP now works with blob URLs
- ✅ **Alt+P Toggle** - Now closes PiP when pressed again
- ✅ **Picker Mode** - Works with videos (not just images)
- ✅ **Context Menu** - Fixed video detection on all sites
- ✅ **Play/Pause Loop** - Fixed rapid flashing on direct MP4 files
- ✅ **Mode Routing** - API mode no longer falls back to popup

## Quick Start

| What You Want | How To Do It |
|---|---|
| Open a video in PiP | **Right-click** the video → **FullPiP: Pop Video** |
| Quick PiP toggle | Press **Alt + P** (toggles open/close) |
| Pick any element | **Right-click** page → **FullPiP: Picker Mode** (or **Alt + K**) |
| Multi-monitor PiP | **Right-click** video → submenu with monitor list |
| Close all PiP | Press **Alt + Shift + P** |

## Features

### 🔵 PiP API Mode (Native)
- Uses Chrome's `documentPictureInPicture` API
- **Best video quality** - borderless, seamless
- Works with blob URLs (YouTube, WeTV, streaming sites)
- Limitation: One PiP window per tab
- Multi-PiP settings hidden (not applicable)

### 🟠 Popup Mode
- Opens PiP in popup windows
- **Multiple simultaneous PiP windows**
- **Multi-monitor positioning support**
- All settings visible (max windows, monitors, etc.)
- Note: Blob URLs cannot work in popups (Chrome limitation)

### 🟣 Hybrid Mode (Default)
- **Smart routing** - tries native PiP first
- Automatically falls back to popup for additional windows
- Blob URLs automatically use native PiP
- Best of both worlds

### Scale Modes
Choose how content fills the PiP window:
- **Normal** — Natural size, centered, black bars where content doesn't fill (default)
- **Fit** — Scales to fit entirely within window, may letterbox
- **Fill** — Scales to fill entire window, may crop
- **Stretch** — Stretches to fill window, may distort

### Customization
- **Background** — Auto, Black, White, or Checkerboard
- **Zoom & Pan** — Scroll to zoom, arrow keys to pan, double-click to reset
- **Max Windows** — Limit simultaneous PiP windows (1–5)
- **Edge Resistance** — Prevent content from being dragged outside the window
- **Smart Zoom** — Prevent zooming out below 100%

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + P` | Toggle PiP for main video (open/close) |
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
| `background.js` | Service worker — context menus, shortcuts, message routing |
| `content.js` | Page-level script — media detection, PiP orchestration |
| `lib/pipFactory.js` | Hybrid PiP engine — mode-aware routing, state management |
| `popup.html` / `popup.js` | Extension popup — mode selection, media list, settings |
| `player.html` / `player.js` | Borderless video proxy for popup PiP windows |
| `style.css` | Popup theme (dark/light) |
| `logo.svg` | Extension icon |

## How the PiP Mode System Works

```
User requests PiP
        │
        ▼
  Check Selected Mode
        │
   ┌────┴────┬─────────┐
   ▼         ▼         ▼
  API      Popup     Hybrid
   │         │         │
   ▼         │    ┌────┴────┐
 Native      │    ▼         ▼
 PiP      Popup  API      Popup
 only       only Open?   Available?
                     │         │
                     ▼         ▼
                   Yes→4     Yes→5
                   No→2      No→6
                     │
                     ▼
                  Can use
                  API here?
                     │
                     ▼
                   Yes→3
                   No→4
```

## Troubleshooting

**PiP window shows gray screen**
- Try switching to **PiP API (Native)** mode for best compatibility
- YouTube and streaming sites work best in API or Hybrid mode
- Blob URLs (MediaSource) cannot work in popup windows by Chrome design

**Video doesn't play in PiP**
- Make sure video is playing on the main page first
- Check if site blocks PiP (some DRM sites do)
- Try right-clicking the video directly instead of using Alt+P

**No PiP window opens**
- Some sites block PiP (Netflix, Disney+, etc.)
- Try right-clicking the video directly instead of using Alt+P
- Check console (F12) for error messages

**Settings not syncing across devices**
- Settings save instantly locally; cross-device sync happens after 2 seconds of inactivity
- Open the popup to trigger a sync flush

## Changelog

### v4.1.0 Beta 2 — April 2026
- **PiP Mode System** — Choose between API, Popup, or Hybrid mode
- **YouTube/Streaming Fix** — Blob URLs now use standard PiP API correctly
- **Alt+P Toggle** — Press again to close PiP (was open-only before)
- **Picker Mode Video Support** — Alt+K now works with video elements
- **Context Menu Fix** — Enhanced video URL matching for all sites
- **Play/Pause Loop Fix** — Removed bidirectional sync that caused rapid flashing
- **Mode-Aware Routing** — API mode no longer falls back to popup on failure
- **Stale State Detection** — Auto-clears old PiP state after 5 minutes
- **Settings Sync Fix** — Race condition resolved with proper queue locking
- **Enhanced Logging** — Detailed console logs for debugging routing decisions
- **Auto-PiP Fix** — Now uses PiPFactory instead of direct API call

### v4.0.0 Beta
- **Unified PiP routing** — All PiP opens go through `PiPFactory.create()`
- **Cross-tab state sync** — `NativePipStateManager` tracks native PiP across tabs
- **Context-aware API** — `pipFactory.js` detects content script vs service worker
- **Normal scale mode** — New default: natural size, centered, black bars
- **Blob URL support** — YouTube and MediaSource videos work correctly
- **Duplicate prevention** — Same video cannot be opened as PiP twice
- **Auto-increment positioning** — Popup windows cascade with offset
- **Service worker safety** — All `window`/`document` access guarded
- **Cleaner popup UI** — Simplified settings layout with collapsible sections
- **Memory leak fixes** — Video sync listeners cleaned up properly
- **Edge resistance** — Prevents dragging content outside the PiP window

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

**FullPiP v4.1.0 Beta 2** — Made by [krittaphato3](https://github.com/krittaphato3)

Found a bug? [Report it](https://github.com/krittaphato3/PiPExtension/issues) · [Suggest a feature](https://github.com/krittaphato3/PiPExtension/issues)

</div>
