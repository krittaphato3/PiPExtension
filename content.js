/**
 * @file content.js
 * @author krittaphato3
 * @desc Handles DOM interactions, Document PiP API implementation, and Auto-trigger logic.
 */

let ctxTarget = null; // Caches last right-clicked element
let pipWindow = null;
let imgObserver = null;

// Capture right-click target for context-aware operations
document.addEventListener("mousedown", (e) => {
    if (e.button === 2) ctxTarget = e.target;
}, true);

// IPC Listener
chrome.runtime.onMessage.addListener((req) => {
    const actions = {
        "triggerVideoPiP": () => execVideoPiP(req.srcUrl),
        "triggerImagePiP": () => execLiveImagePiP()
    };
    if (actions[req.action]) actions[req.action]();
});

/**
 * Executes Standard Video PiP
 * @param {string} srcUrl - Source URL of the target video
 */
async function execVideoPiP(srcUrl) {
    const video = document.querySelector(`video[src="${srcUrl}"]`) || document.querySelector('video');
    
    if (!video?.requestPictureInPicture) return;

    try {
        await video.requestPictureInPicture();
    } catch (e) {
        console.error("[FullPiP] Video PiP Failed:", e);
    }
}

/**
 * Executes Document PiP for Images with MutationObserver sync
 */
async function execLiveImagePiP() {
    if (!ctxTarget || !window.documentPictureInPicture) {
        return console.warn("[FullPiP] Target invalid or API unsupported.");
    }

    // Cleanup existing instances
    if (pipWindow) pipWindow.close();

    try {
        // Init PiP Window
        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: ctxTarget.naturalWidth / 2 || 400,
            height: ctxTarget.naturalHeight / 2 || 300
        });

        const doc = pipWindow.document;
        Object.assign(doc.body.style, {
            margin: '0', background: '#000', display: 'flex', 
            justifyContent: 'center', alignItems: 'center', height: '100vh'
        });

        const img = doc.createElement('img');
        Object.assign(img.style, {
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'
        });
        
        img.src = ctxTarget.src || getComputedStyle(ctxTarget).backgroundImage.slice(5, -2);
        doc.body.appendChild(img);

        if (imgObserver) imgObserver.disconnect();
        
        imgObserver = new MutationObserver((mutations) => {
            if (mutations.some(m => m.type === 'attributes' && ['src', 'srcset'].includes(m.attributeName))) {
                img.src = ctxTarget.src;
            }
        });

        imgObserver.observe(ctxTarget, { attributes: true });

        pipWindow.addEventListener("pagehide", () => {
             if (imgObserver) imgObserver.disconnect();
             pipWindow = null;
        });

    } catch (e) {
        console.error("[FullPiP] DocPiP Error:", e);
    }
}

/**
 * Auto-PiP logic based on user config
 */
(() => {
    chrome.storage.sync.get(['autoPipEnabled'], ({ autoPipEnabled }) => {
        if (!autoPipEnabled) return;

        const autoTrigger = async () => {
            const v = document.querySelector('video');
            if (v && v.readyState > 0) {
                try {
                    await v.requestPictureInPicture();
                    ['click', 'keydown'].forEach(evt => 
                        document.removeEventListener(evt, autoTrigger, { capture: true })
                    );
                } catch (e) {}
            }
        };
        ['click', 'keydown'].forEach(evt => 
            document.addEventListener(evt, autoTrigger, { capture: true })
        );
    });
})();