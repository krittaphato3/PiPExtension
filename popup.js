/**
 * @file popup.js
 * @desc UI Logic: Settings Persistence and Media Scanning
 */

const KEYS = { 
    THEME: 'themePref',
    AUTO_PIP: 'autoPipEnabled',
    
    // Viewer Behavior
    INITIAL_SIZE: 'pipInitialSize',
    BG_COLOR: 'pipBackgroundColor',
    
    // Interaction
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

// UI Element Map
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

// --- Event Listeners: Settings ---
Object.keys(els.inputs).forEach(key => {
    els.inputs[key].addEventListener('input', (e) => { // Use 'input' for sliders
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        
        if (key === KEYS.ZOOM_SPEED) els.speedLabel.innerText = val + 'x';
        
        // Debounce storage writes for sliders
        if (e.target.type === 'range') {
            saveDebounced(key, val);
        } else {
            chrome.storage.sync.set({ [key]: val });
        }
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

// --- Media Scanner ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    
    chrome.tabs.sendMessage(tabs[0].id, { action: "getMediaList" }, (response) => {
        const listEl = document.getElementById('media-list');
        if (chrome.runtime.lastError || !response || response.length === 0) {
            listEl.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 10px; font-size: 12px;">No media found on this page.</div>';
            return;
        }
        renderMediaList(response, listEl, tabs[0].id);
    });
});

function renderMediaList(mediaItems, container, tabId) {
    container.innerHTML = '';
    
    mediaItems.forEach(media => {
        const div = document.createElement('div');
        div.className = 'media-item';
        
        const isVideo = media.type === 'video';
        const icon = isVideo 
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';

        const playIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        const pipIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>'; 

        const time = formatTime(media.currentTime) + (media.duration ? ' / ' + formatTime(media.duration) : '');

        div.innerHTML = `
            <div class="media-info">
                <div class="media-title" style="display: flex; align-items: center; gap: 6px;">
                    ${icon} <span>${isVideo ? 'Video Player' : 'Audio Player'}</span>
                </div>
                <div class="media-meta">${time}</div>
            </div>
            <div class="media-controls">
                <button class="btn-icon" title="${media.paused ? 'Play' : 'Pause'}">
                    ${media.paused ? playIcon : pauseIcon}
                </button>
                ${isVideo ? `<button class="btn-icon pip-btn" title="Picture-in-Picture">${pipIcon}</button>` : ''}
            </div>
        `;

        const [playBtn, pipBtn] = div.querySelectorAll('button');
        
        playBtn.onclick = () => {
            chrome.tabs.sendMessage(tabId, { action: "controlMedia", id: media.id, command: "togglePlay" });
            const isPaused = playBtn.innerHTML.includes('rect'); 
            playBtn.innerHTML = isPaused ? playIcon : pauseIcon;
        };

        if (pipBtn) {
            pipBtn.onclick = () => chrome.tabs.sendMessage(tabId, { action: "controlMedia", id: media.id, command: "pip" });
        }
        container.appendChild(div);
    });
}

function formatTime(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function applyTheme(theme) {
    els.body.setAttribute('data-theme', theme);
    els.themeBtn.innerHTML = theme === 'light' ? ICONS.moon : ICONS.sun;
}