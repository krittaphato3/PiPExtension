/**
 * @file content.js
 * @author krittaphato3
 * @desc High-performance DOM agent. Features debounce logic and crash protection.
 */

// --- State Management ---
const State = {
  lastRightClickTarget: null,
  pipWindow: null,
  observer: null,
  isHoveringPip: false
};

// --- Utilities ---
const Debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

// --- Event Listeners ---
document.addEventListener("mousedown", (e) => {
  if (e.button === 2) State.lastRightClickTarget = e.target;
}, true);

chrome.runtime.onMessage.addListener((req) => {
  switch (req.action) {
    case "contextMenuTrigger":
      req.type === 'video' ? launchVideoPiP(req.srcUrl) : launchImagePiP();
      break;
    case "shortcutTrigger":
      // Heuristic: Try video first, then fallback to last clicked image
      const mainVideo = document.querySelector('video');
      if (mainVideo) launchVideoPiP(mainVideo.src);
      else if (State.lastRightClickTarget) launchImagePiP();
      break;
  }
});

// --- Core Feature: Video PiP ---
async function launchVideoPiP(srcUrl) {
  const video = (srcUrl && document.querySelector(`video[src="${srcUrl}"]`)) 
                || document.querySelector('video');

  if (!video) return console.warn("[FullPiP] No video found.");
  if (video.disablePictureInPicture) return alert("This site has disabled PiP.");

  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    await video.requestPictureInPicture();
  } catch (e) {
    console.error("[FullPiP] Video Error:", e);
  }
}

// --- Core Feature: Live Image PiP ---
async function launchImagePiP() {
  const target = State.lastRightClickTarget;
  if (!target || !window.documentPictureInPicture) return;

  // 1. Close existing to prevent collisions
  if (State.pipWindow) {
    State.pipWindow.close();
    State.pipWindow = null;
  }

  try {
    // 2. Open Window
    State.pipWindow = await window.documentPictureInPicture.requestWindow({
      width: target.naturalWidth / 2 || 500,
      height: target.naturalHeight / 2 || 500
    });

    // 3. Style & Inject
    const doc = State.pipWindow.document;
    setupPipStyles(doc);

    const img = doc.createElement('img');
    img.id = "fullpip-live-img";
    img.src = target.src || extractBgImage(target);
    doc.body.append(img);

    // 4. Optimized Sync (Debounced 50ms)
    setupLiveSync(target, img);

    // 5. Cleanup Hook
    State.pipWindow.addEventListener("pagehide", cleanupPipState);

  } catch (e) {
    console.error("[FullPiP] Image Engine Failed:", e);
  }
}

// --- Logic: Sync & Optimization ---
function setupLiveSync(sourceNode, pipImgNode) {
  if (State.observer) State.observer.disconnect();

  const syncLogic = Debounce(() => {
    const newSrc = sourceNode.src || extractBgImage(sourceNode);
    if (pipImgNode.src !== newSrc) {
      pipImgNode.src = newSrc;
    }
  }, 50); // 50ms delay reduces CPU load on rapid changes

  State.observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(m => 
      m.type === 'attributes' && ['src', 'srcset', 'style'].includes(m.attributeName)
    );
    if (relevant) syncLogic();
  });

  State.observer.observe(sourceNode, { attributes: true });
}

function cleanupPipState() {
  if (State.observer) State.observer.disconnect();
  State.pipWindow = null;
  State.observer = null;
}

// --- Logic: Styling & UI ---
function setupPipStyles(doc) {
  const style = doc.createElement('style');
  style.textContent = `
    body { 
      margin: 0; background: #000; height: 100vh; 
      display: flex; justify-content: center; align-items: center; 
      overflow: hidden; cursor: none; /* Hide cursor for clean look */
    }
    body:hover { cursor: default; } /* Show cursor on hover */
    img { 
      max-width: 100%; max-height: 100%; object-fit: contain; 
      pointer-events: none; user-select: none;
    }
  `;
  doc.head.append(style);
}

function extractBgImage(node) {
  const bg = getComputedStyle(node).backgroundImage;
  return (bg.match(/url\(['"]?([^'"]*)['"]?\)/) || [])[1] || "";
}

// --- Auto-PiP Engine ---
(function initAutoPip() {
  chrome.storage.sync.get(['autoPipEnabled'], ({ autoPipEnabled }) => {
    if (!autoPipEnabled) return;

    const attemptPip = async () => {
      const v = document.querySelector('video');
      // Only trigger if video is playing or ready to prevent errors
      if (v && v.readyState > 0 && !v.paused) {
        try {
          await v.requestPictureInPicture();
          cleanupAutoListeners();
        } catch (e) { /* Pending user interaction */ }
      }
    };

    const cleanupAutoListeners = () => {
      ['click', 'keydown', 'scroll'].forEach(evt => 
        document.removeEventListener(evt, attemptPip, { capture: true })
      );
    };

    // Add listeners
    ['click', 'keydown', 'scroll'].forEach(evt => 
      document.addEventListener(evt, attemptPip, { capture: true, passive: true })
    );
  });
})();