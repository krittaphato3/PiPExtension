/**
 * @file player.js
 * @desc Borderless video player proxy for popup PiP windows.
 *       Loads a video from the `?src=` query parameter and plays it inline
 *       with minimal UI — mimicking native Picture-in-Picture appearance.
 *
 * Features:
 *   - Auto-loads video from URL parameter
 *   - Handles errors gracefully (unavailable sources, CORS, etc.)
 *   - Keyboard shortcuts for playback control
 *   - Hides loading spinner when video is ready
 *   - Retries on transient failures
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
const PLAYER_CONFIG = {
  /** Maximum retry attempts for loading failures */
  MAX_RETRIES: 2,

  /** Delay between retries (ms) */
  RETRY_DELAY_MS: 1000,

  /** Auto-hide loader after video starts playing (ms) */
  LOADER_HIDE_DELAY_MS: 500,

  /** Minimum gap between suspend-triggered retries (ms) — debounces retry storms */
  SUSPEND_DEBOUNCE_MS: 2000
};

// ============================================================================
// STATE
// ============================================================================
const state = {
  videoUrl: null,
  retryCount: 0,
  isLoaded: false,
  /** Timestamp of the last suspend-triggered retry (ms since epoch) */
  lastSuspendRetry: 0,
  /** F2: true while muted by an automatic mute-others/solo command. */
  autoMuted: false,
  /** F2: set on manual M-key unmute so the user always wins over automation. */
  userUnmuteOverride: false,
  /** Cached popup windowId for reportAudible / muteOthers exemption checks. */
  windowId: null,
  isLoading: false
};

// F2: resolve this popup's windowId lazily (extension popup window).
function resolveWindowId() {
  try {
    if (typeof chrome !== 'undefined' && chrome.windows?.getCurrent) {
      chrome.windows.getCurrent((win) => {
        if (win && typeof win.id === 'number') state.windowId = win.id;
      });
    }
  } catch {}
}

// F2: report audible state to background single-audio manager.
// Backward compatible: background defaults to Mix (no-op) when unset.
function reportAudible(audible) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    const msg = { action: 'reportAudible', audible: !!audible };
    if (typeof state.windowId === 'number') msg.windowId = state.windowId;
    const p = chrome.runtime.sendMessage(msg);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

// ============================================================================
// DOM REFERENCES
// ============================================================================
const els = {
  player: document.getElementById('player'),
  loader: document.getElementById('loader'),
  errorOverlay: document.getElementById('errorOverlay'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  retryBtn: document.getElementById('retryBtn')
};

// ============================================================================
// INITIALIZATION
// ============================================================================
function init() {
  // Parse video URL from query parameter
  const params = new URLSearchParams(window.location.search);
  state.videoUrl = params.get('src');

  if (!state.videoUrl) {
    showError('No video source specified', 'Missing ?src= parameter in URL');
    return;
  }

  // ── P0-3: Never proxy blob: URLs ──────────────────────────────────────
  // Blob URLs are scoped to their originating tab and die with it, so loading
  // one here can never succeed. Reject early and point at Native API mode.
  if (state.videoUrl.startsWith('blob:')) {
    showError(
      'Streaming video cannot be proxied',
      'This video uses blob/streaming technology scoped to its original tab. Please use Native API mode instead.'
    );
    return;
  }

  // Allowlist: only http/https sources may be proxied.
  let parsedUrl = null;
  try {
    parsedUrl = new URL(state.videoUrl);
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
    showError(
      'Unsupported video source',
      'Only http(s) video URLs can be played here. For streaming/blob videos, please use Native API mode.'
    );
    return;
  }

  console.log(`[FullPiP Player] Loading video: ${state.videoUrl}`);

  // Playback is driven manually via attemptAutoplay(). Drop the declarative
  // autoplay attribute so the browser does not race us with its own play()
  // request (that race surfaces as AbortError).
  els.player.removeAttribute('autoplay');

  // Setup event listeners
  setupPlayerListeners();
  setupKeyboardListeners();
  setupRetryListener();
  setupAudioManager();
  resolveWindowId();

  // Load the video
  loadVideo();
}

// ============================================================================
// VIDEO LOADING
// ============================================================================
function loadVideo() {
  if (!state.videoUrl || state.videoUrl.startsWith('blob:')) return;
  state.isLoading = true;

  // Reset state
  state.isLoaded = false;
  state.retryCount = 0;
  hideError();
  showLoader();

  // Set video source
  els.player.src = state.videoUrl;
  els.player.load();

  // ── AUTOPLAY HANDLING ──────────────────────────────────────────────────
  // Modern browsers block autoplay with sound. Strategy:
  // 1. Try normal play (may succeed if user interacted with page)
  // 2. If blocked, try muted autoplay (usually allowed)
  // 3. If still blocked, show play button and wait for user interaction
  attemptAutoplay();
}

async function attemptAutoplay() {
  try {
    // Attempt 1: Normal autoplay
    await els.player.play();
    console.log('[FullPiP Player] Autoplay succeeded');
  } catch (e) {
    // AbortError is transient (a concurrent load()/play() is in flight) —
    // NOT a real autoplay block. The pending play resolves via the
    // playing/canplay events, so never show the blocked overlay for it.
    if (e && e.name === 'AbortError') {
      console.debug(
        '[FullPiP Player] Play aborted by concurrent request, waiting for pending playback'
      );
      return;
    }
    console.debug('[FullPiP Player] Normal autoplay prevented:', e.message);

    try {
      // Attempt 2: Muted autoplay (usually allowed by browsers)
      console.log('[FullPiP Player] Trying muted autoplay...');
      els.player.muted = true;
      await els.player.play();
      console.log('[FullPiP Player] Muted autoplay succeeded');

      // Unmute only after user interaction (click or keypress)
      const unmuteOnInteraction = () => {
        try {
          els.player.muted = false;
          console.log('[FullPiP Player] Unmuted after user interaction');
        } catch {}
        document.removeEventListener('click', unmuteOnInteraction);
        document.removeEventListener('keydown', unmuteOnInteraction);
      };
      document.addEventListener('click', unmuteOnInteraction, { once: true });
      document.addEventListener('keydown', unmuteOnInteraction, { once: true });
    } catch (e2) {
      // Same transient-race guard as above: never treat AbortError as blocked.
      if (e2 && e2.name === 'AbortError') {
        console.debug(
          '[FullPiP Player] Muted play aborted by concurrent request, waiting for pending playback'
        );
        return;
      }
      console.debug('[FullPiP Player] Muted autoplay also prevented:', e2.message);
      // Attempt 3: Show play button overlay
      showPlayOverlay();
    }
  }
}

function showPlayOverlay() {
  hideLoader();

  // Create play overlay if not exists
  let overlay = document.getElementById('playOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'playOverlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 30;
      transition: opacity 0.3s;
    `;

    const playIcon = document.createElement('div');
    playIcon.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 24 24" fill="white" style="filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `;
    overlay.appendChild(playIcon);

    overlay.addEventListener('click', async () => {
      try {
        await els.player.play();
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
        console.log('[FullPiP Player] User initiated playback');
      } catch (e) {
        console.error('[FullPiP Player] User playback failed:', e);
      }
    });

    document.body.appendChild(overlay);
    console.log('[FullPiP Player] Play overlay shown - waiting for user click');
  }
}

function retryLoad() {
  if (state.retryCount >= PLAYER_CONFIG.MAX_RETRIES) {
    showError('Failed to load video', 'The video source is unavailable or has expired.');
    return;
  }

  state.retryCount++;
  console.log(`[FullPiP Player] Retry ${state.retryCount}/${PLAYER_CONFIG.MAX_RETRIES}`);

  hideError();
  showLoader();

  // Reload after delay
  setTimeout(() => {
    els.player.src = state.videoUrl;
    els.player.load();
    attemptAutoplay(); // Use the new autoplay handling
  }, PLAYER_CONFIG.RETRY_DELAY_MS);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupPlayerListeners() {
  // Video is ready to play
  els.player.addEventListener('canplay', () => {
    state.isLoading = false;
    if (!state.isLoaded) {
      state.isLoaded = true;
      setTimeout(() => hideLoader(), PLAYER_CONFIG.LOADER_HIDE_DELAY_MS);
    }
  });

  // Playback started
  els.player.addEventListener('playing', () => {
    hideLoader();
    try {
      if (!els.player.muted && els.player.volume > 0) reportAudible(true);
    } catch {}
  });

  // F2: playback paused locally — no longer audible.
  els.player.addEventListener('pause', () => {
    try {
      reportAudible(false);
    } catch {}
  });

  // F2: un/mute or volume changes flip audible reporting.
  els.player.addEventListener('volumechange', () => {
    try {
      const audible = !els.player.paused && !els.player.muted && els.player.volume > 0;
      reportAudible(audible);
    } catch {}
  });

  // Error handling
  els.player.addEventListener('error', (e) => {
    console.error('[FullPiP Player] Video error event:', e);
    handleVideoError();
  });

  // Stalled (buffering / network issue)
  els.player.addEventListener('stalled', () => {
    console.debug('[FullPiP Player] Video stalled (buffering)');
  });

  // Suspended (browser chose not to fetch)
  els.player.addEventListener('suspend', () => {
    console.debug('[FullPiP Player] Video suspended');
    // Debounced retry: suspend fires in bursts, and each retry re-arms the
    // event, so an unguarded handler loops. Only retry when not yet loaded
    // and the debounce window has elapsed.
    if (state.isLoaded) return;
    const now = Date.now();
    if (now - state.lastSuspendRetry < PLAYER_CONFIG.SUSPEND_DEBOUNCE_MS) return;
    state.lastSuspendRetry = now;
    retryLoad();
  });

  // Encrypted media (EME/DRM) can never be proxied — fail fast with a
  // specific message instead of a generic decode/network error.
  els.player.addEventListener('encrypted', () => {
    console.warn('[FullPiP Player] DRM_DETECTED: encrypted media cannot be proxied');
    showError(
      'DRM-protected video',
      'This video is DRM-protected (EME) and cannot be played in a popup window. Please use Native API mode instead.'
    );
  });
}

function setupKeyboardListeners() {
  document.addEventListener('keydown', (e) => {
    const video = els.player;
    if (!video) return;

    switch (e.key) {
      case ' ':
        // Toggle play/pause
        e.preventDefault();
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        break;

      case 'ArrowLeft':
        // Seek backward 5 seconds
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
        break;

      case 'ArrowRight':
        // Seek forward 5 seconds
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        break;

      case 'ArrowUp':
        // Volume up
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        break;

      case 'ArrowDown':
        // Volume down
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        break;

      case 'm':
      case 'M':
        // Toggle mute (manual override always wins over auto-mute)
        video.muted = !video.muted;
        try {
          state.autoMuted = false;
          state.userUnmuteOverride = !video.muted;
          reportAudible(!video.muted && !video.paused && video.volume > 0);
        } catch {}
        break;

      case 'f':
      case 'F':
        // Toggle object-fit (contain / cover / fill)
        e.preventDefault();
        const modes = ['contain', 'cover', 'fill'];
        const current = video.style.objectFit || 'contain';
        const nextIdx = (modes.indexOf(current) + 1) % modes.length;
        video.style.objectFit = modes[nextIdx];
        console.log(`[FullPiP Player] Scale mode: ${modes[nextIdx]}`);
        break;
    }
  });
}

function setupRetryListener() {
  els.retryBtn.addEventListener('click', () => {
    if (state.isLoading) return;
    state.retryCount = 0;
    loadVideo();
  });
}

// F2: honor mute-others/solo commands from the background single-audio
// manager. Exempt window keeps playing; others mute (or pause in solo).
function setupAudioManager() {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      try {
        if (!msg || msg.action !== 'muteOthers') return false;
        if (typeof state.windowId === 'number' && typeof msg.exceptWindowId === 'number') {
          if (state.windowId === msg.exceptWindowId) {
            sendResponse({ success: true, exempt: true });
            return true;
          }
        }
        // Manual unmute override: user already chose sound — stay audible.
        // Background only re-enforces on the NEXT new playback, so skipping
        // one automated mute never breaks future solo/mute-others behavior.
        if (state.userUnmuteOverride && !els.player.paused) {
          sendResponse({ success: true, skipped: 'user-override' });
          return true;
        }
        const mode = msg.mode || 'muteOthers';
        const command = msg.command || (mode === 'solo' ? 'pause' : 'mute');
        if (command === 'pause') {
          try {
            els.player.pause();
          } catch {}
          try {
            reportAudible(false);
          } catch {}
        } else {
          try {
            els.player.muted = true;
          } catch {}
          state.autoMuted = true;
          try {
            reportAudible(false);
          } catch {}
        }
        sendResponse({ success: true, mode, command });
        return true;
      } catch (e) {
        try {
          sendResponse({ success: false, error: (e && e.message) || 'muteOthers failed' });
        } catch {}
        return true;
      }
    });
  } catch {}
}

// ============================================================================
// ERROR HANDLING
// ============================================================================
function handleVideoError() {
  state.isLoading = false;
  // DRM_DETECTED: EME-bound playback fails with generic MediaErrors — detect
  // via MediaKeys and reuse the "source not supported" shape with a specific
  // message instead.
  let hasMediaKeys = false;
  try {
    hasMediaKeys = !!els.player.mediaKeys;
  } catch {
    hasMediaKeys = false;
  }
  if (hasMediaKeys) {
    showError(
      'DRM-protected video',
      'This video is DRM-protected (EME) and cannot be played in a popup window. Please use Native API mode instead.'
    );
    return;
  }

  const error = els.player.error;

  if (!error) {
    // Generic error without details
    showError('Playback error', 'An unknown error occurred during playback.');
    return;
  }

  // Decode MediaError.code
  // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
  const errorMessages = {
    1: {
      title: 'Loading aborted',
      message: 'The loading process was interrupted by a user action or navigation.'
    },
    2: {
      title: 'Network error',
      message: 'A network error occurred while trying to load the video. Check your connection.'
    },
    3: {
      title: 'Decode error',
      message: 'The video format is not supported or the file is corrupted.'
    },
    4: {
      title: 'Source not supported',
      message: 'The video source is unavailable, has been removed, or is blocked by CORS policy.'
    }
  };

  const errorInfo = errorMessages[error.code] || {
    title: 'Unknown error',
    message: `Media error code: ${error.code}`
  };

  showError(errorInfo.title, errorInfo.message);
}

function showError(title, message) {
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = message;
  els.errorOverlay.classList.remove('hidden');
  hideLoader();
  // a11y: move focus to the error surface so keyboard/screen-reader users
  // land on the retry control immediately.
  try {
    if (els.errorOverlay && typeof els.errorOverlay.focus !== 'function') {
      els.errorOverlay.setAttribute('tabindex', '-1');
    }
    if (els.retryBtn && typeof els.retryBtn.focus === 'function') {
      els.retryBtn.focus();
    } else if (els.errorOverlay && typeof els.errorOverlay.focus === 'function') {
      els.errorOverlay.focus();
    }
  } catch {}
  try {
    reportAudible(false);
  } catch {}
}

function hideError() {
  els.errorOverlay.classList.add('hidden');
}

function showLoader() {
  els.loader.style.display = 'block';
}

function hideLoader() {
  els.loader.style.display = 'none';
}

// ============================================================================
// START
// ============================================================================
// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
