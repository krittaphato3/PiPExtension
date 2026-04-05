/**
 * @file background.js
 * @author krittaphato3
 * @desc Service worker with multi-PiP support, content script coordination, and notification handling.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    MENUS: {
        VIDEO: "fullpip-video",
        IMAGE: "fullpip-image",
        PICKER: "fullpip-picker"
    },
    CONTENT_SCRIPT_READY: new Set(), // Track tabs with ready content scripts
    RETRY_DELAY_MS: 100,  // Optimized from 500ms for faster response
    MAX_RETRIES: 2        // Optimized from 3 for faster failure
};

// ============================================================================
// CONTEXT MENUS SETUP
// ============================================================================
function setupContextMenus() {
    // Remove all first to avoid duplicates
    chrome.contextMenus.removeAll(() => {
        // Create menus with proper error handling
        try {
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

            chrome.contextMenus.create({
                id: CONFIG.MENUS.PICKER,
                title: "FullPiP: Picker Mode",
                contexts: ["page", "selection"]
            });
            
            console.log('[FullPiP] Context menus created successfully');
        } catch (e) {
            console.error('[FullPiP] Failed to create context menus:', e);
        }
    });
}

// Setup context menus immediately when service worker starts
setupContextMenus();

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    switch (info.menuItemId) {
        case CONFIG.MENUS.VIDEO:
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
        // Content script might not be ready yet, retry
        if (retryCount < CONFIG.MAX_RETRIES && err.message.includes('Could not establish')) {
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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Track content script readiness
    if (msg.action === "contentScriptReady" && sender.tab?.id) {
        CONFIG.CONTENT_SCRIPT_READY.add(sender.tab.id);
        sendResponse({ status: 'acknowledged' });
    }
    
    // Handle tab removal
    if (msg.action === "tabClosed" && sender.tab?.id) {
        CONFIG.CONTENT_SCRIPT_READY.delete(sender.tab.id);
    }
    
    return true;
});

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
// SERVICE WORKER KEEP-ALIVE (Port-based Connection)
// ============================================================================
// Persistent connections from content scripts keep the service worker alive
// This is the native MV3 approach instead of polling chrome.storage
const activePorts = new Set();

function startKeepAlive() {
    // No longer needed - ports keep SW alive naturally
    stopKeepAlive();
}

function stopKeepAlive() {
    // Ports manage their own lifecycle
}

// Handle persistent connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'fullpip-keepalive') return;

    activePorts.add(port);
    console.debug(`[FullPiP] Port connected. Active ports: ${activePorts.size}`);

    // Keep port alive and respond to pings
    port.onMessage.addListener((msg) => {
        if (msg.action === 'ping') {
            port.postMessage({ action: 'pong', activePipCount: State?.pipCount || 0 });
        }
    });

    // Clean up when port disconnects
    port.onDisconnect.addListener(() => {
        activePorts.delete(port);
        console.debug(`[FullPiP] Port disconnected. Active ports: ${activePorts.size}`);
    });
});

// ============================================================================
// UTILITY: GET ACTIVE TAB INFO
// ============================================================================
function getActiveTabInfo() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0] || null);
        });
    });
}

// Export for potential use in devtools
if (typeof global !== 'undefined') {
    global.dispatchToContent = dispatchToContent;
    global.getActiveTabInfo = getActiveTabInfo;
}
