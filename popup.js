/**
 * @file popup.js
 * @desc Advanced Media Scanner with Cache, Toast Feedback & Settings Management
 */

const KEYS = {
    THEME: 'themePref',
    AUTO_PIP: 'autoPipEnabled',
    SHOW_NOTIFICATIONS: 'showNotifications',
    SCALE_MODE: 'pipScaleMode',
    INITIAL_SIZE: 'pipInitialSize',
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
    CACHE_DURATION: 'cacheDuration'
};

const DEFAULTS = {
    [KEYS.THEME]: 'dark',
    [KEYS.AUTO_PIP]: false,
    [KEYS.SHOW_NOTIFICATIONS]: true,
    [KEYS.SCALE_MODE]: 'contain',
    [KEYS.INITIAL_SIZE]: 'visual',
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
    [KEYS.CACHE_DURATION]: 30000  // Optimized from 15000 to 30000 for faster popup open
};

// Section-based defaults for reset functionality
const SECTION_DEFAULTS = {
    behavior: {
        [KEYS.SCALE_MODE]: 'contain',
        [KEYS.INITIAL_SIZE]: 'visual',
        [KEYS.BG_COLOR]: 'auto',
        [KEYS.MAX_PIP_WINDOWS]: 3
    },
    interaction: {
        [KEYS.LOCK_PAN]: false,
        [KEYS.EDGE_LOCK]: false,
        [KEYS.ZOOM_SMART_LIMIT]: true,
        [KEYS.ZOOM_SPEED]: 1.0,
        [KEYS.TOAST_DURATION]: 2.5
    },
    advanced: {
        [KEYS.HIGHLIGHT_ON_HOVER]: true,
        [KEYS.AUTO_SCROLL_TO_MEDIA]: true,
        [KEYS.CACHE_MEDIA_LIST]: true,
        [KEYS.CACHE_DURATION]: 15000
    }
};

// Media Cache
const mediaCache = {
    data: null,
    timestamp: 0,
    tabId: null
};

// Settings Cache - reduces chrome.storage.sync calls
const settingsCache = {
    data: null,
    timestamp: 0,
    CACHE_DURATION: 3000, // 3 seconds
    
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
    mediaCountBadge: document.getElementById('mediaCountBadge'),
    toastContainer: document.getElementById('toastContainer'),
    inputs: {
        [KEYS.AUTO_PIP]: document.getElementById('autoPipEnabled'),
        [KEYS.SHOW_NOTIFICATIONS]: document.getElementById('showNotifications'),
        [KEYS.SCALE_MODE]: document.getElementById('pipScaleMode'),
        [KEYS.INITIAL_SIZE]: document.getElementById('pipInitialSize'),
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
        [KEYS.CACHE_DURATION]: document.getElementById('cacheDuration')
    }
};

const ICONS = {
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    refresh: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
};

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

// Optimized save: immediate local save + debounced sync migration
function saveSetting(key, value, showFeedback = false) {
    clearTimeout(saveTimeout);

    // 1. Save immediately to chrome.storage.local (instant UI responsiveness)
    chrome.storage.local.set({ [key]: value });

    // 2. Queue for sync migration
    pendingSyncUpdates[key] = value;

    // 3. Debounce sync migration (2000ms after interaction stops)
    saveTimeout = setTimeout(() => {
        const updates = { ...pendingSyncUpdates };
        pendingSyncUpdates = {}; // Clear queue

        // Migrate to sync storage
        chrome.storage.sync.set(updates, () => {
            if (chrome.runtime.lastError) {
                console.warn('[FullPiP] Sync migration failed:', chrome.runtime.lastError.message);
                // Settings are safe in local, retry on next save
                pendingSyncUpdates = { ...pendingSyncUpdates, ...updates };
            } else if (showFeedback) {
                showToast('Setting saved & synced', 'success', 1500);
            }
        });
    }, 2000);

    // Update cache immediately
    settingsCache.data = { ...settingsCache.data, [key]: value };
    settingsCache.timestamp = Date.now();
}

function saveDebounced(key, val, labelEl, formatFn) {
    clearTimeout(saveTimeout);
    
    // Save immediately to local for instant UI responsiveness
    chrome.storage.local.set({ [key]: val });
    pendingSyncUpdates[key] = val;

    // Update label immediately
    if (labelEl && formatFn) {
        labelEl.innerText = formatFn(val);
    }

    // Debounce sync migration
    saveTimeout = setTimeout(() => {
        const updates = { ...pendingSyncUpdates };
        pendingSyncUpdates = {};

        chrome.storage.sync.set(updates, () => {
            if (chrome.runtime.lastError) {
                console.warn('[FullPiP] Sync migration failed:', chrome.runtime.lastError.message);
                pendingSyncUpdates = { ...pendingSyncUpdates, ...updates };
            }
        });
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

async function resetSection(section) {
    const defaults = SECTION_DEFAULTS[section];
    if (!defaults) return;

    const settingsToReset = Object.entries(defaults);
    const updates = {};

    settingsToReset.forEach(([key, value]) => {
        updates[key] = value;
        const el = els.inputs[key];
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = value;
            } else {
                el.value = value;
            }
        }
    });

    // Clear pending sync queue for these keys
    settingsToReset.forEach(([key]) => {
        delete pendingSyncUpdates[key];
    });

    chrome.storage.local.set(updates, () => {
        chrome.storage.sync.set(updates, () => {
            showToast(`${section.charAt(0).toUpperCase() + section.slice(1)} settings reset`, 'success', 1500);
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
        version: '3.0.0',
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
    const cacheDuration = parseInt(settings[KEYS.CACHE_DURATION]) || 15000;

    // Check cache validity
    if (!forceRefresh && useCache && mediaCache.data && mediaCache.tabId) {
        const age = Date.now() - mediaCache.timestamp;
        if (age < cacheDuration) {
            // Validate cache by checking if tab is still valid
            try {
                const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (currentTab?.id === mediaCache.tabId) {
                    renderMediaList(mediaCache.data, container, mediaCache.tabId);
                    return;
                }
            } catch (e) {
                // Tab no longer exists, invalidate cache
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
                const result = await sendTabMessageSafe(tabId, {
                    action: "controlMedia",
                    id: media.pipId,
                    command: "pip"
                }, { frameId: media.frameId });
                
                if (result?.success) {
                    if (settings[KEYS.SHOW_NOTIFICATIONS]) {
                        showToast('Opening PiP', 'success', 1000);
                    }
                } else {
                    showToast('Failed to open PiP', 'error', 1500);
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
// PIPIP WINDOW COUNT UPDATE
// ============================================================================
async function updatePipCount() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getPipCount" });
        const count = response?.count || 0;
        els.pipCount.textContent = count;
        
        // Update status bar appearance
        if (count > 0) {
            els.pipStatusBar.classList.add('active');
        } else {
            els.pipStatusBar.classList.remove('active');
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
    
    // Close all PiP button
    els.closeAllBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.sendMessage(tab.id, { action: "closeAllPip" });
                await updatePipCount();
                const settings = await loadSettings();
                if (settings[KEYS.SHOW_NOTIFICATIONS]) {
                    showToast('All PiP windows closed', 'success');
                }
            }
        } catch (e) {
            showToast('No PiP windows to close', 'info');
        }
    });
    
    // Reset section buttons
    document.querySelectorAll('.reset-section-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            if (section) resetSection(section);
        });
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

    // Listen for live sync updates (with cleanup on popup close)
    const messageListener = (msg) => {
        if (msg.action === 'liveSyncUpdate') {
            // Refresh media list to show updated thumbnail
            if (mediaCache.data) {
                const updated = mediaCache.data.find(m => m.pipId === msg.pipId);
                if (updated) {
                    refreshMediaList(true);
                }
            }
        }
        return true;
    };
    
    chrome.runtime.onMessage.addListener(messageListener);
    
    // Cleanup listener when popup closes
    window.addEventListener('unload', () => {
        chrome.runtime.onMessage.removeListener(messageListener);
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
})();
