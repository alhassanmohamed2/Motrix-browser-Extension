#!/usr/bin/env python3
import sys
import json
import struct
import subprocess

def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    msg_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(msg_length).decode('utf-8')
    return json.loads(message)

def encode_message(message_content):
    encoded_content = json.dumps(message_content).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    return {'length': encoded_length, 'content': encoded_content}

def send_message(encoded_message):
    sys.stdout.buffer.write(encoded_message['length'])
    sys.stdout.buffer.write(encoded_message['content'])
    sys.stdout.buffer.flush()

while True:
    try:
        received_message = get_message()
        if "url" in received_message:
            url = received_message["url"]
            action = received_message.get("action", "get_best")
            
            try:
                with open("/tmp/motrix_host.log", "a") as f:
                    f.write(f"Received action: {action}, url: {url}\n")
                
                import shutil
                yt_dlp_path = shutil.which("yt-dlp")
                if not yt_dlp_path:
                    import os
                    local_bin = os.path.expanduser("~/.local/bin/yt-dlp")
                    if os.path.exists(local_bin):
                        yt_dlp_path = local_bin
                    else:
                        yt_dlp_path = "yt-dlp"

                if action == "get_formats":
                    cmd = [yt_dlp_path, "-J", "--no-playlist", url]
                    res = subprocess.run(cmd, capture_output=True, text=True)
                    if res.returncode != 0:
                        send_message(encode_message({"success": False, "error": f"yt-dlp failed: {res.stderr.strip()}"}))
                        continue
                        
                    info = json.loads(res.stdout)
                    formats = []
                    for f in info.get("formats", []):
                        # Motrix/aria2 cannot merge video+audio.
                        # Pre-merged formats (both codecs exist) max out at 720p on YouTube.
                        # 1080p+ are video-only streams. We will include them but label them as (No Sound).
                        if f.get("vcodec") != "none":
                            height = f.get("height", 0)
                            ext = f.get("ext", "mp4")
                            fps = f.get("fps")
                            has_audio = f.get("acodec") != "none"
                            
                            label = f"{height}p" if height else "Video"
                            if height and fps and fps > 30:
                                label += f"{int(fps)}"
                                
                            if not has_audio:
                                label += " (No Sound)"
                                
                            label += f" .{ext}"
                            
                            formats.append({
                                "url": f.get("url"),
                                "label": label,
                                "height": height or 0,
                                "ext": ext
                            })
                    
                    formats = sorted(formats, key=lambda x: x["height"], reverse=True)
                    # Deduplicate
                    unique_formats = []
                    seen = set()
                    for f in formats:
                        if f["label"] not in seen:
                            seen.add(f["label"])
                            unique_formats.append(f)
                    
                    title = info.get('title', 'video')
                    safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in ' -_']).rstrip()
                    safe_title = safe_title.replace(" ", "_")
                    if not safe_title: safe_title = "video"
                    
                    with open("/tmp/motrix_host.log", "a") as f:
                        f.write(f"Returning {len(unique_formats)} formats\n")
                        
                    send_message(encode_message({
                        "success": True,
                        "formats": unique_formats,
                        "title": safe_title,
                        "headers": info.get("http_headers", {})
                    }))
                    
                elif action == "resolve_redirect":
                    import urllib.request
                    req = urllib.request.Request(url, method="HEAD")
                    try:
                        with urllib.request.urlopen(req) as response:
                            final_url = response.geturl()
                            send_message(encode_message({"success": True, "final_url": final_url}))
                    except Exception as e:
                        # Fallback to the original URL if HEAD fails
                        send_message(encode_message({"success": True, "final_url": url, "error": str(e)}))
                    
                else:
                    # Original get_best logic
                    cmd = [yt_dlp_path, "-J", "--no-playlist", "-f", "b[ext=mp4]/b", url]
                    res = subprocess.run(cmd, capture_output=True, text=True)
                    
                    if res.returncode != 0:
                        send_message(encode_message({"success": False, "error": f"yt-dlp failed: {res.stderr.strip()}"}))
                        continue
                        
                    info = json.loads(res.stdout)
                    
                    direct_url = info.get('url')
                    title = info.get('title', 'video')
                    ext = info.get('ext', 'mp4')
                    
                    safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in ' -_']).rstrip()
                    safe_title = safe_title.replace(" ", "_")
                    if not safe_title:
                        safe_title = "video"
                    filename = f"{safe_title}.{ext}"
                    
                    headers = info.get('http_headers', {})
                    
                    send_message(encode_message({
                        "success": True, 
                        "direct_url": direct_url, 
                        "filename": filename,
                        "headers": headers
                    }))
            except Exception as e:
                with open("/tmp/motrix_host.log", "a") as f:
                    f.write(f"Exception: {str(e)}\n")
                send_message(encode_message({"success": False, "error": str(e)}))
        else:
            send_message(encode_message({"success": False, "error": "No URL provided"}))
    except Exception as e:
        send_message(encode_message({"success": False, "error": str(e)}))
        sys.exit(1)
