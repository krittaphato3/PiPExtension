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
};

// ============================================================================
// STATE
// ============================================================================
const state = {
  videoUrl: null,
  retryCount: 0,
  isLoaded: false,
};

// ============================================================================
// DOM REFERENCES
// ============================================================================
const els = {
  player: document.getElementById('player'),
  loader: document.getElementById('loader'),
  errorOverlay: document.getElementById('errorOverlay'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  retryBtn: document.getElementById('retryBtn'),
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

  console.log(`[FullPiP Player] Loading video: ${state.videoUrl}`);

  // Setup event listeners
  setupPlayerListeners();
  setupKeyboardListeners();
  setupRetryListener();

  // Load the video
  loadVideo();
}

// ============================================================================
// VIDEO LOADING
// ============================================================================
function loadVideo() {
  if (!state.videoUrl) return;

  // Reset state
  state.isLoaded = false;
  state.retryCount = 0;
  hideError();
  showLoader();

  // Set video source
  els.player.src = state.videoUrl;
  els.player.load();

  // Attempt autoplay
  els.player.play().catch((e) => {
    console.debug('[FullPiP Player] Autoplay prevented:', e.message);
  });
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
    els.player.play().catch(() => {});
  }, PLAYER_CONFIG.RETRY_DELAY_MS);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupPlayerListeners() {
  // Video is ready to play
  els.player.addEventListener('canplay', () => {
    if (!state.isLoaded) {
      state.isLoaded = true;
      setTimeout(() => hideLoader(), PLAYER_CONFIG.LOADER_HIDE_DELAY_MS);
    }
  });

  // Playback started
  els.player.addEventListener('playing', () => {
    hideLoader();
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
    // If we haven't loaded yet and retries remain, try again
    if (!state.isLoaded) {
      retryLoad();
    }
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
        // Toggle mute
        video.muted = !video.muted;
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
    state.retryCount = 0; // Reset retry counter for manual retry
    loadVideo();
  });
}

// ============================================================================
// ERROR HANDLING
// ============================================================================
function handleVideoError() {
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
      message: 'The loading process was interrupted by a user action or navigation.',
    },
    2: {
      title: 'Network error',
      message: 'A network error occurred while trying to load the video. Check your connection.',
    },
    3: {
      title: 'Decode error',
      message: 'The video format is not supported or the file is corrupted.',
    },
    4: {
      title: 'Source not supported',
      message: 'The video source is unavailable, has been removed, or is blocked by CORS policy.',
    },
  };

  const errorInfo = errorMessages[error.code] || {
    title: 'Unknown error',
    message: `Media error code: ${error.code}`,
  };

  showError(errorInfo.title, errorInfo.message);
}

function showError(title, message) {
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = message;
  els.errorOverlay.classList.remove('hidden');
  hideLoader();
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
