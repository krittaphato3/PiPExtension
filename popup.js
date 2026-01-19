/**
 * @file popup.js
 * @desc Manages settings state persistence via chrome.storage.
 */

const CONFIG_KEY = 'autoPipEnabled';
const elCheckbox = document.getElementById('autoPipCheckbox');

// Restore state
chrome.storage.sync.get([CONFIG_KEY], (res) => {
    elCheckbox.checked = !!res[CONFIG_KEY];
});

// Update state on change
elCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ [CONFIG_KEY]: e.target.checked });
});