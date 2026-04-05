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

// Optimized settings cache - reduces chrome.storage.sync calls
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
    
    const result = await chrome.storage.sync.get(keys);
    this.data = { ...this.data, ...result };
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
    timeout = setTimeout(() => func.apply(this, args), delay);
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
function handleRuntimeMessage(req, sender, sendResponse) {
  switch (req.action) {
    case "contextMenuTrigger":
      req.type === 'video' ? launchVideoPiP(req.srcUrl) : launchImagePiP();
      sendResponse({ success: true });
      break;
    case "shortcutTrigger":
      const mainVideo = findMainVideo();
      if (mainVideo) {
        launchVideoPiP(mainVideo);
        sendResponse({ success: true, type: 'video' });
      } else if (State.lastRightClickTarget) {
        launchImagePiP();
        sendResponse({ success: true, type: 'image' });
      } else {
        showToast('No media found on page', 'error');
        sendResponse({ success: false, error: 'No media' });
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
          if (document.pictureInPictureElement === el) {
            document.exitPictureInPicture();
          } else {
            el.requestPictureInPicture().catch(console.error);
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
      closeAllPipWindows();
      sendResponse({ success: true });
      break;
    case "getPipCount":
      sendResponse({ count: State.pipWindows.size });
      break;
    case "ping":
      sendResponse({ status: 'ok', pipCount: State.pipWindows.size });
      break;
  }
  return true; // Keep channel open for async response
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
  launchElementPiP(e.target);
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

  // Check max windows limit - using cached settings
  const settings = await CachedSettings.get(['maxPipWindows']);
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
    
    // Copy styles from main document (with error handling)
    Array.from(document.styleSheets).forEach(styleSheet => {
      try {
        if (styleSheet.href) {
          const link = doc.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          doc.head.append(link);
        } else if (styleSheet.cssRules) {
          const style = doc.createElement('style');
          Array.from(styleSheet.cssRules).forEach(rule => style.textContent += rule.cssText);
          doc.head.append(style);
        }
      } catch (e) {
        // Expected for cross-origin stylesheets - log for debugging
        console.debug('[FullPiP] Skipping cross-origin stylesheet:', styleSheet.href || 'inline');
      }
    });
    
    // Add base styles
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
// VIDEO PiP
// ============================================================================
async function launchVideoPiP(target) {
  let video;
  if (target instanceof HTMLVideoElement) {
    video = target;
  } else if (typeof target === 'string') {
    video = document.querySelector(`video[src="${target}"]`);
  }
  if (!video) video = findMainVideo();
  
  if (!video) {
    showToast('No video found on page', 'error');
    return;
  }
  
  if (video.disablePictureInPicture) {
    showToast('PiP is disabled by this website', 'error');
    return;
  }
  
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }
    await video.requestPictureInPicture();
    showToast('Video PiP activated', 'success', 1500);
  } catch (e) { 
    console.error("[FullPiP] Video Error:", e);
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
  
  if (bgSetting === 'white') bgColor = '#ffffff';
  else if (bgSetting === 'black') bgColor = '#000000';
  else if (bgSetting === 'grid') {
    bgColor = '#e5e5e5';
    bgImage = `linear-gradient(45deg, #ccc 25%, transparent 25%),
               linear-gradient(-45deg, #ccc 25%, transparent 25%),
               linear-gradient(45deg, transparent 75%, #ccc 75%),
               linear-gradient(-45deg, transparent 75%, #ccc 75%)`;
    bgSize = '20px 20px';
  }
  
  bodyElement.style.backgroundColor = bgColor;
  bodyElement.style.backgroundImage = bgImage;
  bodyElement.style.backgroundSize = bgSize;
}

function setupPipStyles(doc, sourceNode, bgSetting, scaleMode) {
  const style = doc.createElement('style');
  style.textContent = `
    body {
      margin: 0;
      height: 100vh; width: 100vw;
      display: flex; justify-content: center; align-items: center;
      overflow: hidden;
      cursor: default;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    }
    img, video {
      display: block;
      width: 100%; height: 100%;
      object-fit: ${scaleMode};
      user-select: none; 
      will-change: transform;
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
        updateTransform();
        break;
      case 'ArrowDown':
        pY -= step;
        updateTransform();
        break;
      case 'ArrowLeft':
        pX += step;
        updateTransform();
        break;
      case 'ArrowRight':
        pX -= step;
        updateTransform();
        break;
      case '+':
      case '=':
        scale = Math.min(CONFIG.ZOOM_MAX, scale * CONFIG.ZOOM_STEP_IN);
        updateTransform();
        break;
      case '-':
        scale = Math.max(CONFIG.ZOOM_MIN, scale * CONFIG.ZOOM_STEP_OUT);
        updateTransform();
        break;
      case CONFIG.ZOOM_RESET_KEY:
        scale = 1; pX = 0; pY = 0;
        updateTransform();
        break;
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
    
    if (settings.pipZoomSmartLimit) {
      newScale = Math.max(CONFIG.ZOOM_MIN, newScale);
    } else {
      newScale = Math.max(0.01, newScale);
    }
    
    // Reset position when zoom returns to 1.0
    if (newScale === CONFIG.ZOOM_MIN) {
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
      
      if (settings.pipEdgeLock) {
        const limitX = (winW / 2) / scale;
        const limitY = (winH / 2) / scale;
        nextPx = Math.max(-limitX, Math.min(limitX, nextPx));
        nextPy = Math.max(-limitY, Math.min(limitY, nextPy));
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

(function initAutoPip() {
  // Prevent duplicate initialization
  if (isInitialized) return;

  CachedSettings.get(['autoPipEnabled']).then(({ autoPipEnabled }) => {
    if (!autoPipEnabled) {
      isInitialized = true;
      return;
    }

    const attemptPip = async () => {
      const v = document.querySelector('video');
      if (v && v.readyState > 0 && !v.paused) {
        try {
          await v.requestPictureInPicture();
          cleanupAutoListeners();
          showToast('Auto-PiP activated', 'success');
        } catch (e) { /* Ignore */ }
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
    
    isInitialized = true;
  });
})();

// ============================================================================
// INITIALIZATION
// ============================================================================

// Prevent duplicate initialization when content script is re-injected
if (isInitialized) {
  console.debug('[FullPiP] Already initialized, skipping');
} else {
  setupGlobalErrorHandlers();
  setupEventListeners();
  isInitialized = true;
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
window.addEventListener('pagehide', () => {
  closeAllPipWindows();
  cleanupEventListeners();
  if (serviceWorkerPort) {
    serviceWorkerPort.disconnect();
    serviceWorkerPort = null;
  }
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
