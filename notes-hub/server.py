#!/usr/bin/env python3
"""极简贴图笔记板：标题 + 文字 + 图片（点选/拖拽/粘贴上传）。端口 8788。"""
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')
IMG_DIR = os.path.join(DATA, 'imgs')
NOTES_JSON = os.path.join(DATA, 'notes.json')
os.makedirs(IMG_DIR, exist_ok=True)
PORT = 8788
LOCK = threading.Lock()

CT_EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
          'image/gif': 'gif', 'image/bmp': 'bmp'}


def sniff_ext(b):
    if b.startswith(b'\x89PNG'):
        return 'png'
    if b.startswith(b'\xff\xd8'):
        return 'jpg'
    if b.startswith(b'GIF8'):
        return 'gif'
    if b.startswith(b'BM'):
        return 'bmp'
    if b[:4] == b'RIFF' and b[8:12] == b'WEBP':
        return 'webp'
    return ''


def load_notes():
    try:
        with open(NOTES_JSON, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def save_notes(ns):
    with open(NOTES_JSON, 'w', encoding='utf-8') as f:
        json.dump(ns, f, ensure_ascii=False, indent=1)


def now():
    import datetime
    return datetime.datetime.now().astimezone().isoformat(timespec='seconds')


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def _send(self, code, obj, ctype='application/json; charset=utf-8'):
        body = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/', '/index.html'):
            with open(os.path.join(BASE, 'index.html'), 'rb') as f:
                return self._send(200, f.read(), 'text/html; charset=utf-8')
        m = re.match(r'^/img/([\w-]+)\.(\w+)$', path)
        if m:
            fp = os.path.join(IMG_DIR, f'{m.group(1)}.{m.group(2)}')
            if os.path.isfile(fp):
                ct = next((k for k, v in CT_EXT.items() if v == m.group(2)), 'application/octet-stream')
                with open(fp, 'rb') as f:
                    return self._send(200, f.read(), ct)
            return self._send(404, b'', 'image/png')
        if path == '/api/notes':
            return self._send(200, load_notes())
        return self._send(404, {'error': 'Not Found'})

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/img':
            b = self._body()
            if not b:
                return self._send(400, {'error': '空文件'})
            ext = CT_EXT.get(self.headers.get('Content-Type', '').split(';')[0].strip(), '') or sniff_ext(b)
            if not ext:
                return self._send(400, {'error': '仅支持图片文件'})
            if len(b) > 15 * 1024 * 1024:
                return self._send(413, {'error': '图片超过 15MB'})
            import uuid
            img_id = uuid.uuid4().hex[:14]
            with open(os.path.join(IMG_DIR, f'{img_id}.{ext}'), 'wb') as f:
                f.write(b)
            return self._send(200, {'id': img_id, 'ext': ext})
        if path == '/api/save':
            try:
                note = json.loads(self._body().decode('utf-8'))
            except Exception:
                return self._send(400, {'error': 'JSON 解析失败'})
            if not isinstance(note, dict) or not note.get('id') or not re.match(r'^[\w-]+$', str(note['id'])):
                return self._send(400, {'error': '笔记数据不合法'})
            clean = {
                'id': note['id'],
                'title': (note.get('title') or '')[:120],
                'text': (note.get('text') or '')[:8000],
                'images': [{'id': i['id'], 'ext': i['ext']}
                           for i in (note.get('images') or [])
                           if isinstance(i, dict) and re.match(r'^[\w-]+$', str(i.get('id', '')))
                           and re.match(r'^\w+$', str(i.get('ext', '')))][:40],
                'updatedAt': now(),
            }
            with LOCK:
                ns = load_notes()
                for i, o in enumerate(ns):
                    if o['id'] == clean['id']:
                        old = ns[i]
                        ns[i] = clean
                        if not clean.get('createdAt'):
                            clean['createdAt'] = old.get('createdAt', now())
                        save_notes(ns)
                        return self._send(200, {'ok': True})
                clean['createdAt'] = now()
                ns.insert(0, clean)   # 新笔记置顶
                save_notes(ns)
            return self._send(200, {'ok': True})
        return self._send(404, {'error': 'Not Found'})

    def do_DELETE(self):
        m = re.match(r'^/api/(?:notes|img)/([\w.-]+)$', urlparse(self.path).path)
        if not m:
            return self._send(404, {'error': 'Not Found'})
        key = m.group(1)
        if '.' in key:  # 图片
            fp = os.path.join(IMG_DIR, key)
            if os.path.isfile(fp):
                os.remove(fp)
            return self._send(200, {'ok': True})
        with LOCK:  # 笔记
            ns = load_notes()
            target = next((o for o in ns if o['id'] == key), None)
            ns = [o for o in ns if o['id'] != key]
            save_notes(ns)
        if target:
            for img in target.get('images', []):
                fp = os.path.join(IMG_DIR, f"{img['id']}.{img['ext']}")
                try:
                    os.remove(fp)
                except OSError:
                    pass
        return self._send(200, {'ok': True})


if __name__ == '__main__':
    print(f'notes on http://0.0.0.0:{PORT}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
