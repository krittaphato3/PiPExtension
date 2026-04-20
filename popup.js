/**
 * @file popup.js
 * @desc FullPiP v4.0.0 — Clean, simplified popup UI
 */

const KEYS = {
    THEME: 'themePref',
    PIP_MODE: 'pipMode',
    AUTO_PIP: 'autoPipEnabled',
    SHOW_NOTIFICATIONS: 'showNotifications',
    SCALE_MODE: 'pipScaleMode',
    BG_COLOR: 'pipBackgroundColor',
    LOCK_PAN: 'pipLockPan',
    EDGE_LOCK: 'pipEdgeLock',
    ZOOM_SMART_LIMIT: 'pipZoomSmartLimit',
    ZOOM_SPEED: 'pipZoomSpeed',
    MAX_PIP_WINDOWS: 'maxPipWindows',
    TOAST_DURATION: 'toastDuration',
    HIGHLIGHT_ON_HOVER: 'highlightOnHover',
    AUTO_SCROLL_TO_MEDIA: 'autoScrollToMedia',
    CACHE_MEDIA_LIST: 'cacheMediaList',
};

const DEFAULTS = {
    [KEYS.THEME]: 'dark',
    [KEYS.PIP_MODE]: 'hybrid',
    [KEYS.AUTO_PIP]: false,
    [KEYS.SHOW_NOTIFICATIONS]: true,
    [KEYS.SCALE_MODE]: 'normal',
    [KEYS.BG_COLOR]: 'auto',
    [KEYS.LOCK_PAN]: false,
    [KEYS.EDGE_LOCK]: false,
    [KEYS.ZOOM_SMART_LIMIT]: true,
    [KEYS.ZOOM_SPEED]: 1.0,
    [KEYS.MAX_PIP_WINDOWS]: 3,
    [KEYS.TOAST_DURATION]: 2.5,
    [KEYS.HIGHLIGHT_ON_HOVER]: true,
    [KEYS.AUTO_SCROLL_TO_MEDIA]: true,
    [KEYS.CACHE_MEDIA_LIST]: true,
};

// Media Cache
const mediaCache = {
    data: null,
    timestamp: 0,
    tabId: null,
    tabUrl: null
};

// Cache invalidation helper
function invalidateMediaCache() {
    mediaCache.data = null;
    mediaCache.timestamp = 0;
    mediaCache.tabId = null;
    mediaCache.tabUrl = null;
}

// Settings Cache — reduces chrome.storage.sync calls
const settingsCache = {
    data: null,
    timestamp: 0,
    CACHE_DURATION: 3000,

    async get(keys = null) {
        const now = Date.now();
        if (this.data && (now - this.timestamp) < this.CACHE_DURATION) {
            if (keys) {
                return keys.reduce((acc, k) => ({...acc, [k]: this.data[k]}), {});
            }
            return this.data;
        }

        return new Promise((resolve) => {
            chrome.storage.sync.get(keys, (items) => {
                this.data = { ...this.data, ...items };
                this.timestamp = now;
                if (keys) {
                    resolve(keys.reduce((acc, k) => ({...acc, [k]: this.data[k]}), {}));
                } else {
                    resolve(this.data);
                }
            });
        });
    },

    invalidate() {
        this.data = null;
        this.timestamp = 0;
    }
};

// UI Map
const els = {
    themeBtn: document.getElementById('themeBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    closeAllBtn: document.getElementById('closeAllBtn'),
    body: document.body,
    speedLabel: document.getElementById('speedVal'),
    toastDurationLabel: document.getElementById('toastDurationVal'),
    pipCount: document.getElementById('pipCount'),
    pipStatusBar: document.getElementById('pipStatusBar'),
    pipModeBadge: document.getElementById('pipModeBadge'),
    mediaCountBadge: document.getElementById('mediaCountBadge'),
    toastContainer: document.getElementById('toastContainer'),
    // Mode UI elements
    pipModeSelect: document.getElementById('pipMode'),
    modeDescription: document.getElementById('modeDescription'),
    windowSettingsSection: document.getElementById('windowSettingsSection'),
    multiMonitorSection: document.getElementById('multiMonitorSection'),
    inputs: {
        [KEYS.PIP_MODE]: document.getElementById('pipMode'),
        [KEYS.AUTO_PIP]: document.getElementById('autoPipEnabled'),
        [KEYS.SHOW_NOTIFICATIONS]: document.getElementById('showNotifications'),
        [KEYS.SCALE_MODE]: document.getElementById('pipScaleMode'),
        [KEYS.BG_COLOR]: document.getElementById('pipBackgroundColor'),
        [KEYS.LOCK_PAN]: document.getElementById('pipLockPan'),
        [KEYS.EDGE_LOCK]: document.getElementById('pipEdgeLock'),
        [KEYS.ZOOM_SMART_LIMIT]: document.getElementById('pipZoomSmartLimit'),
        [KEYS.ZOOM_SPEED]: document.getElementById('pipZoomSpeed'),
        [KEYS.MAX_PIP_WINDOWS]: document.getElementById('maxPipWindows'),
        [KEYS.TOAST_DURATION]: document.getElementById('toastDuration'),
        [KEYS.HIGHLIGHT_ON_HOVER]: document.getElementById('highlightOnHover'),
        [KEYS.AUTO_SCROLL_TO_MEDIA]: document.getElementById('autoScrollToMedia'),
        [KEYS.CACHE_MEDIA_LIST]: document.getElementById('cacheMediaList'),
    }
};

const ICONS = {
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
};

// Mode descriptions for UI
const MODE_DESCRIPTIONS = {
    api: '<strong>PiP API Mode:</strong> Uses Chrome\'s native Picture-in-Picture API only. Best quality, but only one PiP window at a time.',
    popup: '<strong>Popup Mode:</strong> Opens PiP in popup windows. Supports multiple simultaneous PiP windows and multi-monitor.',
    hybrid: '<strong>Hybrid Mode:</strong> Tries native PiP API first, falls back to popup windows for multi-PiP. Best of both worlds.'
};

// ============================================================================
// MODE MANAGEMENT
// ============================================================================
function updateModeUI(mode) {
    // Update mode badge
    if (els.pipModeBadge) {
        els.pipModeBadge.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        els.pipModeBadge.dataset.mode = mode;
    }

    // Update mode description
    if (els.modeDescription) {
        els.modeDescription.innerHTML = MODE_DESCRIPTIONS[mode] || MODE_DESCRIPTIONS.hybrid;
    }

    // Show/hide window settings (only for popup and hybrid modes)
    if (els.windowSettingsSection) {
        const showWindowSettings = mode === 'popup' || mode === 'hybrid';
        els.windowSettingsSection.style.display = showWindowSettings ? 'block' : 'none';
    }

    // Show/hide multi-monitor settings (only for popup and hybrid modes)
    if (els.multiMonitorSection) {
        const showMultiMonitor = mode === 'popup' || mode === 'hybrid';
        els.multiMonitorSection.style.display = showMultiMonitor ? 'block' : 'none';
    }

    console.log(`[FullPiP] Mode set to: ${mode.toUpperCase()}`);
}

// ============================================================================
// ERROR HANDLING - Global Error Handlers for Popup
// ============================================================================
let errorHandlerAttached = false;
let popupErrorCount = 0;

function setupPopupErrorHandlers() {
  if (errorHandlerAttached) return;
  
  // Uncaught errors
  window.addEventListener('error', (e) => {
    popupErrorCount++;
    console.error('[FullPiP Popup] Uncaught Error:', {
      message: e.error?.message || e.message || 'Unknown error',
      source: e.filename,
      line: e.lineno,
      column: e.colno
    });
    
    // Show user-friendly error
    const errorMsg = e.error?.message || e.message || 'An unexpected error occurred';
    if (errorMsg.includes('storage')) {
      showToast('Settings sync unavailable. Using local settings.', 'warning');
    } else if (errorMsg.includes('tabs')) {
      showToast('Cannot access tab. Please refresh the page.', 'error');
    } else {
      showToast('An error occurred. Check console for details.', 'error');
    }
  });
  
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    popupErrorCount++;
    console.error('[FullPiP Popup] Unhandled Promise Rejection:', e.reason);
    
    // Show user-friendly error for common cases
    if (e.reason?.message?.includes('Could not establish')) {
      // Silent - expected when content script not ready
      console.debug('[FullPiP] Content script not ready, will retry');
    } else {
      showToast('Operation failed. Please try again.', 'error');
    }
    
    e.preventDefault();
  });
  
  errorHandlerAttached = true;
}

// Helper to safely send tab messages with error handling
async function sendTabMessageSafe(tabId, message, options = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, message, options);
  } catch (err) {
    console.debug(`[FullPiP] Tab message failed:`, err.message);
    return null;
  }
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================
function showToast(message, type = 'info', duration = 2500) {
    let container = els.toastContainer;
    
    // Create container if it doesn't exist
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
        els.toastContainer = container;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <button class="toast-close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    container.appendChild(toast);

    // Auto-remove
    const timeout = setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(timeout);
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    });
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================
let saveTimeout;
let pendingSyncUpdates = {}; // Queue for sync migration
let isSyncing = false; // Prevent concurrent sync operations

// Optimized save: immediate local save + async sync migration
function saveSetting(key, value, showFeedback = false) {
    clearTimeout(saveTimeout);

    // 1. Save immediately to chrome.storage.local (instant UI responsiveness)
    chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
            console.warn('[FullPiP] Failed to save to local storage:', chrome.runtime.lastError.message);
            showToast('Failed to save setting locally', 'error');
            return;
        }

        // Update cache immediately after successful local save
        settingsCache.data = { ...settingsCache.data, [key]: value };
        settingsCache.timestamp = Date.now();

        // 2. Queue for sync migration (with error handling)
        pendingSyncUpdates[key] = value;

        // 3. Debounce sync migration (500ms after interaction stops for better UX)
        saveTimeout = setTimeout(() => {
            flushSyncQueue(showFeedback).catch(err => {
                console.warn('[FullPiP] Sync migration failed:', err.message);
                // Don't show error toast for sync failures to avoid spam
            });
        }, 500); // Reduced from 2000ms to 500ms for better perceived responsiveness
    });
}

// ✅ FIX: Flush sync queue with proper locking to prevent race conditions
async function flushSyncQueue(showFeedback = false) {
    if (isSyncing || Object.keys(pendingSyncUpdates).length === 0) {
        return;
    }

    isSyncing = true;
    const updates = { ...pendingSyncUpdates };
    pendingSyncUpdates = {}; // Clear queue before sync

    try {
        await new Promise((resolve, reject) => {
            chrome.storage.sync.set(updates, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });

        if (showFeedback) {
            showToast('Setting saved & synced', 'success', 1500);
        }
    } catch (error) {
        console.warn('[FullPiP] Sync migration failed:', error.message);
        // Re-queue the updates for next save attempt
        pendingSyncUpdates = { ...pendingSyncUpdates, ...updates };
    } finally {
        isSyncing = false;
    }
}

function saveDebounced(key, val, labelEl, formatFn) {
    clearTimeout(saveTimeout);

    // Save immediate to local for instant UI responsiveness
    chrome.storage.local.set({ [key]: val });
    pendingSyncUpdates[key] = val;

    // Update label immediately
    if (labelEl && formatFn) {
        labelEl.innerText = formatFn(val);
    }

    // Debounce sync migration
    saveTimeout = setTimeout(() => {
        flushSyncQueue(false);
    }, 2000);
}

async function loadSettings() {
    // Load from both local and sync, with local taking precedence for recent changes
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (localItems) => {
            chrome.storage.sync.get(null, (syncItems) => {
                // Merge: sync as base, local overrides for recent changes
                const merged = { ...syncItems, ...localItems };
                settingsCache.data = merged;
                settingsCache.timestamp = Date.now();
                resolve(merged);
            });
        });
    });
}

async function resetAllSettings() {
    if (!confirm('Reset ALL settings to defaults? This cannot be undone.')) return;

    const allDefaults = { ...DEFAULTS };
    delete allDefaults[KEYS.THEME]; // Keep theme

    // Clear pending sync queue
    pendingSyncUpdates = {};

    chrome.storage.local.set(allDefaults, () => {
        chrome.storage.sync.set(allDefaults, () => {
            // Reload settings
            loadSettings().then(items => {
                Object.keys(els.inputs).forEach(key => {
                    const val = items[key] !== undefined ? items[key] : DEFAULTS[key];
                    const el = els.inputs[key];
                    if (!el) return;
                    if (el.type === 'checkbox') el.checked = val;
                    else el.value = val;
                    if (key === KEYS.ZOOM_SPEED && els.speedLabel) els.speedLabel.innerText = val + 'x';
                    if (key === KEYS.TOAST_DURATION && els.toastDurationLabel) els.toastDurationLabel.innerText = val + 's';
                });
            });
            showToast('All settings reset to defaults', 'success');
        });
    });
}

// ============================================================================
// EXPORT/IMPORT SETTINGS
// ============================================================================
async function exportSettings() {
    const items = await loadSettings();
    const exportData = {
        version: '4.0.0',
        exportedAt: new Date().toISOString(),
        settings: items
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fullpip-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast('Settings exported', 'success');
}

function importSettings(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.settings || typeof data.settings !== 'object') {
                throw new Error('Invalid file format: missing settings object');
            }

            // Get all valid setting keys
            const validKeys = new Set(Object.values(KEYS));

            // Validate and filter settings
            const validSettings = {};
            let invalidCount = 0;

            for (const [key, value] of Object.entries(data.settings)) {
                if (validKeys.has(key)) {
                    // Type validation
                    const defaultVal = DEFAULTS[key];
                    if (defaultVal !== undefined) {
                        if (typeof value === typeof defaultVal) {
                            validSettings[key] = value;
                        } else {
                            console.warn(`[FullPiP] Skipping invalid type for ${key}: expected ${typeof defaultVal}, got ${typeof value}`);
                            invalidCount++;
                        }
                    } else {
                        validSettings[key] = value;
                    }
                } else {
                    console.warn(`[FullPiP] Skipping unknown setting key: ${key}`);
                    invalidCount++;
                }
            }

            if (Object.keys(validSettings).length === 0) {
                throw new Error('No valid settings found in file');
            }

            // Clear pending queue for imported keys
            Object.keys(validSettings).forEach(key => {
                delete pendingSyncUpdates[key];
            });

            chrome.storage.local.set(validSettings, () => {
                chrome.storage.sync.set(validSettings, () => {
                    const msg = invalidCount > 0
                        ? `Imported ${Object.keys(validSettings).length} settings (${invalidCount} skipped)`
                        : 'Settings imported successfully';
                    showToast(msg, 'success');
                    setTimeout(() => location.reload(), 1000);
                });
            });
        } catch (err) {
            showToast(`Import failed: ${err.message}`, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================
function applyTheme(theme) {
    els.body.setAttribute('data-theme', theme);
    els.themeBtn.innerHTML = theme === 'light' ? ICONS.moon : ICONS.sun;
}

// ============================================================================
// MEDIA SCANNER
// ============================================================================
function scanForMediaInFrame() {
    const getMediaInfo = (el) => {
        try {
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) return null;
            if (getComputedStyle(el).display === 'none') return null;
            if (el.tagName === 'VIDEO' && !el.currentSrc && !el.src) return null;

            let thumbnail = null;
            let isPortrait = false;

            if (el.tagName === 'VIDEO' && el.readyState >= 2) {
                const w = el.videoWidth || rect.width;
                const h = el.videoHeight || rect.height;
                isPortrait = h > w;

                try {
                    const canvas = document.createElement('canvas');
                    if (isPortrait) { canvas.width = 54; canvas.height = 96; }
                    else { canvas.width = 96; canvas.height = 54; }

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
                    thumbnail = canvas.toDataURL('image/jpeg', 0.5);
                } catch(err) {
                    if (el.poster) thumbnail = el.poster;
                    else thumbnail = null;
                }
            } else if (el.tagName === 'VIDEO' && el.poster) {
                thumbnail = el.poster;
            }

            let title = document.title;
            const aria = el.getAttribute('aria-label') || el.getAttribute('title');
            if (aria) title = aria;

            return {
                pipId: el.dataset.pipId || (el.dataset.pipId = Math.random().toString(36).substr(2, 9)),
                type: el.tagName.toLowerCase(),
                src: el.currentSrc || el.src,
                paused: el.paused,
                currentTime: el.currentTime,
                duration: el.duration,
                volume: el.volume,
                muted: el.muted,
                thumbnail: thumbnail,
                pageTitle: title,
                isPortrait: isPortrait,
                isIframe: window !== window.top
            };
        } catch (e) {
            return null;
        }
    };

    const findAllMedia = (root = document) => {
        let media = Array.from(root.querySelectorAll('video, audio'));
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
        let node;
        while(node = walker.nextNode()) {
            if (node.shadowRoot) {
                media = media.concat(findAllMedia(node.shadowRoot));
            }
        }
        return media;
    };

    return findAllMedia(document).map(getMediaInfo).filter(x => x !== null);
}

async function refreshMediaList(forceRefresh = false) {
    const container = document.getElementById('media-list');
    const settings = await loadSettings();
    const useCache = settings[KEYS.CACHE_MEDIA_LIST] !== false;
    const cacheDuration = 30000; // 30 second default

    // Check cache validity
    if (!forceRefresh && useCache && mediaCache.data && mediaCache.tabId) {
        const age = Date.now() - mediaCache.timestamp;
        if (age < cacheDuration) {
            // Validate cache by checking if tab is still valid and URL hasn't changed
            try {
                const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (currentTab?.id === mediaCache.tabId && currentTab?.url === mediaCache.tabUrl) {
                    renderMediaList(mediaCache.data, container, mediaCache.tabId);
                    return;
                } else {
                    // Tab changed or URL changed, invalidate cache
                    invalidateMediaCache();
                }
            } catch (e) {
                // Tab no longer exists, invalidate cache
                invalidateMediaCache();
            }
        }
    }
    
    // Show loading state
    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <span>Scanning for media...</span>
        </div>
    `;
    
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]?.id) {
            container.innerHTML = '<div class="empty-state">No active tab found</div>';
            return;
        }
        
        const tabId = tabs[0].id;
        
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                func: scanForMediaInFrame,
                world: 'MAIN'
            });
            
            const allMedia = [];
            results.forEach(frameResult => {
                if (frameResult.result) {
                    frameResult.result.forEach(item => {
                        item.frameId = frameResult.frameId;
                        allMedia.push(item);
                    });
                }
            });
            
            // Update cache
            mediaCache.data = allMedia;
            mediaCache.timestamp = Date.now();
            mediaCache.tabId = tabId;
            mediaCache.tabUrl = tabs[0]?.url;
            
            renderMediaList(allMedia, container, tabId);
            
        } catch (e) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>Restricted page or media loading...</span>
                </div>
            `;
        }
    });
}

function renderMediaList(mediaItems, container, tabId) {
    container.innerHTML = '';
    
    if (mediaItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span>No playable media found</span>
            </div>
        `;
        els.mediaCountBadge.textContent = '0';
        return;
    }
    
    els.mediaCountBadge.textContent = mediaItems.length;
    mediaItems.sort((a, b) => (a.paused === b.paused) ? 0 : a.paused ? 1 : -1);
    
    mediaItems.forEach(media => {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        let visual = '';
        const thumbClass = media.isPortrait ? 'media-thumb portrait' : 'media-thumb';
        
        if (media.thumbnail) {
            visual = `<div class="${thumbClass}" style="background-image: url('${media.thumbnail}')"></div>`;
        } else {
            const iconSvg = media.type === 'video'
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
            visual = `<div class="${thumbClass}" style="background: var(--input-bg); display:flex; justify-content:center; align-items:center;">${iconSvg}</div>`;
        }
        
        const playIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        const pipIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
        
        const time = formatTime(media.currentTime) + (media.duration ? ' / ' + formatTime(media.duration) : '');
        const titleText = media.pageTitle === 'FullPiP Control Center' ? 'Unknown Video' : media.pageTitle;
        const subText = media.isIframe ? `<span class="iframe-badge">Embedded Frame</span> • ${time}` : time;
        
        div.innerHTML = `
            ${visual}
            <div class="media-info">
                <div class="media-title">${titleText}</div>
                <div class="media-meta">${subText}</div>
            </div>
            <div class="media-controls">
                <button class="btn-icon play-btn" title="${media.paused ? 'Play' : 'Pause'}">
                    ${media.paused ? playIcon : pauseIcon}
                </button>
                ${media.type === 'video' ? `<button class="btn-icon pip-btn" title="Picture-in-Picture">${pipIcon}</button>` : ''}
            </div>
        `;
        
        const playBtn = div.querySelector('.play-btn');
        const pipBtn = div.querySelector('.pip-btn');
        
        // Hover highlight (with error handling)
        div.addEventListener('mouseenter', async () => {
            const settings = await loadSettings();
            if (settings[KEYS.HIGHLIGHT_ON_HOVER]) {
                sendTabMessageSafe(tabId, {
                    action: "highlightMedia",
                    id: media.pipId,
                    active: true,
                    scroll: settings[KEYS.AUTO_SCROLL_TO_MEDIA]
                }, { frameId: media.frameId });
            }
        });
        div.addEventListener('mouseleave', () => {
            sendTabMessageSafe(tabId, { 
                action: "highlightMedia", 
                id: media.pipId, 
                active: false 
            }, { frameId: media.frameId });
        });
        
        playBtn.onclick = async () => {
            const settings = await loadSettings();
            const result = await sendTabMessageSafe(tabId, {
                action: "controlMedia",
                id: media.pipId,
                command: "togglePlay"
            }, { frameId: media.frameId });
            
            if (result?.success) {
                const isPaused = playBtn.innerHTML.includes('rect');
                playBtn.innerHTML = isPaused ? playIcon : pauseIcon;
                playBtn.title = isPaused ? 'Pause' : 'Play';
                
                if (settings[KEYS.SHOW_NOTIFICATIONS]) {
                    showToast(isPaused ? 'Playing' : 'Paused', 'info', 1000);
                }
            } else {
                showToast('Media not found or unavailable', 'error', 1500);
            }
        };
        
        if (pipBtn) {
            pipBtn.onclick = async () => {
                const settings = await loadSettings();

                // Use the same toggle logic as Alt+P by sending a shortcutTrigger message to content script
                // This ensures consistent behavior and proper state detection
                const result = await sendTabMessageSafe(tabId, {
                    action: "shortcutTrigger"
                }, { frameId: media.frameId });

                if (result?.success) {
                    if (settings[KEYS.SHOW_NOTIFICATIONS]) {
                        if (result.action === 'closed') {
                            showToast(`Closed ${result.count} PiP window${result.count > 1 ? 's' : ''}`, 'success', 1500);
                        } else if (result.action === 'opened') {
                            showToast(result.type === 'video' ? 'PiP opened' : 'Image PiP opened', 'success', 1000);
                        }
                    }
                } else {
                    // Only show error if there's actually an error, not just communication failure
                    if (result?.error === 'No media') {
                        showToast('No media found on page', 'warning');
                    } else if (result) {
                        // If we got a result but success is false, show the specific error
                        showToast(result.error || 'PiP operation failed', 'error');
                    }
                    // If no result at all (communication failure), don't show notification to avoid false alarms
                }
            };
        }
        container.appendChild(div);
    });
}

function formatTime(seconds) {
    if (!seconds) return '0:00';
    if (seconds === Infinity) return 'Live';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ============================================================================
// PIPIP WINDOW COUNT & STATE UPDATE
// Shows native vs popup PiP state with visual indicator.
// ============================================================================
async function updatePipCount() {
    try {
        // Get full PiP state from background (includes native + popup)
        const state = await chrome.runtime.sendMessage({ action: "getPipState" });

        if (state) {
            const totalCount = (state.isOpen ? 1 : 0) + state.popupCount;
            els.pipCount.textContent = totalCount;

            // Update status bar with method-specific indicator
            if (state.isOpen) {
                els.pipStatusBar.classList.add('active');
                els.pipStatusBar.dataset.pipMethod = 'native';
                // Update status text
                const statusText = els.pipStatusBar.querySelector('.status-text');
                if (statusText) {
                    statusText.innerHTML = `<span id="pipCount">${totalCount}</span> PiP window(s) active <span class="pip-method-badge native">Native</span>`;
                }
            } else if (state.popupCount > 0) {
                els.pipStatusBar.classList.add('active');
                els.pipStatusBar.dataset.pipMethod = 'popup';
                const statusText = els.pipStatusBar.querySelector('.status-text');
                if (statusText) {
                    statusText.innerHTML = `<span id="pipCount">${totalCount}</span> PiP window(s) active <span class="pip-method-badge popup">Popup</span>`;
                }
            } else {
                els.pipStatusBar.classList.remove('active');
                els.pipStatusBar.removeAttribute('data-pip-method');
                const statusText = els.pipStatusBar.querySelector('.status-text');
                if (statusText) {
                    statusText.innerHTML = `<span id="pipCount">0</span> PiP window(s) active`;
                }
            }
        } else {
            // Fallback to old method if background not ready
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;

            const response = await chrome.tabs.sendMessage(tab.id, { action: "getPipCount" });
            const count = response?.count || 0;
            els.pipCount.textContent = count;

            if (count > 0) {
                els.pipStatusBar.classList.add('active');
            } else {
                els.pipStatusBar.classList.remove('active');
            }
        }
    } catch (e) {
        els.pipCount.textContent = '0';
        els.pipStatusBar.classList.remove('active');
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
(async function init() {
    // Setup error handlers first
    setupPopupErrorHandlers();
    
    const items = await loadSettings();

    // Apply theme
    applyTheme(items[KEYS.THEME] || 'dark');
    
    // Initialize all inputs
    Object.keys(els.inputs).forEach(key => {
        const val = items[key] !== undefined ? items[key] : DEFAULTS[key];
        const el = els.inputs[key];
        if (!el) return;

        if (el.type === 'checkbox') {
            el.checked = val;
        } else {
            el.value = val;
        }

        // Update labels
        if (key === KEYS.ZOOM_SPEED && els.speedLabel) {
            els.speedLabel.innerText = val + 'x';
        }
        if (key === KEYS.TOAST_DURATION && els.toastDurationLabel) {
            els.toastDurationLabel.innerText = val + 's';
        }
    });

    // Initialize mode UI based on loaded setting
    const currentMode = items[KEYS.PIP_MODE] || 'hybrid';
    updateModeUI(currentMode);
    
    // Set up input listeners
    Object.keys(els.inputs).forEach(key => {
        const el = els.inputs[key];
        if (!el) return;

        el.addEventListener('input', (e) => {
            const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

            if (key === KEYS.ZOOM_SPEED && els.speedLabel) {
                els.speedLabel.innerText = val + 'x';
                saveDebounced(key, val, els.speedLabel, v => v + 'x');
            } else if (key === KEYS.TOAST_DURATION && els.toastDurationLabel) {
                els.toastDurationLabel.innerText = val + 's';
                saveDebounced(key, val, els.toastDurationLabel, v => v + 's');
            } else if (e.target.type === 'range') {
                saveDebounced(key, val);
            } else {
                saveSetting(key, val);
            }
        });
    });

    // Mode change listener (special handling for UI updates)
    if (els.pipModeSelect) {
        els.pipModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            saveSetting(KEYS.PIP_MODE, mode, true);
            updateModeUI(mode);
        });
    }
    
    // Theme toggle
    els.themeBtn.addEventListener('click', () => {
        const isDark = els.body.getAttribute('data-theme') !== 'light';
        const newTheme = isDark ? 'light' : 'dark';
        applyTheme(newTheme);
        saveSetting(KEYS.THEME, newTheme);
    });

    // Refresh button with debounce
    let refreshTimeout;
    els.refreshBtn.addEventListener('click', () => {
        if (refreshTimeout) return; // Prevent spam clicking
        
        mediaCache.data = null; // Clear cache
        refreshMediaList(true);
        showToast('Refreshing media list', 'info', 1000);
        
        // Disable button temporarily
        refreshTimeout = setTimeout(() => {
            refreshTimeout = null;
        }, 2000);
    });
    
    // Close all PiP button — sends to background (which manages ALL PiP state)
    els.closeAllBtn.addEventListener('click', async () => {
        try {
            // Close via background service worker (closes native + all popup PiP)
            const result = await chrome.runtime.sendMessage({ action: 'closeAllPip' });
            await updatePipCount();
            if (result?.success) {
                const settings = await loadSettings();
                if (settings[KEYS.SHOW_NOTIFICATIONS]) {
                    showToast('All PiP windows closed', 'success');
                }
            }
        } catch (e) {
            showToast('No PiP windows to close', 'info');
        }
    });

    // Export settings
    document.getElementById('exportSettingsBtn').addEventListener('click', exportSettings);
    
    // Import settings
    document.getElementById('importSettingsInput').addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
            importSettings(e.target.files[0]);
        }
    });
    
    // Reset all settings
    document.getElementById('resetAllSettingsBtn').addEventListener('click', resetAllSettings);
    
    // Initial media scan
    refreshMediaList();
    
    // Update PiP count
    updatePipCount();
    
    // Periodic PiP count update
    setInterval(updatePipCount, 2000);

    // Listen for live sync updates and tab navigation (with cleanup on popup close)
    const messageListener = (msg) => {
        if (msg.action === 'liveSyncUpdate') {
            // Refresh media list to show updated thumbnail
            if (mediaCache.data) {
                refreshMediaList(true);
            }
        }
        return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Listen for tab updates to invalidate cache on navigation
    const tabUpdateListener = (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading' && mediaCache.tabId === tabId) {
            // Tab is navigating, invalidate cache
            invalidateMediaCache();
        }
    };

    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    // Cleanup listeners when popup closes
    window.addEventListener('unload', () => {
        chrome.runtime.onMessage.removeListener(messageListener);
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
    });
    
    // Export debug info (accessible via console)
    window.FullPiPDebug = {
        getStats: () => ({
            errorCount: popupErrorCount,
            mediaCacheAge: mediaCache.timestamp ? Date.now() - mediaCache.timestamp : 0,
            cachedTabId: mediaCache.tabId,
            cachedMediaCount: mediaCache.data?.length || 0
        }),
        clearCache: () => {
            mediaCache.data = null;
            mediaCache.timestamp = 0;
            mediaCache.tabId = null;
            console.log('[FullPiP] Cache cleared');
        }
    };

    // ========================================================================
    // MULTI-MONITOR PiP UI
    // ========================================================================
    const monitorSelect = document.getElementById('monitorSelect');
    const displayCountBadge = document.getElementById('displayCountBadge');
    const forcePopupCheckbox = document.getElementById('forcePopup');
    const launchMonitorPipBtn = document.getElementById('launchMonitorPipBtn');
    const refreshDisplaysBtn = document.getElementById('refreshDisplaysBtn');

    // Guard: multi-monitor elements may not exist in future HTML variations
    if (!monitorSelect || !displayCountBadge || !forcePopupCheckbox ||
        !launchMonitorPipBtn || !refreshDisplaysBtn) {
        console.warn('[FullPiP] Multi-monitor UI elements missing');
    }

    let availableDisplays = [];

    /**
     * Load available displays from background script
     */
    async function loadDisplays() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getDisplays' });
            if (response?.success) {
                availableDisplays = response.displays;
            } else {
                availableDisplays = [];
            }
        } catch (e) {
            console.warn('[FullPiP] Could not load displays:', e.message);
            availableDisplays = [];
        }

        // Populate dropdown
        if (monitorSelect) {
            monitorSelect.innerHTML = '<option value="">Auto (Primary)</option>';
            availableDisplays.forEach((display, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `${display.name || `Monitor ${idx + 1}`} (${display.width}x${display.height})`;
                monitorSelect.appendChild(opt);
            });
        }

        // Update badge
        if (displayCountBadge) {
            displayCountBadge.textContent = availableDisplays.length;
        }

        // Show/hide multi-monitor section based on availability
        const multiMonitorCard = document.querySelector('.multi-monitor-card');
        if (multiMonitorCard) {
          multiMonitorCard.style.display = availableDisplays.length > 0 ? 'block' : 'none';
        }
    }

    /**
     * Launch PiP on selected monitor
     */
    async function launchMonitorPip() {
        const selectedIdx = monitorSelect.value;
        const targetDisplay = selectedIdx !== '' ? availableDisplays[parseInt(selectedIdx, 10)] : null;
        const forcePopup = forcePopupCheckbox.checked;

        if (!targetDisplay && !forcePopup) {
            showToast('No monitor selected. Choose a monitor or enable Force Popup.', 'warning');
            return;
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                showToast('No active tab', 'error');
                return;
            }

            // Scan for media in the active tab
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: () => {
                    const videos = Array.from(document.querySelectorAll('video'));
                    const visible = videos.find(v => {
                        const r = v.getBoundingClientRect();
                        return r.width > 20 && r.height > 20 && getComputedStyle(v).display !== 'none';
                    });
                    return visible ? { src: visible.currentSrc || visible.src, id: visible.dataset.pipId } : null;
                },
                world: 'MAIN'
            });

            const mediaInfo = results?.find(r => r.result)?.result;
            if (!mediaInfo?.src) {
                showToast('No video found on page', 'error');
                return;
            }

            // Send request to content script
            const message = {
                action: 'launchVideoPopup',
                srcUrl: mediaInfo.src,
                screenId: targetDisplay?.id,
                left: targetDisplay?.left,
                top: targetDisplay?.top,
                forcePopup: forcePopup || !!targetDisplay,
            };

            const response = await chrome.tabs.sendMessage(tab.id, message);
            if (response?.success) {
                showToast('PiP window opened', 'success');
            } else {
                showToast('Failed to open PiP window', 'error');
            }
        } catch (e) {
            console.error('[FullPiP] Failed to launch monitor PiP:', e);
            showToast('Failed to open PiP. Check console for details.', 'error');
        }
    }

    // Event listeners (guarded)
    if (launchMonitorPipBtn) {
        launchMonitorPipBtn.addEventListener('click', launchMonitorPip);
    }
    if (refreshDisplaysBtn) {
        refreshDisplaysBtn.addEventListener('click', async () => {
            await loadDisplays();
            showToast('Display list refreshed', 'success', 1500);
        });
    }

    // Load displays on popup open
    await loadDisplays();
})();
