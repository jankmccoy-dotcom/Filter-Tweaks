const audioContexts = new WeakMap();      // media -> { context, gainNode }
const lastGainValues = new WeakMap();     // media -> number

// --- messaging ---
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "applyFilters") applyFilters(message.filters);
});

// --- auto-apply on load ---
chrome.runtime.sendMessage({ type: "getTabId" }, (tabId) => {
  if (!tabId) return;
  const key = `filters_tab_${tabId}`;
  chrome.storage.local.get([key], (res) => {
    const filters = res[key];
    if (filters) applyFilters(filters);
    else {
      chrome.storage.local.get(["filter_profiles"], (res2) => {
        const defaultProfile = res2.filter_profiles?.Default;
        if (defaultProfile) applyFilters(defaultProfile);
      });
    }
  });
});

// --- core ---
function applyFilters(f) {
  // Coerce & default
  const hue        = toNum(f.hue, 0);
  const saturate   = toNum(f.saturate, 100);
  const sepia      = toNum(f.sepia, 0);
  const contrast   = toNum(f.contrast, 100);
  const brightness = toNum(f.brightness, 100);
  const grayscale  = !!f.grayscale;
  const invert     = !!f.invert;
  const volumePct  = clamp(toNum(f.volume, 100), 0, 400); // allow up to 4x if you like

  // CSS filter
  const filterString =
    `hue-rotate(${hue}deg) saturate(${saturate}%) sepia(${sepia}%) ` +
    `contrast(${contrast}%) brightness(${brightness}%) ` +
    `invert(${invert ? 100 : 0}%) grayscale(${grayscale ? 100 : 0}%)`;
  document.documentElement.style.filter = filterString;

  // Audio gain
  setGainForAllMedia(volumePct / 100);
  // Also hook future elements/plays
  ensureMediaHooks();
}

function toNum(v, d=0){ const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(n, a, b){ return Math.min(Math.max(n, a), b); }

// Create/adjust gain nodes for all current media
function setGainForAllMedia(currentGain){
  document.querySelectorAll('video, audio').forEach(media => {
    try {
      attachGainPipeline(media, currentGain);
    } catch (e) {
      console.warn("Volume handling error:", e);
    }
  });
}

function attachGainPipeline(media, currentGain){
  // If we already have a pipeline, just update gain
  if (audioContexts.has(media)) {
    const { context, gainNode } = audioContexts.get(media);
    if (lastGainValues.get(media) !== currentGain) {
      gainNode.gain.setTargetAtTime(currentGain, context.currentTime, 0.05);
      lastGainValues.set(media, currentGain);
    }
    return;
  }

  // Defer creation until playback (helps with gesture/autoplay policies)
  const onPlay = () => {
    try {
      if (audioContexts.has(media)) return; // double-guard

      const context = new (window.AudioContext || window.webkitAudioContext)();
      const source = context.createMediaElementSource(media);
      const gainNode = context.createGain();
      gainNode.gain.value = currentGain;

      source.connect(gainNode).connect(context.destination);
      audioContexts.set(media, { context, gainNode });
      lastGainValues.set(media, currentGain);

      if (context.state === "suspended") {
        context.resume().catch(e => console.warn("Failed to resume AudioContext:", e));
      }
    } catch (e) {
      console.warn("Audio pipeline error:", e);
    } finally {
      media.removeEventListener('play', onPlay);
    }
  };

  // If it’s already playing, build immediately; else wait for user play
  if (!media.paused && !media.ended && media.readyState >= 2) onPlay();
  else media.addEventListener('play', onPlay, { once: true });
}

// Observe future media nodes (SPA, lazy loads)
let mediaObserverInitialized = false;
function ensureMediaHooks(){
  if (mediaObserverInitialized) return;
  mediaObserverInitialized = true;

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes?.forEach(node => {
        if (node instanceof HTMLElement) {
          if (node.matches?.('video, audio')) attachGainPipeline(node, lastGlobalGain());
          node.querySelectorAll?.('video, audio').forEach(el => attachGainPipeline(el, lastGlobalGain()));
        }
      });
      m.removedNodes?.forEach(node => {
        if (node instanceof HTMLElement) {
          if (audioContexts.has(node)) {
            try {
              const { context } = audioContexts.get(node);
              context.close().catch(()=>{});
            } catch{}
            audioContexts.delete(node);
            lastGainValues.delete(node);
          }
        }
      });
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
}

// Remember the most recent gain applied (fallback 1.0)
function lastGlobalGain(){
  // Try to read from any tracked media
  for (const [media, gain] of lastGainValues) return gain;
  return 1.0;
}
