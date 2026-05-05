// Default settings
const defaultSettings = {
  rpcUrl: 'http://127.0.0.1:16800/jsonrpc',
  secretToken: '',
  interceptionEnabled: true,
  minFileSize: 0,
  blockedExtensions: []
};

// Initialize settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(defaultSettings), (res) => {
    const init = { ...defaultSettings, ...res };
    chrome.storage.local.set(init);
  });
  
  chrome.contextMenus.create({
    id: "download-with-motrix",
    title: "Download with Motrix",
    contexts: ["link", "selection", "image", "video", "audio"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "download-with-motrix") {
    const url = info.linkUrl || info.srcUrl || info.selectionText;
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ftp://'))) {
      sendToMotrix(url, "", tab.url);
    } else {
      showNotification("Invalid URL", "The selected link is not a valid download URL.");
    }
  }
});

let recentDownloads = new Set();

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!downloadItem.url || downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) return;

  chrome.storage.local.get(['interceptionEnabled', 'minFileSize', 'blockedExtensions'], (settings) => {
    if (!settings.interceptionEnabled) return;

    // Check recent downloads to avoid duplicate handling
    if (recentDownloads.has(downloadItem.url)) return;

    // Check size if available (minFileSize in MB)
    if (settings.minFileSize > 0 && downloadItem.fileSize > 0 && downloadItem.fileSize < settings.minFileSize * 1024 * 1024) return;

    // Check extensions
    try {
      const urlObj = new URL(downloadItem.url);
      const pathname = urlObj.pathname.toLowerCase();
      const ext = pathname.split('.').pop();
      if (settings.blockedExtensions && settings.blockedExtensions.includes(ext)) return;
    } catch(e) {
      console.warn("Interception: URL parsing failed", e);
    }

    // Add to recent downloads to prevent loops
    recentDownloads.add(downloadItem.url);
    setTimeout(() => recentDownloads.delete(downloadItem.url), 5000);

    // Cancel native download
    chrome.downloads.cancel(downloadItem.id, () => {
      // Erase from chrome history to keep it clean
      chrome.downloads.erase({id: downloadItem.id});
      
      // Send to Motrix
      sendToMotrix(downloadItem.url, downloadItem.filename, downloadItem.referrer);
    });
  });
});

async function sendToMotrix(url, filename, referrer) {
  const { rpcUrl, secretToken } = await chrome.storage.local.get(['rpcUrl', 'secretToken']);
  
  const options = {};
  
  // Extract filename
  if (filename) {
    const baseName = filename.split(/[\/\\]/).pop();
    if (baseName) options.out = baseName;
  }

  // Build headers
  const headers = [];
  if (referrer) headers.push(`Referer: ${referrer}`);
  // Add browser's User-Agent to help with some servers
  headers.push(`User-Agent: ${navigator.userAgent}`);
  
  options.header = headers;

  const params = [];
  if (secretToken) {
    params.push(`token:${secretToken}`);
  }
  params.push([url]);
  params.push(options);

  const payload = {
    jsonrpc: "2.0",
    id: `motrix-${Date.now()}`,
    method: "aria2.addUri",
    params: params
  };

  console.log("Sending to Motrix:", payload);

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      showNotification("Motrix Error", data.error.message || "Failed to add download");
    } else {
      showNotification("Success", `Download added to Motrix: ${options.out || 'Successfully'}`);
    }
  } catch (error) {
    console.error("Motrix connection error:", error);
    showNotification("Motrix Unreachable", "Could not connect to Motrix. Please ensure it is running.");
  }
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message
  });
}
