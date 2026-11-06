#!/usr/bin/env python3
"""学习阅读器服务 —— 零第三方依赖（纯 Python 标准库）

启动:  python3 server.py [端口，默认 8787]
数据:  ./data/{books.json, books/, texts/, state/}
"""
import email
import email.policy
import json
import mimetypes
import os
import re
import threading
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
BOOKS_DIR = os.path.join(DATA, 'books')
TEXTS_DIR = os.path.join(DATA, 'texts')
STATE_DIR = os.path.join(DATA, 'state')
BOOKS_JSON = os.path.join(DATA, 'books.json')
for d in (BOOKS_DIR, TEXTS_DIR, STATE_DIR):
    os.makedirs(d, exist_ok=True)

LOCK = threading.Lock()          # 保护 books.json 与各 state 文件
TEXT_CACHE = {}                  # texts/<id>.json 内存缓存 {mtime, data}
START_TS = time.time()


def now():
    return datetime.now().astimezone().isoformat(timespec='seconds')


def load_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)


def load_books():
    return load_json(BOOKS_JSON, [])


def state_path(bid):
    return os.path.join(STATE_DIR, f'{bid}.json')


def load_state(bid):
    st = load_json(state_path(bid), None)
    if st is None:
        st = {'bookId': bid, 'updatedAt': now(), 'progress': {}, 'annotations': []}
    return st


def load_texts(bid):
    path = os.path.join(TEXTS_DIR, f'{bid}.json')
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None
    c = TEXT_CACHE.get(bid)
    if c and c[0] == mtime:
        return c[1]
    data = load_json(path, None)
    if data:
        TEXT_CACHE[bid] = (mtime, data)
    return data


# ---------------------------------------------------------------- 路由表
ROUTES = []  # (method, regex, handler)


def route(method, pattern):
    def deco(fn):
        ROUTES.append((method, re.compile('^' + pattern + '$'), fn))
        return fn
    return deco


@route('GET', r'/api/health')
def api_health(h):
    return 200, {'ok': True, 'uptime': int(time.time() - START_TS), 'books': len(load_books())}


@route('GET', r'/api/books')
def api_list_books(h):
    out = []
    for b in load_books():
        st = load_json(state_path(b['id']), None)
        e = dict(b)
        e['annotationCount'] = len(st['annotations']) if st else 0
        e['progressSummary'] = (st or {}).get('progress', {})
        texts = load_texts(b['id'])
        e['hasText'] = texts is not None
        e['chapterCount'] = len(texts['chapters']) if texts else 0
        out.append(e)
    return 200, out


@route('POST', r'/api/books')
def api_upload(h):
    ctype = h.headers.get('Content-Type', '')
    if 'multipart/form-data' not in ctype:
        return 400, {'error': '需要 multipart/form-data'}
    body = h.rfile.read(int(h.headers.get('Content-Length', 0) or 0))
    fname, content = None, None
    try:
        msg = email.message_from_bytes(
            b'Content-Type: ' + ctype.encode('utf-8', 'ignore') + b'\r\n\r\n' + body,
            policy=email.policy.HTTP)
        for part in msg.walk():
            fn = part.get_filename()
            if fn:
                fname, content = fn, part.get_payload(decode=True)
                break
    except Exception as e:
        return 400, {'error': f'解析上传数据失败: {e}'}
    if not fname or content is None:
        return 400, {'error': '未找到文件字段'}
    if not fname.lower().endswith('.pdf') or not content.startswith(b'%PDF'):
        return 400, {'error': '仅支持 PDF 文件'}

    bid = 'b' + uuid.uuid4().hex[:10]
    name = re.sub(r'\.pdf$', '', fname, flags=re.I).strip() or bid
    safe = os.path.join(BOOKS_DIR, f'{bid}.pdf')
    with open(safe, 'wb') as f:
        f.write(content)

    pages = None
    try:
        from pypdf import PdfReader
        pages = len(PdfReader(safe).pages)
    except Exception:
        pages = None

    entry = {'id': bid, 'name': name, 'file': f'{bid}.pdf', 'pages': pages,
             'addedAt': now(), 'textStatus': 'pending'}
    with LOCK:
        books = load_books()
        books.append(entry)
        save_json(BOOKS_JSON, books)

    threading.Thread(target=_extract_async, args=(bid, safe), daemon=True).start()
    return 200, entry


def _extract_async(bid, pdf_path):
    """后台文本提取，完成后更新 books.json"""
    out = os.path.join(TEXTS_DIR, f'{bid}.json')
    try:
        import extract as _ex  # 同目录模块
        data = _ex.extract_book(pdf_path)
        with LOCK:
            books = load_books()
            b = next((x for x in books if x['id'] == bid), None)
            if not b:  # 已被删除
                return
            b['textStatus'] = 'ready'
            save_json(BOOKS_JSON, books)
            data['bookName'] = b['name']
        save_json(out, data)
    except Exception as e:
        try:
            os.remove(out)
        except OSError:
            pass
        with LOCK:
            books = load_books()
            b = next((x for x in books if x['id'] == bid), None)
            if b:
                b['textStatus'] = 'failed'
                save_json(BOOKS_JSON, books)


@route('DELETE', r'/api/books/(?P<bid>[^/]+)')
def api_delete_book(h, bid):
    with LOCK:
        books = load_books()
        if not any(b['id'] == bid for b in books):
            return 404, {'error': '书籍不存在'}
        save_json(BOOKS_JSON, [b for b in books if b['id'] != bid])
    for p in (os.path.join(BOOKS_DIR, f'{bid}.pdf'),
              os.path.join(TEXTS_DIR, f'{bid}.json'),
              state_path(bid)):
        try:
            os.remove(p)
        except OSError:
            pass
    TEXT_CACHE.pop(bid, None)
    return 200, {'ok': True}


@route('GET', r'/api/books/(?P<bid>[^/]+)/texts')
def api_get_texts(h, bid):
    data = load_texts(bid)
    if data is None:
        return 404, {'error': '文本未就绪', 'textStatus': 'pending'}
    return 200, data


@route('GET', r'/api/books/(?P<bid>[^/]+)/state')
def api_get_state(h, bid):
    if not any(b['id'] == bid for b in load_books()):
        return 404, {'error': '书籍不存在'}
    return 200, load_state(bid)


@route('PUT', r'/api/books/(?P<bid>[^/]+)/progress')
def api_put_progress(h, bid):
    """body: {mode:'pdf'|'text', data:{...updatedAt 新者胜}}"""
    body = h.read_json()
    mode = body.get('mode')
    data = body.get('data')
    if mode not in ('pdf', 'text') or not isinstance(data, dict):
        return 400, {'error': '参数错误'}
    if not any(b['id'] == bid for b in load_books()):
        return 404, {'error': '书籍不存在'}
    data['updatedAt'] = now()
    with LOCK:
        st = load_state(bid)
        old = st['progress'].get(mode)
        if old and old.get('updatedAt') and data.get('clientTs') and data['clientTs'] < old.get('clientTs', ''):
            return 200, {'ok': True, 'kept': 'remote'}  # 远端更新，忽略旧数据
        st['progress'][mode] = data
        st['updatedAt'] = now()
        save_json(state_path(bid), st)
    return 200, {'ok': True}


@route('POST', r'/api/books/(?P<bid>[^/]+)/annotations')
def api_add_annotation(h, bid):
    body = h.read_json()
    if not isinstance(body, dict):
        return 400, {'error': '参数错误'}
    ann = {'id': uuid.uuid4().hex[:16], 'createdAt': now()}
    ann.update({k: v for k, v in body.items() if k not in ('id', 'createdAt')})
    with LOCK:
        st = load_state(bid)
        st['annotations'].append(ann)
        st['updatedAt'] = now()
        save_json(state_path(bid), st)
    return 200, ann


@route('PUT', r'/api/books/(?P<bid>[^/]+)/annotations/(?P<aid>[^/]+)')
def api_update_annotation(h, bid, aid):
    body = h.read_json()
    with LOCK:
        st = load_state(bid)
        for a in st['annotations']:
            if a['id'] == aid:
                a.update({k: v for k, v in body.items() if k not in ('id',)})
                st['updatedAt'] = now()
                save_json(state_path(bid), st)
                return 200, a
    return 404, {'error': '标注不存在'}


@route('DELETE', r'/api/books/(?P<bid>[^/]+)/annotations/(?P<aid>[^/]+)')
def api_delete_annotation(h, bid, aid):
    with LOCK:
        st = load_state(bid)
        n0 = len(st['annotations'])
        st['annotations'] = [a for a in st['annotations'] if a['id'] != aid]
        if len(st['annotations']) == n0:
            return 404, {'error': '标注不存在'}
        st['updatedAt'] = now()
        save_json(state_path(bid), st)
    return 200, {'ok': True}


def _fix_mojibake(q):
    """某些代理会把查询串以原始 UTF-8 发送，http.server 按 latin-1 解码成乱码；
    此处探测并还原。"""
    if not q:
        return q
    try:
        q.encode('latin-1')
    except UnicodeEncodeError:
        return q  # 本就是正常 Unicode（如中文），无需处理
    try:
        fixed = q.encode('latin-1').decode('utf-8')
        return fixed if fixed != q else q
    except UnicodeDecodeError:
        return q


@route('GET', r'/api/search')
def api_search(h):
    qs = parse_qs(urlparse(h.path).query)
    q = _fix_mojibake((qs.get('q', [''])[0]).strip())
    book = qs.get('book', [''])[0].strip()
    if not q:
        return 400, {'error': '缺少参数 q'}
    results = []
    for b in load_books():
        if book and b['id'] != book:
            continue
        texts = load_texts(b['id'])
        if not texts:
            continue
        book_count = 0
        for ch in texts['chapters']:
            if book_count >= 60 or len(results) >= 200:
                break
            text = ch['text']
            start = 0
            while book_count < 60 and len(results) < 200:
                i = text.find(q, start)
                if i < 0:
                    break
                page = ch['startPage']
                for off, p in ch['pageMarks']:
                    if off <= i:
                        page = p
                    else:
                        break
                results.append({
                    'bookId': b['id'], 'bookName': b['name'],
                    'chapterIdx': ch['idx'], 'chapterTitle': ch['title'],
                    'offset': i, 'page': page,
                    'snippet': text[max(0, i - 40):i + 60].replace('\n', ' '),
                })
                start = i + len(q)
                book_count += 1
            if len(results) >= 200:
                break
    return 200, {'q': q, 'count': len(results), 'results': results}


# ---------------------------------------------------------------- 静态文件
MIME_OVERRIDES = {'.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8'}


def serve_static(h, rel):
    path = os.path.normpath(os.path.join(ROOT, rel))
    if not path.startswith(ROOT) or not os.path.isfile(path):
        return None
    ctype = MIME_OVERRIDES.get(os.path.splitext(path)[1].lower()) or mimetypes.guess_type(path)[0] or 'application/octet-stream'
    if rel.endswith('.html'):
        ctype = 'text/html; charset=utf-8'
    with open(path, 'rb') as f:
        content = f.read()
    return 200, content, {'Content-Type': ctype}


def serve_pdf_file(h, bid, query=''):
    """PDF 文件：?info=1 元信息 / ?chunk=N 4MB分片（预览代理对大响应不友好）/ 整文件+Range"""
    path = os.path.join(BOOKS_DIR, f'{bid}.pdf')
    if not os.path.isfile(path):
        return h._send(404, {'error': '文件不存在'})
    size = os.path.getsize(path)
    csize = 4 * 1024 * 1024
    qs = parse_qs(query)
    if 'info' in qs:
        return h._send(200, {'size': size, 'chunkSize': csize, 'chunks': (size + csize - 1) // csize})
    if 'chunk' in qs:
        try:
            n = int(qs['chunk'][0])
        except (ValueError, IndexError):
            return h._send(400, {'error': 'chunk 参数错误'})
        start = n * csize
        if n < 0 or start >= size:
            return h._send(416, {'error': 'chunk 超范围'})
        end = min(start + csize, size)
        with open(path, 'rb') as f:
            f.seek(start)
            chunk = f.read(end - start)
        h.send_response(200)
        h.send_header('Content-Type', 'application/octet-stream')
        h.send_header('Content-Length', str(len(chunk)))
        h.send_header('Access-Control-Allow-Origin', '*')
        h.end_headers()
        try:
            h.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        return
    rng = h.headers.get('Range', '')
    m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip())
    if m and (m.group(1) or m.group(2)):
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2)))
        end = int(m.group(2)) if m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            return 416, {'error': 'Range 不合法'}
        with open(path, 'rb') as f:
            f.seek(start)
            chunk = f.read(end - start + 1)
        h.send_response(206)
        h.send_header('Content-Type', 'application/pdf')
        h.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        h.send_header('Accept-Ranges', 'bytes')
        h.send_header('Content-Length', str(len(chunk)))
        h.send_header('Access-Control-Allow-Origin', '*')
        h.end_headers()
        h.wfile.write(chunk)
        return
    # 无 Range：整文件
    h.send_response(200)
    h.send_header('Content-Type', 'application/pdf')
    h.send_header('Accept-Ranges', 'bytes')
    h.send_header('Content-Length', str(size))
    h.send_header('Access-Control-Allow-Origin', '*')
    h.end_headers()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1 << 16)
            if not chunk:
                break
            try:
                h.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break


# ---------------------------------------------------------------- HTTP Handler
class Handler(BaseHTTPRequestHandler):
    server_version = 'StudyReader/1.0'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}")

    # -- 工具 --
    def read_json(self):
        n = int(self.headers.get('Content-Length', 0) or 0)
        raw = self.rfile.read(n) if n else b'{}'
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def _send(self, code, payload, headers=None):
        if isinstance(payload, (dict, list)):
            payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            headers = dict(headers or {})
            headers.setdefault('Content-Type', 'application/json; charset=utf-8')
        headers = dict(headers or {})
        headers.setdefault('Access-Control-Allow-Origin', '*')
        headers.setdefault('Cache-Control', 'no-store')
        if isinstance(payload, str):
            payload = payload.encode('utf-8')
        self.send_response(code)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # -- 请求分派 --
    def _dispatch(self, method):
        parsed = urlparse(self.path)
        path = parsed.path

        if method == 'OPTIONS':
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return

        # API 路由
        for m, pattern, fn in ROUTES:
            if m != method:
                continue
            match = pattern.match(path)
            if match:
                try:
                    res = fn(self, **match.groupdict())
                    if isinstance(res, tuple) and len(res) == 2:
                        self._send(res[0], res[1])
                    elif isinstance(res, tuple) and len(res) == 3:
                        self._send(res[0], res[1], res[2])
                    elif res is None:
                        pass
                    else:
                        self._send(200, res)
                except Exception as e:
                    self._send(500, {'error': f'服务器内部错误: {e}'})
                return

        # PDF 文件流
        m = re.match(r'^/api/books/([^/]+)/file$', path)
        if m and method == 'GET':
            try:
                serve_pdf_file(self, m.group(1), parsed.query)
            except Exception as e:
                self._send(500, {'error': str(e)})
            return

        # 静态文件
        if method == 'GET':
            rel = path.lstrip('/') or 'index.html'
            rel = unquote(rel)
            res = serve_static(self, rel)
            if res:
                self._send(res[0], res[1], res[2])
                return
            self._send(404, {'error': 'Not Found'})
            return
        self._send(404, {'error': 'Not Found'})

    def do_GET(self):
        self._dispatch('GET')

    def do_POST(self):
        self._dispatch('POST')

    def do_PUT(self):
        self._dispatch('PUT')

    def do_DELETE(self):
        self._dispatch('DELETE')

    def do_OPTIONS(self):
        self._dispatch('OPTIONS')


def main():
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    srv = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print('=' * 52)
    print(f'  学习阅读器已启动  http://0.0.0.0:{port}')
    print(f'  数据目录: {DATA}')
    print(f'  在 Trae 预览面板打开端口 {port} 即可访问')
    print('=' * 52)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
