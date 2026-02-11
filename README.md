# FullPiP Extension

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)
![Version](https://img.shields.io/badge/Version-2.3.0-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

**FullPiP** is a high-performance Chrome Extension designed to extend standard Picture-in-Picture (PiP) capabilities beyond simple video playback. It introduces **Live Image PiP**, utilizing the Document Picture-in-Picture API and MutationObservers to maintain real-time synchronization between floating windows and dynamic page content (e.g., slideshows, live feeds).

## 🚀 Features

### 🎥 Enhanced Video PiP
- Native integration with HTML5 `<video>` elements via Context Menu.
- robust fallback mechanisms for complex player implementations.

### 🖼️ Live Image PiP (Experimental)
- **Document PiP API**: Offloads image content to a lightweight, always-on-top window.
- **Real-time Synchronization**: Implements `MutationObserver` to track `src` and `srcset` attributes. If the DOM updates (e.g., a carousel slide changes), the PiP window updates instantly.
- **Background Image Support**: Intelligent parsing of CSS `background-image` for non-standard image containers.

### ⚡ Auto-PiP Mode
- **Configurable Logic**: Toggleable "Auto-PiP" setting via the extension popup.
- **Heuristic Activation**: Automatically triggers PiP for the main content video upon the first user interaction (click/keypress), bypassing browser autoplay restrictions.

### 🎨 Modern UX/UI
- **Dark Mode First**: sleek, accessibility-focused settings interface.
- **Toggle Switch**: smooth CSS transitions for configuration state management.

---

## 🛠 Installation

1.  **Clone the Repository**
    ```bash
    git clone [https://github.com/krittaphato3/PiPExtension.git](https://github.com/krittaphato3/PiPExtension.git)
    ```
2.  **Open Chrome Extensions**
    - Navigate to `chrome://extensions/` in your browser.
3.  **Enable Developer Mode**
    - Toggle the switch in the top-right corner.
4.  **Load Unpacked**
    - Click **"Load unpacked"**.
    - Select the directory where you cloned the repository.

---

## 📖 Usage

### Context Menu Integration
1.  **Videos**: Right-click any video player $\rightarrow$ Select **"FullPiP: Open Video"**.
2.  **Images**: Right-click any image or dynamic visual container $\rightarrow$ Select **"FullPiP: Open Live Image"**.

### Configuration
1.  Click the **FullPiP icon** in the Chrome toolbar.
2.  Toggle **"Auto-PiP Mode"** to enable/disable automatic video popping on page interaction.

---

## 🏗 Technical Architecture

### Core Components
- **`manifest.json`**: Compliant with **Manifest V3** specifications.
- **`content.js`**:
    - **Event Delegation**: Captures right-click context (`mousedown` event) to identify target DOM elements prior to menu invocation.
    - **IPC**: Handles asynchronous messages from the Service Worker (`background.js`) to trigger DOM manipulation.
    - **MutationObserver**: Monitors target nodes for attribute changes to drive the Live Image sync.
- **`background.js`**: Service worker managing the context menu lifecycle and tab messaging.

### Permissions
| Permission | Justification |
| :--- | :--- |
| `contextMenus` | Registers right-click actions for video and image contexts. |
| `documentPictureInPicture` | Required to open arbitrary HTML content (images) in an always-on-top window. |
| `storage` | Persists user preferences (Auto-PiP state) across sessions. |
| `activeTab` / `scripting` | Injection of logic into the current active page to access DOM elements. |

---

## 👨‍💻 Author

**krittaphato3**
- [GitHub Profile](https://github.com/krittaphato3)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
