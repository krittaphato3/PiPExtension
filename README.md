# FullPiP — Picture-in-Picture

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?style=flat-square)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/Version-1.1.1-orange?style=flat-square)](https://github.com/krittaphato3/PiPExtension/releases)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

FullPiP is a comprehensive Chrome extension that provides advanced Picture-in-Picture (PiP) functionality with intelligent routing, multi-window support, and seamless media control across different video sources.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Limitations](#limitations)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

### Intelligent PiP Routing

FullPiP offers three distinct operational modes that automatically adapt to your content and workflow:

- **Native API Mode**: Utilizes Chrome's `documentPictureInPicture` API for optimal quality
- **Popup Window Mode**: Creates dedicated popup windows for unlimited multi-window support
- **Hybrid Mode**: Intelligent routing that combines the best of both approaches

### Advanced Media Control

- **Multi-Window Support**: Open up to 5 or unlimited PiP windows (default 3, see Configuration)
- **Cross-Tab State Management**: Tracks PiP state across browser tabs
- **Smart Duplicate Prevention**: Prevents opening the same video multiple times
- **Multi-Monitor Positioning**: Target specific displays with manual placement
- **Zoom and Pan Controls**: Full viewport manipulation with keyboard shortcuts

### Seamless Integration

- **Universal Video Support**: Works with HTML5 video, streaming platforms, and custom players
- **Native-only streaming**: `blob:` / MSE / EME content must use Native API mode (see Limitations)
- **Context Menu Integration**: Right-click any video element for instant PiP
- **Keyboard Shortcuts**: Comprehensive hotkey support for power users
- **Settings Persistence**: Cross-session configuration with Chrome storage sync

### User Experience Enhancements

- **Picker Mode (Alt+K)**: Select any element on the page for PiP
- **Auto-PiP**: Automatically opens PiP when a video starts playing
- **Settings Export/Import**: Backup and restore your configuration
- **Multi-Monitor Placement**: Place PiP windows on specific displays
- **Configurable Toast Notifications**: Control duration and visibility of on-screen notifications

## Installation

> **Note:** Chrome Web Store listing is TBD — no listing ID yet. Use Manual Installation below.

### From Chrome Web Store (TBD)

1. Visit the [Chrome Web Store page](https://chrome.google.com/webstore)
2. Click "Add to Chrome"
3. Confirm installation in the popup dialog

### Manual Installation (Development)

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the extension directory
6. The extension will appear in your browser toolbar

## Usage

### Basic Usage

| Action            | Method                                  | Alternative                |
| ----------------- | --------------------------------------- | -------------------------- |
| Open Video in PiP | Right-click video → FullPiP: Pop Video  | Click PiP button in popup  |
| Toggle PiP        | Press Alt + P                           | Click media item in popup  |
| Picker Mode       | Right-click page → FullPiP: Picker Mode | Press Alt + K              |
| Multi-Monitor     | Right-click video → monitor submenu     | Use monitor settings       |
| Close All PiP     | Press Alt + Shift + P                   | Use "Close All PiP" button |

### Keyboard Shortcuts

Global commands (any webpage):

| Shortcut        | Action                     |
| --------------- | -------------------------- |
| Alt + P         | Toggle PiP for main video  |
| Alt + K         | Toggle element picker mode |
| Alt + Shift + P | Close all PiP windows      |

Content zoom windows (`documentPictureInPicture` image PiP):

| Shortcut     | Action                  |
| ------------ | ----------------------- |
| + / -        | Zoom in/out             |
| Mouse wheel  | Zoom                    |
| Arrow Keys   | Pan content when zoomed |
| 0            | Reset to default view   |
| Double-click | Reset zoom and pan      |
| Esc          | Close PiP window        |

Popup player windows (`player.html` video popups):

| Shortcut     | Action                                   |
| ------------ | ---------------------------------------- |
| Space        | Play / pause                             |
| M            | Mute / unmute                            |
| F            | Cycle fit (`contain` / `cover` / `fill`) |
| Left / Right | Seek ∓ 5s                                |
| Up / Down    | Volume ± 10%                             |

### Advanced Controls

- **Zoom**: Mouse wheel or + / - keys (content zoom windows)
- **Pan**: Arrow keys when zoomed (content zoom windows)
- **Reset View**: Double-click or 0 key (content zoom windows)
- **Close**: Esc (content zoom windows)
- **Playback**: Spacebar (popup player only)
- **Scale Mode**: F key cycles `contain` / `cover` / `fill` (popup player only)

## Configuration

### PiP Mode Selection

Choose from three operational modes in the extension settings:

- **Native API Mode**: Best for single video playback with highest quality
- **Popup Window Mode**: Best for multiple simultaneous PiP windows
- **Hybrid Mode**: Recommended - automatically chooses the best approach

### Window Management

- **Max Windows**: 1–5 or Unlimited (default 3). Unlimited is rate-limited (200 ms dispatch settle) so practical limits apply under load.
- **Window Positioning**: Auto-placement or manual positioning
- **Multi-Monitor Support**: Target specific displays

### Visual Customization

- **Background**: Auto, Black, White, or Checkerboard pattern
- **Scale Mode**: Normal, Fit, Fill, or Stretch
- **Zoom & Pan**: Mouse/touch controls with keyboard shortcuts
- **Edge Resistance**: Prevent dragging content outside window bounds
- **Initial Size**: Set default PiP window size (Visual/Actual/Fit)

### Interaction Settings

- **Lock Pan**: Zoom-only mode (no dragging)
- **Smart Zoom**: Prevent zooming below 100%
- **Zoom Speed**: Adjustable sensitivity (0.1x - 3.0x)
- **Auto-Scroll**: Automatically scroll to highlighted media
- **Highlight on Hover**: Visual highlight when hovering over media elements
- **Cache Media List**: Cache detected media for faster access

### Automation Settings

- **Auto-PiP Mode**: Automatically open PiP when a video starts playing

### Notification Settings

- **Toast Duration**: Set notification display time (1-10 seconds)
- **Show Notifications**: Toggle toast notifications on or off

### Audio Manager

Single-audio manager (`audioMode`, default `mix`) in popup Window settings (injected `#audioMode` select):

| Mode         | Behavior                                |
| ------------ | --------------------------------------- |
| `mix`        | No behavior change, all windows audible |
| `solo`       | New audible playback pauses others      |
| `muteOthers` | New audible playback mutes others       |

- Popup player reports audible state and honors `muteOthers` / `solo` commands from the background.
- Player `M` key toggles mute and sets a manual unmute override — user choice always wins over automation.

### Advanced

Advanced collapsible section in the popup:

- **Force Popup Mode** (`forcePopup`, default off): Skip native PiP. Labelled "Skip native PiP" in Multi-Monitor card.
- **Initial Size** (`pipInitialSize`, default `visual`): `visual` (on-screen size) / `actual` (natural size, capped to screen ratio) / `fit` (fit to screen at 85%).
- **Footer badge** (`#footerMode`): Shows the active engine name in the popup footer.

## Limitations

Popup `player.js` cannot proxy all sources. These must use Native API mode:

- `blob:` URLs — tab-scoped, rejected early (`Streaming video cannot be proxied`).
- Non-`http(s)` sources — only `http:` / `https:` may be proxied (`Unsupported video source`).
- Encrypted / EME / DRM — `encrypted` event fails fast (`DRM_DETECTED`, cannot be played in a popup window).
- MSE / HLS / DASH manifests (`.m3u8` / `.mpd`) need the page player stack — routed to native by `pipFactory`.

## Architecture

### Core Components

| Component         | Technology     | Responsibility                                                  |
| ----------------- | -------------- | --------------------------------------------------------------- |
| manifest.json     | JSON           | Extension manifest (Manifest V3)                                |
| background.js     | Service Worker | Context menus, keyboard shortcuts, inter-process communication  |
| content.js        | Content Script | DOM manipulation, media detection, PiP orchestration            |
| lib/pipFactory.js | ES6 Module     | Hybrid PiP engine with intelligent routing and state management |
| popup.html/.js    | HTML/CSS/JS    | Extension interface, settings management, media browser         |
| player.html/.js   | HTML/CSS/JS    | Borderless video player for popup PiP windows                   |
| style.css         | CSS            | Responsive UI theming with dark/light mode support              |

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
│ • Window create │    │ • Native PiP     │    │ • Cache mgmt    │
│ • Error handling│    │ • Popup tracking │    │ • Settings      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Flowchart

Native-first routing tries `documentPictureInPicture` zero-copy before falling back to popup windows.
Popup `player.html?src` proxies `http(s)` only; `blob:` / EME / `.m3u8` stay native via preflight.
Background service worker centralizes PiPFactory dispatch, storage (7 keys + 60s TTL), and single-audio (`mix` / `solo` / `muteOthers`).

```mermaid
flowchart TD
  User[User Action<br/>click/Alt+P/K/context] --> Popup[popup.html/js<br/>settings+scanner]
  Popup -->|tabs.sendMessage| Content[content.js<br/>detect/launch]
  Content -->|runtime.sendMessage| BG[background SW<br/>PiPFactory+audio+menus]
  Content <--> Factory[lib/pipFactory.js<br/>native vs popup routing]
  BG -->|windows.create| Player[player.html?src<br/>proxy http(s) only]
  Factory -->|native| Native[documentPictureInPicture<br/>zero-copy]
  Factory -->|popup| BG
  Player -->|reportAudible/muteOthers| BG
  BG <--> Store[(storage.local<br/>7 keys+TTL60s)]
  Content <-.->|preflight blob/EME/m3u8| Factory
```

### Extension Permissions

FullPiP requires the following Chrome permissions:

- `activeTab`: Access current tab for media detection
- `storage`: Save user preferences and settings
- `contextMenus`: Add right-click menu options
- `scripting`: Inject content scripts for PiP functionality
- `windows`: Create and manage popup PiP windows
- `system.display`: Multi-monitor support
- `notifications`: Display toast notifications for user feedback

Host permissions:

- `<all_urls>`: Required because popup windows opened via `chrome.windows.create` are new tabs where `activeTab` does not apply, so `scripting.executeScript` CSS injection into those popup tabs needs host access.

## Development

### Prerequisites

- Chrome 116+ for `documentPictureInPicture` (MV3 baseline 88+)
- Node.js (for running tests)
- Git (for version control)

### Setup

```bash
# Clone the repository
git clone https://github.com/krittaphato3/PiPExtension.git
cd PiPExtension

# Install dependencies
npm install
```

### Building

The extension is built using standard web technologies. No build process is required for development. Load the extension directory directly in Chrome's developer mode.

### Development Commands

```bash
# Run linting
npm run lint

# Fix lint issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Run PiPFactory unit tests
npm test

# Run content/player/popup util tests
npm run test:utils

# Run ALL tests (PiPFactory + content utils + player + popup utils)
npm run test:all

# CI-equivalent entry point
npm run test:ci

# Version-gated release zip (manifest/package/README must match)
npm run pack
```

CI (`.github/workflows/ci.yml`, Node 20): `npm ci`, `npm run lint`, `npm run format:check`, `npm run test:all`.

Pack (`scripts/pack.mjs`): version-gates `manifest.json` / `package.json` / README badge, warns on Prettier drift, and writes `fullpip-<ver>.zip` excluding `node_modules`, `tests`, `.git`, `.playwright-mcp`, `.kilo`.

### Testing

```bash
# Run all unit tests
npm run test:all

# Manual testing
# 1. Load extension in Chrome developer mode
# 2. Test on various video sites (YouTube, Vimeo, etc.)
# 3. Verify all PiP modes work correctly (API, Popup, Hybrid)
# 4. Test keyboard shortcuts (Alt+P, Alt+K, Alt+Shift+P)
# 5. Test right-click context menu on videos and images
# 6. Test settings export/import and theme toggle
```

## Contributing

We welcome contributions from the community. Please follow these guidelines:

### Development Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Update documentation as needed
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

### Code Standards

- Use modern JavaScript (ES6+)
- Follow consistent naming conventions
- Add JSDoc comments for functions
- Maintain test coverage for new features
- Ensure cross-browser compatibility

### Reporting Issues

- Use [GitHub Issues](https://github.com/krittaphato3/PiPExtension/issues) for bug reports
- Include detailed steps to reproduce
- Provide browser version and OS information
- Attach screenshots for UI issues

### Feature Requests

- Check existing issues before submitting
- Provide detailed use case descriptions
- Consider backward compatibility implications

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### Version 1.1.1

- Fix P0/P1/P2 bugs across background, content, popup, player, and pipFactory
- Responsive popup UI improvements
- Audio manager (`mix` / `solo` / `muteOthers`, default `mix`) with player `M` manual override
- `forcePopup` Skip native, `pipInitialSize` (`visual` / `actual` / `fit`), `#footerMode` engine badge
- `host_permissions` `<all_urls>` for popup-tab `scripting.executeScript` after `windows.create`
- CI (Node 20: lint + `format:check` + `test:all`) and version-gated `pack.mjs` (`fullpip-<ver>.zip` excludes)
- Native-only routing for `blob:` / MSE / EME — popup player rejects blob, non-`http(s)`, and `encrypted` events

### Version 1.1.0

- Hybrid PiP engine (native API + popup windows)
- Multi-monitor support with display detection
- Settings export/import/reset
- Picker mode (Alt+K) for element selection
- Auto-PiP mode
- Configurable toast duration and notifications
- Scale modes (Normal/Fit/Fill/Stretch)
- Background options (Auto/Black/White/Checkerboard)
- Edge resistance and smart zoom controls
- Live image sync in PiP windows
- Deduplication to prevent duplicate PiP windows
- Bug fixes and performance improvements

### Version 1.0.0

- Intelligent PiP routing with three operational modes
- Multi-window PiP support (1–5 / unlimited, default 3, 200 ms rate-limit)
- Cross-tab state management
- Multi-monitor positioning
- Comprehensive keyboard shortcuts
- Responsive extension popup
- Native-only streaming for `blob:` / MSE / EME content
- Smart duplicate prevention
- Settings synchronization
- Professional user interface

---

**FullPiP** — Advanced Picture-in-Picture for the modern web.
