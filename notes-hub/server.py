#!/usr/bin/env python3
"""标注笔记库：上传已标注的 PDF → 自动提取标注（高亮/下划线/便签/批注）→ 存储与检索
端口 8788。分片上传（4MB/片，预览代理对大请求不友好）。"""
import json
import os
import re
import shutil
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import fitz  # PyMuPDF

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')
PDFS_DIR = os.path.join(DATA, 'pdfs')
THUMBS_DIR = os.path.join(DATA, 'thumbs')
UPLOADS_DIR = os.path.join(DATA, 'uploads')
DEMO_DIR = os.path.join(BASE, 'demo')
DOCS_JSON = os.path.join(DATA, 'docs.json')
for d in (DATA, PDFS_DIR, THUMBS_DIR, UPLOADS_DIR):
    os.makedirs(d, exist_ok=True)

PORT = 8788
LOCK = threading.Lock()
CHUNK = 4 * 1024 * 1024

TYPE_MAP = {
    'Highlight': '高亮', 'Underline': '下划线', 'Squiggly': '波浪线', 'StrikeOut': '删除线',
    'Text': '便签', 'FreeText': '文字框', 'Square': '矩形', 'Circle': '椭圆',
    'Ink': '手绘', 'Polygon': '多边形', 'PolyLine': '折线', 'Stamp': '图章', 'Caret': '插入符',
}
HIGHLIGHT_TYPES = ('Highlight', 'Underline', 'Squiggly', 'StrikeOut')


def now():
    import datetime
    return datetime.datetime.now().astimezone().isoformat(timespec='seconds')


def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def rgb_hex(t):
    if not t:
        return ''
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c * 255))) for c in t[:3])


def pdf_date(s):
    m = re.match(r"D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?", s or '')
    if not m:
        return ''
    y, mo, d, hh, mm = (m.group(i) or '' for i in range(1, 6))
    return f"{y}-{mo or '01'}-{d or '01'} {hh or '00'}:{mm or '00'}"


def sanitize_name(raw):
    name = re.sub(r'[\\/:*?"<>|]', '', unquote(raw or '')).strip()
    name = re.sub(r'\.pdf$', '', name, flags=re.I).strip()
    return (name or '未命名文档')[:80]


def extract_annotations(pdf_path, doc_id):
    """提取全部标准标注 + 每条标注的原文截图，返回 (pages, notes)"""
    doc = fitz.open(pdf_path)
    pages = doc.page_count
    thumbs_dir = os.path.join(THUMBS_DIR, doc_id)
    shutil.rmtree(thumbs_dir, ignore_errors=True)
    os.makedirs(thumbs_dir, exist_ok=True)
    notes = []
    for pno, page in enumerate(doc):
        try:
            annots = list(page.annots() or [])
        except Exception:
            annots = []
        for annot in annots:
            try:
                a_type = annot.type[1]
            except Exception:
                continue
            info = annot.info or {}
            text = ''
            verts = (annot.vertices or [])
            if a_type in HIGHLIGHT_TYPES and verts:
                parts = []
                for i in range(0, len(verts), 4):
                    q = fitz.Quad(verts[i:i + 4])
                    parts.append(page.get_textbox(q.rect).strip())
                text = re.sub(r'\s+', ' ', ''.join(parts)).strip()
            elif a_type == 'FreeText':
                text = (info.get('content') or '').strip()
            note = {
                'page': pno + 1,
                'type': TYPE_MAP.get(a_type, a_type),
                'rawType': a_type,
                'color': rgb_hex((annot.colors or {}).get('stroke')),
                'text': text,
                'comment': (info.get('content') or '').strip(),
                'author': (info.get('title') or '').strip(),
                'date': pdf_date(info.get('modDate', '')),
                '_y': annot.rect.y0, '_x': annot.rect.x0,
            }
            # 原文截图（扩大一点上下文）
            try:
                r = annot.rect + (-8, -8, 8, 8)
                if annot.rect.width < 20 or annot.rect.height < 20:  # 便签等点状标注
                    r = annot.rect + (-60, -30, 60, 40)
                r = r & page.rect
                if not r.is_empty and r.width > 4 and r.height > 4:
                    key = uuid.uuid4().hex[:12]
                    pix = page.get_pixmap(clip=r, matrix=fitz.Matrix(2, 2))
                    pix.save(os.path.join(thumbs_dir, f"{key}.png"))
                    note['thumb'] = key
            except Exception:
                note['thumb'] = None
            notes.append(note)
    doc.close()
    notes.sort(key=lambda n: (n['page'], n['_y'], n['_x']))
    for n in notes:
        n.pop('_y', None)
        n.pop('_x', None)
    return pages, notes


def ingest_pdf_bytes(content, display_name):
    """存 PDF、提取标注、登记文档（同名视为更新）。返回文档摘要 dict"""
    if not content.startswith(b'%PDF'):
        raise ValueError('不是有效的 PDF 文件')
    with LOCK:
        docs = load_json(DOCS_JSON, [])
        existing = next((d for d in docs if d['name'] == display_name), None)
        updated = existing is not None
        doc_id = existing['id'] if existing else 'd' + uuid.uuid4().hex[:10]
        pdf_path = os.path.join(PDFS_DIR, f'{doc_id}.pdf')
        with open(pdf_path, 'wb') as f:
            f.write(content)
        pages, notes = extract_annotations(pdf_path, doc_id)
        save_json(os.path.join(DATA, f'{doc_id}.json'), {
            'id': doc_id, 'name': display_name, 'pages': pages,
            'notes': notes,
        })
        entry = {'id': doc_id, 'name': display_name, 'pages': pages,
                 'noteCount': len(notes), 'uploadedAt': now()}
        if updated:
            docs = [entry if d['id'] == doc_id else d for d in docs]
        else:
            docs.append(entry)
        save_json(DOCS_JSON, docs)
    return {**entry, 'updated': updated}


def delete_doc(doc_id):
    with LOCK:
        docs = load_json(DOCS_JSON, [])
        docs = [d for d in docs if d['id'] != doc_id]
        save_json(DOCS_JSON, docs)
    for p in (os.path.join(PDFS_DIR, f'{doc_id}.pdf'),
              os.path.join(DATA, f'{doc_id}.json')):
        try:
            os.remove(p)
        except OSError:
            pass
    shutil.rmtree(os.path.join(THUMBS_DIR, doc_id), ignore_errors=True)


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
        parsed = urlparse(self.path)
        path, q = parsed.path, parse_qs(parsed.query)

        if path in ('/', '/index.html'):
            with open(os.path.join(BASE, 'index.html'), 'rb') as f:
                return self._send(200, f.read(), 'text/html; charset=utf-8')

        m = re.match(r'^/api/docs/([^/]+)/thumb/([\w-]+)\.png$', path)
        if m:
            fp = os.path.join(THUMBS_DIR, m.group(1), f"{m.group(2)}.png")
            if os.path.isfile(fp):
                with open(fp, 'rb') as f:
                    return self._send(200, f.read(), 'image/png')
            return self._send(404, b'', 'image/png')

        m = re.match(r'^/api/docs/([^/]+)/pdf$', path)
        if m:
            fp = os.path.join(PDFS_DIR, f"{m.group(1)}.pdf")
            if os.path.isfile(fp):
                with open(fp, 'rb') as f:
                    return self._send(200, f.read(), 'application/pdf')
            return self._send(404, {'error': '文件不存在'})

        if path == '/api/docs':
            return self._send(200, load_json(DOCS_JSON, []))

        if path == '/api/all':
            docs = load_json(DOCS_JSON, [])
            out = []
            for d in docs:
                detail = load_json(os.path.join(DATA, f"{d['id']}.json"), None)
                if detail:
                    out.append({**d, 'notes': detail.get('notes', [])})
            return self._send(200, out)

        m = re.match(r'^/demo/([\w.-]+)$', path)
        if m:
            fp = os.path.join(DEMO_DIR, m.group(1))
            if os.path.isfile(fp):
                with open(fp, 'rb') as f:
                    return self._send(200, f.read(), 'application/pdf')
            return self._send(404, {'error': 'not found'})

        return self._send(404, {'error': 'Not Found'})

    def do_POST(self):
        parsed = urlparse(self.path)
        path, q = parsed.path, parse_qs(parsed.query)

        if path == '/api/chunk':
            uid = (q.get('uploadId') or [''])[0]
            seq = (q.get('seq') or ['0'])[0]
            if not re.match(r'^[\w-]+$', uid) or not seq.isdigit():
                return self._send(400, {'error': '参数错误'})
            d = os.path.join(UPLOADS_DIR, uid)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, f"{int(seq):05d}.part"), 'wb') as f:
                f.write(self._body())
            return self._send(200, {'ok': True, 'seq': int(seq)})

        if path == '/api/finish':
            uid = (q.get('uploadId') or [''])[0]
            name = sanitize_name((q.get('name') or [''])[0])
            d = os.path.join(UPLOADS_DIR, uid)
            if not os.path.isdir(d):
                return self._send(404, {'error': '上传会话不存在'})
            parts = sorted(os.listdir(d))
            buf = bytearray()
            for p in parts:
                with open(os.path.join(d, p), 'rb') as f:
                    buf.extend(f.read())
            shutil.rmtree(d, ignore_errors=True)
            try:
                summary = ingest_pdf_bytes(bytes(buf), name)
            except ValueError as e:
                return self._send(400, {'error': str(e)})
            except Exception as e:
                return self._send(500, {'error': f'解析失败: {e}'})
            return self._send(200, summary)

        return self._send(404, {'error': 'Not Found'})

    def do_DELETE(self):
        m = re.match(r'^/api/docs/([^/]+)$', urlparse(self.path).path)
        if m:
            delete_doc(m.group(1))
            return self._send(200, {'ok': True})
        return self._send(404, {'error': 'Not Found'})


if __name__ == '__main__':
    print(f'notes-hub on http://0.0.0.0:{PORT}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
