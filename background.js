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
        VIDEO: "fullpip-video",
        IMAGE: "fullpip-image",
        PICKER: "fullpip-picker",
        VIDEO_MONITOR_1: "fullpip-video-monitor-1",
        VIDEO_MONITOR_2: "fullpip-video-monitor-2",
        VIDEO_MONITOR_3: "fullpip-video-monitor-3",
    },
    CONTENT_SCRIPT_READY: new Set(), // Track tabs with ready content scripts
    RETRY_DELAY_MS: 100,  // Optimized from 500ms for faster response
    MAX_RETRIES: 2        // Optimized from 3 for faster failure
};

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
// CONTEXT MENUS SETUP
// ============================================================================
async function setupContextMenus() {
    // MV3: Use Promise-based removeAll, then create menus synchronously
    try {
        await chrome.contextMenus.removeAll();

        chrome.contextMenus.create({
            id: CONFIG.MENUS.VIDEO,
            title: "FullPiP: Pop Video",
            contexts: ["video"]
        });

        chrome.contextMenus.create({
            id: CONFIG.MENUS.IMAGE,
            title: "FullPiP: Pop Live Image",
            contexts: ["image"]
        });

        // Multi-screen submenu for video
        const displays = await getDisplays();
        if (displays.length > 1) {
            chrome.contextMenus.create({
                id: "fullpip-video-monitors",
                title: "FullPiP: Pop Video on...",
                contexts: ["video"],
            });

            displays.forEach((display, idx) => {
                chrome.contextMenus.create({
                    id: CONFIG.MENUS[`VIDEO_MONITOR_${idx + 1}`] || `fullpip-video-monitor-${idx + 1}`,
                    title: `${display.name || `Monitor ${idx + 1}`}`,
                    contexts: ["video"],
                    parentId: "fullpip-video-monitors",
                });
            });
        }

        chrome.contextMenus.create({
            id: CONFIG.MENUS.PICKER,
            title: "FullPiP: Picker Mode",
            contexts: ["page", "selection"]
        });

        console.log('[FullPiP] Context menus created successfully');
    } catch (e) {
        console.error('[FullPiP] Failed to create context menus:', e);
    }
}

// Setup context menus immediately when service worker starts
setupContextMenus();

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
            dispatchToContent(tab.id, "contextMenuTrigger", {
                srcUrl: info.srcUrl,
                type: 'video'
            });
        }
        return;
    }

    switch (info.menuItemId) {
        case CONFIG.MENUS.VIDEO:
            // Use hybrid factory via content script
            dispatchToContent(tab.id, "contextMenuTrigger", {
                srcUrl: info.srcUrl,
                type: 'video'
            });
            break;

        case CONFIG.MENUS.IMAGE:
            dispatchToContent(tab.id, "contextMenuTrigger", {
                srcUrl: info.srcUrl,
                type: 'image'
            });
            break;

        case CONFIG.MENUS.PICKER:
            dispatchToContent(tab.id, "togglePickerMode", {});
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
            case "toggle-pip":
                dispatchToContent(tabId, "shortcutTrigger", {});
                break;
                
            case "toggle-picker":
                dispatchToContent(tabId, "togglePickerMode", {});
                break;
                
            case "close-all-pip":
                dispatchToContent(tabId, "closeAllPip", {});
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
            return new Promise(resolve => {
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
                    files: ['content.js']
                });
                // Wait a bit for script to initialize
                await new Promise(resolve => setTimeout(resolve, 200));
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
});

// Clean up when tabs are updated (navigated)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        // Content script will be re-injected automatically by manifest
        // Just clear our ready state
        CONFIG.CONTENT_SCRIPT_READY.delete(tabId);
    }
});

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
        iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/></svg>',
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
    if (cachedDisplays.length > 0 && (now - displaysCacheTime) < DISPLAYS_CACHE_DURATION) {
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
            screenId: d.id,
        }));
        displaysCacheTime = now;
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
            sourceTabId: tabId,
        });

        if (result.success) {
            console.log(`[FullPiP] Video popup created on ${display.name}: ${videoUrl}`);
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
        sourceTabId,
    });
}

// ============================================================================
// UNIFIED MESSAGE HANDLER
// ============================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // ── Content script coordination ─────────────────────────────────────────
    if (msg.action === "contentScriptReady" && sender.tab?.id) {
        CONFIG.CONTENT_SCRIPT_READY.add(sender.tab.id);
        sendResponse({ status: 'acknowledged' });
        return true;
    }

    if (msg.action === "tabClosed" && sender.tab?.id) {
        CONFIG.CONTENT_SCRIPT_READY.delete(sender.tab.id);
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
            sourceTabId: sender.tab?.id,
        }).then((result) => {
            sendResponse(result);
        }).catch((err) => {
            sendResponse({
                success: false,
                pipId: msg.pipId,
                method: 'popup',
                error: err?.message || 'Popup creation failed',
            });
        });
        return true; // Async response
    }

    // Close a specific popup PiP window (delegated from content script)
    if (msg.action === 'closePopupPip') {
        PiPFactory.closePopup(msg.windowId).then((success) => {
            sendResponse({ success });
        }).catch((err) => {
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
            sourceTabId: sender.tab?.id,
        }).then(sendResponse).catch((err) => {
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
        PiPFactory.closeAllPopups().then((count) => {
            sendResponse({ success: true, closed: count });
        }).catch((err) => {
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
        PiPFactory.closeAllPip().then((result) => {
            sendResponse({ success: true, ...result });
        }).catch((err) => {
            sendResponse({ success: false, error: err?.message || 'Close all failed' });
        });
        return true;
    }

    // Get available displays
    if (msg.action === 'getDisplays') {
        getDisplays().then((displays) => {
            sendResponse({ success: true, displays });
        }).catch((err) => {
            sendResponse({ success: false, displays: [], error: err?.message || 'Failed to get displays' });
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
