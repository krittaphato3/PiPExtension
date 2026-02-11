/**
 * @file content.js
 * @author krittaphato3
 * @desc High-performance DOM agent. Features ShadowDOM piercing and Highlight logic.
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
  // Use a recursive search for Shadow DOM
  const scan = (root) => {
      let vids = Array.from(root.querySelectorAll('video'));
      root.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) vids = vids.concat(scan(el.shadowRoot));
      });
      return vids;
  };
  
  const videos = scan(document);
  const visible = videos.filter(v => {
    const r = v.getBoundingClientRect();
    return r.width > 20 && r.height > 20 && 
           getComputedStyle(v).display !== 'none' && 
           getComputedStyle(v).visibility !== 'hidden';
  });

  if (!visible.length) return null;

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
    
    // NOTE: getMediaList is now handled by executeScript in popup.js
    // but we keep the map population for consistency if needed.
    
    case "controlMedia":
      // Re-scan or find by ID
      let el = mediaMap.get(req.id);
      if (!el) {
         // Fallback: Try to find by ID again (in case map was cleared)
         const allVids = document.querySelectorAll('video, audio');
         for (const v of allVids) { if (v.dataset.pipId === req.id) el = v; }
      }

      if (el) {
        if (req.command === 'pip') {
            if (document.pictureInPictureElement === el) document.exitPictureInPicture();
            else el.requestPictureInPicture().catch(console.error);
        } else if (req.command === 'togglePlay') {
          el.paused ? el.play() : el.pause();
        }
      }
      break;

    case "highlightMedia":
        let hEl = mediaMap.get(req.id);
        if (!hEl) {
             const allVids = document.querySelectorAll('video, audio');
             for (const v of allVids) { if (v.dataset.pipId === req.id) hEl = v; }
        }
        if (hEl) {
            if (req.active) {
                hEl.style.outline = "4px solid #3b82f6";
                hEl.style.outlineOffset = "-4px";
                hEl.style.boxShadow = "0 0 20px rgba(59, 130, 246, 0.6)";
                hEl.scrollIntoView({behavior: "smooth", block: "center"});
            } else {
                hEl.style.outline = "";
                hEl.style.outlineOffset = "";
                hEl.style.boxShadow = "";
            }
        }
        break;
  }
});

// --- Picker Mode ---
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

// --- Element PiP (Live Image) ---
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
    
    // Copy Styles
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

// --- Video PiP ---
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

// --- Image PiP (Main Feature) ---
async function launchImagePiP() {
  const target = State.lastRightClickTarget;
  if (!target || !window.documentPictureInPicture) return;

  const settings = await chrome.storage.sync.get({
    pipInitialSize: 'half',
    pipBackgroundColor: 'auto',
    pipLockPan: false,
    pipEdgeLock: false,
    pipZoomSmartLimit: true,
    pipZoomSpeed: 1.0
  });

  if (State.pipWindow) {
    State.pipWindow.close();
    State.pipWindow = null;
  }

  // --- Smart Sizing Logic ---
  const nW = target.naturalWidth || target.width || 800;
  const nH = target.naturalHeight || target.height || 600;
  const sW = window.screen.availWidth;
  const sH = window.screen.availHeight;

  let finalW, finalH;

  if (settings.pipInitialSize === 'actual') {
      finalW = Math.min(nW, sW * 0.9);
      finalH = Math.min(nH, sH * 0.9);
  } else if (settings.pipInitialSize === 'fit') {
      const ratio = nW / nH;
      if (ratio > 1) { // Landscape
          finalW = sW * 0.8;
          finalH = finalW / ratio;
      } else { // Portrait
          finalH = sH * 0.8;
          finalW = finalH * ratio;
      }
  } else {
      // Half (Default)
      finalW = Math.max(300, nW / 2);
      finalH = Math.max(200, nH / 2);
  }

  try {
    State.pipWindow = await window.documentPictureInPicture.requestWindow({
      width: Math.round(finalW),
      height: Math.round(finalH)
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
    
    setupZoomAndPan(contentEl, settings, State.pipWindow);

    State.pipWindow.addEventListener("pagehide", cleanupPipState);

  } catch (e) {
    console.error("[FullPiP] Image Engine Failed:", e);
  }
}

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
      height: 100vh; width: 100vw;
      display: flex; justify-content: center; align-items: center; 
      overflow: hidden; 
    }
    img, video { 
      display: block;
      width: 100%; height: 100%; object-fit: contain; 
      user-select: none; will-change: transform;
    }
  `;
  doc.head.append(style);
}

function setupZoomAndPan(img, settings, pipWin) {
  let scale = 1;
  let pX = 0, pY = 0;
  let startX = 0, startY = 0;
  let basePx = 0, basePy = 0;
  let isDragging = false;
  let rafId = null;

  img.addEventListener('dragstart', (e) => e.preventDefault());

  const updateTransform = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        img.style.transform = `scale(${scale}) translate(${pX}px, ${pY}px)`;
    });
  };

  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    const speed = parseFloat(settings.pipZoomSpeed) || 1.0;
    const direction = e.deltaY > 0 ? (0.9 * (1/speed)) : (1.1 * speed);
    const safeFactor = e.deltaY > 0 ? Math.max(0.5, 1 - (0.1 * speed)) : Math.min(2, 1 + (0.1 * speed));
    let newScale = scale * safeFactor;

    if (settings.pipZoomSmartLimit) {
        newScale = Math.max(0.1, newScale);
    } else {
        newScale = Math.max(0.01, newScale);
    }
    
    scale = newScale;
    updateTransform();
  }, { passive: false });

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
        const deltaX = (e.clientX - startX);
        const deltaY = (e.clientY - startY);

        let nextPx = basePx + (deltaX / scale);
        let nextPy = basePy + (deltaY / scale);

        if (settings.pipEdgeLock) {
            const vpW = pipWin.innerWidth / scale;
            const vpH = pipWin.innerHeight / scale;
            nextPx = Math.max(-vpW/1.5, Math.min(vpW/1.5, nextPx));
            nextPy = Math.max(-vpH/1.5, Math.min(vpH/1.5, nextPy));
        }

        pX = nextPx;
        pY = nextPy;
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

  img.addEventListener('dblclick', () => {
      scale = 1;
      pX = 0;
      pY = 0;
      updateTransform();
  });
}

function extractBgImage(node) {
  const bg = getComputedStyle(node).backgroundImage;
  const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
  return match ? match[1] : "";
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