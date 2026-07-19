/**
 * Motrix DM — Options Page Script
 * Consistent with background.js storage keys.
 * Fixes: proper 0 handling, NaN validation, null checks.
 */

const DEFAULTS = {
  rpcUrl: 'http://localhost:16800/jsonrpc',
  minFileSize: 0,                                     // in MB (0 = intercept all)
  excludedExtensions: [],
  videoOverlay: true,
  enabled: true,
};

// === DOM Elements ===
const el = {
  rpcUrl: document.getElementById('rpc-url'),
  testBtn: document.getElementById('test-btn'),
  testResult: document.getElementById('test-result'),
  minSize: document.getElementById('min-size'),
  excludedExt: document.getElementById('excluded-ext'),
  videoOverlay: document.getElementById('video-overlay-toggle'),
  saveBtn: document.getElementById('save-btn'),
  resetBtn: document.getElementById('reset-btn'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  statusMessage: document.getElementById('status-message'),
};

// ============================================================
// Load Settings
// ============================================================

function loadSettings() {
  chrome.storage.local.get(DEFAULTS, (result) => {
    el.rpcUrl.value = result.rpcUrl ?? DEFAULTS.rpcUrl;
    // Use ?? so that 0 is preserved (|| would treat 0 as falsy)
    el.minSize.value = result.minFileSize ?? DEFAULTS.minFileSize;
    el.excludedExt.value = (result.excludedExtensions ?? DEFAULTS.excludedExtensions).join(', ');
    el.videoOverlay.checked = result.videoOverlay ?? DEFAULTS.videoOverlay;
  });
}

// ============================================================
// Save Settings
// ============================================================

function saveSettings() {
  // Validate RPC URL
  const rpcUrl = el.rpcUrl.value.trim() || DEFAULTS.rpcUrl;
  try {
    new URL(rpcUrl);
  } catch {
    showStatus('Invalid RPC URL format', 'error');
    return;
  }

  // Validate min file size
  const rawSize = el.minSize.value.trim();
  let minFileSize = DEFAULTS.minFileSize;
  if (rawSize !== '') {
    minFileSize = parseFloat(rawSize);
    if (Number.isNaN(minFileSize) || minFileSize < 0) {
      showStatus('Minimum file size must be a non-negative number', 'error');
      return;
    }
  }

  // Parse extensions
  const extensions = el.excludedExt.value
    .split(',')
    .map(e => e.trim().toLowerCase().replace(/^\./, ''))  // strip leading dot only
    .filter(e => e.length > 0);

  const settings = {
    rpcUrl,
    minFileSize,
    excludedExtensions: extensions,
    videoOverlay: el.videoOverlay.checked,
  };

  chrome.storage.local.set(settings, () => {
    if (chrome.runtime.lastError) {
      showStatus('Failed to save: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus('Settings saved successfully!', 'success');
    }
  });
}

// ============================================================
// Reset Settings
// ============================================================

function resetSettings() {
  chrome.storage.local.set(DEFAULTS, () => {
    loadSettings();
    showStatus('Settings reset to defaults', 'info');
  });
}

// ============================================================
// Test Connection
// ============================================================

async function testConnection() {
  const url = el.rpcUrl.value.trim() || DEFAULTS.rpcUrl;

  // Validate URL first
  try {
    new URL(url);
  } catch {
    showTestResult('Invalid URL format', false);
    return;
  }

  // Show loading state
  el.testBtn.classList.add('testing');
  el.testResult.className = 'test-result';
  el.testResult.textContent = '';

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'test-connection',
        method: 'aria2.getVersion',
        params: []
      }),
      signal: AbortSignal.timeout(5000)
    });

    const elapsed = Math.round(performance.now() - startTime);
    const data = await response.json();

    if (data.result) {
      const version = data.result.version || 'unknown';
      showTestResult(`Connected! aria2 v${version} (${elapsed}ms)`, true);
    } else if (data.error) {
      showTestResult(`Error: ${data.error.message}`, false);
    } else {
      showTestResult('Unknown response from server', false);
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      showTestResult('Connection timed out (5s)', false);
    } else {
      showTestResult('Cannot connect — is Motrix running?', false);
    }
  } finally {
    el.testBtn.classList.remove('testing');
  }
}

function showTestResult(message, success) {
  el.testResult.textContent = message;
  el.testResult.className = `test-result visible ${success ? 'success' : 'error'}`;
}

// ============================================================
// Export Settings
// ============================================================

function exportSettings() {
  chrome.storage.local.get(DEFAULTS, (result) => {
    const data = {
      _type: 'motrix-dm-settings',
      _version: 1,
      _exported: new Date().toISOString(),
      ...result,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'motrix-dm-settings.json';
    a.click();
    URL.revokeObjectURL(url);

    showStatus('Settings exported!', 'success');
  });
}

// ============================================================
// Import Settings
// ============================================================

function importSettings(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // Validate it's a Motrix settings file
      if (data._type !== 'motrix-dm-settings') {
        showStatus('Invalid settings file format', 'error');
        return;
      }

      // Extract only valid setting keys
      const validKeys = Object.keys(DEFAULTS);
      const settings = {};
      for (const key of validKeys) {
        if (key in data) {
          settings[key] = data[key];
        }
      }

      if (Object.keys(settings).length === 0) {
        showStatus('No valid settings found in file', 'error');
        return;
      }

      chrome.storage.local.set(settings, () => {
        loadSettings();
        showStatus('Settings imported successfully!', 'success');
      });
    } catch {
      showStatus('Failed to parse settings file', 'error');
    }
  };
  reader.readAsText(file);
}

// ============================================================
// Status Messages
// ============================================================

let statusTimeout = null;

function showStatus(message, type) {
  clearTimeout(statusTimeout);
  el.statusMessage.textContent = message;
  el.statusMessage.className = `status-message visible ${type}`;

  statusTimeout = setTimeout(() => {
    el.statusMessage.className = 'status-message';
  }, 4000);
}

// ============================================================
// Event Listeners
// ============================================================

el.saveBtn.addEventListener('click', saveSettings);
el.resetBtn.addEventListener('click', resetSettings);
el.testBtn.addEventListener('click', testConnection);
el.exportBtn.addEventListener('click', exportSettings);

el.importBtn.addEventListener('click', () => el.importFile.click());
el.importFile.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    importSettings(e.target.files[0]);
    e.target.value = ''; // Reset so same file can be re-imported
  }
});

// ============================================================
// Initialize
// ============================================================

loadSettings();
