#!/usr/bin/env python3
# 把多文件 ES module 项目打包成单个自包含 HTML（CSS/JS 全内联）
# - 去掉行首 export 关键字
# - 删除 import 行（合并后同 <script> 作用域互相可见）
# - 处理 ai.js 与 engine.js 的 clampWeeks 重名
# - main.js 的 engine.X / ui.X 命名空间前缀剥离
import re

base = '/workspace/fusheng'
with open(f'{base}/index.html', encoding='utf-8') as f: html = f.read()
with open(f'{base}/style.css', encoding='utf-8') as f: css = f.read()

js_files = ['data.js', 'ai.js', 'engine.js', 'ui.js', 'main.js']
parts = []
for fn in js_files:
    with open(f'{base}/js/{fn}', encoding='utf-8') as f: src = f.read()
    src = re.sub(r'(?m)^export\s+', '', src)            # 去掉行首 export
    src = re.sub(r'(?m)^import\s+.*$\n?', '', src)      # 删除 import 行
    if fn == 'ai.js':
        src = src.replace('clampWeeks', 'clampWeeksA')   # 避免与 engine.js 重名
    if fn == 'main.js':
        src = re.sub(r'\bengine\.', '', src)            # engine.pickNext -> pickNext
        src = re.sub(r'\bui\.', '', src)                # ui.renderStart -> renderStart
    if fn in ('main.js', 'engine.js'):
        src = src.replace('currentAI', 'current')       # 处理 import { current as currentAI } 别名
    parts.append(src)
js = '\n\n/* ---- file boundary ---- */\n\n'.join(parts)

html = html.replace('<link rel="stylesheet" href="./style.css" />', '<style>\n' + css + '\n</style>')
html = html.replace('<script type="module" src="./js/main.js"></script>', '<script>\n' + js + '\n</script>')

out = f'{base}/fusheng.html'
with open(out, 'w', encoding='utf-8') as f: f.write(html)
print('BUILT', out, 'size=', len(html))
