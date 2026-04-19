# FullPiP — Advanced Picture-in-Picture for Chrome

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?style=flat-square)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/Version-4.3.0--Beta-orange?style=flat-square)](https://github.com/krittaphato3/PiPExtension/releases)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

**FullPiP** is a powerful Chrome extension that revolutionizes Picture-in-Picture functionality with intelligent multi-window support, customizable modes, and seamless media control. Experience professional-grade PiP with advanced features like multi-monitor support, unlimited windows, and smart routing.

## ✨ Key Features

### 🔄 Three Engine Modes
Choose the optimal PiP approach for your workflow:

| Mode | Technology | Best For | Windows | Quality |
|------|------------|----------|---------|---------|
| **🔵 Native API** | Chrome's `documentPictureInPicture` | Single video, best quality | 1 per tab | Highest |
| **🟠 Popup Windows** | Custom popup windows | Multiple PiPs, multi-monitor | Unlimited* | High |
| **🟣 Hybrid (Smart)** | Intelligent routing | Best of both worlds | Adaptive | Optimal |

*Limited by system resources

### 🎯 What's New in v4.3.0 Beta

#### 🚀 Major Improvements
- **Unlimited PiP Windows** — Remove artificial limits with new "Unlimited" option
- **Enhanced Toggle Logic** — Active media list buttons now properly toggle PiP open/close
- **Improved Responsiveness** — Popup adapts to screen size with responsive design
- **Better Error Handling** — User-friendly error messages with actionable guidance

#### 🐛 Critical Fixes
- **Toggle Functionality** — Media list PiP buttons now behave like Alt+P (open/close toggle)
- **Settings Sync** — Reduced sync delay from 2000ms to 500ms for better UX
- **Media Cache** — Prevents stale media lists when navigating between pages
- **Global Exposure** — Removed unnecessary global function exports for security

#### 🎨 UI/UX Enhancements
- **Responsive Popup** — Adapts to different screen sizes (360px-500px width)
- **Professional Styling** — Improved animations and visual feedback
- **Accessibility** — Better focus management and keyboard navigation

## 🚀 Quick Start Guide

### Basic Usage
| Action | Method | Alternative |
|--------|--------|-------------|
| **Open Video in PiP** | Right-click video → **FullPiP: Pop Video** | Click PiP button in popup |
| **Toggle PiP** | Press **Alt + P** | Click media item in popup |
| **Picker Mode** | Right-click page → **FullPiP: Picker Mode** | Press **Alt + K** |
| **Multi-Monitor** | Right-click video → monitor submenu | Use monitor settings |
| **Close All PiP** | Press **Alt + Shift + P** | Use "Close All PiP" button |

### Advanced Controls
- **Zoom**: Mouse wheel or **+**/**-** keys
- **Pan**: Arrow keys (when zoomed)
- **Reset View**: Double-click or **0** key
- **Scale Mode**: **F** key (popup PiP only)
- **Mute Toggle**: **M** key (popup PiP only)
- **Playback**: Spacebar (popup PiP only)

## ⚙️ Advanced Features

### 🎥 PiP Engine Modes

#### 🔵 Native API Mode
**Best for**: Single video playback, highest quality
- Utilizes Chrome's native `documentPictureInPicture` API
- **Borderless integration** with seamless appearance
- **Full blob URL support** (YouTube, streaming platforms)
- **Hardware acceleration** for optimal performance
- **Limitation**: One PiP window per browser tab

#### 🟠 Popup Window Mode
**Best for**: Multiple PiPs, multi-monitor setups
- Custom popup windows with full control
- **Unlimited simultaneous PiP windows**
- **Multi-monitor positioning** with manual placement
- **All customization options** available
- **Note**: Blob URLs require native mode (Chrome limitation)

#### 🟣 Hybrid Mode (Recommended)
**Best for**: Most users, optimal experience
- **Intelligent routing** based on content and context
- Attempts native PiP first for quality
- Automatically falls back to popup for additional windows
- **Blob URL detection** with automatic mode selection
- **Adaptive behavior** for best user experience

### 🎨 Content Scaling & Display

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Normal** | Natural size, centered with black bars | Preserve aspect ratio |
| **Fit** | Scales to fit window, may letterbox | See entire content |
| **Fill** | Scales to fill window, may crop | Maximize screen usage |
| **Stretch** | Stretches to fill, may distort | Fill screen completely |

### 🎛️ Customization Options

#### Window Management
- **Max Windows**: 1-5 or Unlimited simultaneous PiP windows
- **Window Positioning**: Auto-placement or manual positioning
- **Multi-Monitor Support**: Target specific displays

#### Visual Customization
- **Background**: Auto, Black, White, or Checkerboard pattern
- **Scale Mode**: Choose how content fills the window
- **Zoom & Pan**: Mouse/touch controls with keyboard shortcuts
- **Edge Resistance**: Prevent dragging content outside window bounds

#### Interaction Settings
- **Lock Pan**: Zoom-only mode (no dragging)
- **Smart Zoom**: Prevent zooming below 100%
- **Zoom Speed**: Adjustable sensitivity (0.1x - 3.0x)
- **Auto-Scroll**: Automatically scroll to highlighted media

### ⌨️ Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| **`Alt + P`** | Toggle PiP for main video | Any webpage |
| **`Alt + K`** | Toggle element picker mode | Any webpage |
| **`Alt + Shift + P`** | Close all PiP windows | Any webpage |
| **`+` / `-`** | Zoom in/out | Inside PiP window |
| **`Arrow Keys`** | Pan content | When zoomed in PiP |
| **`Double Click`** | Reset zoom and pan | Inside PiP window |
| **`0`** | Reset to default view | Inside PiP window |
| **`F`** | Cycle scale mode | Popup PiP windows |
| **`M`** | Toggle audio mute | Popup PiP windows |
| **`Space`** | Play/pause video | Popup PiP windows |
| **`Escape`** | Close PiP window | Inside PiP window |

**💡 Pro Tip**: All shortcuts work globally and don't require focus on specific elements.

## 📦 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store page](https://chrome.google.com/webstore)
2. Click **"Add to Chrome"**
3. Confirm installation in the popup

### Manual Installation (Development)
1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the extension directory
6. The extension will appear in your toolbar

## 🏗️ Architecture

### Core Components

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| **`manifest.json`** | JSON | Extension manifest (Manifest V3) |
| **`background.js`** | Service Worker | Context menus, keyboard shortcuts, inter-process communication |
| **`content.js`** | Content Script | DOM manipulation, media detection, PiP orchestration |
| **`lib/pipFactory.js`** | ES6 Module | Hybrid PiP engine with intelligent routing and state management |
| **`popup.html/.js`** | HTML/CSS/JS | Extension interface, settings management, media browser |
| **`player.html/.js`** | HTML/CSS/JS | Borderless video player for popup PiP windows |
| **`style.css`** | CSS | Responsive UI theming with dark/light mode support |

### Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Action   │───▶│  Content Script  │───▶│  Background SW  │
│                 │    │                  │    │                 │
│ • Right-click   │    │ • Media detection│    │ • Window mgmt   │
│ • Keyboard      │    │ • DOM injection  │    │ • Settings sync │
│ • Popup UI      │    │ • State tracking │    │ • Context menus │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PiP Factory   │◀──▶│   State Manager  │◀──▶│   Storage API   │
│                 │    │                  │    │                 │
│ • Mode routing  │    │ • Cross-tab sync │    │ • Local/Sync    │
│ • Window creation│    │ • Native PiP    │    │ • Cache mgmt    │
│ • Error handling│    │ • Popup tracking │    │ • Settings      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

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

## 🔧 Troubleshooting Guide

### Common Issues & Solutions

#### **PiP Window Shows Gray/Black Screen**
- **Switch to Native mode**: Use **PiP API (Native)** mode for best compatibility
- **Check content**: YouTube and streaming sites work optimally in API or Hybrid mode
- **Blob URL limitation**: MediaSource/blob URLs cannot display in popup windows (Chrome security restriction)

#### **Video Won't Play in PiP**
- **Verify playback**: Ensure video is playing on the main page before opening PiP
- **Site restrictions**: Some platforms (Netflix, Disney+, etc.) block PiP due to DRM
- **Alternative method**: Try right-clicking the video directly instead of keyboard shortcuts

#### **PiP Won't Open At All**
- **Content detection**: Extension may not detect certain video players or custom implementations
- **Console debugging**: Open DevTools (F12) and check for error messages
- **Manual method**: Use right-click context menu on video elements

#### **Settings Not Syncing**
- **Local save**: Settings save immediately to local storage
- **Cross-device sync**: Chrome sync occurs after 500ms of inactivity
- **Force sync**: Open/close the extension popup to trigger immediate synchronization

#### **Performance Issues**
- **Multiple windows**: Reduce max PiP windows or use Unlimited cautiously
- **System resources**: Close unnecessary PiP windows to free memory
- **Browser restart**: Restart Chrome if experiencing persistent issues

### Advanced Diagnostics

1. **Check Extension Permissions**: Ensure all required permissions are granted
2. **Clear Extension Data**: Reset settings if configuration appears corrupted
3. **Browser Compatibility**: Verify Chrome version supports Manifest V3
4. **Conflict Detection**: Disable other PiP-related extensions temporarily

## 📋 Changelog

### v4.3.0 Beta — April 2026
- **🚀 Unlimited PiP Windows** — New "Unlimited" option removes artificial window limits
- **🔄 Enhanced Toggle Logic** — Active media list buttons now properly toggle PiP (open/close)
- **📱 Responsive Design** — Popup adapts to screen size (360px-500px width range)
- **⚡ Improved Performance** — Reduced settings sync delay from 2000ms to 500ms
- **🛡️ Security Hardening** — Removed unnecessary global function exports
- **💾 Smart Caching** — Media cache invalidates properly on page navigation
- **🔧 Better Error Messages** — User-friendly blob URL error messages with guidance
- **🎨 UI Polish** — Professional styling with improved animations and feedback
- **♿ Accessibility** — Better focus management and keyboard navigation support

### v4.1.0 Beta 2 — April 2026
- **🎯 PiP Mode System** — Choose between API, Popup, or Hybrid modes
- **🎬 Streaming Support** — Blob URLs now work correctly with native PiP API
- **⌨️ Alt+P Toggle** — Press again to close PiP (previously open-only)
- **🎯 Picker Mode Enhancement** — Alt+K now works with video elements
- **📱 Context Menu Improvements** — Better video detection across all websites
- **🔄 Playback Stability** — Fixed rapid flashing on direct MP4 files
- **🎛️ Mode-Aware Routing** — API mode no longer falls back to popup unexpectedly
- **⏰ State Management** — Auto-clears stale PiP state after 5 minutes
- **🔄 Sync Reliability** — Resolved race conditions in settings synchronization
- **📊 Enhanced Logging** — Detailed console output for debugging routing decisions
- **🤖 Auto-PiP Refinement** — Now uses PiPFactory instead of direct API calls

### v4.0.0 Beta — Previous
- **🔀 Unified Architecture** — All PiP operations route through PiPFactory.create()
- **🔄 Cross-Tab Synchronization** — NativePipStateManager tracks PiP across browser tabs
- **🎯 Context Awareness** — Smart detection of content script vs service worker environment
- **📐 Normal Scale Mode** — New default: natural size with centered positioning
- **🌐 Blob URL Compatibility** — YouTube and streaming videos work seamlessly
- **🚫 Duplicate Prevention** — Prevents opening the same video multiple times
- **📍 Smart Positioning** — Popup windows cascade with automatic offset placement
- **🛡️ Service Worker Safety** — Comprehensive guarding of window/document access
- **🎨 UI Modernization** — Simplified popup with collapsible settings sections
- **🧹 Memory Management** — Proper cleanup of video synchronization listeners
- **🔒 Edge Resistance** — Prevents dragging content outside window boundaries

### v3.1.0 — Legacy
- Port-based service worker keep-alive mechanism
- Dual-storage architecture (local + synchronized storage)
- Intelligent media list caching system

### v3.0.0 — Legacy
- Comprehensive customization framework
- Settings export/import functionality
- Toast notification system
- Multi-PiP window support
- Complete user interface redesign

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- **🐛 Bug Reports** — Use [GitHub Issues](https://github.com/krittaphato3/PiPExtension/issues)
- **💡 Feature Requests** — Submit enhancement suggestions
- **🔧 Code Contributions** — Fork and submit pull requests
- **📖 Documentation** — Help improve guides and documentation

### Development Setup
```bash
git clone https://github.com/krittaphato3/PiPExtension.git
cd PiPExtension
# Load as unpacked extension in Chrome
```

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Chrome Extensions Team** for Manifest V3 and PiP API support
- **Open Source Community** for inspiration and contributions
- **Beta Testers** for valuable feedback and bug reports

---

<div align="center">

**FullPiP v4.3.0 Beta** — Crafted with ❤️ by [krittaphato3](https://github.com/krittaphato3)

🔗 [GitHub Repository](https://github.com/krittaphato3/PiPExtension) • 📧 [Issues](https://github.com/krittaphato3/PiPExtension/issues) • 💡 [Discussions](https://github.com/krittaphato3/PiPExtension/discussions)

*Experience the future of Picture-in-Picture browsing*

</div>
