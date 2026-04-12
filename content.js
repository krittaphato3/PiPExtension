/**
 * @file content.js
 * @author krittaphato3
 * @desc High-performance DOM agent with QOL enhancements and full customization.
 */

// ============================================================================
// CONFIGURATION - All user-configurable values centralized
// ============================================================================
const CONFIG = {
  // Zoom constraints
  ZOOM_MIN: 1.0,           // Minimum zoom level (1.0 = 100%, no shrink)
  ZOOM_MAX: 10.0,          // Maximum zoom level
  ZOOM_STEP_IN: 1.1,       // Zoom in multiplier
  ZOOM_STEP_OUT: 0.9,      // Zoom out multiplier
  ZOOM_RESET_KEY: '0',     // Key to reset zoom/pan
  
  // Pan constraints
  PAN_STEP: 20,            // Arrow key pan step (pixels)
  DRAG_THRESHOLD: 1.0,     // Minimum zoom to allow dragging
  
  // Size constraints
  MIN_WINDOW_WIDTH: 150,   // Minimum PiP window width
  MIN_WINDOW_HEIGHT: 150,  // Minimum PiP window height
  MAX_SCREEN_RATIO: 0.9,   // Max screen coverage for "actual" size
  
  // Performance
  DEBOUNCE_SYNC_MS: 50,    // Live sync debounce delay
  MEDIA_SCAN_TIMEOUT: 5000,// Timeout for media scanning
  HIGHLIGHT_DURATION_MS: 2000, // How long highlight stays after hover
  
  // Picker mode
  PICKER_HIGHLIGHT_CLASS: 'fullpip-picker-highlight',
  PICKER_STYLE_ID: 'fullpip-picker-style',
  
  // PiP indicator
  INDICATOR_CLASS: 'fullpip-indicator',
  INDICATOR_FADE_DELAY_MS: 3000,
  
  // Multi-PiP limits
  MAX_PIP_WINDOWS: 3,
  
  // Toast notifications
  TOAST_DURATION_MS: 2500,
  TOAST_POSITION: 'bottom-right',
  
  // Memory cleanup
  CLEANUP_INTERVAL_MS: 30000, // Clean mediaMap every 30s
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
const State = {
  lastRightClickTarget: null,
  pipWindows: new Map(),        // Track multiple PiP windows by ID
  observer: null,
  isHoveringPip: false,
  isPickerActive: false,
  activeMediaId: null,          // Currently playing media ID
  cleanupTimer: null,
  toastContainer: null,
  pageListeners: {
    mousedown: null,
    storage: null,
    message: null,
    error: null,
    unhandledrejection: null
  },
  pickerListeners: {
    mouseover: null,
    click: null,
    keydown: null
  },
  errorCount: 0,                // Track errors for debugging
  lastErrorTime: 0
};

// Optimized settings cache — reads from BOTH local and sync storage,
// with local taking precedence (popup saves to local instantly for speed).
const CachedSettings = {
  data: null,
  timestamp: 0,
  CACHE_DURATION: 5000, // 5 seconds cache

  async get(keys = null) {
    const now = Date.now();
    if (this.data && (now - this.timestamp) < this.CACHE_DURATION) {
      if (keys) {
        return keys.reduce((acc, k) => ({...acc, [k]: this.data[k]}), {});
      }
      return this.data;
    }

    // Read from BOTH storage areas simultaneously — local overrides sync
    const [localResult, syncResult] = await Promise.all([
      chrome.storage.local.get(keys),
      chrome.storage.sync.get(keys),
    ]);

    // Merge: sync as base, local takes precedence for recent changes
    this.data = { ...syncResult, ...localResult };
    this.timestamp = now;

    if (keys) {
      return keys.reduce((acc, k) => ({...acc, [k]: this.data[k]}), {});
    }
    return this.data;
  },
  
  invalidate() {
    this.data = null;
    this.timestamp = 0;
  }
};

const mediaMap = new Map();
let uniquePipId = 0;
let isInitialized = false; // Prevent duplicate initialization

// ============================================================================
// ERROR HANDLING - Global Error Handlers
// ============================================================================
function setupGlobalErrorHandlers() {
  // Uncaught errors
  State.pageListeners.error = (e) => {
    State.errorCount++;
    State.lastErrorTime = Date.now();
    
    const errorInfo = {
      message: e.error?.message || e.message || 'Unknown error',
      source: e.filename || 'content.js',
      line: e.lineno,
      column: e.colno,
      stack: e.error?.stack
    };
    
    console.error('[FullPiP] Uncaught Error:', errorInfo);
    
    // Show user-friendly error for critical failures
    if (errorInfo.message.includes('PictureInPicture') || 
        errorInfo.message.includes('documentPictureInPicture')) {
      showToast('PiP feature unavailable on this page', 'error');
    }
  };
  window.addEventListener('error', State.pageListeners.error);
  
  // Unhandled promise rejections
  State.pageListeners.unhandledrejection = (e) => {
    State.errorCount++;
    State.lastErrorTime = Date.now();
    
    console.error('[FullPiP] Unhandled Promise Rejection:', e.reason);
    
    // Prevent default logging
    e.preventDefault();
  };
  window.addEventListener('unhandledrejection', State.pageListeners.unhandledrejection);
}

function cleanupGlobalErrorHandlers() {
  if (State.pageListeners.error) {
    window.removeEventListener('error', State.pageListeners.error);
    State.pageListeners.error = null;
  }
  if (State.pageListeners.unhandledrejection) {
    window.removeEventListener('unhandledrejection', State.pageListeners.unhandledrejection);
    State.pageListeners.unhandledrejection = null;
  }
}

// Helper to safely send messages with error handling
async function sendSafeMessage(message, description = 'Message') {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.debug(`[FullPiP] ${description} failed:`, err.message);
    return null;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================
const Debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};

const generateId = () => `fullpip-${++uniquePipId}-${Date.now()}`;

function pruneMediaMap() {
  for (const [id, el] of mediaMap.entries()) {
    if (!el.isConnected) mediaMap.delete(id);
  }
}

// Start periodic cleanup
function startCleanupTimer() {
  if (State.cleanupTimer) clearInterval(State.cleanupTimer);
  State.cleanupTimer = setInterval(pruneMediaMap, CONFIG.CLEANUP_INTERVAL_MS);
}

const getAllMediaDeep = (root = document) => {
  let media = Array.from(root.querySelectorAll('video, audio'));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
  let node;
  while(node = walker.nextNode()) {
    if (node.shadowRoot) {
      media = media.concat(getAllMediaDeep(node.shadowRoot));
    }
  }
  return media;
};

const findMediaById = (id) => {
  pruneMediaMap();
  if (mediaMap.has(id)) return mediaMap.get(id);
  const all = getAllMediaDeep(document);
  const found = all.find(el => el.dataset.pipId === id);
  if (found) mediaMap.set(id, found);
  return found;
};

const findMainVideo = () => {
  const visible = getAllMediaDeep(document).filter(v => {
    const r = v.getBoundingClientRect();
    return r.width > 20 && r.height > 20 &&
           getComputedStyle(v).display !== 'none' &&
           getComputedStyle(v).visibility !== 'hidden';
  });
  if (!visible.length) return null;
  visible.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return (rb.width * rb.height) - (ra.width * ra.height);
  });
  const playing = visible.find(v => !v.paused && v.readyState > 2);
  return playing || visible[0];
};

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================
// Toast throttle to reduce perceived delay
let lastToastTime = 0;
const TOAST_THROTTLE_MS = 2000; // 2 seconds between info toasts

function ensureToastContainer() {
  if (State.toastContainer && State.toastContainer.isConnected) return State.toastContainer;

  State.toastContainer = document.createElement('div');
  State.toastContainer.className = 'fullpip-toast-container';
  State.toastContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  `;
  document.body.appendChild(State.toastContainer);
  return State.toastContainer;
}

function showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION_MS) {
  // Throttle info toasts to reduce perceived delay
  const now = Date.now();
  if (type === 'info' && now - lastToastTime < TOAST_THROTTLE_MS) {
    return;
  }
  if (type !== 'info') {
    lastToastTime = now;
  }

  const container = ensureToastContainer();

  const toast = document.createElement('div');
  toast.className = `fullpip-toast fullpip-toast-${type}`;
  toast.style.cssText = `
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: fullpip-toast-slide 0.3s ease;
    pointer-events: auto;
    max-width: 300px;
  `;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================
function setupEventListeners() {
  // Clean up any existing listeners first
  cleanupEventListeners();
  
  // Mousedown listener for right-click tracking
  State.pageListeners.mousedown = (e) => {
    if (State.isPickerActive) return;
    if (e.button === 2) State.lastRightClickTarget = e.target;
  };
  document.addEventListener("mousedown", State.pageListeners.mousedown, true);
  
  // Storage change listener
  State.pageListeners.storage = (changes, area) => {
    if (area !== 'sync') return;
    
    // Update all active PiP windows with new settings
    for (const [pipId, pipData] of State.pipWindows.entries()) {
      const doc = pipData.window?.document;
      if (!doc) continue;
      
      const img = doc.querySelector('img, video');
      const body = doc.body;
      
      if (changes.pipScaleMode && img) {
        img.style.objectFit = changes.pipScaleMode.newValue;
      }
      if (changes.pipBackgroundColor && body) {
        updateBackgroundStyle(body, changes.pipBackgroundColor.newValue);
      }
    }
  };
  chrome.storage.onChanged.addListener(State.pageListeners.storage);
  
  // Message listener
  State.pageListeners.message = handleRuntimeMessage;
  chrome.runtime.onMessage.addListener(State.pageListeners.message);
  
  // Start cleanup timer
  startCleanupTimer();
}

function cleanupEventListeners() {
  if (State.pageListeners.mousedown) {
    document.removeEventListener("mousedown", State.pageListeners.mousedown, true);
    State.pageListeners.mousedown = null;
  }
  if (State.pageListeners.storage) {
    chrome.storage.onChanged.removeListener(State.pageListeners.storage);
    State.pageListeners.storage = null;
  }
  if (State.pageListeners.message) {
    chrome.runtime.onMessage.removeListener(State.pageListeners.message);
    State.pageListeners.message = null;
  }
  if (State.cleanupTimer) {
    clearInterval(State.cleanupTimer);
    State.cleanupTimer = null;
  }
  // Clean up picker listeners if they exist
  if (State.pickerListeners.mouseover) {
    document.removeEventListener('mouseover', State.pickerListeners.mouseover, true);
    State.pickerListeners.mouseover = null;
  }
  if (State.pickerListeners.click) {
    document.removeEventListener('click', State.pickerListeners.click, true);
    State.pickerListeners.click = null;
  }
  if (State.pickerListeners.keydown) {
    document.removeEventListener('keydown', State.pickerListeners.keydown, true);
    State.pickerListeners.keydown = null;
  }
  // Clean up global error handlers
  cleanupGlobalErrorHandlers();
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================
async function handleRuntimeMessage(req, sender, sendResponse) {
  switch (req.action) {
    case "contextMenuTrigger":
      req.type === 'video' ? launchVideoPiP(req.srcUrl) : launchImagePiP();
      sendResponse({ success: true });
      break;
    case "shortcutTrigger":
      // ✅ FIX: Add toggle logic - close if PiP is open, open if closed
      // Check for native PiP (both documentPictureInPicture and standard video PiP)
      const hasDocPip = typeof window !== 'undefined' && window.documentPictureInPicture?.window;
      const hasVideoPip = typeof document !== 'undefined' && document.pictureInPictureElement;
      const hasNativePip = hasDocPip || hasVideoPip;

      // Check for popup PiP windows (both local and background-tracked)
      const localPopupCount = State.pipWindows.size;
      let backgroundPopupCount = 0;
      try {
        const state = await chrome.runtime.sendMessage({ action: 'getPipState' });
        backgroundPopupCount = state?.popupCount || 0;
      } catch (e) {
        // Background not available
      }
      const hasPopupPip = localPopupCount > 0 || backgroundPopupCount > 0;

      console.log('[FullPiP] Alt+P toggle check: native=', hasNativePip, 'localPopups=', localPopupCount, 'bgPopups=', backgroundPopupCount);

      if (hasNativePip || hasPopupPip) {
        // PiP is open → close it
        console.log('[FullPiP] Alt+P toggle: PiP detected, closing');

        // Close native PiP
        if (hasVideoPip) {
          document.exitPictureInPicture().catch(() => {});
        }
        if (hasDocPip) {
          window.documentPictureInPicture.window.close();
        }

        // Close local popup PiP windows
        closeAllPipWindows();

        // Also tell background to close popup PiP windows it tracks
        chrome.runtime.sendMessage({ action: 'closeAllPip' }).catch(() => {});

        showToast('PiP closed', 'info', 1500);
        sendResponse({ success: true, action: 'closed' });
      } else {
        // No PiP → open for main video
        const mainVideo = findMainVideo();
        if (mainVideo) {
          launchVideoPiP(mainVideo);
          sendResponse({ success: true, type: 'video', action: 'opened' });
        } else if (State.lastRightClickTarget) {
          launchImagePiP();
          sendResponse({ success: true, type: 'image', action: 'opened' });
        } else {
          showToast('No media found on page', 'error');
          sendResponse({ success: false, error: 'No media' });
        }
      }
      break;
    case "togglePickerMode":
      togglePickerMode();
      sendResponse({ success: true, active: State.isPickerActive });
      break;
    case "controlMedia":
      const el = findMediaById(req.id);
      if (el) {
        if (req.command === 'pip') {
          // Route through FullPiP engine to apply all settings (scale mode, zoom, etc.)
          if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
            launchVideoPiP(el).then(() => {
              sendResponse({ success: true });
            }).catch(err => {
              // Fallback: try native PiP if FullPiP fails
              try { el.requestPictureInPicture(); } catch {}
              sendResponse({ success: true });
            });
            return true; // Async response
          } else {
            // For images/other elements, use native Document PiP
            launchElementPiP(el).then(() => {
              sendResponse({ success: true });
            }).catch(err => {
              sendResponse({ success: false, error: err?.message || 'Failed' });
            });
            return true; // Async response
          }
        } else if (req.command === 'togglePlay') {
          el.paused ? el.play() : el.pause();
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Media not found' });
      }
      break;
    case "highlightMedia":
      const hEl = findMediaById(req.id);
      if (hEl) {
        if (req.active) {
          hEl.style.outline = "4px solid #3b82f6";
          hEl.style.outlineOffset = "-4px";
          hEl.style.boxShadow = "0 0 20px rgba(59, 130, 246, 0.6)";
          if (req.scroll !== false) {
            hEl.scrollIntoView({behavior: "smooth", block: "center"});
          }
        } else {
          hEl.style.outline = "";
          hEl.style.outlineOffset = "";
          hEl.style.boxShadow = "";
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Media not found' });
      }
      break;
    case "closeAllPip":
      // Close local Document PiP windows tracked by content script
      closeAllPipWindows();
      // Also tell background to close popup PiP windows it tracks
      chrome.runtime.sendMessage({ action: 'closeAllPip' }).catch(() => {});
      sendResponse({ success: true });
      break;

    // ✅ FIX: Handle popup window closed notification from service worker
    case "popupWindowClosed":
      console.log('[FullPiP] Popup window closed notification:', req.windowId);
      // Clean up local dedup tracking
      if (req.sourceId && typeof PiPFactory !== 'undefined') {
        PiPFactory._unregisterSource(req.sourceId);
      }
      sendResponse({ success: true });
      break;

    // ✅ FIX: Pause source video when popup opens
    case "pauseSourceVideo":
      const videoToPause = findMainVideo();
      if (videoToPause && !videoToPause.paused) {
        videoToPause.pause();
        console.log('[FullPiP] Paused source video for popup');
      }
      sendResponse({ success: true });
      break;

    case "getPipCount":
      sendResponse({ count: State.pipWindows.size });
      break;
    case "ping":
      sendResponse({ status: 'ok', pipCount: State.pipWindows.size });
      break;

    // Hybrid PiP control from popup UI
    case "launchVideoPopup":
      launchVideoPiP(req.target || req.srcUrl, {
        screenId: req.screenId,
        left: req.left,
        top: req.top,
        forcePopup: req.forcePopup !== false,
        width: req.width,
        height: req.height,
      }).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err?.message || String(err) });
      });
      return true; // Keep channel open for async response
  }
  // Unhandled message — don't keep channel open
  return false;
}

// ============================================================================
// PICKER MODE
// ============================================================================
function togglePickerMode() {
  State.isPickerActive = !State.isPickerActive;

  if (State.isPickerActive) {
    document.body.style.cursor = 'crosshair';
    
    // Create and store listener references
    State.pickerListeners.mouseover = handlePickerHover;
    State.pickerListeners.click = handlePickerClick;
    State.pickerListeners.keydown = handlePickerKey;
    
    document.addEventListener('mouseover', State.pickerListeners.mouseover, true);
    document.addEventListener('click', State.pickerListeners.click, true);
    document.addEventListener('keydown', State.pickerListeners.keydown, true);

    const style = document.createElement('style');
    style.id = CONFIG.PICKER_STYLE_ID;
    style.textContent = `
      .${CONFIG.PICKER_HIGHLIGHT_CLASS} {
        outline: 3px solid #2196F3 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 15px rgba(33, 150, 243, 0.7) !important;
        cursor: crosshair !important;
        position: relative;
        z-index: 9999;
      }
      .${CONFIG.PICKER_HIGHLIGHT_CLASS}::after {
        content: "Click to PiP";
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        background: #2196F3;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
    showToast('Picker mode ON - Click any element', 'info', 2000);
  } else {
    document.body.style.cursor = '';
    
    // Remove picker listeners
    if (State.pickerListeners.mouseover) {
      document.removeEventListener('mouseover', State.pickerListeners.mouseover, true);
      State.pickerListeners.mouseover = null;
    }
    if (State.pickerListeners.click) {
      document.removeEventListener('click', State.pickerListeners.click, true);
      State.pickerListeners.click = null;
    }
    if (State.pickerListeners.keydown) {
      document.removeEventListener('keydown', State.pickerListeners.keydown, true);
      State.pickerListeners.keydown = null;
    }

    const style = document.getElementById(CONFIG.PICKER_STYLE_ID);
    if (style) style.remove();

    const highlighted = document.querySelector(`.${CONFIG.PICKER_HIGHLIGHT_CLASS}`);
    if (highlighted) highlighted.classList.remove(CONFIG.PICKER_HIGHLIGHT_CLASS);
    showToast('Picker mode OFF', 'info', 1500);
  }
}

function handlePickerHover(e) {
  e.stopPropagation();
  const prev = document.querySelector(`.${CONFIG.PICKER_HIGHLIGHT_CLASS}`);
  if (prev) prev.classList.remove(CONFIG.PICKER_HIGHLIGHT_CLASS);

  // Don't highlight FullPiP UI elements or null targets
  if (!e.target) return;
  if (!e.target.closest('.fullpip-toast, .fullpip-indicator')) {
    e.target.classList.add(CONFIG.PICKER_HIGHLIGHT_CLASS);
  }
}

function handlePickerClick(e) {
  e.preventDefault();
  e.stopPropagation();
  togglePickerMode();

  const target = e.target;

  // ✅ FIX: Detect if clicked element is a video and use appropriate handler
  if (target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
    // Video elements should use launchVideoPiP for proper playback
    console.log('[FullPiP] Picker clicked on', target.tagName.toLowerCase(), '→ using video PiP');
    launchVideoPiP(target);
  } else {
    // Images and other elements use Document PiP
    launchElementPiP(target);
  }
}

function handlePickerKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    togglePickerMode();
  }
}

// ============================================================================
// ELEMENT PiP (Document PiP API)
// ============================================================================
async function launchElementPiP(sourceNode) {
  if (!window.documentPictureInPicture) {
    showToast('Document PiP not supported in this browser', 'error');
    return;
  }

  // Load ALL settings needed for proper styling
  const settings = await CachedSettings.get([
    'maxPipWindows',
    'pipScaleMode',
    'pipBackgroundColor',
  ]);

  if (State.pipWindows.size >= (settings.maxPipWindows || CONFIG.MAX_PIP_WINDOWS)) {
    showToast(`Maximum ${settings.maxPipWindows || CONFIG.MAX_PIP_WINDOWS} PiP windows allowed`, 'error');
    return;
  }

  if (sourceNode.classList.contains(CONFIG.PICKER_HIGHLIGHT_CLASS)) {
    sourceNode.classList.remove(CONFIG.PICKER_HIGHLIGHT_CLASS);
  }

  try {
    const rect = sourceNode.getBoundingClientRect();
    const pipId = generateId();

    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width: Math.max(CONFIG.MIN_WINDOW_WIDTH, rect.width || 500),
      height: Math.max(CONFIG.MIN_WINDOW_HEIGHT, rect.height || 500)
    });

    const doc = pipWindow.document;

    // Add base styles — apply scale mode and background from settings
    const scaleMode = settings.pipScaleMode || 'normal';

    // Build CSS based on scale mode
    let contentCSS = '';
    if (scaleMode === 'normal') {
      contentCSS = `max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;`;
    } else {
      contentCSS = `width: 100%; height: 100%; object-fit: ${scaleMode};`;
    }

    const baseStyle = doc.createElement('style');
    baseStyle.textContent = `
      body {
        margin: 0;
        display: grid;
        place-items: center;
        height: 100vh;
        background: transparent;
        overflow: hidden;
      }
      img, video, canvas, svg, iframe, div {
        ${contentCSS}
      }
      .fullpip-close-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(0,0,0,0.6);
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s, background 0.2s;
        z-index: 1000;
      }
      body:hover .fullpip-close-btn { opacity: 1; }
      .fullpip-close-btn:hover { background: rgba(255,0,0,0.8); }
      .fullpip-close-btn svg { width: 14px; height: 14px; }
    `;
    doc.head.append(baseStyle);

    // Apply background setting from settings
    updateBackgroundStyle(doc.body, settings.pipBackgroundColor || 'auto');

    // Create close button
    const closeBtn = doc.createElement('button');
    closeBtn.className = 'fullpip-close-btn';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.title = 'Close PiP';
    closeBtn.onclick = () => {
      pipWindow.close();
    };
    doc.body.append(closeBtn);
    
    // Clone and add the source element
    const clone = sourceNode.cloneNode(true);
    clone.style.position = 'static';
    clone.style.margin = '0';
    clone.dataset.pipId = pipId;
    doc.body.append(clone);
    
    // Store window reference
    State.pipWindows.set(pipId, {
      window: pipWindow,
      sourceElement: sourceNode,
      type: 'element',
      createdAt: Date.now()
    });
    
    // Cleanup on close
    pipWindow.addEventListener("pagehide", () => {
      cleanupPipState(pipId);
    });
    
    showToast('PiP window opened', 'success', 1500);
    
  } catch (e) { 
    console.error("[FullPiP] Element Picker Failed:", e);
    showToast('Failed to open PiP window', 'error');
  }
}

// ============================================================================
// VIDEO PiP (Unified — always routes through PiPFactory)
// ============================================================================
/**
 * Opens a video PiP window via PiPFactory, which handles:
 *   1. Cross-tab native PiP state tracking
 *   2. Routing: native (first) vs popup (second+)
 *   3. Fallback from native → popup if native fails
 *
 * @param {HTMLVideoElement|string} target - Video element or URL string
 * @param {Object} options
 */
async function launchVideoPiP(target, options = {}) {
  let video;

  if (target instanceof HTMLVideoElement) {
    // Already have the video element
    video = target;
  } else if (typeof target === 'string') {
    // ✅ FIX: Enhanced video URL matching for context menu
    // Try multiple matching strategies for better compatibility

    // Strategy 1: Exact src attribute match (works for simple .mp4 files)
    video = document.querySelector(`video[src="${target}"]`);

    // Strategy 2: Match by currentSrc (handles blob URLs, encoded URLs, redirects)
    if (!video) {
      const allVideos = document.querySelectorAll('video');
      for (const v of allVideos) {
        // Normalize URLs for comparison (decode and remove trailing slashes)
        const normalizeUrl = (url) => {
          try {
            return decodeURIComponent(url).replace(/\/$/, '');
          } catch {
            return url;
          }
        };

        const normalizedTarget = normalizeUrl(target);
        const normalizedCurrentSrc = normalizeUrl(v.currentSrc || '');
        const normalizedSrc = normalizeUrl(v.src || '');

        if (normalizedCurrentSrc === normalizedTarget ||
            normalizedSrc === normalizedTarget ||
            v.currentSrc === target ||
            v.src === target) {
          video = v;
          break;
        }
      }
    }

    // Strategy 3: If target is a blob URL, find video with matching blob URL
    if (!video && target.startsWith('blob:')) {
      const allVideos = document.querySelectorAll('video');
      for (const v of allVideos) {
        if (v.currentSrc?.startsWith('blob:') || v.src?.startsWith('blob:')) {
          // Multiple blob videos might exist, pick the first playing one
          if (!v.paused && v.readyState > 2) {
            video = v;
            break;
          }
        }
      }
      // If no playing video found, just take the first blob video
      if (!video) {
        for (const v of allVideos) {
          if (v.currentSrc?.startsWith('blob:') || v.src?.startsWith('blob:')) {
            video = v;
            break;
          }
        }
      }
    }

    // Strategy 4: Check <source> children for matching URLs
    if (!video) {
      const allVideos = document.querySelectorAll('video');
      for (const v of allVideos) {
        const sources = v.querySelectorAll('source');
        for (const source of sources) {
          if (source.src === target || source.srcset === target) {
            video = v;
            break;
          }
        }
        if (video) break;
      }
    }

    // Strategy 5: If still not found and target looks like a video URL,
    // try to find any visible video on the page (fallback)
    if (!video) {
      console.log('[FullPiP] Video URL not matched exactly, falling back to main video');
    }
  }

  // Final fallback: find main visible video
  if (!video) video = findMainVideo();

  if (!video) {
    showToast('No video found on page', 'error');
    return;
  }

  if (video.disablePictureInPicture) {
    showToast('PiP is disabled by this website', 'error');
    return;
  }

  const { screenId, left, top, forcePopup } = options;

  // ── Determine if we should force popup ─────────────────────────────────
  // Force popup when: explicit flag, multi-monitor options, or a native
  // video PiP is already active (document.pictureInPictureElement).
  // PiPFactory also checks its own cross-tab state internally.
  const shouldForcePopup = !!(screenId || left || top || forcePopup || document.pictureInPictureElement);

  try {
    if (typeof PiPFactory === 'undefined') {
      // Fallback: direct native PiP if factory isn't loaded
      await video.requestPictureInPicture();
      showToast('Video PiP activated', 'success', 1500);
      return;
    }

    // Get current mode setting with detailed logging
    console.log('[FullPiP] Reading pipMode setting...');
    const settings = await CachedSettings.get(['pipMode']);
    const mode = settings.pipMode || 'hybrid';

    console.log('[FullPiP] ════════════════════════════════════════');
    console.log('[FullPiP] PiP Mode Setting:', mode.toUpperCase());
    console.log('[FullPiP] Video Element:', video ? video.tagName : 'null');
    console.log('[FullPiP] Video currentSrc:', video?.currentSrc?.substring(0, 50) || 'null');
    console.log('[FullPiP] Is Blob URL:', video?.currentSrc?.startsWith('blob:') || false);
    console.log('[FullPiP] ════════════════════════════════════════');

    // Delegate to PiPFactory — it handles routing + tracking
    console.log('[FullPiP] Calling PiPFactory.create() with mode:', mode);
    const result = await PiPFactory.create({
      videoElement: video,
      width: options.width,
      height: options.height,
      screenId,
      left,
      top,
      forcePopup: shouldForcePopup,
      mode: mode, // Pass mode to factory for routing decision
    });

    console.log('[FullPiP] PiPFactory result:', result);

    if (result.success) {
      showToast(`Video PiP opened (${result.method})`, 'success', 1500);
    } else {
      // ✅ FIX: Don't fallback to direct requestPictureInPicture
      // This bypasses PiPFactory tracking and can replace existing PiP
      // Instead, show the error to user so they know what happened
      console.error('[FullPiP] PiPFactory failed:', result.error);
      showToast(`PiP failed: ${result.error || 'unknown error'}`, 'error');
    }
  } catch (e) {
    console.error('[FullPiP] launchVideoPiP error:', e);
    showToast('Failed to start video PiP', 'error');
  }
}

// ============================================================================
// IMAGE PiP (with Live Sync)
// ============================================================================
async function launchImagePiP() {
  const target = State.lastRightClickTarget;
  if (!target) {
    showToast('No element selected. Right-click an image first.', 'error');
    return;
  }
  
  if (!window.documentPictureInPicture) {
    showToast('Document PiP not supported in this browser', 'error');
    return;
  }
  
  // Check max windows limit - using cached settings for speed
  const settings = await CachedSettings.get([
    'maxPipWindows',
    'pipInitialSize',
    'pipBackgroundColor',
    'pipLockPan',
    'pipEdgeLock',
    'pipZoomSmartLimit',
    'pipZoomSpeed',
    'pipScaleMode'
  ]);
  
  if (State.pipWindows.size >= settings.maxPipWindows) {
    showToast(`Maximum ${settings.maxPipWindows} PiP windows allowed`, 'error');
    return;
  }
  
  const rect = target.getBoundingClientRect();
  const pipId = generateId();
  
  // Calculate initial size
  let nW = target.naturalWidth || target.width || 800;
  let nH = target.naturalHeight || target.height || 600;
  const sW = window.screen.availWidth;
  const sH = window.screen.availHeight;
  
  let finalW = 500, finalH = 500;
  
  switch (settings.pipInitialSize) {
    case 'visual':
      finalW = Math.max(CONFIG.MIN_WINDOW_WIDTH, rect.width);
      finalH = Math.max(CONFIG.MIN_WINDOW_HEIGHT, rect.height);
      break;
    case 'actual':
      finalW = Math.min(nW, sW * CONFIG.MAX_SCREEN_RATIO);
      finalH = Math.min(nH, sH * CONFIG.MAX_SCREEN_RATIO);
      const ratio = nW / nH;
      if (finalW / finalH > ratio) finalW = finalH * ratio;
      else finalH = finalW / ratio;
      break;
    case 'fit':
      const screenRatio = sW / sH;
      const imageRatio = nW / nH;
      if (imageRatio > screenRatio) {
        finalW = sW * 0.85;
        finalH = finalW / imageRatio;
      } else {
        finalH = sH * 0.85;
        finalW = finalH * imageRatio;
      }
      break;
    default:
      finalW = rect.width > 0 ? rect.width : 500;
      finalH = rect.height > 0 ? rect.height : 500;
  }
  
  finalW = Math.max(CONFIG.MIN_WINDOW_WIDTH, Math.round(finalW));
  finalH = Math.max(CONFIG.MIN_WINDOW_HEIGHT, Math.round(finalH));
  
  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width: finalW,
      height: finalH
    });
    
    const doc = pipWindow.document;
    setupPipStyles(doc, target, settings.pipBackgroundColor, settings.pipScaleMode);
    
    // Create close button
    const closeBtn = doc.createElement('button');
    closeBtn.className = 'fullpip-close-btn';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.title = 'Close PiP (Esc)';
    closeBtn.onclick = () => pipWindow.close();
    doc.body.append(closeBtn);
    
    let contentEl;
    if (target.tagName === 'CANVAS') {
      contentEl = doc.createElement('video');
      contentEl.muted = true;
      contentEl.autoplay = true;
      contentEl.srcObject = target.captureStream(60);
    } else {
      contentEl = doc.createElement('img');
      contentEl.src = target.src || extractBgImage(target);
      setupLiveSync(target, contentEl, pipId);
    }
    
    contentEl.id = "fullpip-live-content";
    contentEl.dataset.pipId = pipId;
    doc.body.append(contentEl);
    
    setupZoomAndPan(contentEl, settings, pipWindow, pipId);
    
    // Store window reference
    State.pipWindows.set(pipId, {
      window: pipWindow,
      sourceElement: target,
      contentElement: contentEl,
      type: 'image',
      observer: State.observer,
      createdAt: Date.now()
    });
    
    // Cleanup on close
    pipWindow.addEventListener("pagehide", () => {
      cleanupPipState(pipId);
    });
    
    showToast('Image PiP opened', 'success', 1500);
    
  } catch (e) { 
    console.error("[FullPiP] Image Engine Failed:", e);
    showToast('Failed to open image PiP', 'error');
  }
}

function setupLiveSync(sourceNode, pipImgNode, pipId) {
  // Disconnect previous observer
  if (State.observer) State.observer.disconnect();

  const syncLogic = Debounce(() => {
    const newSrc = sourceNode.currentSrc || sourceNode.src || extractBgImage(sourceNode);
    if (pipImgNode.src !== newSrc) {
      pipImgNode.src = newSrc;
      // Notify popup of change (with error handling)
      sendSafeMessage({
        action: "liveSyncUpdate",
        pipId,
        src: newSrc
      }, 'Live sync notification');
    }
  }, CONFIG.DEBOUNCE_SYNC_MS);

  State.observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(m =>
      m.type === 'attributes' && ['src', 'srcset', 'style'].includes(m.attributeName)
    );
    if (relevant) syncLogic();
  });
  State.observer.observe(sourceNode, { attributes: true });
}

function cleanupPipState(pipId) {
  const pipData = State.pipWindows.get(pipId);
  if (!pipData) return;

  // Disconnect observer for this PiP
  if (pipData.observer) {
    pipData.observer.disconnect();
  }

  // Clean up PiP window listeners (resize, keydown will be GC'd with window)
  if (pipData.window) {
    try {
      // The window is closing, so listeners will be garbage collected
      // No need to explicitly remove them
    } catch (e) { /* Window already closed */ }
  }

  State.pipWindows.delete(pipId);

  // Disconnect port if no more PiP windows
  if (State.pipWindows.size === 0) {
    if (State.observer) State.observer.disconnect();
    State.observer = null;
    
    // Disconnect service worker port
    if (serviceWorkerPort) {
      serviceWorkerPort.disconnect();
      serviceWorkerPort = null;
    }
  } else {
    // Ensure port is connected while PiP windows are active
    establishServiceWorkerConnection();
  }
}

function closeAllPipWindows() {
  const count = State.pipWindows.size;
  for (const [pipId, pipData] of State.pipWindows.entries()) {
    try {
      pipData.window?.close();
    } catch (e) { /* Window already closed */ }
  }
  State.pipWindows.clear();
  if (State.observer) State.observer.disconnect();
  State.observer = null;

  // Clear cross-tab native PiP state to prevent stale state
  // that would cause future PiP attempts to use popup mode unnecessarily
  if (typeof NativePipStateManager !== 'undefined') {
    NativePipStateManager.clearState();
  }

  // Disconnect service worker port
  if (serviceWorkerPort) {
    serviceWorkerPort.disconnect();
    serviceWorkerPort = null;
  }

  if (count > 0) {
    showToast(`Closed ${count} PiP window${count > 1 ? 's' : ''}`, 'success');
  }
}

// ============================================================================
// STYLING UTILITIES
// ============================================================================
function updateBackgroundStyle(bodyElement, bgSetting) {
  let bgColor = '#000';
  let bgImage = 'none';
  let bgSize = 'auto';
  let bgPosition = '0 0';

  if (bgSetting === 'white') bgColor = '#ffffff';
  else if (bgSetting === 'black') bgColor = '#000000';
  else if (bgSetting === 'grid') {
    bgColor = '#e5e5e5';
    bgImage = `linear-gradient(45deg, #ccc 25%, transparent 25%),
               linear-gradient(-45deg, #ccc 25%, transparent 25%),
               linear-gradient(45deg, transparent 75%, #ccc 75%),
               linear-gradient(-45deg, transparent 75%, #ccc 75%)`;
    bgSize = '20px 20px';
    bgPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
  }

  bodyElement.style.backgroundColor = bgColor;
  bodyElement.style.backgroundImage = bgImage;
  bodyElement.style.backgroundSize = bgSize;
  bodyElement.style.backgroundPosition = bgPosition;
}

function setupPipStyles(doc, sourceNode, bgSetting, scaleMode) {
  const style = doc.createElement('style');

  // ── Scale Mode Styles ──────────────────────────────────────────────
  // "normal"  → natural size, centered, black bars where content doesn't fill
  // "contain" → scales to fit entirely within window (may letterbox)
  // "cover"   → scales to fill entire window (may crop)
  // "fill"    → stretches to fill (may distort)
  let contentCSS = '';
  if (scaleMode === 'normal') {
    contentCSS = `
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    `;
  } else {
    contentCSS = `
      width: 100%;
      height: 100%;
      object-fit: ${scaleMode};
    `;
  }

  style.textContent = `
    body {
      margin: 0;
      height: 100vh; width: 100vw;
      display: flex; justify-content: center; align-items: center;
      overflow: hidden;
      cursor: default;
    }
    img, video {
      display: block;
      user-select: none;
      will-change: transform;
      ${contentCSS}
    }
    .fullpip-close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(0,0,0,0.6);
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s, background 0.2s;
      z-index: 1000;
    }
    body:hover .fullpip-close-btn { opacity: 1; }
    .fullpip-close-btn:hover { background: rgba(255,0,0,0.8); }
    .fullpip-close-btn svg { width: 14px; height: 14px; }
  `;
  doc.head.append(style);
  updateBackgroundStyle(doc.body, bgSetting);
}

// ============================================================================
// ZOOM AND PAN CONTROLS
// ============================================================================
function setupZoomAndPan(img, settings, pipWin, pipId) {
  let scale = 1;
  let pX = 0, pY = 0;
  let startX = 0, startY = 0;
  let basePx = 0, basePy = 0;
  let isDragging = false;
  let rafId = null;

  let winW = pipWin.innerWidth;
  let winH = pipWin.innerHeight;

  // Store resize listener for cleanup
  const resizeListener = () => {
    winW = pipWin.innerWidth;
    winH = pipWin.innerHeight;
  };
  pipWin.addEventListener('resize', resizeListener);

  img.addEventListener('dragstart', (e) => e.preventDefault());

  // Optimized transform update with RAF batching
  const updateTransform = () => {
    if (rafId) return; // Already scheduled - batch updates
    rafId = requestAnimationFrame(() => {
      img.style.transform = `scale(${scale}) translate(${pX}px, ${pY}px)`;
      rafId = null;
    });
  };

  const doc = pipWin.document;
  
  // Store keyboard listener for cleanup
  const keydownListener = (e) => {
    const step = CONFIG.PAN_STEP / scale;
    switch(e.key) {
      case 'Escape':
        pipWin.close();
        break;
      case 'ArrowUp':
        pY += step;
        break;
      case 'ArrowDown':
        pY -= step;
        break;
      case 'ArrowLeft':
        pX += step;
        break;
      case 'ArrowRight':
        pX -= step;
        break;
      case '+':
      case '=':
        scale = Math.min(CONFIG.ZOOM_MAX, scale * CONFIG.ZOOM_STEP_IN);
        break;
      case '-':
        // ── Edge Resistance ──
        // When ON: cannot zoom below 1.0 (full fit = fills the window)
        // When OFF: can zoom down to CONFIG.ZOOM_MIN (also 1.0 by default)
        if (settings.pipEdgeLock) {
          scale = Math.max(1.0, scale * CONFIG.ZOOM_STEP_OUT);
        } else {
          scale = Math.max(CONFIG.ZOOM_MIN, scale * CONFIG.ZOOM_STEP_OUT);
        }
        break;
      case CONFIG.ZOOM_RESET_KEY:
        scale = 1; pX = 0; pY = 0;
        break;
    }

    // ── Edge Resistance for pan arrows ──────────────────────────
    // When Edge Lock is ON, prevent panning at scale <= 1.0
    // (image fills window, there's nothing outside to pan to)
    const isArrowKey = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key);
    if (isArrowKey) {
      if (settings.pipEdgeLock && scale <= 1.0) {
        // Clamp pan to zero when at or below full fit
        pX = 0;
        pY = 0;
      }
      updateTransform();
    }
  };
  doc.addEventListener('keydown', keydownListener);
  
  // Auto-hide cursor
  let cursorTimer;
  doc.addEventListener('mousemove', () => {
    doc.body.style.cursor = 'default';
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      if (!isDragging) doc.body.style.cursor = 'none';
    }, 2000);
  });
  
  // Zoom on scroll
  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    const speed = parseFloat(settings.pipZoomSpeed) || 1.0;
    const safeFactor = e.deltaY > 0
      ? Math.max(0.5, 1 - (0.1 * speed))
      : Math.min(2, 1 + (0.1 * speed));
    let newScale = scale * safeFactor;

    // ── Edge Resistance ────────────────────────────────────────────────
    // When pipEdgeLock is ON, scale cannot go below 1.0.
    // At scale=1 the image fills the window (full fit). Allowing scale<1
    // would shrink the image and expose empty borders — edge lock prevents
    // this. When OFF, allow free zoom down to 0.01.
    if (settings.pipEdgeLock) {
      newScale = Math.max(1.0, newScale);
    } else if (settings.pipZoomSmartLimit) {
      newScale = Math.max(CONFIG.ZOOM_MIN, newScale);
    } else {
      newScale = Math.max(0.01, newScale);
    }

    // Reset position when zoom returns to 1.0
    if (newScale <= 1.001) {
      pX = 0;
      pY = 0;
    }
    
    scale = newScale;
    updateTransform();
  }, { passive: false });
  
  // Drag to pan
  if (!settings.pipLockPan) {
    img.addEventListener('pointerdown', (e) => {
      if (scale <= CONFIG.DRAG_THRESHOLD) {
        showToast('Zoom in to pan', 'info', 1000);
        return;
      }
      isDragging = true;
      img.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      basePx = pX;
      basePy = pY;
      img.style.cursor = 'grabbing';
    });
    
    img.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const deltaX = (e.clientX - startX);
      const deltaY = (e.clientY - startY);
      let nextPx = basePx + (deltaX / scale);
      let nextPy = basePy + (deltaY / scale);

      // ── Edge Resistance during drag ─────────────────────────────
      // At scale=1: image fills the window, pan must be locked to 0
      // At scale>1: allow pan but prevent showing empty borders outside the image
      if (settings.pipEdgeLock) {
        if (scale <= 1.0) {
          // At or below full fit — image fills the window, no panning allowed
          nextPx = 0;
          nextPy = 0;
        } else {
          // Zoomed in — clamp pan so image edges can't be pulled inside the window.
          // At scale=2, the image is 2x the window size, so we can pan up to ±50% of window size.
          // At scale=1.5, we can pan up to ±33% of window size.
          // General formula: max pan = (window/2) * (1 - 1/scale)
          const maxPanX = (winW / 2) * (1 - 1 / scale);
          const maxPanY = (winH / 2) * (1 - 1 / scale);
          nextPx = Math.max(-maxPanX, Math.min(maxPanX, nextPx));
          nextPy = Math.max(-maxPanY, Math.min(maxPanY, nextPy));
        }
      }

      pX = nextPx;
      pY = nextPy;
      updateTransform();
    });
    
    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        img.releasePointerCapture(e.pointerId);
        img.style.cursor = 'grab';
      }
    };
    
    img.addEventListener('pointerup', stopDrag);
    img.addEventListener('pointercancel', stopDrag);
    img.style.cursor = 'grab';
  } else {
    img.style.cursor = 'default';
  }
  
  // Double-click to reset
  img.addEventListener('dblclick', () => {
    scale = 1; pX = 0; pY = 0; 
    updateTransform();
    showToast('View reset', 'info', 1000);
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function extractBgImage(node) {
  const bg = getComputedStyle(node).backgroundImage;
  const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
  return match ? match[1] : "";
}

// ============================================================================
// AUTO PiP MODE
// ============================================================================
let autoPipListeners = []; // Track auto-PiP listeners for cleanup
let autoPipInitialized = false; // Separate flag for auto-PiP

(function initAutoPip() {
  // Prevent duplicate initialization
  if (autoPipInitialized) return;

  CachedSettings.get(['autoPipEnabled']).then(({ autoPipEnabled }) => {
    if (!autoPipEnabled) {
      autoPipInitialized = true;
      return;
    }

    const attemptPip = async () => {
      const v = document.querySelector('video');
      if (v && v.readyState > 0 && !v.paused) {
        try {
          // ✅ FIX: Use PiPFactory instead of direct requestPictureInPicture
          // This ensures proper routing, deduplication, and multi-window support
          if (typeof PiPFactory !== 'undefined') {
            const result = await PiPFactory.create({
              videoElement: v,
            });
            if (result.success) {
              cleanupAutoListeners();
              showToast(`Auto-PiP activated (${result.method})`, 'success');
            } else {
              console.warn('[FullPiP] Auto-PiP failed:', result.error);
            }
          } else {
            // Fallback if PiPFactory not loaded
            await v.requestPictureInPicture();
            cleanupAutoListeners();
            showToast('Auto-PiP activated', 'success');
          }
        } catch (e) {
          console.debug('[FullPiP] Auto-PiP prevented:', e.message);
        }
      }
    };

    const cleanupAutoListeners = () => {
      autoPipListeners.forEach(({evt, handler, opts}) => {
        document.removeEventListener(evt, handler, opts);
      });
      autoPipListeners = [];
    };

    // Store listener references for cleanup
    const events = ['click', 'keydown', 'scroll'];
    events.forEach(evt => {
      const opts = { capture: true, passive: true };
      document.addEventListener(evt, attemptPip, opts);
      autoPipListeners.push({ evt, handler: attemptPip, opts });
    });

    autoPipInitialized = true;
  });
})();

// ============================================================================
// USAGE EXAMPLES - Button Click Integration with PiPFactory
// ============================================================================

/**
 * Example 1: Simple button click → Open PiP (auto-routes to native or popup)
 *
 * Add this to any page with a video:
 *   <button id="openPipBtn">Open PiP</button>
 */
function setupPipButtonExample() {
  // Wait for DOM to be ready
  const openPipBtn = document.getElementById('openPipBtn');
  if (!openPipBtn) return;

  openPipBtn.addEventListener('click', async () => {
    // Find the main video on the page
    const video = findMainVideo();
    if (!video) {
      showToast('No video found on page', 'error');
      return;
    }

    // Call PiPFactory.create() - it will automatically choose:
    // - Native PiP if no native PiP is open
    // - Popup PiP if a native PiP is already open (prevents replacement)
    const result = await PiPFactory.create({
      videoElement: video,
      width: 480,
      height: 270,
    });

    if (result.success) {
      showToast(`PiP opened via ${result.method} mode`, 'success');
      console.log('[FullPiP] PiP result:', result);
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  });
}

/**
 * Example 2: Force popup mode (bypass native PiP)
 */
function setupForcePopupExample() {
  const forcePopupBtn = document.getElementById('forcePopupBtn');
  if (!forcePopupBtn) return;

  forcePopupBtn.addEventListener('click', async () => {
    const video = findMainVideo();
    if (!video) {
      showToast('No video found', 'error');
      return;
    }

    // Force popup mode even if native is available
    const result = await PiPFactory.create({
      videoElement: video,
      forcePopup: true, // ← Forces popup path
      width: 640,
      height: 360,
    });

    if (result.success) {
      showToast(`Popup PiP opened (window ID: ${result.windowId})`, 'success');
    }
  });
}

/**
 * Example 3: Multi-monitor positioning (requires Chrome 102+)
 */
function setupMultiMonitorExample() {
  const multiMonitorBtn = document.getElementById('multiMonitorBtn');
  if (!multiMonitorBtn) return;

  multiMonitorBtn.addEventListener('click', async () => {
    const video = findMainVideo();
    if (!video) {
      showToast('No video found', 'error');
      return;
    }

    // Get available displays from background
    const displays = await chrome.runtime.sendMessage({ action: 'getDisplays' });
    if (!displays?.success || displays.displays.length < 2) {
      showToast('Only one display detected, opening on current screen', 'warning');
      // Fallback to single screen
      const result = await PiPFactory.create({
        videoElement: video,
        forcePopup: true,
      });
      return;
    }

    // Open on second monitor
    const secondDisplay = displays.displays.find(d => !d.isPrimary);
    const result = await PiPFactory.create({
      videoElement: video,
      screenId: secondDisplay.id,
      forcePopup: true, // Required for multi-monitor
      width: 480,
      height: 270,
    });

    if (result.success) {
      showToast(`Opened on ${secondDisplay.name}`, 'success');
    }
  });
}

/**
 * Example 4: Check PiP state before opening
 */
async function checkPipStateBeforeOpen() {
  // Get current PiP state (cross-tab aware)
  const state = await chrome.runtime.sendMessage({ action: 'getPipState' });

  console.log('Native PiP open:', state.isOpen);
  console.log('Active native PiP ID:', state.pipId);
  console.log('Popup windows open:', state.popupCount);
  console.log('Any PiP active:', state.hasAnyPip);

  if (state.isOpen) {
    console.log('A native PiP is open in another tab. New PiP will use popup mode.');
  }

  return state;
}

/**
 * Example 5: Close all PiP windows from content script (example usage)
 * NOTE: The real closeAllPipWindows() is defined above at line ~949.
 * This example shows how to use the background message for cross-tab close.
 */
async function _example_closeAllPipViaBackground() {
  const result = await chrome.runtime.sendMessage({ action: 'closeAllPip' });
  if (result?.success) {
    showToast(`Closed ${result.popups} popup(s) + native: ${result.native}`, 'success');
  }
  return result;
}

// Auto-setup examples if buttons exist on the page
// (Uncomment these lines to enable the examples)
// setupPipButtonExample();
// setupForcePopupExample();
// setupMultiMonitorExample();

// ============================================================================
// INITIALIZATION
// ============================================================================

// Prevent duplicate initialization across:
//   1. Module-level re-runs (isInitialized variable)
//   2. Content script re-injection (all_frames, navigation) — uses shared
//      window marker since each injection gets a new JS context/isolated world
//   3. Multiple iframes (all_frames: true) — each frame gets its own instance,
//      which is intentional since each frame has its own DOM to monitor
const FULLPIP_INIT_MARKER = '__fullpipContentScriptInitialized';

(function initContentScript() {
  // Cross-world guard: persists across script re-injections in the same frame
  if (window[FULLPIP_INIT_MARKER]) {
    console.debug('[FullPiP] Already initialized (cross-world guard), skipping');
    return;
  }

  // Module-level guard
  if (isInitialized) {
    console.debug('[FullPiP] Already initialized (module-level), skipping');
    return;
  }

  setupGlobalErrorHandlers();
  setupEventListeners();

  // Mark as initialized in both scopes
  isInitialized = true;
  window[FULLPIP_INIT_MARKER] = true;
})();

// ── Wire content.js showToast into PiPFactory ──────────────────────────────
// PiPFactory calls this._showToast() but has no UI in content script context.
// Connect it to our content.js showToast so users see feedback.
if (typeof PiPFactory !== 'undefined' && typeof showToast === 'function') {
  PiPFactory._showToast = showToast;
}

// Establish persistent connection to keep service worker alive
let serviceWorkerPort = null;
function establishServiceWorkerConnection() {
  // Only connect when PiP windows are active
  if (State.pipWindows.size > 0 && !serviceWorkerPort) {
    try {
      serviceWorkerPort = chrome.runtime.connect({ name: 'fullpip-keepalive' });
      serviceWorkerPort.onDisconnect.addListener(() => {
        serviceWorkerPort = null;
        // Reconnect if PiP windows still active
        if (State.pipWindows.size > 0) {
          setTimeout(establishServiceWorkerConnection, 1000);
        }
      });
      console.debug('[FullPiP] Service worker port established');
    } catch (e) {
      console.debug('[FullPiP] Failed to establish port connection:', e.message);
    }
  }
}

// Notify background script that content script is ready (with error handling)
sendSafeMessage({ action: "contentScriptReady" }, 'Content script ready handshake');

// Cleanup on page unload/navigation
// This MUST be synchronous — async operations are unreliable during pagehide.
window.addEventListener('pagehide', () => {
  // 1. Close all local Document PiP windows (synchronous)
  closeAllPipWindows();

  // 2. Close Document PiP window if open (synchronous)
  if (window.documentPictureInPicture?.window) {
    try { window.documentPictureInPicture.window.close(); } catch {}
  }

  // 3. Exit standard video PiP if active (synchronous best-effort)
  if (document.pictureInPictureElement) {
    try { document.exitPictureInPicture(); } catch {}
  }

  // 4. Clean up all event listeners
  cleanupEventListeners();

  // 5. Disconnect service worker port
  if (serviceWorkerPort) {
    serviceWorkerPort.disconnect();
    serviceWorkerPort = null;
  }

  // 6. Notify background (best-effort, may not complete)
  try { chrome.runtime.sendMessage({ action: 'tabClosed' }); } catch {}
});

window.addEventListener('beforeunload', () => {
  // Final cleanup attempt
  if (State.observer) State.observer.disconnect();
  if (State.cleanupTimer) clearInterval(State.cleanupTimer);
});

// Export error stats for debugging (accessible via console)
if (typeof window !== 'undefined') {
  window.FullPiPDebug = {
    getState: () => ({
      pipWindows: State.pipWindows.size,
      errorCount: State.errorCount,
      lastErrorTime: State.lastErrorTime,
      isPickerActive: State.isPickerActive,
      mediaMapSize: mediaMap.size
    }),
    getErrorRate: () => {
      if (!State.lastErrorTime) return 0;
      const uptime = Date.now() - State.lastErrorTime;
      return (State.errorCount / (uptime / 1000 / 60)).toFixed(2) + ' errors/min';
    }
  };
}
