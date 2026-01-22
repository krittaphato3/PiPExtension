/**
 * @file popup.js
 * @desc UI Logic: Theme handling and Settings Persistence
 */

const KEYS = { AUTO_PIP: 'autoPipEnabled', THEME: 'themePref' };
const els = {
    checkbox: document.getElementById('autoPipCheckbox'),
    themeBtn: document.getElementById('themeBtn'),
    body: document.body
};

// Icons
const ICONS = {
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
};

// --- Initialization ---
chrome.storage.sync.get([KEYS.AUTO_PIP, KEYS.THEME], (res) => {
    // 1. Restore Checkbox
    els.checkbox.checked = !!res[KEYS.AUTO_PIP];
    
    // 2. Restore Theme (Default to Dark if unset)
    const currentTheme = res[KEYS.THEME] || 'dark';
    applyTheme(currentTheme);
});

// --- Event Handlers ---
els.checkbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ [KEYS.AUTO_PIP]: e.target.checked });
});

els.themeBtn.addEventListener('click', () => {
    const isDark = els.body.getAttribute('data-theme') !== 'light';
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    chrome.storage.sync.set({ [KEYS.THEME]: newTheme });
});

// --- Helper Functions ---
function applyTheme(theme) {
    els.body.setAttribute('data-theme', theme);
    els.themeBtn.innerHTML = theme === 'light' ? ICONS.moon : ICONS.sun;
}