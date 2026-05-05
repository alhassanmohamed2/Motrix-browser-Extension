document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const interceptionToggle = document.getElementById('interceptionToggle');
  const optionsBtn = document.getElementById('optionsBtn');

  // Load settings
  const settings = await chrome.storage.local.get(['rpcUrl', 'secretToken', 'interceptionEnabled']);
  interceptionToggle.checked = settings.interceptionEnabled;

  // Toggle listener
  interceptionToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ interceptionEnabled: e.target.checked });
  });

  // Options button
  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });

  // Check Motrix connection
  async function checkConnection() {
    try {
      const payload = {
        jsonrpc: "2.0",
        id: "motrix-ext-check",
        method: "aria2.getVersion",
        params: settings.secretToken ? [`token:${settings.secretToken}`] : []
      };

      const response = await fetch(settings.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.error) {
        setOffline();
      } else {
        setOnline();
      }
    } catch (err) {
      setOffline();
    }
  }

  function setOnline() {
    statusBadge.className = 'status-badge online';
    statusText.textContent = 'Online';
  }

  function setOffline() {
    statusBadge.className = 'status-badge offline';
    statusText.textContent = 'Offline';
  }

  checkConnection();
});
