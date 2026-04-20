#!/usr/bin/env python3
import os
import sys
import json
import socket
import mimetypes
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from datetime import datetime, timedelta
import threading
import jwt

from PIL import Image
from pillow_heif import register_heif_opener
from zeroconf import ServiceInfo, Zeroconf

# Register HEIF opener for HEIC support
register_heif_opener()

# Configuration
# Check for custom directory or use Pictures
PICTURES_DIR = Path(os.environ.get("PHOTOS_DIR", Path.home() / "Pictures"))
THUMBNAILS_DIR = Path(__file__).parent / "thumbnails"
STATIC_DIR = Path(__file__).parent / "static"
PASSWORD = os.environ.get("PASSWORD", "gallery")

# Load or generate persistent SECRET_KEY
SECRET_KEY_FILE = Path(__file__).parent / ".secret_key"
if SECRET_KEY_FILE.exists():
    SECRET_KEY = SECRET_KEY_FILE.read_text().strip()
else:
    SECRET_KEY = os.urandom(32).hex()
    SECRET_KEY_FILE.write_text(SECRET_KEY)
    print(f"✓ Generated new secret key: {SECRET_KEY_FILE}")

SESSION_DURATION = timedelta(days=1)
THUMBNAIL_SIZE = (300, 300)
SUPPORTED_EXTENSIONS = {
    '.jpg', '.jpeg', '.png', '.gif', '.heic',
    '.mp4', '.mov'
}

# Ensure thumbnails directory exists
THUMBNAILS_DIR.mkdir(exist_ok=True)


def get_local_ip():
    """Get the local IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


def scan_media_files():
    """Recursively scan Pictures directory for media files"""
    media_files = []

    if not PICTURES_DIR.exists():
        print(f"Warning: {PICTURES_DIR} does not exist")
        return media_files

    for path in PICTURES_DIR.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            try:
                mtime = path.stat().st_mtime
                media_files.append({
                    'path': str(path),
                    'name': path.name,
                    'mtime': mtime,
                    'is_video': path.suffix.lower() in {'.mp4', '.mov'}
                })
            except:
                continue

    # Sort by modification time, newest first
    media_files.sort(key=lambda x: x['mtime'], reverse=True)
    return media_files


def generate_thumbnail(source_path, thumb_path):
    """Generate a thumbnail for an image"""
    try:
        with Image.open(source_path) as img:
            # Convert RGBA to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background

            # Create thumbnail with cover crop
            img.thumbnail((THUMBNAIL_SIZE[0] * 2, THUMBNAIL_SIZE[1] * 2), Image.Resampling.LANCZOS)

            # Center crop to exact size
            width, height = img.size
            left = (width - THUMBNAIL_SIZE[0]) / 2
            top = (height - THUMBNAIL_SIZE[1]) / 2
            right = (width + THUMBNAIL_SIZE[0]) / 2
            bottom = (height + THUMBNAIL_SIZE[1]) / 2

            img = img.crop((left, top, right, bottom))
            img.save(thumb_path, "JPEG", quality=85)
            return True
    except Exception as e:
        print(f"Error generating thumbnail for {source_path}: {e}")
        return False


def generate_video_thumbnail(source_path, thumb_path):
    """Generate a thumbnail for a video using ffmpeg"""
    import subprocess
    try:
        # Extract frame at 1 second (or 10% of duration)
        temp_frame = thumb_path.with_suffix('.tmp.jpg')

        # Use ffmpeg to extract a frame
        cmd = [
            'ffmpeg',
            '-i', str(source_path),
            '-ss', '1',  # Seek to 1 second
            '-vframes', '1',  # Extract 1 frame
            '-vf', f'scale={THUMBNAIL_SIZE[0]*2}:{THUMBNAIL_SIZE[1]*2}:force_original_aspect_ratio=increase,crop={THUMBNAIL_SIZE[0]}:{THUMBNAIL_SIZE[1]}',
            '-y',  # Overwrite output
            str(temp_frame)
        ]

        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10
        )

        if result.returncode == 0 and temp_frame.exists():
            temp_frame.rename(thumb_path)
            return True

        return False
    except Exception as e:
        print(f"Error generating video thumbnail for {source_path}: {e}")
        return False


def create_session_token():
    """Create a JWT session token"""
    expiry = datetime.now() + SESSION_DURATION
    payload = {
        'exp': expiry,
        'iat': datetime.now(),
        'authenticated': True
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    print(f"[AUTH] Created JWT token, expires at {expiry.strftime('%Y-%m-%d %H:%M:%S')}")
    return token


def verify_session_token(token):
    """Verify a JWT session token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        print(f"[AUTH] Valid token, expires at {datetime.fromtimestamp(payload['exp']).strftime('%Y-%m-%d %H:%M:%S')}")
        return True
    except jwt.ExpiredSignatureError:
        print(f"[AUTH] Token expired")
        return False
    except jwt.InvalidTokenError as e:
        print(f"[AUTH] Invalid token: {e}")
        return False
    except Exception as e:
        print(f"[AUTH] Token verification error: {e}")
        return False


class GalleryHandler(BaseHTTPRequestHandler):
    media_files = []

    def log_message(self, format, *args):
        """Log HTTP requests"""
        # Suppress logging for common client disconnection errors
        message = format % args
        if 'Broken pipe' in message or 'Connection reset' in message:
            return
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {self.address_string()} - {message}")

    def get_session_token(self):
        """Extract session token from Authorization header or Cookie"""
        # Check Authorization header first (for localStorage tokens)
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            print(f"[AUTH] Found Bearer token for {self.path}")
            return token

        # Fall back to cookie
        cookie_header = self.headers.get('Cookie', '')
        if not cookie_header:
            print(f"[AUTH] No Authorization or Cookie header found for {self.path}")
            return None

        for cookie in cookie_header.split(';'):
            cookie = cookie.strip()
            if cookie.startswith('session='):
                token = cookie[8:]
                print(f"[AUTH] Found session cookie for {self.path}")
                return token

        print(f"[AUTH] Cookie header exists but no session cookie for {self.path}")
        return None

    def is_authenticated(self):
        """Check if request is authenticated"""
        token = self.get_session_token()
        if not token:
            print(f"[AUTH] No token found for {self.path}")
            return False

        result = verify_session_token(token)
        if not result:
            print(f"[AUTH] Invalid or expired token for {self.path}")
        else:
            print(f"[AUTH] Valid token for {self.path}")
        return result

    def send_redirect(self, location):
        """Send a redirect response"""
        self.send_response(302)
        self.send_header('Location', location)
        self.end_headers()

    def send_json(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def send_file(self, file_path, content_type=None):
        """Send a file response"""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            if content_type:
                self.send_header('Content-Type', content_type)
            else:
                mime_type, _ = mimetypes.guess_type(file_path)
                if mime_type:
                    self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionResetError):
            # Client disconnected - ignore silently (common with prefetching)
            pass
        except Exception as e:
            try:
                self.send_error(404, f"File not found: {e}")
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_GET(self):
        """Handle GET requests"""
        parsed = urlparse(self.path)
        path = parsed.path

        # Serve the unified app for all root paths (handles auth in JS)
        if path in ['/', '/index.html', '/login.html']:
            self.send_file(STATIC_DIR / 'index.html', 'text/html')
            return

        if path == '/api/media':
            if not self.is_authenticated():
                self.send_json({'error': 'Unauthorized'}, 401)
                return

            # Parse pagination parameters
            query_params = parse_qs(parsed.query)
            offset = int(query_params.get('offset', ['0'])[0])
            limit = int(query_params.get('limit', ['100'])[0])

            # Return paginated list of media files
            total = len(self.media_files)
            media_subset = self.media_files[offset:offset + limit]

            media_list = []
            for idx in range(offset, min(offset + limit, total)):
                if idx < total:
                    media = self.media_files[idx]
                    media_list.append({
                        'id': idx,
                        'name': media['name'],
                        'is_video': media['is_video'],
                        'mtime': media['mtime']
                    })

            self.send_json({
                'items': media_list,
                'total': total,
                'offset': offset,
                'limit': limit,
                'hasMore': (offset + limit) < total
            })
            return

        if path.startswith('/api/thumbnail/'):
            if not self.is_authenticated():
                self.send_error(401, "Unauthorized")
                return

            try:
                media_id = int(path.split('/')[-1])
                if 0 <= media_id < len(self.media_files):
                    media = self.media_files[media_id]

                    # Generate thumbnail if it doesn't exist
                    source_path = Path(media['path'])
                    thumb_name = hashlib.md5(media['path'].encode()).hexdigest() + '.jpg'
                    thumb_path = THUMBNAILS_DIR / thumb_name

                    if not thumb_path.exists():
                        if media['is_video']:
                            generate_video_thumbnail(source_path, thumb_path)
                        else:
                            generate_thumbnail(source_path, thumb_path)

                    if thumb_path.exists():
                        self.send_file(thumb_path, 'image/jpeg')
                    else:
                        self.send_error(500, "Failed to generate thumbnail")
                else:
                    self.send_error(404, "Media not found")
            except (BrokenPipeError, ConnectionResetError):
                # Client disconnected - ignore silently
                pass
            except Exception as e:
                try:
                    self.send_error(500, str(e))
                except (BrokenPipeError, ConnectionResetError):
                    pass
            return

        if path.startswith('/api/view/'):
            if not self.is_authenticated():
                self.send_error(401, "Unauthorized")
                return

            try:
                media_id = int(path.split('/')[-1])
                if 0 <= media_id < len(self.media_files):
                    media = self.media_files[media_id]
                    # Serve the media file for viewing only (not downloading)
                    self.send_file(media['path'])
                else:
                    self.send_error(404, "Media not found")
            except (BrokenPipeError, ConnectionResetError):
                # Client disconnected - ignore silently
                pass
            except Exception as e:
                try:
                    self.send_error(500, str(e))
                except (BrokenPipeError, ConnectionResetError):
                    pass
            return

        # Serve static files (CSS, JS)
        if path.startswith('/css/') or path.startswith('/js/'):
            try:
                file_path = STATIC_DIR / path.lstrip('/')
                if file_path.exists() and file_path.is_file():
                    # Determine content type
                    if path.endswith('.css'):
                        content_type = 'text/css'
                    elif path.endswith('.js'):
                        content_type = 'application/javascript'
                    else:
                        content_type = 'text/plain'
                    self.send_file(file_path, content_type)
                    return
            except Exception as e:
                print(f"[ERROR] Error serving static file {path}: {e}")
                pass

        self.send_error(404, "Not found")

    def do_POST(self):
        """Handle POST requests"""
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/login':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = parse_qs(post_data.decode())

            password = params.get('password', [''])[0]

            print(f"[LOGIN] Received password: '{password}' (len={len(password)})")
            print(f"[LOGIN] Expected password: '{PASSWORD}' (len={len(PASSWORD)})")
            print(f"[LOGIN] Match: {password == PASSWORD}")

            if password == PASSWORD:
                token = create_session_token()
                self.send_response(200)
                # Also set cookie as fallback
                self.send_header('Set-Cookie', f'session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={int(SESSION_DURATION.total_seconds())}')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                # Return token in response for localStorage storage
                self.wfile.write(json.dumps({'success': True, 'token': token}).encode())
                hours = int(SESSION_DURATION.total_seconds() / 3600)
                print(f"[LOGIN] Success - JWT token returned (valid for {hours} hours)")
            else:
                self.send_json({'success': False, 'error': 'Invalid password'}, 401)
                print(f"[LOGIN] Failed")
            return

        if path == '/api/logout':
            self.send_response(200)
            self.send_header('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            return

        self.send_error(404, "Not found")


def register_mdns(port):
    """Register mDNS service for gallery.local"""
    try:
        local_ip = get_local_ip()

        info = ServiceInfo(
            "_http._tcp.local.",
            "Photo Gallery._http._tcp.local.",
            addresses=[socket.inet_aton(local_ip)],
            port=port,
            properties={},
            server="gallery.local."
        )

        zeroconf = Zeroconf()
        zeroconf.register_service(info)
        print(f"✓ mDNS registered: http://gallery.local:{port}")
        return zeroconf
    except Exception as e:
        print(f"✗ mDNS registration failed: {e}")
        return None


def main():
    PORT = 8080

    print("=" * 60)
    print("WiFi Photo Gallery Server")
    print("=" * 60)

    # Scan media files
    print(f"\nScanning {PICTURES_DIR}...")
    GalleryHandler.media_files = scan_media_files()
    print(f"✓ Found {len(GalleryHandler.media_files)} media files")

    # Start HTTP server
    server = HTTPServer(('0.0.0.0', PORT), GalleryHandler)

    # Register mDNS
    zeroconf = register_mdns(PORT)

    # Print access information
    local_ip = get_local_ip()
    print(f"\n✓ Server running on port {PORT}")
    print(f"\nAccess the gallery from any device on your WiFi:")
    print(f"  • http://gallery.local:{PORT}")
    print(f"  • http://{local_ip}:{PORT}")
    print(f"\nDefault password: {PASSWORD}")
    print(f"\nPress Ctrl+C to stop the server\n")
    print("=" * 60)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        server.shutdown()
        if zeroconf:
            zeroconf.unregister_all_services()
            zeroconf.close()
        print("✓ Server stopped")


if __name__ == "__main__":
    main()
