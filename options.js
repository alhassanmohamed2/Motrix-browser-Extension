document.addEventListener('DOMContentLoaded', async () => {
  const rpcUrlInput = document.getElementById('rpcUrl');
  const secretTokenInput = document.getElementById('secretToken');
  const minFileSizeInput = document.getElementById('minFileSize');
  const blockedExtensionsInput = document.getElementById('blockedExtensions');
  
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');
  const testBtn = document.getElementById('testBtn');
  const testResult = document.getElementById('testResult');

  // Load saved settings
  const settings = await chrome.storage.local.get([
    'rpcUrl', 
    'secretToken', 
    'minFileSize', 
    'blockedExtensions'
  ]);

  if (settings.rpcUrl) rpcUrlInput.value = settings.rpcUrl;
  if (settings.secretToken) secretTokenInput.value = settings.secretToken;
  if (settings.minFileSize !== undefined) minFileSizeInput.value = settings.minFileSize;
  if (settings.blockedExtensions) blockedExtensionsInput.value = settings.blockedExtensions.join(', ');

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const extStr = blockedExtensionsInput.value.trim();
    const blockedExtensions = extStr ? extStr.split(',').map(e => e.trim().toLowerCase().replace('.', '')) : [];

    await chrome.storage.local.set({
      rpcUrl: rpcUrlInput.value.trim() || 'http://127.0.0.1:16800/jsonrpc',
      secretToken: secretTokenInput.value,
      minFileSize: parseFloat(minFileSizeInput.value) || 0,
      blockedExtensions: blockedExtensions
    });

    saveStatus.textContent = 'Settings saved!';
    saveStatus.classList.add('show');
    setTimeout(() => {
      saveStatus.classList.remove('show');
    }, 2000);
  });

  // Test Connection
  testBtn.addEventListener('click', async () => {
    testResult.textContent = 'Testing...';
    testResult.className = 'test-result';
    
    const rpcUrl = rpcUrlInput.value.trim() || 'http://127.0.0.1:16800/jsonrpc';
    const secretToken = secretTokenInput.value;

    const payload = {
      jsonrpc: "2.0",
      id: "motrix-test",
      method: "aria2.getVersion",
      params: secretToken ? [`token:${secretToken}`] : []
    };

    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.error) {
        testResult.textContent = `Error: ${data.error.message}`;
        testResult.className = 'test-result error';
      } else {
        testResult.textContent = `Success! Motrix v${data.result.version}`;
        testResult.className = 'test-result success';
      }
    } catch (err) {
      testResult.textContent = 'Connection failed. Is Motrix running?';
      testResult.className = 'test-result error';
    }
  });
});
