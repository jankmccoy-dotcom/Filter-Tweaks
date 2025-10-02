const DEFAULT_FILTERS = {
  hue: 0,
  saturate: 100,
  sepia: 0,
  contrast: 100,
  brightness: 100,
  grayscale: false,
  invert: false,
  volume: 100
};

function getCurrentSliders() {
  return {
    hue: parseInt(document.getElementById('hue').value),
    saturate: parseInt(document.getElementById('saturate').value),
    sepia: parseInt(document.getElementById('sepia').value),
    contrast: parseInt(document.getElementById('contrast').value),
    brightness: parseInt(document.getElementById('brightness').value),
    grayscale: document.getElementById('grayscale').checked,
    invert: document.getElementById('invert').checked,
    volume: parseInt(document.getElementById('volume').value),
  };
}

function setSliders(filters) {
  document.getElementById('hue').value = filters.hue;
  document.getElementById('saturate').value = filters.saturate;
  document.getElementById('sepia').value = filters.sepia;
  document.getElementById('contrast').value = filters.contrast;
  document.getElementById('brightness').value = filters.brightness;
  document.getElementById('grayscale').checked = filters.grayscale;
  document.getElementById('invert').checked = filters.invert;
  document.getElementById('volume').value = filters.volume;
}

function applyFiltersToTab(tabId, filters) {
  filters.__applyVolume = true; // only when explicitly changing
  chrome.tabs.sendMessage(tabId, {
    type: "applyFilters",
    filters
  });
}

function updateAndApply(tabId) {
  const filters = getCurrentSliders();
  saveFiltersForTab(tabId, filters);
  applyFiltersToTab(tabId, filters);
}

function saveFiltersForTab(tabId, filters) {
  const key = `filters_tab_${tabId}`;
  chrome.storage.local.set({ [key]: filters });
}

function loadFiltersForTab(tabId, callback) {
  const key = `filters_tab_${tabId}`;
  chrome.storage.local.get([key], (result) => {
    callback(result[key] || { ...DEFAULT_FILTERS });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    populateProfiles((profiles) => {
      loadFiltersForTab(tabId, (filters) => {
        setSliders(filters);

        // Try to select the matching profile name if it exists
        const profileName = Object.keys(profiles).find(name =>
          JSON.stringify(profiles[name]) === JSON.stringify(filters)
        );
        if (profileName) {
          document.getElementById('profiles').value = profileName;
        }
      });
    });
    ['hue', 'saturate', 'sepia', 'contrast', 'brightness'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => updateAndApply(tabId));
    });
    document.getElementById('grayscale').addEventListener('change', () => updateAndApply(tabId));
    document.getElementById('invert').addEventListener('change', () => updateAndApply(tabId));
    document.getElementById('volume').addEventListener('input', () => updateAndApply(tabId));
    document.getElementById('resetFilters').addEventListener('click', () => {
      setSliders(DEFAULT_FILTERS);
      updateAndApply(tabId);
    });
  });
});

// --- Profile logic ---
function saveProfile(name) {
  if (!name) return;
  const profilesKey = 'filter_profiles';
  chrome.storage.local.get([profilesKey], (result) => {
    const profiles = result[profilesKey] || {};
    profiles[name] = getCurrentSliders();
    chrome.storage.local.set({ [profilesKey]: profiles }, populateProfiles);
  });
}

function loadProfile(name, tabId) {
  if (name === 'Default') {
    setSliders(DEFAULT_FILTERS);
    updateAndApply(tabId);
    return;
  }
  chrome.storage.local.get(['filter_profiles'], (result) => {
    const profiles = result['filter_profiles'] || {};
    if (profiles[name]) {
      setSliders(profiles[name]);
      updateAndApply(tabId);
    }
  });
}

function deleteProfile(name) {
  if (name === 'Default') return;
  chrome.storage.local.get(['filter_profiles'], (result) => {
    const profiles = result['filter_profiles'] || {};
    delete profiles[name];
    chrome.storage.local.set({ 'filter_profiles': profiles }, populateProfiles);
  });
}

function populateProfiles(callback) {
  chrome.storage.local.get(['filter_profiles'], (result) => {
    const profiles = result['filter_profiles'] || {};
    const select = document.getElementById('profiles');
    select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = 'Default';
    defaultOption.textContent = 'Default';
    select.appendChild(defaultOption);

    Object.keys(profiles).forEach(name => {
      if (name !== 'Default') {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      }
    });

    if (typeof callback === 'function') callback(profiles);
  });
}

document.getElementById('saveProfile').addEventListener('click', () => {
  const name = document.getElementById('profileName').value.trim();
  if (name) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      saveProfile(name);
    });
  }
});

document.getElementById('loadProfile').addEventListener('click', () => {
  const name = document.getElementById('profiles').value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    loadProfile(name, tabs[0].id);
  });
});

document.getElementById('deleteProfile').addEventListener('click', () => {
  const name = document.getElementById('profiles').value;
  deleteProfile(name);
});

