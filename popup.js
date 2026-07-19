/**
 * Motrix DM — Popup Script
 * Uses message passing to background.js for all RPC operations.
 * Consistent with background.js storage keys.
 */

// === DOM Elements ===
const el = {
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  enableToggle: document.getElementById('enable-toggle'),
  urlInput: document.getElementById('url-input'),
  downloadBtn: document.getElementById('download-btn'),
  historyToggle: document.getElementById('history-toggle'),
  historyList: document.getElementById('history-list'),
  optionsLink: document.getElementById('options-link'),
  toastContainer: document.getElementById('toast-container'),
};

// ============================================================
// Toast Notification System
// ============================================================

/**
 * Shows a toast notification in the popup.
 * @param {string} message - Text to display
 * @param {'success'|'error'|'info'} type - Toast type
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2500);
}

// ============================================================
// Motrix Status Check (via background message)
// ============================================================

async function checkMotrixStatus() {
  try {
    const running = await chrome.runtime.sendMessage({ type: 'check-motrix' });
    if (running) {
      el.statusDot.classList.add('online');
      el.statusText.textContent = 'Connected';
    } else {
      el.statusDot.classList.remove('online');
      el.statusText.textContent = 'Offline';
    }
  } catch {
    el.statusDot.classList.remove('online');
    el.statusText.textContent = 'Error';
  }
}

// ============================================================
// URL Validation
// ============================================================

/**
 * Validates a URL string.
 * @param {string} str - URL to validate
 * @returns {boolean}
 */
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return ['http:', 'https:', 'ftp:', 'magnet:'].includes(url.protocol);
  } catch {
    return false;
  }
}

// ============================================================
// Download Handler
// ============================================================

async function handleDownload() {
  const url = el.urlInput.value.trim();
  if (!url) {
    showToast('Please enter a URL', 'error');
    return;
  }

  // Allow magnet links without full URL validation
  if (!url.startsWith('magnet:') && !isValidUrl(url)) {
    showToast('Invalid URL format', 'error');
    return;
  }

  el.downloadBtn.disabled = true;
  el.downloadBtn.classList.add('loading');

  try {
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    const response = await chrome.runtime.sendMessage({
      type: 'send-to-motrix',
      url: url,
      filename: filename
    });

    if (response?.success) {
      el.urlInput.value = '';
      showToast('Download started!', 'success');
      loadHistory();
    } else {
      showToast(response?.error || 'Download failed', 'error');
    }
  } catch {
    showToast('Is Motrix running?', 'error');
  } finally {
    el.downloadBtn.disabled = false;
    el.downloadBtn.classList.remove('loading');
  }
}

// ============================================================
// Download History
// ============================================================

/**
 * Formats a timestamp into a "time ago" string.
 */
function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function loadHistory() {
  try {
    const history = await chrome.runtime.sendMessage({ type: 'get-history' });
    renderHistory(Array.isArray(history) ? history.slice(0, 5) : []);
  } catch {
    renderHistory([]);
  }
}

function renderHistory(items) {
  el.historyList.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'No recent downloads';
    el.historyList.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <div class="history-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
      </div>
      <div class="history-details">
        <div class="history-filename" title="${escapeHtml(item.filename || item.url)}">${escapeHtml(item.filename || 'Unknown file')}</div>
        <div class="history-time">${timeAgo(item.timestamp)}</div>
      </div>
    `;
    el.historyList.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// Toggle State
// ============================================================

async function loadToggleState() {
  const result = await chrome.storage.local.get({ enabled: true });
  el.enableToggle.checked = result.enabled;
}

el.enableToggle.addEventListener('change', (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
});

// ============================================================
// Event Listeners
// ============================================================

// Download button
el.downloadBtn.addEventListener('click', handleDownload);

// Enter key on URL input
el.urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleDownload();
  }
});

// History toggle
el.historyToggle.addEventListener('click', () => {
  const isOpen = el.historyList.classList.toggle('open');
  el.historyToggle.setAttribute('aria-expanded', isOpen);
});

// Options link
el.optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage
    ? chrome.runtime.openOptionsPage()
    : window.open(chrome.runtime.getURL('options.html'));
});

// ============================================================
// Initialize
// ============================================================

checkMotrixStatus();
loadToggleState();
loadHistory();
