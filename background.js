/**
 * @file background.js
 * @author krittaphato3
 * @desc Service worker handling context menu initialization and IPC message routing.
 */

chrome.runtime.onInstalled.addListener(() => {
  const menus = [
    { id: "fullpip-video", title: "FullPiP: Open Video", contexts: ["video"] },
    { id: "fullpip-image", title: "FullPiP: Open Live Image", contexts: ["image"] }
  ];

  menus.forEach(menu => chrome.contextMenus.create(menu));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const actionMap = {
    "fullpip-video": "triggerVideoPiP",
    "fullpip-image": "triggerImagePiP"
  };

  if (actionMap[info.menuItemId]) {
    chrome.tabs.sendMessage(tab.id, { 
      action: actionMap[info.menuItemId], 
      srcUrl: info.srcUrl 
    }).catch(err => console.debug("IPC Error (Content script likely not ready):", err));
  }
});