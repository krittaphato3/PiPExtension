# FullPiP Full Version

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?style=flat-square)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Version](https://img.shields.io/badge/Version-1.0.0--Alpha-orange?style=flat-square)](https://github.com/krittaphato3/PiPExtension/releases)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

FullPiP is a comprehensive Chrome extension that provides advanced Picture-in-Picture (PiP) functionality with intelligent routing, multi-window support, and seamless media control across different video sources.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
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

- **Multi-Window Support**: Open unlimited PiP windows simultaneously
- **Cross-Tab State Management**: Tracks PiP state across browser tabs
- **Smart Duplicate Prevention**: Prevents opening the same video multiple times
- **Multi-Monitor Positioning**: Target specific displays with manual placement
- **Zoom and Pan Controls**: Full viewport manipulation with keyboard shortcuts

### Seamless Integration

- **Universal Video Support**: Works with HTML5 video, streaming platforms, and custom players
- **Blob URL Compatibility**: Handles MediaSource and streaming content
- **Context Menu Integration**: Right-click any video element for instant PiP
- **Keyboard Shortcuts**: Comprehensive hotkey support for power users
- **Settings Persistence**: Cross-session configuration with Chrome storage sync

## Installation

### From Chrome Web Store

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

| Action | Method | Alternative |
|--------|--------|-------------|
| Open Video in PiP | Right-click video → FullPiP: Pop Video | Click PiP button in popup |
| Toggle PiP | Press Alt + P | Click media item in popup |
| Picker Mode | Right-click page → FullPiP: Picker Mode | Press Alt + K |
| Multi-Monitor | Right-click video → monitor submenu | Use monitor settings |
| Close All PiP | Press Alt + Shift + P | Use "Close All PiP" button |

### Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| Alt + P | Toggle PiP for main video | Any webpage |
| Alt + K | Toggle element picker mode | Any webpage |
| Alt + Shift + P | Close all PiP windows | Any webpage |
| + / - | Zoom in/out | Inside PiP window |
| Arrow Keys | Pan content | When zoomed in PiP |
| Double Click | Reset zoom and pan | Inside PiP window |
| 0 | Reset to default view | Inside PiP window |
| F | Cycle scale mode | Popup PiP windows |
| M | Toggle audio mute | Popup PiP windows |
| Space | Play/pause video | Popup PiP windows |
| Escape | Close PiP window | Inside PiP window |

### Advanced Controls

- **Zoom**: Mouse wheel or + / - keys
- **Pan**: Arrow keys (when zoomed)
- **Reset View**: Double-click or 0 key
- **Scale Mode**: F key (popup PiP only)
- **Playback**: Spacebar (popup PiP only)

## Configuration

### PiP Mode Selection

Choose from three operational modes in the extension settings:

- **Native API Mode**: Best for single video playback with highest quality
- **Popup Window Mode**: Best for multiple simultaneous PiP windows
- **Hybrid Mode**: Recommended - automatically chooses the best approach

### Window Management

- **Max Windows**: Set limit from 1-5 or choose Unlimited
- **Window Positioning**: Auto-placement or manual positioning
- **Multi-Monitor Support**: Target specific displays

### Visual Customization

- **Background**: Auto, Black, White, or Checkerboard pattern
- **Scale Mode**: Normal, Fit, Fill, or Stretch
- **Zoom & Pan**: Mouse/touch controls with keyboard shortcuts
- **Edge Resistance**: Prevent dragging content outside window bounds

### Interaction Settings

- **Lock Pan**: Zoom-only mode (no dragging)
- **Smart Zoom**: Prevent zooming below 100%
- **Zoom Speed**: Adjustable sensitivity (0.1x - 3.0x)
- **Auto-Scroll**: Automatically scroll to highlighted media

## Architecture

### Core Components

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| manifest.json | JSON | Extension manifest (Manifest V3) |
| background.js | Service Worker | Context menus, keyboard shortcuts, inter-process communication |
| content.js | Content Script | DOM manipulation, media detection, PiP orchestration |
| lib/pipFactory.js | ES6 Module | Hybrid PiP engine with intelligent routing and state management |
| popup.html/.js | HTML/CSS/JS | Extension interface, settings management, media browser |
| player.html/.js | HTML/CSS/JS | Borderless video player for popup PiP windows |
| style.css | CSS | Responsive UI theming with dark/light mode support |

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

### Extension Permissions

FullPiP requires the following Chrome permissions:

- `activeTab`: Access current tab for media detection
- `storage`: Save user preferences and settings
- `contextMenus`: Add right-click menu options
- `scripting`: Inject content scripts for PiP functionality
- `windows`: Create and manage popup PiP windows
- `system.display`: Multi-monitor support

## Development

### Prerequisites

- Chrome Browser (version 88+ for Manifest V3 support)
- Node.js (for running tests)
- Git (for version control)

### Setup

```bash
# Clone the repository
git clone https://github.com/krittaphato3/PiPExtension.git
cd PiPExtension

# Install dependencies (if any)
npm install

# Run tests
npm test
```

### Building

The extension is built using standard web technologies. No build process is required for development. Load the extension directory directly in Chrome's developer mode.

### Testing

```bash
# Run unit tests
node tests/test-pipFactory.js

# Manual testing
# 1. Load extension in Chrome developer mode
# 2. Test on various video sites (YouTube, Vimeo, etc.)
# 3. Verify all PiP modes work correctly
# 4. Test keyboard shortcuts and context menus
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

### Version 1.0.0 Alpha (Current)

- Intelligent PiP routing with three operational modes
- Unlimited multi-window PiP support
- Cross-tab state management
- Multi-monitor positioning
- Comprehensive keyboard shortcuts
- Responsive extension popup
- Blob URL compatibility
- Smart duplicate prevention
- Settings synchronization
- Professional user interface

---

**FullPiP** - Advanced Picture-in-Picture for the modern web.</content>
<parameter name="filePath">README.md
