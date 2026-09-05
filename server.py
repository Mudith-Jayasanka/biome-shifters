#!/usr/bin/env python3
"""
Biome Shifters Server
Lightweight HTTP server serving static files and providing REST API endpoints
for saving and loading simulation state files directly inside the project's 'saves/' folder.
"""

import http.server
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = Path(__file__).resolve().parent
SAVES_DIR = BASE_DIR / "saves"

os.makedirs(SAVES_DIR, exist_ok=True)


def sanitize_filename(name: str) -> str:
    """Sanitize string to be a safe filename without path traversal."""
    cleaned = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name.strip())
    if not cleaned.endswith('.json'):
        cleaned += '.json'
    return os.path.basename(cleaned)


class BiomeShiftersRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _send_json(self, status_code: int, data: dict | list):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # List all saved simulations: GET /api/saves
        if path == '/api/saves' or path == '/api/saves/':
            self._handle_list_saves()
            return

        # Fetch a specific save: GET /api/saves/<filename>
        if path.startswith('/api/saves/'):
            filename = urllib.parse.unquote(path[len('/api/saves/'):])
            self._handle_get_save(filename)
            return

        # Fallback to static file server
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Save simulation: POST /api/saves
        if path == '/api/saves' or path == '/api/saves/':
            self._handle_save()
            return

        self._send_json(404, {'error': 'Endpoint not found'})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Delete a save: DELETE /api/saves/<filename>
        if path.startswith('/api/saves/'):
            filename = urllib.parse.unquote(path[len('/api/saves/'):])
            self._handle_delete_save(filename)
            return

        self._send_json(404, {'error': 'Endpoint not found'})

    def _handle_list_saves(self):
        saves = []
        if SAVES_DIR.exists():
            for file_path in SAVES_DIR.glob('*.json'):
                try:
                    stat = file_path.stat()
                    # Try reading metadata without parsing full huge world array if possible
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    saves.append({
                        'filename': file_path.name,
                        'name': data.get('name', file_path.stem),
                        'timestamp': data.get('timestamp', stat.st_mtime),
                        'tick': data.get('tick', 0),
                        'agentCount': data.get('agentCount', len(data.get('agents', []))),
                        'fileSize': stat.st_size
                    })
                except Exception as e:
                    saves.append({
                        'filename': file_path.name,
                        'name': file_path.stem,
                        'timestamp': file_path.stat().st_mtime,
                        'corrupted': True,
                        'error': str(e)
                    })
        saves.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        self._send_json(200, {'saves': saves})

    def _handle_get_save(self, filename: str):
        safe_name = sanitize_filename(filename)
        target = SAVES_DIR / safe_name
        if not target.exists() or not target.is_file():
            self._send_json(404, {'error': f'Save file {safe_name} not found'})
            return

        try:
            with open(target, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self._send_json(200, data)
        except Exception as e:
            self._send_json(500, {'error': f'Failed to read save: {str(e)}'})

    def _handle_save(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self._send_json(400, {'error': 'No data received'})
            return

        try:
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            name = data.get('name') or f"save_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            safe_name = sanitize_filename(name)
            target = SAVES_DIR / safe_name

            data['timestamp'] = datetime.now().isoformat()
            data['name'] = safe_name.replace('.json', '')

            with open(target, 'w', encoding='utf-8') as f:
                json.dump(data, f)

            self._send_json(200, {
                'status': 'success',
                'filename': safe_name,
                'message': f'Simulation saved as {safe_name}'
            })
        except Exception as e:
            self._send_json(500, {'error': f'Failed to save simulation: {str(e)}'})

    def _handle_delete_save(self, filename: str):
        safe_name = sanitize_filename(filename)
        target = SAVES_DIR / safe_name
        if not target.exists():
            self._send_json(404, {'error': f'Save file {safe_name} not found'})
            return

        try:
            target.unlink()
            self._send_json(200, {'status': 'success', 'message': f'{safe_name} deleted'})
        except Exception as e:
            self._send_json(500, {'error': f'Failed to delete: {str(e)}'})


if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), BiomeShiftersRequestHandler)
    print(f'=== Biome Shifters Server running on http://localhost:{PORT} ===')
    print(f'Saves directory: {SAVES_DIR}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
