// === Constants & State ===
const DEFAULTS = { 
  rpcUrl: 'http://localhost:16800/jsonrpc', 
  minFileSize: 0, 
  excludedExtensions: [], 
  enabled: true 
};
let state = { ...DEFAULTS };
let motrixCache = { promise: null, timestamp: 0, TTL: 10000 };
const userInitiatedDownloads = new Set(); // URLs user explicitly triggered

// === Settings Management ===
// Load from storage, listen for changes
chrome.storage.local.get(DEFAULTS, (items) => {
  state.rpcUrl = items.rpcUrl ?? DEFAULTS.rpcUrl;
  state.minFileSize = items.minFileSize ?? DEFAULTS.minFileSize;
  state.excludedExtensions = items.excludedExtensions ?? DEFAULTS.excludedExtensions;
  state.enabled = items.enabled ?? DEFAULTS.enabled;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.rpcUrl) state.rpcUrl = changes.rpcUrl.newValue ?? DEFAULTS.rpcUrl;
    if (changes.minFileSize) state.minFileSize = changes.minFileSize.newValue ?? DEFAULTS.minFileSize;
    if (changes.excludedExtensions) state.excludedExtensions = changes.excludedExtensions.newValue ?? DEFAULTS.excludedExtensions;
    if (changes.enabled) state.enabled = changes.enabled.newValue ?? DEFAULTS.enabled;
  }
});

// === RPC Helper ===
/**
 * Sends a JSON-RPC request to Motrix.
 * @param {string} method The RPC method to call.
 * @param {Array} params Parameters for the RPC method.
 * @returns {Promise<any>} The result from Motrix.
 */
async function sendRPC(method, params = []) {
  const payload = {
    jsonrpc: "2.0",
    id: Date.now().toString(),
    method: method,
    params: params
  };

  const response = await fetch(state.rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.result;
}

// === Motrix Connection (cached) ===
/**
 * Checks if Motrix is running, caching the result.
 * @returns {Promise<boolean>} True if running, false otherwise.
 */
async function isMotrixRunning() {
  const now = Date.now();
  if (motrixCache.promise && now - motrixCache.timestamp < motrixCache.TTL) {
    return motrixCache.promise;
  }

  motrixCache.promise = (async () => {
    try {
      const version = await sendRPC("aria2.getVersion");
      return !!version;
    } catch (e) {
      return false;
    }
  })();
  motrixCache.timestamp = now;

  return motrixCache.promise;
}

// === Download to Motrix ===
/**
 * Sends a download URL to Motrix.
 * @param {string} url The URL to download.
 * @param {string} filename The suggested filename.
 * @param {string} referer The referring page URL.
 */
async function resolveWithYtDlp(url, action = 'get_best') {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage('com.motrix.ytdlp', { url: url, action: action }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

async function sendToMotrix(url, filename, referer) {
  try {
    // If it's an HLS stream (m3u8 or ISM), Motrix's aria2 engine cannot merge the chunks properly.
    // For LinkedIn, we first try the foogaro method to get a direct MP4 that Motrix CAN download.
    const isHlsOrPlaylist = /\.m3u8(\?|$)/i.test(url) || /\.ism(\?|$|\/)/i.test(url) || url.includes('/playlist/vid/');
    
    if (isHlsOrPlaylist) {
      // For LinkedIn URLs, try foogaro method first: fetch public HTML to get direct MP4
      if (referer && referer.includes('linkedin.com')) {
        try {
          const linkedinResponse = await new Promise((resolve) => {
            chrome.runtime.sendNativeMessage('com.motrix.ytdlp', {
              action: 'get_linkedin_mp4',
              url: referer,
              post_url: referer,
              filename: filename || 'linkedin_video'
            }, (response) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response);
              }
            });
          });
          
          if (linkedinResponse && linkedinResponse.success && linkedinResponse.direct_url) {
            // We got a direct MP4! Send it to Motrix normally.
            url = linkedinResponse.direct_url;
            filename = linkedinResponse.filename || filename;
            // Don't return here — fall through to the normal Motrix send code below
          } else {
            // Foogaro failed, fall back to background yt-dlp download
            const hlsResponse = await new Promise((resolve) => {
              chrome.runtime.sendNativeMessage('com.motrix.ytdlp', {
                action: 'download_hls_background',
                url: url,
                filename: filename || 'video'
              }, resolve);
            });
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Background Download Started',
              message: `Downloading LinkedIn video in background to your Downloads folder.`
            });
            return { success: true, message: 'Downloading in background' };
          }
        } catch (e) {
          // If anything fails, still try background download
          const hlsResponse = await new Promise((resolve) => {
            chrome.runtime.sendNativeMessage('com.motrix.ytdlp', {
              action: 'download_hls_background',
              url: url,
              filename: filename || 'video'
            }, resolve);
          });
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Background Download Started',
            message: `Downloading video in background to your Downloads folder.`
          });
          return { success: true, message: 'Downloading in background' };
        }
      } else {
        // Non-LinkedIn HLS: use background downloader as before
        const hlsResponse = await new Promise((resolve) => {
          chrome.runtime.sendNativeMessage('com.motrix.ytdlp', {
            action: 'download_hls_background',
            url: url,
            filename: filename || 'video'
          }, resolve);
        });
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Background Download Started',
          message: `Motrix cannot merge HLS chunks natively. This video is being downloaded directly to your Downloads folder using the extension's background engine!`
        });
        return { success: true, message: 'Downloading in background' };
      }
    }

    const options = {};
    options.header = [];
    if (referer) options.header.push(`Referer: ${referer}`);

    // Extract cookies for the target site and pass them to Motrix (fixes LinkedIn 403 Forbidden errors)
    try {
      const urlsToGetCookies = [];
      if (referer && referer.startsWith('http')) urlsToGetCookies.push(referer);
      if (url && url.startsWith('http')) urlsToGetCookies.push(url);
      
      let allCookies = [];
      for (const targetUrl of [...new Set(urlsToGetCookies)]) {
        const cookies = await new Promise((resolve) => {
          chrome.cookies.getAll({ url: targetUrl }, resolve);
        });
        if (cookies) allCookies = allCookies.concat(cookies);
      }
      
      if (allCookies.length > 0) {
        // Deduplicate cookies by name
        const uniqueCookies = {};
        allCookies.forEach(c => uniqueCookies[c.name] = c.value);
        const cookieStr = Object.entries(uniqueCookies).map(([k, v]) => `${k}=${v}`).join('; ');
        options.header.push(`Cookie: ${cookieStr}`);
      }
    } catch (e) {}

    const isDirectMedia = /\.(mp4|webm|mkv|mp3|m4a|ts|m3u8)(\?|$)/i.test(url);
    const siteTestTarget = referer || url;
    const isVideoSite = /youtube\.com|youtu\.be|twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com|reddit\.com|vimeo\.com|twitch\.tv|linkedin\.com/i.test(siteTestTarget);

    // Prefer resolving via yt-dlp against the *page* URL (referer), since that's
    // where the real title lives — the raw googlevideo CDN url never has it.
    if (isVideoSite) {
      const resolveTarget = /youtube\.com|youtu\.be/i.test(siteTestTarget) && referer ? referer : url;
      const ytResponse = await resolveWithYtDlp(resolveTarget);
      if (ytResponse && ytResponse.success) {
        if (ytResponse.direct_url) url = ytResponse.direct_url;
        if (ytResponse.filename) filename = ytResponse.filename;
        if (ytResponse.headers) {
          const headers = Object.entries(ytResponse.headers).map(([k, v]) => `${k}: ${v}`);
          options.header = options.header ? options.header.concat(headers) : headers;
        }
      }
    }

    // Fallback: still no usable filename? Try the active tab title, then timestamp.
    if (!filename || filename === 'videoplayback' || filename === 'videoplayback.mp4' || filename === 'videoplayback.webm') {
      try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        let cleanTitle = (tabs?.[0]?.title || '').replace(/[\\/:*?"<>|]/g, '').trim();
        if (cleanTitle.endsWith(' - YouTube')) cleanTitle = cleanTitle.replace(' - YouTube', '');
        if (cleanTitle && cleanTitle.toLowerCase() !== 'youtube') {
          let ext = '.mp4';
          if (url.includes('mime=video%2Fwebm') || url.includes('mime=video/webm')) ext = '.webm';
          filename = cleanTitle + ext;
        } else {
          filename = `videoplayback_${Date.now()}.mp4`;
        }
      } catch (e) {
        filename = `videoplayback_${Date.now()}.mp4`;
      }
    }

    if (filename) options.out = filename;
    
    try {
      // Determine category based on extension
      let subfolder = 'Others';
      const extMatch = filename ? filename.match(/\.([^.]+)$/) : url.match(/\.([^.?]+)(?:\?|$)/);
      if (extMatch) {
        const ext = extMatch[1].toLowerCase();
        if (['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'ts'].includes(ext)) {
          subfolder = 'Videos';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
          subfolder = 'Images';
        } else if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext)) {
          subfolder = 'Audio';
        } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) {
          subfolder = 'Documents';
        } else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
          subfolder = 'Archives';
        } else if (['exe', 'msi', 'dmg', 'apk', 'deb', 'rpm'].includes(ext)) {
          subfolder = 'Programs';
        }
      }

      // Get Motrix default download directory
      const globalOpts = await sendRPC('aria2.getGlobalOption');
      if (globalOpts && globalOpts.dir) {
        // Append subfolder, using correct path separator (handling Windows and Unix)
        const separator = globalOpts.dir.includes('\\') ? '\\' : '/';
        options.dir = globalOpts.dir.endsWith(separator) ? `${globalOpts.dir}${subfolder}` : `${globalOpts.dir}${separator}${subfolder}`;
      }
    } catch (e) {
      console.warn("Failed to set subfolder:", e);
    }

    // Aria2 drops options.out if the URL redirects (e.g. googlevideo.com CDNs)
    if (url.includes('googlevideo.com/videoplayback')) {
      const redirectResponse = await resolveWithYtDlp(url, 'resolve_redirect');
      if (redirectResponse?.success && redirectResponse.final_url) {
        url = redirectResponse.final_url;
      }
    }

    await sendRPC('aria2.addUri', [[url], options]);

    await addToHistory({
      url,
      filename: filename || url.split('/').pop()?.split('?')[0] || 'Unknown',
      timestamp: Date.now(),
      status: 'sent'
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Sent to Motrix',
      message: `Successfully started downloading ${filename || 'file'}.`
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send to Motrix:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Motrix Error',
      message: `Failed to start download: ${error.message}`
    });
    return { success: false, error: error.message };
  }
}

// === Download History ===
/**
 * Adds an entry to the download history.
 * @param {Object} entry The history entry to add.
 */
async function addToHistory(entry) {
  const result = await chrome.storage.local.get({ history: [] });
  const history = [entry, ...result.history].slice(0, 50);
  await chrome.storage.local.set({ history });
}

// === Badge Status ===
/**
 * Updates the extension badge based on Motrix status.
 * @param {boolean} running True if Motrix is running.
 */
function updateBadge(running) {
  if (running) {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
  } else {
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
  }
}

// Track user navigations for intent
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    userInitiatedDownloads.add(details.url);
    setTimeout(() => userInitiatedDownloads.delete(details.url), 5000);
  }
});

// === Download Interception (with user-intent guard) ===
chrome.downloads.onCreated.addListener(async (item) => {
  if (!state.enabled) return;
  
  if (state.minFileSize > 0 && item.fileSize > 0 && item.fileSize < state.minFileSize * 1024 * 1024) {
    return;
  }

  const url = item.url || item.finalUrl;
  
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  if (state.excludedExtensions && state.excludedExtensions.includes(ext)) {
    return;
  }

  // Check if URL is in userInitiatedDownloads or if it came from user gesture
  // IMPORTANT: If the download was NOT user-initiated, do NOT intercept
  if (!userInitiatedDownloads.has(url)) {
    return;
  }

  try {
    const running = await isMotrixRunning();
    if (running) {
      // Cancel browser download
      try {
        await chrome.downloads.cancel(item.id);
        await chrome.downloads.erase({ id: item.id });
      } catch (err) {
        console.error('Failed to cancel download:', err);
      }
      
      // Attempt to get referer and title from active tab
      let referer = '';
      let pageTitle = '';
      try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs && tabs.length > 0) {
          referer = tabs[0].url;
          pageTitle = tabs[0].title;
        }
      } catch (e) {
         // ignore
      }

      let filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
      
      // If the filename is generic (like videoplayback), try to use the page title
      if (filename === 'videoplayback' || filename === 'videoplayback.mp4' || filename === 'videoplayback.webm' || !filename) {
        if (pageTitle) {
          let cleanTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '').trim();
          if (cleanTitle.endsWith(' - YouTube')) cleanTitle = cleanTitle.replace(' - YouTube', '');
          let ext = '.mp4';
          if (item.mime === 'video/webm' || url.includes('mime=video%2Fwebm') || url.includes('mime=video/webm')) {
            ext = '.webm';
          }
          filename = cleanTitle + ext;
        } else {
          filename = `videoplayback_${Date.now()}.mp4`;
        }
      } else if (item.filename) {
        // If the browser resolved a good filename, use its basename
        const browserFilename = item.filename.split(/[\\/]/).pop();
        if (browserFilename && !browserFilename.startsWith('videoplayback')) {
          filename = browserFilename;
        }
      }

      await sendToMotrix(url, filename, referer);
    }
  } catch (err) {
    console.error('Error during download interception:', err);
  }
});

// === Context Menu ===
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-to-motrix-link",
    title: "Download with Motrix",
    contexts: ["link", "image", "video", "audio"]
  });
  chrome.contextMenus.create({
    id: "send-page-to-motrix",
    title: "Send page URL to Motrix",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "send-to-motrix-link") {
    const url = info.linkUrl || info.srcUrl;
    if (url) {
      userInitiatedDownloads.add(url);
      let filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
      
      if (filename === 'videoplayback' || !filename) {
        let cleanTitle = (tab?.title || '').replace(/[\\/:*?"<>|]/g, '').trim();
        if (cleanTitle.endsWith(' - YouTube')) cleanTitle = cleanTitle.replace(' - YouTube', '');
        if (cleanTitle) {
          filename = cleanTitle + '.mp4';
        } else {
          filename = `videoplayback_${Date.now()}.mp4`;
        }
      }
      
      await sendToMotrix(url, filename, tab?.url || '');
    }
  }

  if (info.menuItemId === "send-page-to-motrix") {
    const url = info.pageUrl || tab?.url;
    if (url) {
      userInitiatedDownloads.add(url);
      await sendToMotrix(url, '', tab?.url || '');
    }
  }
});

// === Message Handler (from popup & content scripts) ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'check-motrix') {
    isMotrixRunning().then(sendResponse);
    return true;
  }
  
  if (msg.type === 'send-to-motrix' || msg.type === 'download-video') {
    const referer = msg.referer || (sender.tab ? sender.tab.url : '');
    const url = msg.url;
    if (url) {
      userInitiatedDownloads.add(url);
      sendToMotrix(url, msg.filename, referer).then(result => sendResponse(result));
      return true;
    }
  }

  if (msg.type === 'get-history') {
    chrome.storage.local.get({ history: [] }).then(result => sendResponse(result.history));
    return true;
  }

  if (msg.type === 'get-ytdlp-formats') {
    chrome.runtime.sendNativeMessage('com.motrix.ytdlp', { action: 'get_formats', url: msg.url }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });
    return true;
  }

  if (msg.type === 'get-sniffed-media') {
    const tabId = sender.tab ? sender.tab.id : -1;
    if (tabId >= 0 && sniffedMedia.has(tabId)) {
      sendResponse(Array.from(sniffedMedia.get(tabId)));
    } else {
      sendResponse([]);
    }
    return false; // synchronous
  }
});

// === Periodic Status Check ===
setInterval(async () => { 
  updateBadge(await isMotrixRunning()); 
}, 30000);

// Initial check
isMotrixRunning().then(updateBadge);

// === Media URL Sniffer ===
const sniffedMedia = new Map();

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Look for media types, common streaming extensions, or specific CDN patterns like LinkedIn's
    const isLinkedInStream = details.url.includes('dms.licdn.com/playlist/') || details.url.includes('/sc/media/');
    if (details.type === 'media' || details.url.includes('.m3u8') || details.url.includes('.mp4') || isLinkedInStream) {
      const ext = details.url.split('?')[0].split('.').pop().toLowerCase();
      // Ignore tiny fragments, we want the manifest or main mp4
      if (['m3u8', 'mp4', 'mkv', 'flv'].includes(ext) || details.type === 'media' || isLinkedInStream) {
        // Only keep manifest/playlist/mp4 (ignore .m4s or chunk streams to avoid clutter)
        if (!details.url.includes('.m4s') && !details.url.includes('seg-') && !details.url.includes('webvtt') && !details.url.includes('caption')) {
          const tabId = details.tabId;
          if (tabId >= 0) {
            if (!sniffedMedia.has(tabId)) sniffedMedia.set(tabId, new Set());
            sniffedMedia.get(tabId).add(details.url);
          }
        }
      }
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    sniffedMedia.delete(tabId);
  }
});
