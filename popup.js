/**
 * @file popup.js
 * @desc Advanced Media Scanner with Tainted Canvas Protection & Scale Mode
 */

const KEYS = { 
    THEME: 'themePref',
    AUTO_PIP: 'autoPipEnabled',
    SCALE_MODE: 'pipScaleMode',
    INITIAL_SIZE: 'pipInitialSize',
    BG_COLOR: 'pipBackgroundColor',
    LOCK_PAN: 'pipLockPan',
    EDGE_LOCK: 'pipEdgeLock',
    ZOOM_SMART_LIMIT: 'pipZoomSmartLimit',
    ZOOM_SPEED: 'pipZoomSpeed'
};

const DEFAULTS = {
    [KEYS.AUTO_PIP]: false,
    [KEYS.SCALE_MODE]: 'contain',
    [KEYS.INITIAL_SIZE]: 'visual', // CHANGED DEFAULT
    [KEYS.BG_COLOR]: 'auto',
    [KEYS.LOCK_PAN]: false,
    [KEYS.EDGE_LOCK]: false,
    [KEYS.ZOOM_SMART_LIMIT]: true,
    [KEYS.ZOOM_SPEED]: 1.0
};

// UI Map
const els = {
    themeBtn: document.getElementById('themeBtn'),
    body: document.body,
    speedLabel: document.getElementById('speedVal'),
    inputs: {
        [KEYS.AUTO_PIP]: document.getElementById('autoPipEnabled'),
        [KEYS.SCALE_MODE]: document.getElementById('pipScaleMode'),
        [KEYS.INITIAL_SIZE]: document.getElementById('pipInitialSize'),
        [KEYS.BG_COLOR]: document.getElementById('pipBackgroundColor'),
        [KEYS.LOCK_PAN]: document.getElementById('pipLockPan'),
        [KEYS.EDGE_LOCK]: document.getElementById('pipEdgeLock'),
        [KEYS.ZOOM_SMART_LIMIT]: document.getElementById('pipZoomSmartLimit'),
        [KEYS.ZOOM_SPEED]: document.getElementById('pipZoomSpeed')
    }
};

const ICONS = {
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
};

// --- Initialization ---
chrome.storage.sync.get(null, (items) => {
    applyTheme(items[KEYS.THEME] || 'dark');
    Object.keys(els.inputs).forEach(key => {
        const val = items[key] !== undefined ? items[key] : DEFAULTS[key];
        const el = els.inputs[key];
        if (el.type === 'checkbox') el.checked = val;
        else el.value = val;
        if (key === KEYS.ZOOM_SPEED) els.speedLabel.innerText = val + 'x';
    });
});

Object.keys(els.inputs).forEach(key => {
    els.inputs[key].addEventListener('input', (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (key === KEYS.ZOOM_SPEED) els.speedLabel.innerText = val + 'x';
        if (e.target.type === 'range') saveDebounced(key, val);
        else chrome.storage.sync.set({ [key]: val });
    });
});

let saveTimeout;
function saveDebounced(key, val) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => chrome.storage.sync.set({ [key]: val }), 300);
}

els.themeBtn.addEventListener('click', () => {
    const isDark = els.body.getAttribute('data-theme') !== 'light';
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    chrome.storage.sync.set({ [KEYS.THEME]: newTheme });
});

// --- SAFE MEDIA SCANNER ---
function scanForMediaInFrame() {
    const getMediaInfo = (el) => {
        try {
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) return null;
            if (getComputedStyle(el).display === 'none') return null;
            if (el.tagName === 'VIDEO' && !el.currentSrc && !el.src) return null;
            
            let thumbnail = null;
            let isPortrait = false;

            if (el.tagName === 'VIDEO' && el.readyState >= 2) {
                const w = el.videoWidth || rect.width;
                const h = el.videoHeight || rect.height;
                isPortrait = h > w; 

                try {
                    const canvas = document.createElement('canvas');
                    if (isPortrait) { canvas.width = 54; canvas.height = 96; } 
                    else { canvas.width = 96; canvas.height = 54; }
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
                    thumbnail = canvas.toDataURL('image/jpeg', 0.5);
                } catch(err) {
                    if (el.poster) thumbnail = el.poster;
                    else thumbnail = null; 
                }
            } else if (el.tagName === 'VIDEO' && el.poster) {
                thumbnail = el.poster;
            }

            let title = document.title;
            const aria = el.getAttribute('aria-label') || el.getAttribute('title');
            if (aria) title = aria;

            return {
                pipId: el.dataset.pipId || (el.dataset.pipId = Math.random().toString(36).substr(2, 9)),
                type: el.tagName.toLowerCase(),
                src: el.currentSrc || el.src,
                paused: el.paused,
                currentTime: el.currentTime,
                duration: el.duration,
                volume: el.volume,
                muted: el.muted,
                thumbnail: thumbnail,
                pageTitle: title,
                isPortrait: isPortrait,
                isIframe: window !== window.top
            };
        } catch (e) {
            return null;
        }
    };

    const findAllMedia = (root = document) => {
        let media = Array.from(root.querySelectorAll('video, audio'));
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
        let node;
        while(node = walker.nextNode()) {
            if (node.shadowRoot) {
                media = media.concat(findAllMedia(node.shadowRoot));
            }
        }
        return media;
    };

    return findAllMedia(document).map(getMediaInfo).filter(x => x !== null);
}

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]?.id) return;
    const tabId = tabs[0].id;

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: scanForMediaInFrame
        });

        const allMedia = [];
        results.forEach(frameResult => {
            if (frameResult.result) {
                frameResult.result.forEach(item => {
                    item.frameId = frameResult.frameId; 
                    allMedia.push(item);
                });
            }
        });

        renderMediaList(allMedia, document.getElementById('media-list'), tabId);

    } catch (e) {
        document.getElementById('media-list').innerHTML = 
            '<div style="text-align: center; color: var(--text-sub); padding: 10px; font-size: 12px;">Restricted page or loading...</div>';
    }
});

function renderMediaList(mediaItems, container, tabId) {
    container.innerHTML = '';
    if (mediaItems.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 10px; font-size: 12px;">No playable media found.</div>';
        return;
    }
    mediaItems.sort((a, b) => (a.paused === b.paused) ? 0 : a.paused ? 1 : -1);

    mediaItems.forEach(media => {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        let visual = '';
        const thumbClass = media.isPortrait ? 'media-thumb portrait' : 'media-thumb';
        
        if (media.thumbnail) {
            visual = `<div class="${thumbClass}" style="background-image: url('${media.thumbnail}')"></div>`;
        } else {
            const iconSvg = media.type === 'video' 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
            visual = `<div class="${thumbClass}" style="background: var(--input-bg); display:flex; justify-content:center; align-items:center;">${iconSvg}</div>`;
        }

        const playIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        const pipIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>'; 

        const time = formatTime(media.currentTime) + (media.duration ? ' / ' + formatTime(media.duration) : '');
        const titleText = media.pageTitle === 'FullPiP Control Center' ? 'Unknown Video' : media.pageTitle;
        const subText = media.isIframe ? `<span style="color:var(--accent)">Embedded Frame</span> • ${time}` : time;

        div.innerHTML = `
            ${visual}
            <div class="media-info">
                <div class="media-title">${titleText}</div>
                <div class="media-meta">${subText}</div>
            </div>
            <div class="media-controls">
                <button class="btn-icon play-btn" title="${media.paused ? 'Play' : 'Pause'}">
                    ${media.paused ? playIcon : pauseIcon}
                </button>
                ${media.type === 'video' ? `<button class="btn-icon pip-btn" title="Picture-in-Picture">${pipIcon}</button>` : ''}
            </div>
        `;

        const playBtn = div.querySelector('.play-btn');
        const pipBtn = div.querySelector('.pip-btn');
        
        div.addEventListener('mouseenter', () => {
            chrome.tabs.sendMessage(tabId, { action: "highlightMedia", id: media.pipId, active: true }, { frameId: media.frameId });
        });
        div.addEventListener('mouseleave', () => {
            chrome.tabs.sendMessage(tabId, { action: "highlightMedia", id: media.pipId, active: false }, { frameId: media.frameId });
        });

        playBtn.onclick = () => {
            chrome.tabs.sendMessage(tabId, { action: "controlMedia", id: media.pipId, command: "togglePlay" }, { frameId: media.frameId });
            const isPaused = playBtn.innerHTML.includes('rect'); 
            playBtn.innerHTML = isPaused ? playIcon : pauseIcon;
        };

        if (pipBtn) {
            pipBtn.onclick = () => chrome.tabs.sendMessage(tabId, { action: "controlMedia", id: media.pipId, command: "pip" }, { frameId: media.frameId });
        }
        container.appendChild(div);
    });
}

function formatTime(seconds) {
    if (!seconds) return '0:00';
    if (seconds === Infinity) return 'Live';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function applyTheme(theme) {
    els.body.setAttribute('data-theme', theme);
    els.themeBtn.innerHTML = theme === 'light' ? ICONS.moon : ICONS.sun;
}