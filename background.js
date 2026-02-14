/**
 * @file background.js
 * @author krittaphato3
 * @desc Production-ready service worker.
 */

const MENUS = {
  VIDEO: "fullpip-video",
  IMAGE: "fullpip-image"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENUS.VIDEO, title: "FullPiP: Pop Video", contexts: ["video"] });
  chrome.contextMenus.create({ id: MENUS.IMAGE, title: "FullPiP: Pop Live Image", contexts: ["image"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const payload = { 
    srcUrl: info.srcUrl,
    type: info.menuItemId === MENUS.VIDEO ? 'video' : 'image'
  };
  dispatchToContent(tab.id, "contextMenuTrigger", payload);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-pip") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) dispatchToContent(tabs[0].id, "shortcutTrigger", {});
    });
  } else if (command === "toggle-picker") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) dispatchToContent(tabs[0].id, "togglePickerMode", {});
    });
  }
});

function dispatchToContent(tabId, action, data) {
  chrome.tabs.sendMessage(tabId, { action, ...data }).catch(err => {
    console.debug(`[FullPiP] IPC Handshake failed: ${err.message}`);
  });
}