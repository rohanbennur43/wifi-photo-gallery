# WiFi Photo Gallery

A local WiFi photo gallery server that lets you browse your Mac's Photos library from your iPhone on the same network. Features iOS Photos app-style interface with smooth gestures and performance optimized for 48,000+ photos.

## Features

✨ **iPhone-Optimized UI**
- iOS Photos app design parity
- Smooth pinch-to-zoom grid (2-6 columns)
- Swipe navigation in lightbox
- Touch-optimized gestures
- Dark theme with iOS design system

🔐 **Secure Access**
- Password protection with JWT tokens
- 24-hour session persistence
- HttpOnly cookies + localStorage fallback
- Auto-login support

📱 **Mobile-First Performance**
- Lazy-loaded thumbnails (300x300)
- Infinite scroll with batch loading
- Tested with 48,000+ photos
- Optimized for cellular/WiFi

🎬 **Media Support**
- Images: JPEG, PNG, GIF, HEIC
- Videos: MP4, MOV with inline playback
- Video thumbnail generation
- Double-tap to zoom images
- Pinch-to-zoom in lightbox

🌐 **Network Discovery**
- mDNS (Bonjour) support
- Access via `http://gallery.local:8080`
- Auto IP detection
- Works across all devices on LAN

## Tech Stack

**Backend:**
- Python 3.14
- HTTP server (stdlib)
- PIL/Pillow for image processing
- PyJWT for authentication
- Zeroconf for mDNS

**Frontend:**
- Vanilla JavaScript (ES6 modules)
- CSS3 with iOS design system
- No frameworks - pure web standards
- Modular architecture

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd wifi-photo-gallery
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the Server

```bash
./start.sh
```

The server will:
- Scan your `~/Pictures` directory for media files
- Start an HTTP server on port 8080
- Register `gallery.local` via mDNS
- Generate thumbnails on-demand

### 4. Access from iPhone

On your iPhone (same WiFi network):
- Open Safari and navigate to `http://gallery.local:8080`
- Or use the IP address: `http://192.168.x.x:8080`
- Enter password (default: `gallery`)
- Browse with iOS-style gestures

## Configuration

### Environment Variables

Set via environment or in `start.sh`:

```bash
export PHOTOS_DIR="/path/to/your/photos"  # Default: ~/Pictures
export PASSWORD="your-password"            # Default: gallery
```

### Customization

Edit `server.py` to customize:
- Session duration (default: 24 hours)
- Thumbnail size (default: 300x300)
- Batch size (default: 24 photos)
- Port (default: 8080)
- Supported file extensions

## Gestures

### Grid View
- **Pinch to zoom**: Change grid density (2-6 columns)
- **Tap photo**: Open in lightbox
- **+/- buttons**: Adjust grid zoom
- **Scroll**: Infinite scroll loading

### Lightbox View
- **Swipe left/right**: Navigate photos
- **Swipe down**: Close lightbox
- **Pinch to zoom**: Zoom into image
- **Double-tap**: Toggle zoom (1x / 2.5x)
- **Pan**: Move zoomed image
- **Tap**: Toggle UI visibility
- **Keyboard**: Arrow keys to navigate, Esc to close

## How It Works

### Backend (Python)
- Recursively scans `~/Pictures` for supported media files
- Generates 300x300 JPEG thumbnails on-demand using Pillow
- Caches thumbnails in `./thumbnails` directory
- JWT tokens with HMAC signing for authentication
- Persistent secret key across server restarts
- Registers mDNS service for `gallery.local` hostname

### Frontend (ES6 Modules)
- Modular JavaScript architecture
- CSS Grid with dynamic column counts
- Intersection Observer API for lazy loading
- Touch event handling for gestures
- localStorage for token persistence
- No frameworks, no build step required

## Performance

- **48,000+ photos** tested successfully
- Thumbnail caching for instant grid loading
- On-demand full-resolution image serving
- Efficient infinite scroll with batch loading (24 items)
- ~2000 thumbnails = ~50MB cache
- First load generates thumbnails, subsequent loads instant

## Security Notes

- **Local network only** - designed for home WiFi use
- Password-protected access with JWT tokens
- Session cookies are HttpOnly and HMAC-signed
- Tokens persist 24 hours in localStorage
- Persistent secret key (`.secret_key` file)
- View-only access - no download/delete endpoints
- All API requests require authentication

⚠️ **Not recommended for public internet exposure**

## Project Structure

```
wifi-photo-gallery/
├── server.py                 # Python backend server
├── start.sh                  # Startup script
├── requirements.txt          # Python dependencies
├── .gitignore               # Git ignore rules
├── README.md                # This file
├── REFACTORING.md           # Architecture documentation
├── static/
│   ├── index.html           # Main HTML (95 lines)
│   ├── css/
│   │   └── styles.css       # All styling (350 lines)
│   └── js/
│       ├── config.js        # Configuration & constants
│       ├── utils.js         # Utility functions
│       ├── auth.js          # Authentication logic
│       ├── gallery.js       # Photo grid management
│       ├── lightbox.js      # Image viewer
│       └── main.js          # App initialization
└── thumbnails/              # Generated cache (gitignored)
```

### Modular Architecture

The codebase is fully modular with separated concerns:

- **auth.js** (76 lines): Login, JWT token management, auto-login
- **gallery.js** (278 lines): Grid rendering, infinite scroll, pinch-to-zoom, API calls
- **lightbox.js** (384 lines): Full-screen viewer, gestures, video playback
- **styles.css** (350 lines): All CSS with iOS design system
- **config.js**: Constants and configuration
- **utils.js**: Helper functions
- **main.js**: Application initialization

See `REFACTORING.md` for detailed architecture documentation.

## Troubleshooting

**Server won't start:**
- Check if port 8080 is available: `lsof -i:8080`
- Kill existing process: `lsof -ti:8080 | xargs kill -9`
- Verify Python version: `python3 --version` (3.8+)

**Can't access from iPhone:**
- Ensure both devices on same WiFi network
- Try IP address instead of `.local`: `http://192.168.x.x:8080`
- Check Mac firewall settings (System Preferences → Security)
- Verify server is running: `lsof -i:8080`

**Can't access via gallery.local:**
- Some networks don't support mDNS/Bonjour
- Use the IP address shown in terminal instead
- Check that Bonjour is enabled on your router

**Images not loading:**
- Verify `PHOTOS_DIR` path is correct
- Check file permissions on Pictures folder
- Look for errors in server logs
- Try restarting server

**Thumbnails slow to generate:**
- First load generates all thumbnails (one-time)
- ~2000 photos takes a few minutes initially
- Subsequent loads use cached thumbnails
- Thumbnails stored in `./thumbnails/` directory

**HEIC images not showing:**
- Ensure `pillow-heif` is installed
- Run: `pip install pillow-heif`
- Restart server after installation

**Login keeps asking for password:**
- Clear browser cache and cookies
- Check if localStorage is enabled
- Try different browser (Safari recommended for iOS)

## Browser Support

- ✅ Safari iOS 14+
- ✅ Chrome iOS 14+
- ✅ Safari macOS
- ✅ Chrome/Firefox/Edge (desktop)

## Requirements

- Python 3.8+
- macOS, Linux, or Windows
- Local WiFi network
- ~50MB disk space for thumbnail cache

## Development

To contribute or modify:

1. The codebase uses ES6 modules - no build step needed
2. Edit files in `static/js/` for functionality changes
3. Edit `static/css/styles.css` for styling
4. Edit `server.py` for backend changes
5. See `REFACTORING.md` for architecture details

## License

MIT License - Free to use and modify

## Credits

Built with Python, Pillow, and vanilla JavaScript for seamless photo browsing across Apple devices.
