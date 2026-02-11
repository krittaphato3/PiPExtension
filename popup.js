/**
 * @file popup.js
 * @desc Advanced Media Scanner with Frame Support & Thumbnails
 */

const KEYS = { 
    THEME: 'themePref',
    AUTO_PIP: 'autoPipEnabled',
    INITIAL_SIZE: 'pipInitialSize',
    BG_COLOR: 'pipBackgroundColor',
    LOCK_PAN: 'pipLockPan',
    EDGE_LOCK: 'pipEdgeLock',
    ZOOM_SMART_LIMIT: 'pipZoomSmartLimit',
    ZOOM_SPEED: 'pipZoomSpeed'
};

const DEFAULTS = {
    [KEYS.AUTO_PIP]: false,
    [KEYS.INITIAL_SIZE]: 'half',
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

// --- ADVANCED MEDIA SCANNER ---
// This injects a script into ALL frames to find videos
function scanForMediaInFrame() {
    const getMediaInfo = (el) => {
        const rect = el.getBoundingClientRect();
        // FILTER: Ignore tiny invisible videos (ads/trackers)
        if (rect.width < 50 || rect.height < 50) return null;
        if (getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return null;
        
        let thumbnail = null;
        try {
            if (el.tagName === 'VIDEO' && el.readyState >= 2) {
                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 90;
                canvas.getContext('2d').drawImage(el, 0, 0, canvas.width, canvas.height);
                thumbnail = canvas.toDataURL('image/jpeg', 0.5);
            }
        } catch(e) { /* CORS block */ }

        // Smart Title
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
            isIframe: window !== window.top
        };
    };

    const findAllMedia = (root = document) => {
        let media = Array.from(root.querySelectorAll('video, audio'));
        // Basic Shadow DOM Scan
        const allNodes = root.querySelectorAll('*');
        for (const node of allNodes) {
            if (node.shadowRoot) {
                media = media.concat(findAllMedia(node.shadowRoot));
            }
        }
        return media;
    };

    return findAllMedia().map(getMediaInfo).filter(x => x !== null);
}

// Execute the scan
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
        console.error("Scan failed", e);
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
    
    // Sort: Playing first
    mediaItems.sort((a, b) => (a.paused === b.paused) ? 0 : a.paused ? 1 : -1);

    mediaItems.forEach(media => {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        // Thumb or Icon
        let visual = '';
        if (media.thumbnail) {
            visual = `<div class="media-thumb" style="background-image: url('${media.thumbnail}')"></div>`;
        } else {
            const iconSvg = media.type === 'video' 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
            visual = `<div class="media-icon-placeholder">${iconSvg}</div>`;
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
        
        // Highlight logic
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