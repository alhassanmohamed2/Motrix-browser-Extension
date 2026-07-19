#!/bin/bash

# Motrix yt-dlp Companion App Installer
echo "==============================================="
echo "   Motrix yt-dlp Native Host Installer"
echo "==============================================="

# Check dependencies
if ! command -v yt-dlp &> /dev/null; then
    echo "ERROR: yt-dlp is not installed."
    echo "Please install it first with your package manager or directly:"
    echo "  sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp"
    echo "  sudo chmod a+rx /usr/local/bin/yt-dlp"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed."
    exit 1
fi

EXT_ID=$1

if [ -z "$EXT_ID" ]; then
    echo "🔍 Scanning for extension ID in browser preferences..."
    
    # Try to find the extension ID in Chrome Preferences
    EXT_ID=$(python3 -c '
import json, sys, os
prefs_path = os.path.expanduser("~/.config/google-chrome/Default/Preferences")
if not os.path.exists(prefs_path):
    sys.exit(0)
try:
    with open(prefs_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    exts = data.get("extensions", {}).get("settings", {})
    for ext_id, ext_info in exts.items():
        # Check if the path ends with our extension folder
        if "Motrix browser Extenstion" in ext_info.get("path", ""):
            print(ext_id)
            sys.exit(0)
except Exception:
    pass
')
    
    if [ -z "$EXT_ID" ]; then
        echo "❌ Could not automatically find the Extension ID."
        echo "Usage: ./install.sh <EXTENSION_ID>"
        echo "You can find your Extension ID in chrome://extensions/"
        exit 1
    fi
    echo "✅ Found Extension ID: $EXT_ID"
fi
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
HOST_PATH="$DIR/motrix_ytdlp_host.py"
MANIFEST_PATH="$DIR/com.motrix.ytdlp.json"

chmod +x "$HOST_PATH"

cat > "$MANIFEST_PATH" << EOF
{
  "name": "com.motrix.ytdlp",
  "description": "yt-dlp bridge for Motrix Extension",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

# Install for Chrome
CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
mkdir -p "$CHROME_DIR"
cp "$MANIFEST_PATH" "$CHROME_DIR/"

# Install for Chromium
CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
mkdir -p "$CHROMIUM_DIR"
cp "$MANIFEST_PATH" "$CHROMIUM_DIR/"

# Install for Brave
BRAVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
mkdir -p "$BRAVE_DIR"
cp "$MANIFEST_PATH" "$BRAVE_DIR/"

# Install for Edge
EDGE_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
mkdir -p "$EDGE_DIR"
cp "$MANIFEST_PATH" "$EDGE_DIR/"

echo ""
echo "✅ Successfully installed Native Messaging Host for extension ID: $EXT_ID"
echo "✅ The yt-dlp bridge is now active. You can download YouTube videos seamlessly from the extension."
