/**
 * @file background.js
 * @author krittaphato3
 * @desc Service worker with multi-PiP support, hybrid native/popup factory integration,
 *       content script coordination, and cross-tab native PiP state tracking.
 */

// Import PiPFactory (will be loaded via manifest content_scripts injection)
// For service worker context, we include it directly
importScripts('lib/pipFactory.js');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  MENUS: {
    VIDEO: 'fullpip-video',
    IMAGE: 'fullpip-image',
    PICKER: 'fullpip-picker',
    VIDEO_MONITOR_1: 'fullpip-video-monitor-1',
    VIDEO_MONITOR_2: 'fullpip-video-monitor-2',
    VIDEO_MONITOR_3: 'fullpip-video-monitor-3'
  },
  CONTENT_SCRIPT_READY: new Set(), // Track tabs with ready content scripts
  RETRY_DELAY_MS: 100, // Optimized from 500ms for faster response
  MAX_RETRIES: 2, // Optimized from 3 for faster failure
  INJECT_SETTLE_MS: 200 // Rate-limit/dispatch settle wait after fallback inject (keep 200ms)
};

// SW suspend survival: chrome.storage.local keys for rehydration on restart.
// Mirrors the NativePipStateManager pattern (persist on mutation, rehydrate in init).
const SW_STATE_KEYS = {
  POPUPS: 'fullpip_swPopupWindows',
  OFFSET: 'fullpip_swPopupOffset',
  SOURCES: 'fullpip_swActiveSources',
  READY_TABS: 'fullpip_swReadyTabs',
  DISPLAYS: 'fullpip_swCachedDisplays',
  AUDIBLE: 'fullpip_swAudibleWindows',
  AUDIO_MODE: 'fullpip_audioMode'
};

// ============================================================================
// F2: SINGLE-AUDIO MANAGER
// audioMode: 'mix' (default, no behavior change) | 'solo' (pause others)
//            | 'muteOthers' (mute others, keep playing).
// audibleWindowIds: popup windowIds currently reporting audible playback.
// Persisted to storage.local for SW-restart survival.
// ============================================================================
const AUDIO_MODES = ['mix', 'solo', 'muteOthers'];
let audibleWindowIds = new Set();
let audioMode = 'mix';

function normalizeAudioMode(raw) {
  if (raw === 'mute-others' || raw === 'mute_others' || raw === 'muteOthers') return 'muteOthers';
  if (raw === 'solo') return 'solo';
  return 'mix';
}

async function persistAudioState() {
  try {
    if (!chrome.storage?.local) return;
    await chrome.storage.local.set({
      [SW_STATE_KEYS.AUDIBLE]: Array.from(audibleWindowIds),
      [SW_STATE_KEYS.AUDIO_MODE]: audioMode
    });
  } catch (e) {
    console.debug('[FullPiP] persistAudioState failed:', e?.message || e);
  }
}

async function broadcastToPopups(message, exceptWindowId = null) {
  const factory = _getFactory();
  if (!factory) return 0;
  let sent = 0;
  for (const [windowId, data] of Array.from(factory.popupWindows.entries())) {
    if (exceptWindowId !== null && windowId === exceptWindowId) continue;
    const tabId = data?.tabId;
    if (typeof tabId !== 'number') continue;
    try {
      await chrome.tabs.sendMessage(tabId, message);
      sent++;
    } catch (e) {
      console.debug(`[FullPiP] broadcast to window ${windowId} failed:`, e?.message || e);
    }
  }
  return sent;
}

async function enforceSingleAudio(newWindowId) {
  if (audioMode === 'mix') return { enforced: false, count: 0 };
  const command = audioMode === 'solo' ? 'pause' : 'mute';
  const count = await broadcastToPopups(
    {
      action: 'muteOthers',
      exceptWindowId: newWindowId,
      mode: audioMode,
      command
    },
    newWindowId
  );
  return { enforced: true, count };
}

// P1-13: mutex serializing setupContextMenus so onInstalled/onStartup/SW-start
// cannot interleave removeAll/create sequences.
let _menusSetupInProgress = false;

// Guard so SW init (rehydrate + reconcile + menus) runs exactly once.
let _swInitStarted = false;

// Cache for display info
let cachedDisplays = [];
let displaysCacheTime = 0;
const DISPLAYS_CACHE_DURATION = 60000; // 1 minute

// ============================================================================
// CROSS-TAB NATIVE PIP STATE SYNC
// The primary cleanup is pipWindow.addEventListener('pagehide') in pipFactory.js.
// We do NOT use windows.onRemoved as backup because it fires for ALL Chrome
// windows (tabs, devtools, etc.) and would incorrectly clear native PiP state.
// ============================================================================

// ============================================================================
// SW STATE PERSISTENCE (P0-4)
// Service workers suspend and lose in-memory state: PiPFactory.popupWindows,
// PiPFactory._activeSources, PiPFactory._popupOffsetCounter,
// CONFIG.CONTENT_SCRIPT_READY, cachedDisplays. Persist to chrome.storage.local
// on every mutation and rehydrate in init; then re-query chrome.windows.getAll
// to drop entries whose windows no longer exist.
// ============================================================================
function _getFactory() {
  try {
    return typeof PiPFactory !== 'undefined' ? PiPFactory : null;
  } catch {
    return null;
  }
}

async function persistSwState() {
  try {
    if (!chrome.storage?.local) return;
    const factory = _getFactory();
    const payload = {};
    if (factory) {
      payload[SW_STATE_KEYS.POPUPS] = Array.from(factory.popupWindows.entries());
      payload[SW_STATE_KEYS.OFFSET] = factory._popupOffsetCounter || 0;
      payload[SW_STATE_KEYS.SOURCES] = Array.from(factory._activeSources || []);
    }
    payload[SW_STATE_KEYS.READY_TABS] = Array.from(CONFIG.CONTENT_SCRIPT_READY);
    payload[SW_STATE_KEYS.DISPLAYS] = { items: cachedDisplays, at: displaysCacheTime };
    payload[SW_STATE_KEYS.AUDIBLE] = Array.from(audibleWindowIds);
    payload[SW_STATE_KEYS.AUDIO_MODE] = audioMode;
    await chrome.storage.local.set(payload);
  } catch (e) {
    console.debug('[FullPiP] persistSwState failed:', e?.message || e);
  }
}

async function rehydrateSwState() {
  try {
    if (!chrome.storage?.local) return;
    const keys = Object.values(SW_STATE_KEYS);
    const stored = await chrome.storage.local.get(keys);
    const factory = _getFactory();

    if (factory) {
      const popups = stored[SW_STATE_KEYS.POPUPS];
      if (Array.isArray(popups)) {
        factory.popupWindows.clear();
        for (const [windowId, data] of popups) {
          if (typeof windowId === 'number' && data && typeof data === 'object') {
            factory.popupWindows.set(windowId, data);
          }
        }
      }
      const offset = stored[SW_STATE_KEYS.OFFSET];
      if (typeof offset === 'number' && Number.isFinite(offset) && offset >= 0) {
        factory._popupOffsetCounter = offset;
      }
      const sources = stored[SW_STATE_KEYS.SOURCES];
      if (Array.isArray(sources)) {
        factory._activeSources.clear();
        for (const s of sources) {
          if (typeof s === 'string' && s) factory._activeSources.add(s);
        }
      }
    }

    const readyTabs = stored[SW_STATE_KEYS.READY_TABS];
    if (Array.isArray(readyTabs)) {
      CONFIG.CONTENT_SCRIPT_READY.clear();
      for (const tabId of readyTabs) {
        if (typeof tabId === 'number') CONFIG.CONTENT_SCRIPT_READY.add(tabId);
      }
    }

    const displays = stored[SW_STATE_KEYS.DISPLAYS];
    if (displays && Array.isArray(displays.items)) {
      cachedDisplays = displays.items;
      displaysCacheTime = typeof displays.at === 'number' ? displays.at : 0;
    }

    const audible = stored[SW_STATE_KEYS.AUDIBLE];
    if (Array.isArray(audible)) {
      audibleWindowIds = new Set(audible.filter((id) => typeof id === 'number'));
    }
    const storedMode = stored[SW_STATE_KEYS.AUDIO_MODE];
    if (typeof storedMode === 'string') {
      audioMode = normalizeAudioMode(storedMode);
    }
    console.log('[FullPiP] SW state rehydrated from storage');
  } catch (e) {
    console.debug('[FullPiP] rehydrateSwState failed:', e?.message || e);
  }
}

async function reconcilePopupWindows() {
  try {
    const factory = _getFactory();
    if (!factory || !chrome.windows?.getAll) return;
    const live = await chrome.windows.getAll().catch(() => null);
    if (!Array.isArray(live)) return;
    const liveIds = new Set(live.map((w) => w?.id));
    let pruned = 0;
    for (const windowId of Array.from(factory.popupWindows.keys())) {
      if (!liveIds.has(windowId)) {
        const sourceId = factory._popupWindowSources?.get(windowId);
        if (sourceId) factory._unregisterSource?.(sourceId);
        factory._popupWindowSources?.delete(windowId);
        factory.popupWindows.delete(windowId);
        if (audibleWindowIds.delete(windowId)) pruned++;
        pruned++;
      }
    }
    // Drop audible entries whose windows no longer exist (SW-restart safety).
    for (const windowId of Array.from(audibleWindowIds)) {
      if (!liveIds.has(windowId)) audibleWindowIds.delete(windowId);
    }
    if (pruned > 0) {
      console.log(`[FullPiP] Reconciled popup windows: pruned ${pruned} dead entries`);
      await persistSwState();
    }
  } catch (e) {
    console.debug('[FullPiP] reconcilePopupWindows failed:', e?.message || e);
  }
}

// ============================================================================
// CONTEXT MENUS SETUP (P1-13: serialized with mutex + lastError checks)
// ============================================================================
function _checkLastError(context) {
  try {
    const err = chrome.runtime?.lastError;
    if (err) {
      console.debug(`[FullPiP] Context menus ${context}: ${err.message || err}`);
      return true;
    }
  } catch {}
  return false;
}

function _createMenu(props) {
  return new Promise((resolve) => {
    try {
      chrome.contextMenus.create(props, () => {
        _checkLastError(`create(${props.id})`);
        resolve();
      });
    } catch (e) {
      console.debug(`[FullPiP] Context menu create threw (${props.id}):`, e?.message || e);
      resolve();
    }
  });
}

async function setupContextMenus() {
  // Serialize: concurrent onInstalled/onStartup/SW-start calls collapse.
  if (_menusSetupInProgress) return;
  _menusSetupInProgress = true;
  // MV3: Use Promise-based removeAll, then create menus synchronously
  try {
    await chrome.contextMenus.removeAll();
    _checkLastError('removeAll');

    await _createMenu({
      id: CONFIG.MENUS.VIDEO,
      title: 'FullPiP: Pop Video',
      contexts: ['video']
    });

    await _createMenu({
      id: CONFIG.MENUS.IMAGE,
      title: 'FullPiP: Pop Live Image',
      contexts: ['image']
    });

    // Multi-screen submenu for video
    const displays = await getDisplays();
    if (displays.length > 1) {
      await _createMenu({
        id: 'fullpip-video-monitors',
        title: 'FullPiP: Pop Video on...',
        contexts: ['video']
      });

      for (let idx = 0; idx < displays.length; idx++) {
        const display = displays[idx];
        await _createMenu({
          id: CONFIG.MENUS[`VIDEO_MONITOR_${idx + 1}`] || `fullpip-video-monitor-${idx + 1}`,
          title: `${display.name || `Monitor ${idx + 1}`}`,
          contexts: ['video'],
          parentId: 'fullpip-video-monitors'
        });
      }
    }

    await _createMenu({
      id: CONFIG.MENUS.PICKER,
      title: 'FullPiP: Picker Mode',
      contexts: ['page', 'selection']
    });

    console.log('[FullPiP] Context menus created successfully');
  } catch (e) {
    console.error('[FullPiP] Failed to create context menus:', e);
  } finally {
    _menusSetupInProgress = false;
  }
}

// SW startup: rehydrate persisted state (NativePipStateManager pattern),
// reconcile against live windows, then build menus. Runs exactly once.
async function initServiceWorker() {
  if (_swInitStarted) return;
  _swInitStarted = true;
  try {
    if (typeof NativePipStateManager !== 'undefined' && NativePipStateManager) {
      await NativePipStateManager.ensureInit();
    }
  } catch (e) {
    console.debug('[FullPiP] NativePipStateManager init failed:', e?.message || e);
  }
  await rehydrateSwState();
  await reconcilePopupWindows();
  await setupContextMenus();
}

// Setup context menus immediately when service worker starts
initServiceWorker();

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  // Check if this is a multi-screen menu item
  const monitorMatch = info.menuItemId.match(/fullpip-video-monitor-(\d+)/);
  if (monitorMatch) {
    const monitorIdx = parseInt(monitorMatch[1], 10);
    const displays = await getDisplays();
    const targetDisplay = displays[monitorIdx - 1];

    if (targetDisplay) {
      // Create popup PiP on specific monitor
      await createVideoPopupOnMonitor(tab.id, info.srcUrl, targetDisplay);
    } else {
      // Fallback to default
      dispatchToContent(tab.id, 'contextMenuTrigger', {
        srcUrl: info.srcUrl,
        type: 'video'
      });
    }
    return;
  }

  switch (info.menuItemId) {
    case CONFIG.MENUS.VIDEO:
      // Use hybrid factory via content script
      dispatchToContent(tab.id, 'contextMenuTrigger', {
        srcUrl: info.srcUrl,
        type: 'video'
      });
      break;

    case CONFIG.MENUS.IMAGE:
      dispatchToContent(tab.id, 'contextMenuTrigger', {
        srcUrl: info.srcUrl,
        type: 'image'
      });
      break;

    case CONFIG.MENUS.PICKER:
      dispatchToContent(tab.id, 'togglePickerMode', {});
      break;
  }
});

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    const tabId = tabs[0].id;

    switch (command) {
      case 'toggle-pip':
        dispatchToContent(tabId, 'shortcutTrigger', {});
        break;

      case 'toggle-picker':
        dispatchToContent(tabId, 'togglePickerMode', {});
        break;

      case 'close-all-pip':
        dispatchToContent(tabId, 'closeAllPip', {});
        break;
    }
  });
});

// ============================================================================
// MESSAGE DISPATCH WITH RETRY
// ============================================================================
async function dispatchToContent(tabId, action, data, retryCount = 0) {
  const message = { action, ...data };

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return { success: true };
  } catch (err) {
    // Tab was destroyed — no point retrying
    if (err.message?.includes('No tab with id')) {
      return { success: false, error: 'Tab no longer exists' };
    }

    // Content script might not be ready yet, retry
    if (retryCount < CONFIG.MAX_RETRIES && err.message?.includes('Could not establish')) {
      return new Promise((resolve) => {
        setTimeout(async () => {
          const result = await dispatchToContent(tabId, action, data, retryCount + 1);
          resolve(result);
        }, CONFIG.RETRY_DELAY_MS);
      });
    }

    // Final retry: inject content script and try again
    if (retryCount === CONFIG.MAX_RETRIES) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          // P0-5: content.js depends on PiPFactory globals; inject the
          // factory first (manifest order: lib/pipFactory.js, content.js).
          files: ['lib/pipFactory.js', 'content.js']
        });
        // Wait a bit for script to initialize (keep 200ms rate-limit)
        await new Promise((resolve) => setTimeout(resolve, CONFIG.INJECT_SETTLE_MS));
        await chrome.tabs.sendMessage(tabId, message);
        return { success: true, injected: true };
      } catch (injectErr) {
        console.debug(`[FullPiP] Failed to inject/send: ${injectErr.message}`);
        return {
          success: false,
          error: 'Content script unavailable. Try refreshing the page.'
        };
      }
    }
  }
}

// ============================================================================
// CONTENT SCRIPT COORDINATION
// ============================================================================
// Note: Message handling moved to unified listener below

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  CONFIG.CONTENT_SCRIPT_READY.delete(tabId);
  persistSwState();
});

// Clean up when tabs are updated (navigated)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
  if (changeInfo.status === 'loading') {
    // Content script will be re-injected automatically by manifest
    // Just clear our ready state
    if (CONFIG.CONTENT_SCRIPT_READY.delete(tabId)) {
      persistSwState();
    }
  }
});

// Track user-closed popup windows and persist (covers X-button closes that
// bypass our closePopup path). PiPFactory.init() owns dedup cleanup; this
// hook only ensures storage reflects the removal.
if (typeof chrome !== 'undefined' && chrome.windows?.onRemoved) {
  chrome.windows.onRemoved.addListener((windowId) => {
    if (audibleWindowIds.delete(windowId)) {
      persistAudioState();
    }
    const factory = _getFactory();
    if (factory && factory.popupWindows.has(windowId)) {
      persistSwState();
    }
  });
}

// ============================================================================
// KEEPALIVE (P2-16)
// content.js opens a 'fullpip-keepalive' port while PiP windows are active and
// disconnects on pagehide. This is an intentional no-op receiver: holding the
// port open keeps the SW alive during active PiP and stops connect/disconnect
// churn. Disconnect is clean — no work is queued on the port.
// ============================================================================
if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== 'fullpip-keepalive') return;
    try {
      port.onMessage.addListener(() => {});
    } catch {}
    try {
      port.onDisconnect.addListener(() => {
        console.debug('[FullPiP] keepalive port disconnected');
      });
    } catch {}
  });
}

// ============================================================================
// INSTALLATION/UPDATE HANDLER
// ============================================================================
chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenus();

  if (details.reason === 'install') {
    // First install - show notification
    showNotification(
      'FullPiP Installed',
      'Right-click any video or image to use FullPiP. Press Alt+P for quick access!',
      'success'
    );
  } else if (details.reason === 'update') {
    // Update - notify about new features
    console.log(`[FullPiP] Updated to version ${details.version || 'latest'}`);
  }
});

// ============================================================================
// NOTIFICATIONS (Optional - for future use)
// ============================================================================
function showNotification(title, message, type = 'info') {
  // Check if notifications permission is available
  if (!chrome.notifications) return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'logo.svg',
    title: title,
    message: message,
    priority: type === 'error' ? 2 : 0
  });
}

// ============================================================================
// CONTEXT MENU RE-INSTALLATION
// ============================================================================
// Re-install context menus if they get removed
chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

// ============================================================================
// MULTI-MONITOR SUPPORT
// ============================================================================

/**
 * Get display info (cached). Requires "system.display" permission.
 *
 * @returns {Promise<Array<Object>>}
 */
async function getDisplays() {
  const now = Date.now();
  if (cachedDisplays.length > 0 && now - displaysCacheTime < DISPLAYS_CACHE_DURATION) {
    return cachedDisplays;
  }

  try {
    if (!chrome.system?.display) {
      console.warn('[FullPiP] chrome.system.display not available');
      return [];
    }

    const displays = await chrome.system.display.getInfo();
    cachedDisplays = displays.map((d) => ({
      id: d.id,
      name: d.name || `Monitor ${d.id}`,
      width: d.bounds.width,
      height: d.bounds.height,
      left: d.bounds.left,
      top: d.bounds.top,
      isPrimary: d.isPrimary || false,
      screenId: d.id
    }));
    displaysCacheTime = now;
    persistSwState();
    return cachedDisplays;
  } catch (e) {
    console.error('[FullPiP] Failed to get display info:', e);
    return [];
  }
}

/**
 * Create a popup PiP window on a specific monitor.
 *
 * @param {number} tabId - Tab that triggered this
 * @param {string} videoUrl - URL of the video
 * @param {Object} display - Display info from getDisplays()
 */
async function createVideoPopupOnMonitor(tabId, videoUrl, display) {
  if (!videoUrl) {
    console.warn('[FullPiP] No video URL provided for popup');
    return;
  }

  try {
    const result = await PiPFactory.createPopup({
      url: videoUrl,
      width: 480,
      height: 270,
      screenId: display.screenId,
      sourceTabId: tabId
    });

    if (result.success) {
      console.log(`[FullPiP] Video popup created on ${display.name}: ${videoUrl}`);
      persistSwState();
    } else {
      console.error('[FullPiP] Failed to create video popup:', result.error);
    }
  } catch (e) {
    console.error('[FullPiP] Error creating popup:', e);
  }
}

/**
 * Handle hybrid PiP requests from content scripts.
 * This allows content scripts to delegate to the background's PiPFactory.
 */
async function handleHybridPipRequest(params) {
  const { videoUrl, width, height, screenId, left, top, sourceTabId } = params;

  if (!videoUrl) {
    return { success: false, error: 'No video URL provided' };
  }

  return await PiPFactory.createPopup({
    url: videoUrl,
    width: width || 480,
    height: height || 270,
    screenId,
    left,
    top,
    sourceTabId
  });
}

// ============================================================================
// UNIFIED MESSAGE HANDLER
// ============================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ── Content script coordination ─────────────────────────────────────────
  if (msg.action === 'contentScriptReady' && sender.tab?.id) {
    CONFIG.CONTENT_SCRIPT_READY.add(sender.tab.id);
    persistSwState();
    sendResponse({ status: 'acknowledged' });
    return true;
  }

  if (msg.action === 'tabClosed' && sender.tab?.id) {
    if (CONFIG.CONTENT_SCRIPT_READY.delete(sender.tab.id)) {
      persistSwState();
    }
    return true;
  }

  // ── New: Direct popup creation from content script ─────────────────────
  // PiPFactory in content script context delegates here because
  // content scripts don't have chrome.windows permission.
  if (msg.action === 'createPopupPip') {
    PiPFactory.createPopup({
      url: msg.url,
      pipId: msg.pipId,
      width: msg.width,
      height: msg.height,
      screenId: msg.screenId,
      left: msg.left,
      top: msg.top,
      sourceTabId: sender.tab?.id
    })
      .then((result) => {
        persistSwState();
        sendResponse(result);
      })
      .catch((err) => {
        sendResponse({
          success: false,
          pipId: msg.pipId,
          method: 'popup',
          error: err?.message || 'Popup creation failed'
        });
      });
    return true; // Async response
  }

  // Close a specific popup PiP window (delegated from content script)
  if (msg.action === 'closePopupPip') {
    PiPFactory.closePopup(msg.windowId)
      .then((success) => {
        persistSwState();
        sendResponse({ success });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Close failed' });
      });
    return true;
  }

  // Handle hybrid PiP factory requests from content scripts
  if (msg.action === 'hybridPipRequest') {
    handleHybridPipRequest({
      videoUrl: msg.videoUrl,
      width: msg.width,
      height: msg.height,
      screenId: msg.screenId,
      left: msg.left,
      top: msg.top,
      sourceTabId: sender.tab?.id
    })
      .then((result) => {
        persistSwState();
        sendResponse(result);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Hybrid PiP failed' });
      });
    return true; // Async response
  }

  // Get popup PiP count
  if (msg.action === 'getPopupPipCount') {
    sendResponse({ count: PiPFactory.getActivePopupCount() });
    return true;
  }

  // Close all popup PiP windows
  if (msg.action === 'closeAllPopupPip') {
    PiPFactory.closeAllPopups()
      .then((count) => {
        persistSwState();
        sendResponse({ success: true, closed: count });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Close all failed' });
      });
    return true;
  }

  // Get full PiP state (native + popup)
  if (msg.action === 'getPipState') {
    sendResponse(PiPFactory.getPipState());
    return true;
  }

  // Close ALL PiP windows (native + popup)
  if (msg.action === 'closeAllPip') {
    PiPFactory.closeAllPip()
      .then((result) => {
        persistSwState();
        sendResponse({ success: true, ...result });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Close all failed' });
      });
    return true;
  }

  // Get available displays
  if (msg.action === 'getDisplays') {
    getDisplays()
      .then((displays) => {
        sendResponse({ success: true, displays });
      })
      .catch((err) => {
        sendResponse({
          success: false,
          displays: [],
          error: err?.message || 'Failed to get displays'
        });
      });
    return true;
  }

  // Clear cross-tab native PiP state (called from content script)
  if (msg.action === 'clearNativePipState') {
    NativePipStateManager.clearState()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Failed to clear state' });
      });
    return true;
  }

  // ── F2: Single-audio manager (backward compatible, default Mix = no-op) ──
  if (msg.action === 'audioModeChanged') {
    audioMode = normalizeAudioMode(msg.mode);
    persistAudioState();
    sendResponse({ success: true, mode: audioMode });
    return true;
  }

  if (msg.action === 'reportAudible') {
    // Resolve windowId: explicit field preferred; fall back to sender tab's window.
    let windowId = typeof msg.windowId === 'number' ? msg.windowId : null;
    if (windowId === null && sender?.tab?.windowId !== undefined) {
      windowId = sender.tab.windowId;
    }
    const audible = msg.audible !== false;
    if (windowId !== null) {
      if (audible) {
        audibleWindowIds.add(windowId);
        persistAudioState();
        // On new audible playback, mute/pause others (Mix = no-op).
        if (audioMode !== 'mix') {
          enforceSingleAudio(windowId)
            .then((r) => {
              sendResponse({ success: true, mode: audioMode, ...r });
            })
            .catch((err) => {
              sendResponse({
                success: true,
                mode: audioMode,
                error: err?.message || 'Enforce failed'
              });
            });
          return true;
        }
      } else {
        if (audibleWindowIds.delete(windowId)) persistAudioState();
      }
    }
    sendResponse({ success: true, mode: audioMode });
    return true;
  }

  if (msg.action === 'muteOthers') {
    const except = typeof msg.exceptWindowId === 'number' ? msg.exceptWindowId : null;
    enforceSingleAudio(except)
      .then((r) => {
        sendResponse({ success: true, mode: audioMode, ...r });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Mute others failed' });
      });
    return true;
  }
});

// Export for potential use in devtools (only in development)
if (typeof globalThis !== 'undefined' && chrome.runtime.getManifest().version.includes('dev')) {
  globalThis.dispatchToContent = dispatchToContent;
  globalThis.getDisplays = getDisplays;
  globalThis.PiPFactory = PiPFactory;
}
