(() => {
  'use strict';

  // ============================================================
  // Motrix Video Download Overlay
  // Detects videos on any website and shows a download button
  // similar to IDM's video download panel.
  // ============================================================

  // === Constants ===
  const MIN_VIDEO_WIDTH = 120;
  const MIN_VIDEO_HEIGHT = 90;
  const SCAN_DEBOUNCE_MS = 1500;
  const OVERLAY_CLASS = 'motrix-video-overlay';
  const CONTAINER_CLASS = 'motrix-video-container';
  const PROCESSED_ATTR = 'data-motrix-processed';

  // === State ===
  const processedVideos = new WeakSet();
  let scanTimeout = null;
  let overlayEnabled = true;

  // === Platform Detection ===
  const PLATFORM = detectPlatform();

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('vimeo.com')) return 'vimeo';
    if (host.includes('twitch.tv')) return 'twitch';
    if (host.includes('dailymotion.com')) return 'dailymotion';
    if (host.includes('reddit.com')) return 'reddit';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('linkedin.com')) return 'linkedin';
    return 'generic';
  }

  // === SVG Icons ===
  const ICONS = {
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>`
  };

  // ============================================================
  // Source Extraction (Platform-Aware)
  // ============================================================

  function extractVideoSources(video) {
    const sources = [];
    const seenUrls = new Set();

    function addSource(url, label, meta = {}) {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      sources.push({
        url,
        label,
        isBlob: url.startsWith('blob:'),
        isData: url.startsWith('data:'),
        ...meta
      });
    }

    // Direct src
    if (video.src) addSource(video.src, 'Video');
    if (video.currentSrc && video.currentSrc !== video.src) {
      addSource(video.currentSrc, 'Current Source');
    }

    // <source> children
    video.querySelectorAll('source').forEach((source, i) => {
      if (!source.src) return;
      const res = source.getAttribute('res') || source.getAttribute('label') ||
                  source.getAttribute('size') || source.getAttribute('data-quality');
      const type = source.type ? source.type.split('/')[1]?.toUpperCase() : '';
      const label = res ? `${res}${type ? ' · ' + type : ''}` : (type || `Source ${i + 1}`);
      addSource(source.src, label);
    });

    // data-src attribute
    const dataSrc = video.getAttribute('data-src');
    if (dataSrc) addSource(dataSrc, 'Alternate Source');

    // Platform-specific extraction
    if (PLATFORM === 'twitter' || PLATFORM === 'reddit') {
      // Twitter/Reddit often have the video URL in a nearby element or parent
      const poster = video.getAttribute('poster');
      if (poster && !poster.startsWith('blob:')) {
        // Poster URLs sometimes hint at the video URL pattern
        addSource(poster.replace(/\/[^/]+\.(jpg|png)/, '/video'), 'Poster-derived', { uncertain: true });
      }
    }

    // Try to find video URL from page metadata (og:video)
    const ogVideo = document.querySelector('meta[property="og:video"]');
    if (ogVideo && ogVideo.content) {
      addSource(ogVideo.content, 'Page Video (Meta)');
    }
    const ogVideoUrl = document.querySelector('meta[property="og:video:url"]');
    if (ogVideoUrl && ogVideoUrl.content) {
      addSource(ogVideoUrl.content, 'Page Video URL');
    }

    // Filter out data URIs entirely
    return sources.filter(s => !s.isData);
  }

  // ============================================================
  // Get the page URL for the current video (for YouTube etc.)
  // ============================================================

  function getVideoPageUrl() {
    return window.location.href;
  }

  // ============================================================
  // Overlay Panel Creation (IDM-style)
  // ============================================================

  async function createOverlay(video, baseSources) {
    // Also fetch sniffed media URLs from background
    let sniffedUrls = [];
    try {
      sniffedUrls = await chrome.runtime.sendMessage({ type: 'get-sniffed-media' });
    } catch (e) {}

    sniffedUrls = sniffedUrls || [];

    // Combine baseSources and sniffedUrls
    const sources = [...baseSources];
    sniffedUrls.forEach(url => {
      if (!sources.some(s => s.url === url)) {
        sources.push({ url, label: url.includes('.m3u8') ? 'Sniffed Stream (HLS)' : 'Sniffed Media', isBlob: false });
      }
    });

    // For platforms with blob-only sources, we still show the overlay
    // with the page URL as a fallback option
    const directSources = sources.filter(s => !s.isBlob);
    const hasBlobOnly = sources.length > 0 && directSources.length === 0;
    const hasNoSources = sources.length === 0;

    // Don't create overlay if there's nothing useful to show
    // (except on known video platforms where we can offer the page URL)
    const isVideoSite = ['youtube', 'twitter', 'facebook', 'instagram',
                         'vimeo', 'twitch', 'dailymotion', 'reddit', 'tiktok', 'linkedin'].includes(PLATFORM);
    if (hasNoSources && !isVideoSite) return;

    // Wrap the video in a container for relative positioning
    // Only if not already wrapped
    let container;
    if (video.parentElement?.classList.contains(CONTAINER_CLASS)) {
      container = video.parentElement;
    } else {
      container = document.createElement('div');
      container.className = CONTAINER_CLASS;

      // Preserve the video's position in the DOM
      const computedStyle = window.getComputedStyle(video);
      const parentPosition = window.getComputedStyle(video.parentElement).position;

      // If parent is already positioned, just use it as the anchor
      if (['relative', 'absolute', 'fixed', 'sticky'].includes(parentPosition)) {
        container = video.parentElement;
        container.classList.add(CONTAINER_CLASS);
      } else {
        // Wrap the video
        video.parentElement.insertBefore(container, video);
        container.appendChild(video);
        container.style.position = 'relative';
        container.style.display = computedStyle.display === 'inline' ? 'inline-block' : computedStyle.display;
        container.style.width = computedStyle.width;
        container.style.height = computedStyle.height;
      }
    }

    // Create the overlay panel
    const panel = document.createElement('div');
    panel.className = `motrix-panel ${OVERLAY_CLASS}`;
    panel.videoElement = video;

    // --- Main download button (always visible on hover) ---
    const mainBtn = document.createElement('button');
    mainBtn.className = 'motrix-main-btn';
    mainBtn.innerHTML = `
      <span class="motrix-main-btn-icon">${ICONS.download}</span>
      <span class="motrix-main-btn-text">Download</span>
    `;
    mainBtn.title = 'Download with Motrix';

    // --- Expandable panel content ---
    const panelContent = document.createElement('div');
    panelContent.className = 'motrix-panel-content';

    // Platform info banner for blob/streaming sites
    if (hasBlobOnly || hasNoSources) {
      const infoBanner = document.createElement('div');
      infoBanner.className = 'motrix-info-banner';

      if (PLATFORM === 'youtube') {
        infoBanner.innerHTML = `
          <span class="motrix-info-icon">${ICONS.info}</span>
          <span>YouTube uses encrypted streams.<br>Click below to copy the video URL for use with a downloader tool.</span>
        `;
      } else {
        infoBanner.innerHTML = `
          <span class="motrix-info-icon">${ICONS.info}</span>
          <span>This video uses streaming (blob URLs).<br>Direct download may not work — try the page URL.</span>
        `;
      }
      panelContent.appendChild(infoBanner);
    }

    // Source list
    const sourceList = document.createElement('div');
    sourceList.className = 'motrix-source-list';

    // Add direct downloadable sources
    directSources.forEach(src => {
      const item = createSourceItem(src, panel);
      sourceList.appendChild(item);
    });

    // For known video sites, or sites where we couldn't find a direct source, offer page-level options
    if (isVideoSite || hasBlobOnly || hasNoSources) {
      const pageUrl = getVideoPageUrl();
      const pageItem = document.createElement('div');
      pageItem.className = 'motrix-source-item motrix-source-page';
      pageItem.innerHTML = `
        <span class="motrix-source-label">📋 Copy Video URL</span>
        <span class="motrix-source-action">Copy</span>
      `;
      pageItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(pageUrl).then(() => {
          pageItem.querySelector('.motrix-source-action').textContent = 'Copied!';
          setTimeout(() => {
            pageItem.querySelector('.motrix-source-action').textContent = 'Copy';
          }, 2000);
        });
      });
      sourceList.appendChild(pageItem);

      // Add "Fetch Qualities" button using yt-dlp for ANY site
      if (true) {
        const fetchItem = document.createElement('div');
        fetchItem.className = 'motrix-source-item motrix-source-primary';
        fetchItem.innerHTML = `
          <span class="motrix-source-label">✨ Fetch Qualities (yt-dlp)</span>
          <span class="motrix-source-action">Fetch</span>
        `;
        fetchItem.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const actionSpan = fetchItem.querySelector('.motrix-source-action');
          const originalText = actionSpan.textContent;
          actionSpan.textContent = 'Loading...';
          fetchItem.style.pointerEvents = 'none';
          
          chrome.runtime.sendMessage({ type: 'get-ytdlp-formats', url: pageUrl }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response ? response.error : 'Unknown error');
              alert("Motrix yt-dlp Error:\n" + errMsg);
              actionSpan.textContent = 'Failed';
              setTimeout(() => {
                actionSpan.textContent = originalText;
                fetchItem.style.pointerEvents = 'auto';
              }, 2000);
              return;
            }
            
            // Remove the fetch and copy items
            fetchItem.remove();
            pageItem.remove();
            
            const title = response.title || 'video';
            const formats = response.formats || [];
            
            if (formats.length === 0) {
              const noFormats = document.createElement('div');
              noFormats.className = 'motrix-source-item';
              noFormats.innerHTML = `<span class="motrix-source-label">No pre-merged formats found</span>`;
              sourceList.appendChild(noFormats);
              return;
            }
            
            formats.forEach(f => {
              const formatItem = document.createElement('div');
              formatItem.className = 'motrix-source-item';
              formatItem.innerHTML = `
                <span class="motrix-source-label">${f.label}</span>
                <span class="motrix-source-action">Download</span>
              `;
              formatItem.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                
                showPanelStatus(panel, 'loading', 'Sending...');
                
                const fallbackTitle = document.title ? document.title.replace(/[<>:"/\\|?*\n\r]/g, '').trim() : 'video';
                const finalTitle = (title && title !== 'video') ? title.replace(/[<>:"/\\|?*\n\r]/g, '') : fallbackTitle;
                const outFilename = `${finalTitle}.${f.ext || 'mp4'}`;
                
                chrome.runtime.sendMessage({
                  type: 'send-to-motrix',
                  url: f.url,
                  filename: outFilename,
                  referer: window.location.href
                }, (response) => {
                  if (chrome.runtime.lastError || !response || !response.success) {
                    showPanelStatus(panel, 'error', response?.error || 'Failed');
                  } else {
                    showPanelStatus(panel, 'success', 'Sent to Motrix!');
                  }
                });
              });
              sourceList.appendChild(formatItem);
            });
          });
        });
        sourceList.appendChild(fetchItem);
      }
    }

    // Add blob sources last with a warning
    if (hasBlobOnly) {
      sources.filter(s => s.isBlob).forEach(src => {
        const item = createSourceItem({ ...src, label: src.label + ' (Stream)' }, panel);
        sourceList.appendChild(item);
      });
    }

    panelContent.appendChild(sourceList);
    panel.appendChild(mainBtn);
    panel.appendChild(panelContent);

    // --- Interactions ---
    let expanded = false;

    // If only one direct source and no other options, main button downloads immediately
    // If isVideoSite is true, we always have 'Fetch Qualities' so we must expand the panel instead
    if (directSources.length === 1 && !hasBlobOnly && !isVideoSite) {
      mainBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownload(directSources[0].url, panel);
      });
    } else {
      // Multiple sources or special case: expand panel on click
      mainBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        expanded = !expanded;
        panelContent.classList.toggle('motrix-expanded', expanded);
        mainBtn.classList.toggle('motrix-active', expanded);
        panel.classList.toggle('motrix-keep-visible', expanded);
      });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target)) {
        expanded = false;
        panelContent.classList.remove('motrix-expanded');
        mainBtn.classList.remove('motrix-active');
        panel.classList.remove('motrix-keep-visible');
      }
    });

    container.appendChild(panel);
  }

  function createSourceItem(src, panel) {
    const item = document.createElement('div');
    item.className = 'motrix-source-item';

    const label = document.createElement('span');
    label.className = 'motrix-source-label';
    label.textContent = src.label;

    const action = document.createElement('span');
    action.className = 'motrix-source-action';
    action.textContent = 'Download';

    item.appendChild(label);
    item.appendChild(action);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDownload(src.url, panel);
    });

    return item;
  }

  // ============================================================
  // Download Handler
  // ============================================================

  function handleDownload(url, panelElement) {
    if (!chrome?.runtime?.sendMessage) {
      showPanelStatus(panelElement, 'error', 'Extension error');
      return;
    }

    showPanelStatus(panelElement, 'loading', 'Sending…');

    chrome.runtime.sendMessage({
      type: 'download-video',
      url: url,
      filename: extractFilename(url),
      referer: window.location.href
    }, (response) => {
      if (chrome.runtime.lastError) {
        showPanelStatus(panelElement, 'error', 'Connection failed');
      } else if (response?.success) {
        showPanelStatus(panelElement, 'success', 'Sent to Motrix!');
      } else {
        showPanelStatus(panelElement, 'error', response?.error || 'Failed');
      }
    });
  }

  function extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const filename = decodeURIComponent(path.split('/').pop() || '');
      return filename || urlObj.hostname;
    } catch {
      return url.split('/').pop()?.split('?')[0] || 'video';
    }
  }

  function showPanelStatus(panel, type, message) {
    const btn = panel.querySelector('.motrix-main-btn');
    if (!btn) return;

    const textEl = btn.querySelector('.motrix-main-btn-text');
    const iconEl = btn.querySelector('.motrix-main-btn-icon');

    // Save originals
    if (!btn._originalText) {
      btn._originalText = textEl.textContent;
      btn._originalIcon = iconEl.innerHTML;
    }

    if (type === 'success') {
      textEl.textContent = message;
      iconEl.innerHTML = ICONS.check;
      btn.classList.add('motrix-status-success');
      btn.classList.remove('motrix-status-error', 'motrix-status-loading');
    } else if (type === 'error') {
      textEl.textContent = message;
      iconEl.innerHTML = ICONS.x;
      btn.classList.add('motrix-status-error');
      btn.classList.remove('motrix-status-success', 'motrix-status-loading');
    } else if (type === 'loading') {
      textEl.textContent = message;
      btn.classList.add('motrix-status-loading');
      btn.classList.remove('motrix-status-success', 'motrix-status-error');
    }

    // Reset after delay
    if (type !== 'loading') {
      setTimeout(() => {
        textEl.textContent = btn._originalText;
        iconEl.innerHTML = btn._originalIcon;
        btn.classList.remove('motrix-status-success', 'motrix-status-error', 'motrix-status-loading');
      }, 3000);
    }
  }

  // ============================================================
  // Video Scanner
  // ============================================================

  function doScan() {
    if (!overlayEnabled) return;

    // Scan regular DOM videos
    document.querySelectorAll('video').forEach(processVideo);

    // Also scan for iframes that might contain videos (same-origin only)
    try {
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            iframeDoc.querySelectorAll('video').forEach(processVideo);
          }
        } catch { /* Cross-origin iframe, skip */ }
      });
    } catch { /* ignore */ }
  }

  function processVideo(video) {
    if (processedVideos.has(video) || video.hasAttribute(PROCESSED_ATTR)) return;

    // Wait for video to have dimensions
    const checkAndCreate = () => {
      if (!overlayEnabled) return;
      const rect = video.getBoundingClientRect();
      if (rect.width < MIN_VIDEO_WIDTH || rect.height < MIN_VIDEO_HEIGHT) return;

      const sources = extractVideoSources(video);
      processedVideos.add(video);
      video.setAttribute(PROCESSED_ATTR, 'true');
      createOverlay(video, sources);
    };

    // If video already has dimensions, create immediately
    if (video.offsetWidth >= MIN_VIDEO_WIDTH && video.offsetHeight >= MIN_VIDEO_HEIGHT) {
      setTimeout(checkAndCreate, 300);
    } else {
      // Wait for video to load/resize
      video.addEventListener('loadedmetadata', checkAndCreate, { once: true });
      video.addEventListener('resize', checkAndCreate, { once: true });
      // Also try after a delay as fallback
      setTimeout(checkAndCreate, 2000);
    }
  }

  function scanForVideos() {
    if (!overlayEnabled) return;
    if (scanTimeout) return;
    scanTimeout = setTimeout(() => {
      scanTimeout = null;
      if (window.requestIdleCallback) {
        requestIdleCallback(doScan);
      } else {
        setTimeout(doScan, 0);
      }
    }, SCAN_DEBOUNCE_MS);
  }

  // ============================================================
  // Cleanup
  // ============================================================

  function removeAllOverlays() {
    document.querySelectorAll('.' + OVERLAY_CLASS).forEach(el => {
      el.remove();
    });
    // Remove container class from parents (but don't unwrap to avoid layout break)
    document.querySelectorAll('.' + CONTAINER_CLASS).forEach(el => {
      el.classList.remove(CONTAINER_CLASS);
    });
  }

  // ============================================================
  // URL Change Detection (for SPAs like YouTube)
  // ============================================================

  let lastUrl = window.location.href;

  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Reset processed videos for new page content
      document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(v => {
        v.removeAttribute(PROCESSED_ATTR);
      });
      // Re-scan after a delay for new page content to load
      setTimeout(() => {
        removeAllOverlays();
        scanForVideos();
      }, 1500);
    }
  }

  // Check for URL changes every second (catches YouTube navigation, etc.)
  setInterval(checkUrlChange, 1000);

  // Also listen for popstate
  window.addEventListener('popstate', () => {
    setTimeout(() => {
      checkUrlChange();
    }, 500);
  });

  // ============================================================
  // Settings Management
  // ============================================================

  if (chrome.storage?.local) {
    chrome.storage.local.get({ videoOverlay: true }, (result) => {
      overlayEnabled = result.videoOverlay !== false;
      if (overlayEnabled) scanForVideos();
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.videoOverlay) {
        overlayEnabled = changes.videoOverlay.newValue !== false;
        if (!overlayEnabled) {
          removeAllOverlays();
        } else {
          scanForVideos();
        }
      }
    });
  }

  // ============================================================
  // MutationObserver — detect dynamically added videos
  // ============================================================

  const observer = new MutationObserver((mutations) => {
    if (!overlayEnabled) return;
    let shouldScan = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.nodeName === 'VIDEO' ||
            node.querySelector?.('video') ||
            node.nodeName === 'IFRAME') {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scanForVideos();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // ============================================================
  // Periodic cleanup for removed videos
  // ============================================================

  setInterval(() => {
    document.querySelectorAll('.' + OVERLAY_CLASS).forEach(overlay => {
      if (overlay.videoElement && !overlay.videoElement.isConnected) {
        overlay.remove();
      }
    });
  }, 5000);

})();
