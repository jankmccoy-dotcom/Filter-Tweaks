console.log("Video Filter extension loaded.");

const DEFAULT_FILTERS = {
  hue: 0,
  saturate: 100,
  sepia: 0,
  contrast: 100,
  brightness: 100,
  grayscale: false,
  invert: false,   // include this if you want invert checkbox support
  volume: 100
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["filter_profiles"], (result) => {
    const profiles = result["filter_profiles"] || {};
    if (!profiles["Default"]) {
      profiles["Default"] = DEFAULT_FILTERS;
      chrome.storage.local.set({ filter_profiles: profiles }, () => {
        console.log("Default filter profile created.");
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getTabId") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse(tabs[0]?.id);
    });
    return true; // keep channel open for async response
  }
});

// Reset per-tab filters when the main frame navigates (new URL in the same tab)
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // only top-level
  const key = `filters_tab_${details.tabId}`;
  chrome.storage.local.remove(key);

  // Re-apply the Default profile so the new page starts clean
  chrome.tabs.sendMessage(details.tabId, { type: "applyFilters", filters: DEFAULT_FILTERS });
});
