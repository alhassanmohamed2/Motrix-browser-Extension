const item = { url: 'https://rr2---sn-apo3qvuoxuxbt-5atz.googlevideo.com/videoplayback?...', mime: 'video/mp4' };
let pageTitle = '';
let filename = decodeURIComponent(item.url.split('/').pop()?.split('?')[0] || '');
if (filename === 'videoplayback' || filename === 'videoplayback.mp4' || filename === 'videoplayback.webm' || !filename) {
  if (pageTitle) {
    let cleanTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '').trim();
    if (cleanTitle.endsWith(' - YouTube')) cleanTitle = cleanTitle.replace(' - YouTube', '');
    let ext = '.mp4';
    if (item.mime === 'video/webm' || item.url.includes('mime=video%2Fwebm') || item.url.includes('mime=video/webm')) {
      ext = '.webm';
    }
    filename = cleanTitle + ext;
  } else {
    filename = `videoplayback_${Date.now()}.mp4`;
  }
}
console.log(filename);
