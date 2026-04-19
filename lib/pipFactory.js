/**
 * @file pipFactory.js
 * @desc Hybrid PiP Factory - intelligently chooses between native Document PiP
 *       and Chrome Popup windows for multi-window/multi-monitor support.
 *
 * Architecture:
 *   1. Check cross-tab state: is a native `documentPictureInPicture` window already open?
 *   2. IF NO native PiP exists → Use `documentPictureInPicture.requestWindow()` (best UX)
 *   3. IF YES (a native PiP is already open) → Fallback to
 *      `chrome.windows.create({type: 'popup'})` for additional independent windows
 *
 * Cross-Tab State Sync:
 *   - `documentPictureInPicture.window` is tab-scoped, so we track native PiP state
 *     via `chrome.storage.local` so the extension knows if ANY tab has a native PiP open.
 *   - State is set to `true` on successful `requestWindow()`
 *   - State is cleared on `pipWindow.addEventListener('pagehide')`
 *   - Backup: `chrome.windows.onRemoved` listener in background.js clears stale state
 *
 * Usage (from content script):
 *   const result = await PiPFactory.create({ videoElement, width, height });
 *
 * Usage (from background/service worker):
 *   const result = await PiPFactory.createPopup({ url, width, height, screenId });
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
const PiPFactoryConfig = {
  /** Minimum popup window dimensions */
  MIN_WIDTH: 150,
  MIN_HEIGHT: 150,

  /** Default dimensions when not specified */
  DEFAULT_WIDTH: 480,
  DEFAULT_HEIGHT: 270,

  /** Player proxy path (relative to extension root) */
  PLAYER_PATH: 'player.html',

  /** File extensions that should use the player proxy */
  RAW_VIDEO_EXTENSIONS: ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi'],

  /** Chrome version that supports screenId in windows.create */
  CHROME_VERSION_SCREEN_ID: 102,

  /** Maximum number of popup PiP windows */
  MAX_POPUP_WINDOWS: 10,

  /** Video sync interval (ms) for popup windows */
  VIDEO_SYNC_INTERVAL_MS: 250,

  /** Timeout for native PiP request (ms) */
  NATIVE_PIP_TIMEOUT_MS: 3000,

  /** Auto-increment offset for popup windows (pixels) */
  POPUP_OFFSET_STEP: 30,

  /** Key used in chrome.storage.local for cross-tab native PiP state */
  STORAGE_KEY_NATIVE_PIP: 'fullpip_nativePipState',
};

// ============================================================================
// CROSS-TAB STATE MANAGER
// Tracks whether a native documentPictureInPicture window is open in ANY tab.
// Uses chrome.storage.local for persistence across tabs & sessions.
// Lazy-initialized on first access so it works in both content script and
// service worker contexts.
// ============================================================================
const NativePipStateManager = {
  /** @type {boolean} Whether a native PiP is known to be open across all tabs */
  _isNativePipOpen: false,

  /** @type {string|null} The pipId of the active native PiP */
  _activePipId: null,

  /** @type {Promise|null} Pending init promise to prevent double-init */
  _initPromise: null,

  /** @type {boolean} Has init been triggered? */
  _initialized: false,

  /**
   * Trigger initialization (lazy, single-call).
   * Returns a promise that resolves when state is loaded from storage.
   *
   * @returns {Promise<void>}
   */
  ensureInit() {
    if (this._initialized) return Promise.resolve();

    if (!this._initPromise) {
      this._initPromise = this._doInit();
    }
    return this._initPromise;
  },

  /** Internal init implementation. */
  async _doInit() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(PiPFactoryConfig.STORAGE_KEY_NATIVE_PIP);
        const state = result[PiPFactoryConfig.STORAGE_KEY_NATIVE_PIP];
        if (state) {
          // ── STALE STATE DETECTION ──────────────────────────────────────
          // State older than 5 minutes is considered stale (browser restart,
          // tab closed without cleanup, etc.)
          const FIVE_MINUTES_MS = 5 * 60 * 1000;
          const isStale = !state.timestamp || (Date.now() - state.timestamp) > FIVE_MINUTES_MS;

          if (isStale) {
            console.log('[PiPFactory:StateManager] Stale state detected (timestamp too old or missing), clearing');
            await this.clearState();
          } else {
            this._isNativePipOpen = state.isOpen || false;
            this._activePipId = state.pipId || null;

            // Additional stale check: if state says open but has no pipId, clear it
            if (this._isNativePipOpen && !this._activePipId) {
              console.log('[PiPFactory:StateManager] State says open but no pipId, clearing');
              await this.clearState();
            }
          }
        }
      }
    } catch (e) {
      console.warn('[PiPFactory:StateManager] Failed to load state:', e.message);
      this._isNativePipOpen = false;
      this._activePipId = null;
    }

    this._initialized = true;
    console.log(`[PiPFactory:StateManager] Initialized - native PiP ${this._isNativePipOpen ? 'OPEN' : 'closed'}`, this._activePipId);
  },

  /**
   * Initialize the state manager by reading from storage.
   * Called by PiPFactory.init() in service worker context.
   * In content scripts, initialization happens lazily on first access.
   */
  async init() {
    return this.ensureInit();
  },

  /**
   * Set the native PiP state to "open".
   * Called after a successful requestWindow().
   *
   * @param {string} pipId - Unique identifier for this PiP window
   */
  async setOpened(pipId) {
    this._isNativePipOpen = true;
    this._activePipId = pipId;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({
          [PiPFactoryConfig.STORAGE_KEY_NATIVE_PIP]: {
            isOpen: true,
            pipId,
            timestamp: Date.now(),
          },
        });
      }
    } catch (e) {
      console.warn('[PiPFactory:StateManager] Failed to save opened state:', e.message);
    }

    console.log(`[PiPFactory:StateManager] Native PiP opened: ${pipId}`);
  },

  /**
   * Clear the native PiP state (set to "closed").
   * Called on pagehide, windows.onRemoved, or manually.
   */
  async clearState() {
    this._isNativePipOpen = false;
    this._activePipId = null;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.remove(PiPFactoryConfig.STORAGE_KEY_NATIVE_PIP);
      }
    } catch (e) {
      console.warn('[PiPFactory:StateManager] Failed to clear state:', e.message);
    }

    console.log('[PiPFactory:StateManager] Native PiP state cleared');
  },

  /**
   * Check if a native PiP is currently open (cross-tab aware).
   *
   * @returns {boolean}
   */
  isNativePipOpen() {
    return this._isNativePipOpen;
  },

  /**
   * Get the active native PiP ID, if any.
   *
   * @returns {string|null}
   */
  getActivePipId() {
    return this._activePipId;
  },
};

// ============================================================================
// STATE - Track all popup PiP windows AND active video sources (dedup)
// ============================================================================
const PiPFactory = {
  /** Map of popup windowId -> { tabId, sourceTabId, videoUrl, createdAt } */
  popupWindows: new Map(),

  /** Counter for generating unique PiP IDs */
  _pipIdCounter: 0,

  /** Interval IDs for video sync timers */
  _syncIntervals: new Map(),

  /** Popup window auto-increment offset (for grid/offset layout) */
  _popupOffsetCounter: 0,

  /** Set of active video source identifiers to prevent duplicate PiP */
  _activeSources: new Set(),

  /** Map of popup windowId -> sourceId for cleanup on close */
  _popupWindowSources: new Map(),

  // ==========================================================================
  // PUBLIC API - Main entry point
  // ==========================================================================

  /**
   * Create a PiP window using the best available method.
   *
   * Flow:
   *   0. Dedup check: has this video already been opened as PiP?
   *   1. Check cross-tab state: is a native PiP already open?
   *   2. If NO → try native `documentPictureInPicture.requestWindow()`
   *   3. If YES → fallback to popup to avoid replacing the existing native PiP
   *
   * @param {Object} options
   * @param {HTMLVideoElement} [options.videoElement] - The video element to use (for native PiP)
   * @param {string} [options.videoUrl] - Direct URL to the video (for popup)
   * @param {string} [options.pageUrl] - URL of the page containing the video
   * @param {number} [options.width] - Window width
   * @param {number} [options.height] - Window height
   * @param {number} [options.screenId] - Target monitor screen ID (Chrome 102+)
   * @param {number} [options.left] - X position on screen
   * @param {number} [options.top] - Y position on screen
   * @param {boolean} [options.forcePopup] - Force popup mode even if native is available
   * @param {boolean} [options.forceNative] - Force native mode, fail if unavailable
   * @param {string} [options.pipId] - Custom PiP ID (auto-generated if not provided)
   * @returns {Promise<Object>} { success, pipId, method, window?, windowId?, videoElement?, error? }
   */
  async create(options = {}) {
    const {
      videoElement,
      videoUrl,
      pageUrl,
      width,
      height,
      screenId,
      left,
      top,
      forcePopup = false,
      forceNative = false,
      pipId = null,
      mode = 'hybrid', // PiP mode: 'api', 'popup', or 'hybrid'
    } = options;

    console.log('[PiPFactory] ════════════════════════════════════════');
    console.log('[PiPFactory] create() called with mode:', mode.toUpperCase());
    console.log('[PiPFactory] videoElement:', videoElement ? videoElement.tagName : 'null');
    console.log('[PiPFactory] forcePopup:', forcePopup);
    console.log('[PiPFactory] forceNative:', forceNative);
    console.log('[PiPFactory] ════════════════════════════════════════');

    const pipIdFinal = pipId || `fullpip-${++this._pipIdCounter}-${Date.now()}`;

    // ── Step 0: Deduplication check ──────────────────────────────────────
    const sourceId = this._getSourceId(videoElement);
    if (sourceId && this._activeSources.has(sourceId)) {
      console.log(`[PiPFactory] Video already active as PiP: ${sourceId}`);
      return {
        success: false,
        pipId: pipIdFinal,
        method: 'dedup',
        error: 'This video is already open in PiP',
      };
    }

    // ── Step 0.5: Ensure cross-tab state is loaded (lazy init) ───────────
    await NativePipStateManager.ensureInit();

    // ── Step 1: Determine routing ──────────────────────────────────────────
    console.log('[PiPFactory] Calling _shouldUsePopup() with mode:', mode);
    const shouldUsePopup = this._shouldUsePopup({
      videoElement,
      videoUrl,
      screenId,
      left,
      top,
      forcePopup,
      forceNative,
      mode, // Pass mode for routing decision
    });

    console.log('[PiPFactory] _shouldUsePopup() returned:', shouldUsePopup);

    // ── Step 2: Route to appropriate method ────────────────────────────────
    if (!shouldUsePopup && videoElement) {
      // Native PiP path
      console.log('[PiPFactory] → Taking NATIVE PiP path');
      const result = await this._createNativePip(videoElement, {
        pipId: pipIdFinal,
        width,
        height,
      });

      console.log('[PiPFactory] Native PiP result:', result.success ? 'SUCCESS' : 'FAILED', result.error || '');

      // If native fails, check if we should fallback to popup
      if (!result.success) {
        // ✅ FIX: Respect mode setting - don't fallback in API mode
        if (mode === 'api' || forceNative) {
          console.log('[PiPFactory] ❌ Native PiP failed and mode is API/forceNative → NOT falling back to popup');
          console.log('[PiPFactory] Returning error:', result.error);
          return result; // Return the error
        }

        // In popup or hybrid mode, fallback to popup
        console.log('[PiPFactory] → Native failed, falling back to POPUP path');
        // Generate fresh pipId for the fallback path
        const fallbackPipId = `fullpip-${++this._pipIdCounter}-${Date.now()}`;
        return await this._createPopupPip({
          videoElement,
          videoUrl,
          pageUrl,
          pipId: fallbackPipId,
          width,
          height,
          screenId,
          left,
          top,
        });
      }

      return result;
    }

    // Popup path
    console.log('[PiPFactory] → Taking POPUP PiP path');
    return await this._createPopupPip({
      videoElement,
      videoUrl,
      pageUrl,
      pipId: pipIdFinal,
      width,
      height,
      screenId,
      left,
      top,
    });
  },

  /**
   * Create a popup PiP window directly (bypasses native PiP).
   * Used by background.js for context menu / multi-screen scenarios.
   *
   * @param {Object} options
   * @param {string} options.url - URL to open (video URL or player.html?src=...)
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.screenId]
   * @param {number} [options.left]
   * @param {number} [options.top]
   * @param {string} [options.pipId]
   * @param {number} [options.sourceTabId] - Tab that triggered this
   * @returns {Promise<Object>}
   */
  async createPopup(options = {}) {
    return await this._createPopupPip({
      videoUrl: options.url,
      pipId: options.pipId || `fullpip-${++this._pipIdCounter}-${Date.now()}`,
      width: options.width,
      height: options.height,
      screenId: options.screenId,
      left: options.left,
      top: options.top,
      sourceTabId: options.sourceTabId,
    });
  },

  /**
   * Close a specific popup PiP window.
   *
   * Context detection:
   *   - Service worker (has chrome.windows) → remove directly
   *   - Content script (no chrome.windows) → delegate to background
   *
   * @param {number} windowId - Chrome window ID
   * @returns {Promise<boolean>}
   */
  async closePopup(windowId) {
    // Content script context — delegate to background
    if (typeof chrome === 'undefined' || !chrome.windows) {
      try {
        const result = await chrome.runtime.sendMessage({
          action: 'closePopupPip',
          windowId,
        });
        // Unregister source on success
        if (result?.success) {
          const sourceId = this._popupWindowSources.get(windowId);
          this._unregisterSource(sourceId);
          this._popupWindowSources.delete(windowId);
        }
        return result?.success || false;
      } catch (e) {
        console.error('[PiPFactory] Failed to close popup via background:', e);
        return false;
      }
    }

    // Service worker context — remove directly
    try {
      const win = await chrome.windows.get(windowId).catch(() => null);
      if (win) {
        await chrome.windows.remove(windowId);
      }
      // Unregister source
      const sourceId = this._popupWindowSources.get(windowId);
      this._unregisterSource(sourceId);
      this._popupWindowSources.delete(windowId);
      this.popupWindows.delete(windowId);
      this._clearSyncInterval(windowId);
      return true;
    } catch (e) {
      console.error('[PiPFactory] Failed to close popup:', e);
      // Still clean up tracking
      const sourceId = this._popupWindowSources.get(windowId);
      this._unregisterSource(sourceId);
      this._popupWindowSources.delete(windowId);
      this.popupWindows.delete(windowId);
      return false;
    }
  },

  /**
   * Close ALL popup PiP windows.
   *
   * @returns {Promise<number>} Number of windows closed
   */
  async closeAllPopups() {
    const windowIds = Array.from(this.popupWindows.keys());
    let closed = 0;

    for (const windowId of windowIds) {
      if (await this.closePopup(windowId)) {
        closed++;
      }
    }

    return closed;
  },

  /**
   * Close ALL PiP windows (native + popup).
   * This is the "nuclear option" - closes everything.
   *
   * Note: Document PiP windows (from documentPictureInPicture.requestWindow())
   * are closed via pipWindow.close(), NOT document.exitPictureInPicture().
   * The latter only works for standard video PiP.
   *
   * @returns {Promise<{ native: boolean, popups: number }>}
   */
  async closeAllPip() {
    const result = { native: false, popups: 0 };

    // Close Document PiP window if open in this tab.
    // Guard: `window` and `document` are undefined in service worker context.
    if (typeof window !== 'undefined' && window.documentPictureInPicture?.window) {
      try {
        window.documentPictureInPicture.window.close();
        result.native = true;
      } catch (e) {
        console.error('[PiPFactory] Failed to close Document PiP window:', e);
      }
    }

    // Also try standard video PiP exit (covers both APIs)
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        result.native = true;
      } catch (e) {
        console.error('[PiPFactory] Failed to exit video PiP:', e);
      }
    }

    // Clear cross-tab state
    await NativePipStateManager.clearState();

    // Close all popup PiP windows
    result.popups = await this.closeAllPopups();

    return result;
  },

  /**
   * Get the count of active popup PiP windows.
   *
   * @returns {number}
   */
  getActivePopupCount() {
    return this.popupWindows.size;
  },

  /**
   * Get info about all active popup PiP windows.
   *
   * @returns {Array<Object>}
   */
  getActivePopups() {
    const popups = [];
    for (const [windowId, data] of this.popupWindows.entries()) {
      popups.push({ windowId, ...data });
    }
    return popups;
  },

  /**
   * Get the current native PiP state (cross-tab aware).
   *
   * @returns {{ isOpen: boolean, pipId: string|null, popupCount: number }}
   */
  getPipState() {
    return {
      isOpen: NativePipStateManager.isNativePipOpen(),
      pipId: NativePipStateManager.getActivePipId(),
      popupCount: this.popupWindows.size,
      hasAnyPip: NativePipStateManager.isNativePipOpen() || this.popupWindows.size > 0,
    };
  },

  // ==========================================================================
  // PRIVATE - Native PiP
  // ==========================================================================

  /**
   * Create a native Document Picture-in-Picture window.
   *
   * Lifecycle Sync:
   *   ✅ Sets NativePipStateManager.setOpened() on success
   *   ✅ Listens to pipWindow 'pagehide' → NativePipStateManager.clearState()
   *
   * @param {HTMLVideoElement} videoElement
   * @param {Object} options
   * @param {string} options.pipId
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @returns {Promise<Object>}
   */
  async _createNativePip(videoElement, options = {}) {
    const { pipId, width, height } = options;

    // Check API availability
    if (!window.documentPictureInPicture) {
      return {
        success: false,
        pipId,
        method: 'native',
        error: 'Document Picture-in-Picture API not supported in this browser',
      };
    }

    // Check if there's already a document PiP window open in THIS tab.
    // documentPictureInPicture.window is set while the PiP window exists.
    // Calling requestWindow() again would REPLACE it, so we refuse here.
    if (window.documentPictureInPicture.window) {
      return {
        success: false,
        pipId,
        method: 'native',
        error: 'Document PiP already active in this tab — use popup mode for additional windows',
      };
    }

    // Get source ID for deduplication
    const sourceId = this._getSourceId(videoElement);

    // Check cross-tab state: if another tab has a native PiP open, we can still
    // open a new one (Chrome allows one per tab), but warn the user
    if (NativePipStateManager.isNativePipOpen()) {
      console.log('[PiPFactory] Another tab has a native PiP open. Opening a new one (Chrome allows one per tab).');
    }

    // ✅ FIX: Use standard video.requestPictureInPicture() for ALL videos
    // This works for both blob URLs and regular URLs (MP4, WebM, etc.)
    // documentPictureInPicture clones the video which causes issues with
    // seeking, buffering, and playback state synchronization.
    console.log('[PiPFactory] Using standard video.requestPictureInPicture()');
    try {
      // Request standard PiP (browser handles all URL types correctly)
      const pipWindow = await videoElement.requestPictureInPicture();

      // Register source for deduplication
      this._registerSource(sourceId);

      // Mark native PiP as open
      await NativePipStateManager.setOpened(pipId);

      // Listen for PiP close
      const onLeavePip = async () => {
        this._unregisterSource(sourceId);
        await NativePipStateManager.clearState();
        videoElement.removeEventListener('leavepictureinpicture', onLeavePip);
        console.log(`[PiPFactory] Standard PiP window closed: ${pipId}`);
      };
      videoElement.addEventListener('leavepictureinpicture', onLeavePip);

      // Show toast
      this._showToast?.('Native PiP opened', 'success', 1500);

      return {
        success: true,
        pipId,
        method: 'native',
        window: pipWindow,
        videoElement: videoElement,
      };
    } catch (e) {
      console.error('[PiPFactory] Standard PiP failed:', e);
      let errorMessage = e.message || 'Native PiP request failed';
      if (e.name === 'NotAllowedError') {
        errorMessage = 'PiP request was denied by the browser. The site may block PiP.';
      }
      return {
        success: false,
        pipId,
        method: 'native',
        error: errorMessage,
      };
    }
  },

  // ==========================================================================
  // PRIVATE - Popup PiP
  // ==========================================================================

  /**
   * Create a popup-style PiP window (supports multi-window & multi-monitor).
   *
   * Context detection:
   *   - Service worker (has chrome.windows) → create popup directly
   *   - Content script (no chrome.windows) → delegate to background via messaging
   *
   * @param {Object} options
   * @param {HTMLVideoElement} [options.videoElement]
   * @param {string} [options.videoUrl]
   * @param {string} [options.pageUrl]
   * @param {string} options.pipId
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.screenId]
   * @param {number} [options.left]
   * @param {number} [options.top]
   * @param {number} [options.sourceTabId]
   * @returns {Promise<Object>}
   */
  async _createPopupPip(options = {}) {
    // ── Context detection ──────────────────────────────────────────────────
    // Content scripts do NOT have access to chrome.windows.
    // We must delegate to the background service worker.
    if (typeof chrome === 'undefined' || !chrome.windows) {
      return await this._createPopupViaBackground(options);
    }

    // Service worker context — create popup directly
    return await this._createPopupDirect(options);
  },

  /**
   * Delegate popup creation to the background service worker via messaging.
   * Used when PiPFactory runs as a content script (no chrome.windows access).
   *
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async _createPopupViaBackground(options) {
    const {
      videoElement,
      videoUrl,
      pageUrl,
      pipId,
      width,
      height,
      screenId,
      left,
      top,
    } = options;

    try {
      // Determine the URL to open
      let targetUrl = videoUrl;

      if (!targetUrl && videoElement) {
        targetUrl = this._extractVideoUrl(videoElement);
      }

      if (!targetUrl && pageUrl) {
        targetUrl = pageUrl;
      }

      if (!targetUrl) {
        return {
          success: false,
          pipId,
          method: 'popup',
          error: 'No video URL available for popup mode',
        };
      }

      // ── CRITICAL: Reject blob URLs for popup mode ──────────────────────
      // Blob URLs are tab-scoped and CANNOT be loaded in a new popup window.
      // This check is a safety net — _shouldUsePopup should have already
      // forced native PiP for blob URLs, but we check again here.
      if (targetUrl.startsWith('blob:')) {
        return {
          success: false,
          pipId,
          method: 'popup',
          error: 'This video uses streaming technology that cannot be opened in popup windows. Try using "PiP API (Native)" mode instead, or right-click the video and select "FullPiP: Pop Video".',
        };
      }

      // Decide if we need the player proxy
      const needsProxy = this._shouldUseProxy(targetUrl);
      if (needsProxy) {
        const extensionUrl = chrome.runtime.getURL(PiPFactoryConfig.PLAYER_PATH);
        targetUrl = `${extensionUrl}?src=${encodeURIComponent(targetUrl)}`;
      }

      // Send to background for actual popup creation
      const result = await chrome.runtime.sendMessage({
        action: 'createPopupPip',
        url: targetUrl,
        pipId,
        width: Math.max(PiPFactoryConfig.MIN_WIDTH, width || PiPFactoryConfig.DEFAULT_WIDTH),
        height: Math.max(PiPFactoryConfig.MIN_HEIGHT, height || PiPFactoryConfig.DEFAULT_HEIGHT),
        screenId,
        left: left !== undefined && left !== null ? Math.round(left) : undefined,
        top: top !== undefined && top !== null ? Math.round(top) : undefined,
      });

      if (result?.success) {
        // Register source for deduplication (content script side)
        const sourceId = this._getSourceId(videoElement) || targetUrl;
        this._registerSource(sourceId);

        // Store sourceId with popup for cleanup on close
        if (result.windowId) {
          this._popupWindowSources.set(result.windowId, sourceId);
        }

        this._showToast?.('Popup PiP opened', 'success', 1500);
      }

      return result || {
        success: false,
        pipId,
        method: 'popup',
        error: 'Background service worker did not respond',
      };
    } catch (e) {
      console.error('[PiPFactory] Popup delegation failed:', e);
      return {
        success: false,
        pipId,
        method: 'popup',
        error: e.message || 'Failed to delegate popup to background',
      };
    }
  },

  /**
   * Create a popup window directly (service worker context only).
   *
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async _createPopupDirect(options = {}) {
    const {
      videoElement,
      videoUrl,
      pageUrl,
      pipId,
      width,
      height,
      screenId,
      left,
      top,
      sourceTabId,
    } = options;

    // Check max popup windows limit
    if (this.popupWindows.size >= PiPFactoryConfig.MAX_POPUP_WINDOWS) {
      return {
        success: false,
        pipId,
        method: 'popup',
        error: `Maximum ${PiPFactoryConfig.MAX_POPUP_WINDOWS} popup PiP windows reached`,
      };
    }

    try {
      // Determine the URL to open
      let targetUrl = videoUrl;

      if (!targetUrl && videoElement) {
        // Extract video URL from element
        targetUrl = this._extractVideoUrl(videoElement);
      }

      if (!targetUrl && pageUrl) {
        // Fall back to the page URL (might be a page with embedded video)
        targetUrl = pageUrl;
      }

      if (!targetUrl) {
        return {
          success: false,
          pipId,
          method: 'popup',
          error: 'No video URL available for popup mode',
        };
      }

      // ✅ FIX: Reject blob URLs for popup mode with clear error message
      // Blob URLs are tab-scoped and CANNOT be loaded in a new popup window.
      // This should have been caught by _shouldUsePopup(), but we check again here.
      if (targetUrl.startsWith('blob:')) {
        console.error('[PiPFactory] ❌ Blob URL cannot be used in popup windows');
        return {
          success: false,
          pipId,
          method: 'popup',
          error: 'This video uses streaming technology that cannot be opened in popup windows. Try switching to "PiP API (Native)" mode in settings, or right-click the video and select "FullPiP: Pop Video".',
        };
      }

      // Decide if we need the player proxy
      const needsProxy = this._shouldUseProxy(targetUrl);
      if (needsProxy) {
        const extensionUrl = chrome.runtime.getURL(PiPFactoryConfig.PLAYER_PATH);
        targetUrl = `${extensionUrl}?src=${encodeURIComponent(targetUrl)}`;
      }

      // Build chrome.windows.create options
      const createOptions = {
        type: 'popup',
        url: targetUrl,
        width: Math.max(PiPFactoryConfig.MIN_WIDTH, width || PiPFactoryConfig.DEFAULT_WIDTH),
        height: Math.max(PiPFactoryConfig.MIN_HEIGHT, height || PiPFactoryConfig.DEFAULT_HEIGHT),
        focused: true,
      };

      // Add screen positioning if specified
      if (screenId !== undefined && screenId !== null) {
        const chromeVersion = this._getChromeVersion();
        if (chromeVersion && chromeVersion >= PiPFactoryConfig.CHROME_VERSION_SCREEN_ID) {
          createOptions.screenId = screenId;
        } else {
          console.warn(`[PiPFactory] screenId requires Chrome ${PiPFactoryConfig.CHROME_VERSION_SCREEN_ID}+, ignoring screenId.`);
        }
      }

      // Explicit left/top positioning
      if (left !== undefined && left !== null) {
        createOptions.left = Math.round(left);
      }
      if (top !== undefined && top !== null) {
        createOptions.top = Math.round(top);
      }

      // Auto-increment positioning if no explicit position specified
      if (left === undefined || left === null || top === undefined || top === null) {
        const offset = this._popupOffsetCounter * PiPFactoryConfig.POPUP_OFFSET_STEP;
        if (createOptions.left === undefined) {
          createOptions.left = 100 + offset;
        }
        if (createOptions.top === undefined) {
          createOptions.top = 100 + offset;
        }
        this._popupOffsetCounter++;

        // Reset counter after max reasonable windows to avoid overflow
        if (this._popupOffsetCounter > 20) {
          this._popupOffsetCounter = 0;
        }
      }

      // Create the popup window
      const win = await chrome.windows.create(createOptions);

      // Store window reference
      this.popupWindows.set(win.id, {
        pipId,
        tabId: win.tabs?.[0]?.id,
        sourceTabId,
        videoUrl: targetUrl,
        createdAt: Date.now(),
        screenId: screenId || null,
      });

      // Inject borderless CSS if not using player proxy
      if (!needsProxy && win.tabs?.[0]?.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: win.tabs[0].id },
            func: () => {
              const style = document.createElement('style');
              style.textContent = `
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: hidden !important;
                  background: #000 !important;
                }
                video, img, iframe {
                  width: 100vw !important;
                  height: 100vh !important;
                  object-fit: contain !important;
                  border: none !important;
                  outline: none !important;
                }
              `;
              document.head.appendChild(style);
            },
          });
        } catch (injectErr) {
          console.debug('[PiPFactory] Could not inject borderless CSS into popup:', injectErr.message);
        }
      }

      // Show user-friendly toast if in content script context
      this._showToast?.('Popup PiP opened', 'success', 1500);

      // ✅ FIX: Pause the source video in the content script (service worker has no DOM access)
      if (sourceTabId) {
        chrome.tabs.sendMessage(sourceTabId, { action: 'pauseSourceVideo' }).catch(() => {});
        console.log('[PiPFactory] Sent pause request to source tab:', sourceTabId);
      }

      console.log(`[PiPFactory] Popup PiP window created: ${pipId} (windowId: ${win.id})`);

      return {
        success: true,
        pipId,
        method: 'popup',
        window: win,
        windowId: win.id,
      };
    } catch (e) {
      console.error('[PiPFactory] Popup PiP failed:', e);

      // Provide user-friendly error messages
      let errorMessage = e.message || 'Popup creation failed';
      if (e.message?.includes('popup blocked') || e.message?.includes('NotAllowedError')) {
        errorMessage = 'Popup blocked by browser. Please allow popups for this site.';
      } else if (e.message?.includes('screenId')) {
        errorMessage = 'Multi-monitor positioning unavailable. Opening on primary screen.';
      }

      return {
        success: false,
        pipId,
        method: 'popup',
        error: errorMessage,
      };
    }
  },

  // ==========================================================================
  // PRIVATE - Decision Logic
  // ==========================================================================

  /**
   * Determine whether to use popup mode instead of native.
   *
   * Checks two things:
   *   1. In-tab: `documentPictureInPicture.window` — has this tab already opened a doc-PiP window?
   *   2. Cross-tab: `NativePipStateManager.isNativePipOpen()` — has ANY tab opened one?
   *
   * If either is true, we must use popup to avoid replacing the existing window.
   *
   * CRITICAL: Blob URLs (MediaSource) CANNOT be loaded in popup windows.
   * If the video source is a blob URL, we MUST use native PiP.
   *
   * @param {Object} params
   * @returns {boolean}
   */
  _shouldUsePopup({ videoElement, videoUrl, screenId, left, top, forcePopup, forceNative, mode = 'hybrid' }) {
    // ── MODE: API - Always use native PiP ────────────────────────────────
    if (mode === 'api') {
      console.log('[PiPFactory] 🎯 API mode → using native PiP');
      return false;
    }

    // ── MODE: Popup - Always use popup ───────────────────────────────────
    if (mode === 'popup') {
      console.log('[PiPFactory] 🎯 Popup mode → using popup windows');
      return true;
    }

    // ── MODE: Hybrid - Smart routing (default) ───────────────────────────
    // Fall through to existing logic below

    // ── CRITICAL: Blob URLs MUST always use native PiP ───────────────────
    // Blob URLs (MediaSource) are scoped to the originating tab.
    // chrome.windows.create({ url: blob:... }) will always show "File not found".
    // This check is FIRST — blob URLs always force native regardless of other options.
    if (videoElement && this._isBlobUrl(videoElement)) {
      console.log('[PiPFactory] ✅ Blob URL detected → forcing native PiP (popup cannot load blobs)');
      return false;
    }
    if (videoUrl && videoUrl.startsWith('blob:')) {
      console.log('[PiPFactory] ✅ Blob URL in videoUrl → forcing native PiP');
      return false;
    }

    // Explicit force override
    if (forcePopup) {
      console.log('[PiPFactory] ⚠️ forcePopup=true → using popup');
      return true;
    }
    if (forceNative) {
      console.log('[PiPFactory] ⚠️ forceNative=true → using native');
      return false;
    }

    // Multi-monitor positioning requires popup mode (native PiP has no positioning API)
    if (screenId !== undefined && screenId !== null) {
      console.log('[PiPFactory] 🖥️ screenId specified → using popup');
      return true;
    }
    if (left !== undefined && left !== null) {
      console.log('[PiPFactory] 🖥️ left specified → using popup');
      return true;
    }
    if (top !== undefined && top !== null) {
      console.log('[PiPFactory] 🖥️ top specified → using popup');
      return true;
    }

    // No video element for native → must use popup
    if (!videoElement) {
      console.log('[PiPFactory] ⚠️ No videoElement → using popup');
      return true;
    }

    // ── KEY CHECK: Is a native PiP window already open? ──
    // Check for standard video PiP (video.requestPictureInPicture)
    // `document.pictureInPictureElement` is set when a video is in PiP mode.
    // Calling requestPictureInPicture() again would REPLACE it, so we use popup.
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      console.log('[PiPFactory] ⚠️ document.pictureInPictureElement exists → using popup to avoid replacement');
      return true;
    }

    // Check for document PiP (documentPictureInPicture.requestWindow)
    // `documentPictureInPicture.window` is non-null while the PiP window exists.
    // Guard: `window` may be undefined in service worker context.
    if (typeof window !== 'undefined' && window.documentPictureInPicture?.window) {
      console.log('[PiPFactory] ⚠️ documentPictureInPicture.window exists → using popup to avoid replacement');
      return true;
    }

    // Cross-tab check: another tab may have opened a native PiP
    if (NativePipStateManager.isNativePipOpen()) {
      console.log('[PiPFactory] ⚠️ NativePipStateManager.isNativePipOpen()=true → using popup');
      console.log('[PiPFactory]    Active pipId:', NativePipStateManager.getActivePipId());
      return true;
    }

    // Default: Try native first
    console.log('[PiPFactory] ✅ All checks passed → using NATIVE PiP');
    return false;
  },

  /**
   * Check if a video element's source is a blob URL (MediaSource).
   * Blob URLs are tab-scoped and CANNOT be loaded in popup windows.
   *
   * @param {HTMLVideoElement} videoElement
   * @returns {boolean}
   */
  _isBlobUrl(videoElement) {
    if (!videoElement || typeof videoElement !== 'object') return false;
    // Check currentSrc first (what's actually playing)
    if (videoElement.currentSrc && videoElement.currentSrc.startsWith('blob:')) return true;
    // Check src attribute
    if (videoElement.src && videoElement.src.startsWith('blob:')) return true;
    // Check <source> children (only if querySelectorAll is available)
    if (typeof videoElement.querySelectorAll === 'function') {
      try {
        const sources = videoElement.querySelectorAll('source');
        for (const source of sources) {
          if ((source.src || '').startsWith('blob:')) return true;
          if ((source.srcset || '').startsWith('blob:')) return true;
        }
      } catch {}
    }
    return false;
  },

  /**
   * Extract a unique identifier for a video element (for deduplication).
   * Uses currentSrc, src, or the element's outerHTML hash.
   *
   * @param {HTMLVideoElement} videoElement
   * @returns {string}
   */
  _getSourceId(videoElement) {
    if (!videoElement) return '';
    // Use the video's src as the identifier
    const src = videoElement.currentSrc || videoElement.src || '';
    if (src) return src;
    // Fallback: use a hash of the element's position in the DOM
    return `dom-${videoElement.dataset.pipId || Date.now()}`;
  },

  /**
   * Register a video source as active PiP (deduplication).
   *
   * @param {string} sourceId
   */
  _registerSource(sourceId) {
    if (sourceId) {
      this._activeSources.add(sourceId);
      console.log(`[PiPFactory] Registered active source: ${sourceId} (total: ${this._activeSources.size})`);
    }
  },

  /**
   * Unregister a video source when its PiP window closes.
   *
   * @param {string} sourceId
   */
  _unregisterSource(sourceId) {
    if (sourceId) {
      this._activeSources.delete(sourceId);
      console.log(`[PiPFactory] Unregistered source: ${sourceId} (remaining: ${this._activeSources.size})`);
    }
  },

  /**
   * Get the count of active video sources being PiP'd.
   *
   * @returns {number}
   */
  getActiveSourceCount() {
    return this._activeSources.size;
  },

  /**
   * Check if a URL should be opened via the player.html proxy.
   * Raw video files (.mp4, .webm, etc.) would trigger downloads without the proxy.
   *
   * @param {string} url
   * @returns {boolean}
   */
  _shouldUseProxy(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();

      return PiPFactoryConfig.RAW_VIDEO_EXTENSIONS.some((ext) =>
        pathname.endsWith(ext)
      );
    } catch {
      // If URL parsing fails, don't use proxy
      return false;
    }
  },

  /**
   * Extract the source URL from a video element.
   *
   * @param {HTMLVideoElement} videoElement
   * @returns {string|null}
   */
  _extractVideoUrl(videoElement) {
    if (!videoElement) return null;

    // Check src attribute first
    if (videoElement.currentSrc) return videoElement.currentSrc;
    if (videoElement.src) return videoElement.src;

    // Check <source> children
    const sources = videoElement.querySelectorAll('source');
    for (const source of sources) {
      if (source.src || source.srcset) {
        return source.src || source.srcset;
      }
    }

    return null;
  },

  // ==========================================================================
  // PRIVATE - Video State Sync
  // ==========================================================================

  /**
   * Sync playback state from original video to PiP video clone.
   * Listens for play/pause/seek/volume changes on the original.
   *
   * ✅ FIX: Added sync lock to prevent rapid play/pause loop
   * when video isn't fully loaded yet.
   *
   * Cleanup strategy:
   *   1. Primary: pipWindow 'pagehide' event → removes ALL listeners
   *   2. Backup: source element's own 'pagehide' (if on main document) → cleanup
   *   3. Safety: MutationObserver on target removal
   *
   * @param {HTMLVideoElement} source - The original video in the page
   * @param {HTMLVideoElement} target - The cloned video in the PiP window
   */
  _syncVideoState(source, target) {
    if (!source || !target) return;

    // ✅ FIX: Sync lock to prevent recursive play/pause loops
    let isSyncing = false;

    // Sync initial state
    target.currentTime = source.currentTime;
    target.volume = source.volume;
    target.muted = source.muted;

    // Only try to play if source is actually playing and ready
    if (!source.paused && source.readyState >= 2) {
      target.play().catch(() => {});
    }

    // Listen for changes on source → sync to target
    const onPlay = () => {
      if (isSyncing) return;
      isSyncing = true;
      // Only play if target is ready
      if (target.readyState >= 2) {
        target.play().catch(() => {});
      }
      isSyncing = false;
    };

    const onPause = () => {
      if (isSyncing) return;
      isSyncing = true;
      target.pause();
      isSyncing = false;
    };

    const onSeeked = () => {
      if (isSyncing) return;
      isSyncing = true;
      target.currentTime = source.currentTime;
      isSyncing = false;
    };

    const onVolumeChange = () => {
      if (isSyncing) return;
      isSyncing = true;
      target.volume = source.volume;
      target.muted = source.muted;
      isSyncing = false;
    };

    // ✅ FIX: Removed bidirectional sync (target → source)
    // This was causing the rapid play/pause loop when video wasn't loaded.
    // The source video controls playback; PiP window just mirrors it.
    // Users can control playback from the source video or PiP controls directly.

    source.addEventListener('play', onPlay);
    source.addEventListener('pause', onPause);
    source.addEventListener('seeked', onSeeked);
    source.addEventListener('volumechange', onVolumeChange);

    // Store cleanup reference
    const syncKey = target.dataset.pipId || `sync-${Date.now()}`;
    this._syncIntervals.set(syncKey, {
      source,
      target,
      listeners: {
        source: { onPlay, onPause, onSeeked, onVolumeChange },
        target: {}, // No target→source sync anymore
      },
    });

    // Primary cleanup: pipWindow pagehide
    const cleanup = () => this._clearSyncByKey(syncKey);

    try {
      const pipWindow = target.ownerDocument?.defaultView;
      if (pipWindow) {
        pipWindow.addEventListener('pagehide', cleanup, { once: true });
      }
    } catch {}

    // Backup cleanup: source page navigation (when PiP window is in same tab context)
    // This catches cases where the user navigates away from the source page
    try {
      const sourceWindow = source.ownerDocument?.defaultView;
      if (sourceWindow && sourceWindow !== (target.ownerDocument?.defaultView)) {
        sourceWindow.addEventListener('pagehide', cleanup, { once: true });
      }
    } catch {}

    // Safety fallback: MutationObserver if target is removed from DOM
    try {
      const parent = target.parentElement;
      if (parent) {
        const observer = new MutationObserver(() => {
          if (!target.isConnected) {
            cleanup();
            observer.disconnect();
          }
        });
        observer.observe(parent, { childList: true, subtree: true });
      }
    } catch {}
  },

  /**
   * Clear sync interval by key.
   * Always removes all listeners regardless of element connection state.
   *
   * @param {string} key
   */
  _clearSyncByKey(key) {
    const syncData = this._syncIntervals.get(key);
    if (!syncData) return;

    const { source, target, listeners } = syncData;

    // Always remove listeners (even if element is disconnected)
    if (source) {
      try { source.removeEventListener('play', listeners.source.onPlay); } catch {}
      try { source.removeEventListener('pause', listeners.source.onPause); } catch {}
      try { source.removeEventListener('seeked', listeners.source.onSeeked); } catch {}
      try { source.removeEventListener('volumechange', listeners.source.onVolumeChange); } catch {}
    }
    if (target) {
      try { target.removeEventListener('play', listeners.target.onTargetPlay); } catch {}
      try { target.removeEventListener('pause', listeners.target.onTargetPause); } catch {}
      try { target.removeEventListener('seeked', listeners.target.onTargetSeeked); } catch {}
      try { target.removeEventListener('volumechange', listeners.target.onTargetVolumeChange); } catch {}
    }

    this._syncIntervals.delete(key);
  },

  /**
   * Clear popup window sync interval.
   *
   * @param {number} windowId
   */
  _clearSyncInterval(windowId) {
    // Popup windows don't have element-level sync (they use player.html self-contained)
    // This is here for API completeness
  },

  // ==========================================================================
  // PRIVATE - Utilities
  // ==========================================================================

  /**
   * Get the current Chrome major version.
   *
   * @returns {number|null}
   */
  _getChromeVersion() {
    const ua = navigator.userAgent;
    const match = ua.match(/Chrome\/(\d+)/);
    if (match) return parseInt(match[1], 10);
    return null;
  },

  /**
   * Show a toast notification (if available in current context).
   * This is a no-op in background/service worker context.
   *
   * @param {string} message
   * @param {string} type
   * @param {number} duration
   */
  _showToast(message, type = 'info', duration = 2500) {
    // No-op by default; content.js overrides this if available
    console.log(`[PiPFactory Toast] ${message}`);
  },

  /**
   * Get info about available displays (monitors).
   * Requires "system.display" permission.
   *
   * @returns {Promise<Array<Object>>} Array of display info objects
   */
  async getDisplays() {
    try {
      if (!chrome.system?.display) {
        console.warn('[PiPFactory] chrome.system.display not available. Ensure "system.display" permission is granted.');
        return [];
      }

      const displays = await chrome.system.display.getInfo();
      return displays.map((d) => ({
        id: d.id,
        name: d.name || `Display ${d.id}`,
        width: d.bounds.width,
        height: d.bounds.height,
        left: d.bounds.left,
        top: d.bounds.top,
        isPrimary: d.isPrimary || false,
      }));
    } catch (e) {
      console.error('[PiPFactory] Failed to get display info:', e);
      return [];
    }
  },

  /**
   * Initialize the factory - sets up window removal listener and state manager.
   * Should be called once during background.js startup.
   */
  async init() {
    // Initialize cross-tab state manager
    await NativePipStateManager.init();

    // Listen for popup window removal to clean up our tracking
    // This handles both our closePopup() calls AND user clicking the X button
    if (typeof chrome !== 'undefined' && chrome.windows) {
      chrome.windows.onRemoved.addListener(async (windowId) => {
        if (this.popupWindows.has(windowId)) {
          console.log(`[PiPFactory] Popup window removed: ${windowId}`);
          const popupData = this.popupWindows.get(windowId);
          this.popupWindows.delete(windowId);
          this._clearSyncInterval(windowId);

          // ✅ FIX: Clean up dedup tracking in service worker
          const sourceId = this._popupWindowSources.get(windowId);
          this._unregisterSource(sourceId);
          this._popupWindowSources.delete(windowId);

          // ✅ FIX: Notify content script to clean up its dedup tracking
          // The service worker and content script have separate PiPFactory instances
          if (popupData?.sourceTabId) {
            try {
              await chrome.tabs.sendMessage(popupData.sourceTabId, {
                action: 'popupWindowClosed',
                windowId: windowId,
                sourceId: sourceId,
              }).catch(() => {}); // Ignore if tab closed
            } catch (e) {
              console.debug('[PiPFactory] Could not notify content script of popup close:', e.message);
            }
          }
        }
      });
    }

    console.log('[PiPFactory] Initialized');
  },
};

// Auto-initialize if running in a service worker / background context
if (typeof chrome !== 'undefined' && chrome.windows) {
  PiPFactory.init().catch(err => {
    console.error('[PiPFactory] Init failed:', err);
  });
}

// Export for both module and script contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PiPFactory, PiPFactoryConfig, NativePipStateManager };
}
