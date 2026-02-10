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
  isHoveringPip: false,
  isPickerActive: false
};

const mediaMap = new Map();

// --- Utilities ---
const Debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

const getMediaId = (el) => {
  if (!el.dataset.pipId) {
    el.dataset.pipId = Math.random().toString(36).substr(2, 9);
    mediaMap.set(el.dataset.pipId, el);
  }
  return el.dataset.pipId;
};

const findMainVideo = () => {
  const videos = Array.from(document.querySelectorAll('video'));
  const visible = videos.filter(v => {
    const r = v.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && 
           getComputedStyle(v).display !== 'none' && 
           getComputedStyle(v).visibility !== 'hidden';
  });

  if (!visible.length) return null;

  // Sort by surface area (largest first)
  visible.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return (rb.width * rb.height) - (ra.width * ra.height);
  });

  const playing = visible.find(v => !v.paused && v.readyState > 2);
  return playing || visible[0];
};

// --- Event Listeners ---
document.addEventListener("mousedown", (e) => {
  if (State.isPickerActive) return; 
  if (e.button === 2) State.lastRightClickTarget = e.target;
}, true);

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  switch (req.action) {
    case "contextMenuTrigger":
      req.type === 'video' ? launchVideoPiP(req.srcUrl) : launchImagePiP();
      break;
    case "shortcutTrigger":
      const mainVideo = findMainVideo();
      if (mainVideo) launchVideoPiP(mainVideo);
      else if (State.lastRightClickTarget) launchImagePiP();
      break;
    case "togglePickerMode":
      togglePickerMode();
      break;
    case "getMediaList":
      const list = Array.from(document.querySelectorAll('video, audio')).map(el => ({
        id: getMediaId(el),
        type: el.tagName.toLowerCase(),
        src: el.currentSrc || el.src,
        paused: el.paused,
        currentTime: el.currentTime,
        duration: el.duration
      }));
      sendResponse(list);
      return true; 
    case "controlMedia":
      const el = mediaMap.get(req.id);
      if (el) {
        if (req.command === 'pip') {
            if (document.pictureInPictureElement === el) document.exitPictureInPicture();
            else el.requestPictureInPicture().catch(console.error);
        } else if (req.command === 'togglePlay') {
          el.paused ? el.play() : el.pause();
        }
      }
      break;
  }
});

// --- Picker Mode Logic ---
function togglePickerMode() {
  State.isPickerActive = !State.isPickerActive;
  
  if (State.isPickerActive) {
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', handlePickerHover, true);
    document.addEventListener('click', handlePickerClick, true);
    document.addEventListener('keydown', handlePickerKey, true);
    
    const style = document.createElement('style');
    style.id = 'fullpip-picker-style';
    style.textContent = `.fullpip-highlight { outline: 2px solid #2196F3 !important; box-shadow: 0 0 10px rgba(33, 150, 243, 0.5) !important; cursor: crosshair !important; }`;
    document.head.appendChild(style);
  } else {
    document.body.style.cursor = '';
    document.removeEventListener('mouseover', handlePickerHover, true);
    document.removeEventListener('click', handlePickerClick, true);
    document.removeEventListener('keydown', handlePickerKey, true);
    
    const style = document.getElementById('fullpip-picker-style');
    if (style) style.remove();
    
    const highlighted = document.querySelector('.fullpip-highlight');
    if (highlighted) highlighted.classList.remove('fullpip-highlight');
  }
}

function handlePickerHover(e) {
  e.stopPropagation();
  const prev = document.querySelector('.fullpip-highlight');
  if (prev) prev.classList.remove('fullpip-highlight');
  e.target.classList.add('fullpip-highlight');
}

function handlePickerClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.target;
  togglePickerMode();
  launchElementPiP(target);
}

function handlePickerKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    togglePickerMode();
  }
}

// --- Core Feature: Generic Element PiP ---
async function launchElementPiP(sourceNode) {
  if (!window.documentPictureInPicture) return;
  
  if (State.pipWindow) {
    State.pipWindow.close();
    State.pipWindow = null;
  }

  try {
    const rect = sourceNode.getBoundingClientRect();
    State.pipWindow = await window.documentPictureInPicture.requestWindow({
      width: rect.width || 500,
      height: rect.height || 500
    });

    const doc = State.pipWindow.document;
    
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
      } catch (e) { }
    });

    const baseStyle = doc.createElement('style');
    baseStyle.textContent = `body { margin: 0; display: grid; place-items: center; height: 100vh; background: transparent; }`;
    doc.head.append(baseStyle);

    const clone = sourceNode.cloneNode(true);
    clone.style.position = 'static'; 
    clone.style.margin = '0';
    doc.body.append(clone);
    
    State.pipWindow.addEventListener("pagehide", cleanupPipState);

  } catch (e) {
    console.error("[FullPiP] Element Picker Failed:", e);
  }
}

// --- Core Feature: Video PiP ---
async function launchVideoPiP(target) {
  let video;
  
  if (target instanceof HTMLVideoElement) {
    video = target;
  } else if (typeof target === 'string') {
    video = document.querySelector(`video[src="${target}"]`);
  }

  if (!video) video = findMainVideo();

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

  // Fetch Settings first
  const settings = await chrome.storage.sync.get({
    pipLockPan: false,
    pipInvertZoom: false,
    pipDblClickReset: true,
    pipBackgroundColor: 'auto'
  });

  if (State.pipWindow) {
    State.pipWindow.close();
    State.pipWindow = null;
  }

  try {
    State.pipWindow = await window.documentPictureInPicture.requestWindow({
      width: (target.naturalWidth || target.width) / 2 || 500,
      height: (target.naturalHeight || target.height) / 2 || 500
    });

    const doc = State.pipWindow.document;
    setupPipStyles(doc, target, settings.pipBackgroundColor);

    let contentEl;
    if (target.tagName === 'CANVAS') {
      contentEl = doc.createElement('video');
      contentEl.muted = true;
      contentEl.autoplay = true;
      contentEl.srcObject = target.captureStream(60);
    } else {
      contentEl = doc.createElement('img');
      contentEl.src = target.src || extractBgImage(target);
      setupLiveSync(target, contentEl);
    }
    
    contentEl.id = "fullpip-live-content";
    doc.body.append(contentEl);
    
    setupZoomAndPan(contentEl, settings);

    State.pipWindow.addEventListener("pagehide", cleanupPipState);

  } catch (e) {
    console.error("[FullPiP] Image Engine Failed:", e);
  }
}

// --- Logic: Sync & Optimization ---
function setupLiveSync(sourceNode, pipImgNode) {
  if (State.observer) State.observer.disconnect();

  const syncLogic = Debounce(() => {
    const newSrc = sourceNode.currentSrc || sourceNode.src || extractBgImage(sourceNode);
    if (pipImgNode.src !== newSrc) {
      pipImgNode.src = newSrc;
    }
  }, 50);

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
function setupPipStyles(doc, sourceNode, bgSetting) {
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
  } else {
    // Auto
    try {
        if (sourceNode && sourceNode.parentElement) {
           bgColor = window.getComputedStyle(sourceNode.parentElement).backgroundColor;
           if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') bgColor = '#000';
        }
    } catch (e) {}
  }

  const style = doc.createElement('style');
  style.textContent = `
    body { 
      margin: 0; 
      background-color: ${bgColor}; 
      background-image: ${bgImage};
      background-size: ${bgSize};
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
      height: 100vh; 
      display: flex; justify-content: center; align-items: center; 
      overflow: hidden; 
    }
    img, video { 
      width: 100%; height: 100%; object-fit: contain; 
      user-select: none;
    }
  `;
  doc.head.append(style);
}

// --- Logic: Interactive Zoom/Pan ---
function setupZoomAndPan(img, settings) {
  let scale = 1;
  let pX = 0, pY = 0;
  let startX = 0, startY = 0;
  let basePx = 0, basePy = 0;
  let isDragging = false;

  img.addEventListener('dragstart', (e) => e.preventDefault());

  const updateTransform = () => {
    img.style.transform = `scale(${scale}) translate(${pX}px, ${pY}px)`;
  };

  // Zoom Logic
  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Check Invert Zoom Setting
    let direction = e.deltaY > 0 ? 0.9 : 1.1;
    if (settings.pipInvertZoom) direction = e.deltaY > 0 ? 1.1 : 0.9;
    
    scale *= direction;
    scale = Math.max(0.1, scale); 
    updateTransform();
  }, { passive: false });

  // Pan Logic (Only if not Locked)
  if (!settings.pipLockPan) {
      img.addEventListener('pointerdown', (e) => {
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
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        pX = basePx + (deltaX / scale);
        pY = basePy + (deltaY / scale);
        
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

  // Reset Logic
  if (settings.pipDblClickReset) {
      img.addEventListener('dblclick', () => {
          scale = 1;
          pX = 0;
          pY = 0;
          updateTransform();
      });
  }
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
      if (v && v.readyState > 0 && !v.paused) {
        try {
          await v.requestPictureInPicture();
          cleanupAutoListeners();
        } catch (e) { }
      }
    };

    const cleanupAutoListeners = () => {
      ['click', 'keydown', 'scroll'].forEach(evt => 
        document.removeEventListener(evt, attemptPip, { capture: true })
      );
    };

    ['click', 'keydown', 'scroll'].forEach(evt => 
      document.addEventListener(evt, attemptPip, { capture: true, passive: true })
    );
  });
})();