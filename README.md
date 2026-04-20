# WiFi Photo Gallery

Browse photos from your Mac's Pictures folder on your iPhone via local WiFi. iOS Photos app-style interface.

## Features

- Password-protected access with JWT tokens
- iOS-style UI with pinch-to-zoom and swipe gestures
- Supports JPEG, PNG, GIF, HEIC, MP4, MOV
- Lazy-loaded thumbnails with caching
- Infinite scroll
- Works on local network via mDNS (gallery.local)

## Installation

```bash
git clone https://github.com/rohanbennur43/wifi-photo-gallery.git
cd wifi-photo-gallery
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Usage

```bash
./start.sh
```

Access from your iPhone at `http://gallery.local:8080` (default password: `gallery`)

## Configuration

Set environment variables:

```bash
export PHOTOS_DIR="/path/to/photos"  # Default: ~/Pictures
export PASSWORD="yourpassword"       # Default: gallery
```

## Tech Stack

- Python 3.8+ (HTTP server, PIL/Pillow, PyJWT, Zeroconf)
- Vanilla JavaScript (ES6 modules)
- CSS3

## Requirements

- Python 3.8+
- Local WiFi network
- ~50MB disk space for thumbnail cache

## License

MIT
