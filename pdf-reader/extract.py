#!/usr/bin/env python3
"""PDF 章节文本提取器 —— CLI 与 server.py 共用

用法: python3 extract.py <in.pdf> <out.json>
输出: {bookName, extractedAt, totalPages, chapters:[{idx,title,startPage,endPage,text,sections,pageMarks}]}
"""
import json
import re
import sys
from datetime import datetime

WATERMARK_PATTERNS = [
    re.compile(r'^\s*\d{1,4}\s*$'),                                  # 纯页码
    re.compile(r'91过软考教育学院内部资料'),                          # 水印行
    re.compile(r'^信息系统项目管理师考试.*（20\d{2}年最新版）'),      # 每页书眉
    re.compile(r'^信息系统项目管理师考试.*\(\d{4}年最新版\)'),
]


def clean_page_text(raw: str) -> str:
    lines = [l.strip() for l in (raw or '').split('\n')]
    kept = [l for l in lines if l and not any(p.search(l) for p in WATERMARK_PATTERNS)]
    return '\n'.join(kept)


def _resolve_page(reader, it, npages):
    """解析书签指向的页码(1-based)，失败返回 None"""
    # Destination.page → PageObject（部分版本直接返回 int）
    try:
        p = getattr(it, 'page', None)
        if isinstance(p, int):
            return min(p + 1, npages)
        if p is not None:
            try:
                num = reader.get_page_number(p)
                if isinstance(num, int) and num >= 0:
                    return min(num + 1, npages)
            except AttributeError:
                pass
            # 兜底：按 indirect_reference 暴力比对
            try:
                target = p.indirect_reference
                for i, pg in enumerate(reader.pages):
                    if pg.indirect_reference == target or (
                            hasattr(pg.indirect_reference, 'idnum') and
                            pg.indirect_reference.idnum == target.idnum):
                        return min(i + 1, npages)
            except Exception:
                pass
    except Exception:
        pass
    # 字符串/数组形式 dest
    try:
        d = getattr(it, 'dest', None)
        if isinstance(d, str):
            d = reader.get_destination(it)
        if isinstance(d, list) and d:
            num = reader.get_page_number(d[0])
            if isinstance(num, int) and num >= 0:
                return min(num + 1, npages)
    except Exception:
        pass
    return None


def extract_book(pdf_path: str) -> dict:
    from pypdf import PdfReader  # 延迟导入，缺库时由调用方降级处理
    r = PdfReader(pdf_path)
    if r.is_encrypted:
        try:
            r.decrypt('')
        except Exception:
            pass
    npages = len(r.pages)

    # ---------- 1. 目录树 → 章节骨架 ----------
    flat = []  # {title, depth, page}
    def walk(items, depth=0):
        for it in items:
            if isinstance(it, list):
                walk(it, depth + 1)
                continue
            title = (getattr(it, 'title', '') or '').strip()
            if not title or 'OLE_LINK' in title:
                continue
            flat.append({'title': title, 'depth': depth, 'page': _resolve_page(r, it, npages)})
    try:
        walk(r.outline)
    except Exception:
        flat = []

    # 顶层章节；若无 depth0 则全体降级为顶层
    if not any(x['depth'] == 0 for x in flat):
        for x in flat:
            x['depth'] = 0
    tops = [x for x in flat if x['depth'] == 0 and x['page']]
    # 起始页必须递增，否则并入前一章范围
    for i in range(1, len(tops)):
        if tops[i]['page'] < tops[i - 1]['page']:
            tops[i]['page'] = None
    tops = [x for x in tops if x['page']]
    if not tops:  # 无可用目录 → 整书一章
        tops = [{'title': '全书', 'depth': 0, 'page': 1}]

    # 各章范围 [start, end)
    spans = []
    for i, t in enumerate(tops):
        end = tops[i + 1]['page'] if i + 1 < len(tops) else npages + 1
        spans.append({'title': t['title'], 'start': t['page'], 'end': end})

    # ---------- 2. 逐页清洗 + 章节拼接 ----------
    chapters = []
    page_texts = {}
    for ci, sp in enumerate(spans):
        text_parts = []
        page_marks = []
        offset = 0
        for p in range(sp['start'], sp['end']):
            if p not in page_texts:
                try:
                    page_texts[p] = clean_page_text(r.pages[p - 1].extract_text() or '')
                except Exception:
                    page_texts[p] = ''
            pt = page_texts[p]
            if not pt:
                continue
            page_marks.append([offset, p])
            text_parts.append(pt)
            offset += len(pt) + 2  # '\n\n' 分隔
        chapters.append({
            'idx': ci,
            'title': sp['title'],
            'startPage': sp['start'],
            'endPage': sp['end'] - 1 if sp['end'] > sp['start'] else sp['start'],
            'text': '\n\n'.join(text_parts),
            'sections': [],
            'pageMarks': page_marks,
        })

    # ---------- 3. 二级书签 → 小节(带章内偏移) ----------
    def mark_offset(ch, page):
        for off, p in ch['pageMarks']:
            if p >= page:
                return off
        return ch['pageMarks'][-1][0] if ch['pageMarks'] else 0

    for x in flat:
        if x['depth'] == 0 or not x['page']:
            continue
        for ch in chapters:
            if ch['startPage'] <= x['page'] <= ch['endPage']:
                ch['sections'].append({'title': x['title'], 'page': x['page'], 'offset': mark_offset(ch, x['page'])})
                break

    # 章节文本为空时丢弃（避免空目录项）
    chapters = [c for c in chapters if c['text'].strip()]
    for i, c in enumerate(chapters):
        c['idx'] = i

    return {
        'bookName': '',
        'extractedAt': datetime.now().astimezone().isoformat(timespec='seconds'),
        'totalPages': npages,
        'chapters': chapters,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    data = extract_book(sys.argv[1])
    data['bookName'] = sys.argv[1]
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    total = sum(len(c['text']) for c in data['chapters'])
    print(f"OK: {len(data['chapters'])} 章, {total} 字, -> {sys.argv[2]}")


if __name__ == '__main__':
    main()
