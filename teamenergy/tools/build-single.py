#!/usr/bin/env python3
"""index.html と CSS/JS/画像/動画/JSON を1つのHTMLに束ねる(プレビュー配布用)。
使い方: python3 teamenergy/tools/build-single.py 出力パス [ページ名=index.html] [リンク置換 例: sourcing.html=https://...]
"""
import base64, json, mimetypes, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'dist' / 'teamenergy-preview.html')
page = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
links = dict(a.split('=', 1) for a in sys.argv[3:])
out.parent.mkdir(parents=True, exist_ok=True)

def data_uri(rel):
    p = ROOT / rel
    mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"

html = (ROOT / page).read_text()
css = (ROOT / 'assets/style.css').read_text()
js = (ROOT / 'assets/main.js').read_text()

# JSON は fetch できないので JS に埋め込む
news = json.load(open(ROOT / 'data/news.json'))
stories = json.load(open(ROOT / 'data/stories.json'))
for st in stories:
    if st.get('image') and (ROOT / st['image']).exists():
        st['image'] = data_uri(st['image'])
    if st.get('url') in links:
        st['url'] = links[st['url']]
js = js.replace(
    "function loadJSON(path, cb) {\n    fetch(path).then(function (r) { return r.json(); }).then(cb).catch(function () { cb([]); });\n  }",
    "var INLINE = { 'data/news.json': " + json.dumps(news, ensure_ascii=False) + ", 'data/stories.json': " + json.dumps(stories, ensure_ascii=False) + " };\n"
    "  function loadJSON(path, cb) { cb(INLINE[path] || []); }")
assert 'INLINE' in js, 'loadJSON の置換に失敗'

# 外部ファイルの参照を埋め込みに置換
for rel in sorted(set(re.findall(r'(?:src|href|poster)="((?:\.\./)?assets/[^"]+)"', html)), key=len, reverse=True):
    html = html.replace(f'"{rel}"', f'"{data_uri(rel.replace("../", ""))}"')
html = html.replace('<link rel="stylesheet" href="' + data_uri('assets/style.css') + '">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="' + data_uri('assets/main.js') + '"></script>', '<script>\n' + js + '\n</script>')
html = html.replace('<a href="./">', '<a href="#">')
# ページ間リンクを公開URLへ(指定がなければ無効化)
for target in ['index.html', 'sourcing.html', 'cases/teshikaga.html', '../index.html', '../sourcing.html']:
    repl = links.get(target, '#' if target != page else '#')
    html = re.sub(r'href="' + re.escape(target) + r'(#[^"]*)?"', lambda m: 'href="' + (repl + (m.group(1) or '') if repl != '#' else (m.group(1) or '#')) + '"', html)
titles = {'index.html': 'Team Energy', 'sourcing.html': 'Team Energy For Intermediaries', 'cases/teshikaga.html': 'Teshikaga Challenge Case'}
html = re.sub(r'<title>.*?</title>', '<title>' + titles.get(page, 'Team Energy') + '</title>', html)

# Artifact 用に <head>/<body> の骨組みを外し、本文だけにする
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body[^>]*>(.*?)</body>', html, re.S).group(1)
keep = [l for l in head.splitlines() if re.search(r'<title>|<link rel="(preconnect|stylesheet)"|<style>|</style>', l) or not l.strip().startswith('<meta')]
# <style>...</style> は複数行なので head 全体から meta 行と favicon だけ落とす
head_clean = '\n'.join(l for l in head.splitlines() if not re.match(r'\s*<meta', l) and 'rel="icon"' not in l)
body_class = re.search(r'<body([^>]*)>', html).group(1)
if 'subpage' in body_class:
    css_fix = '<style>.header{mix-blend-mode:normal}</style>'
    body = css_fix + body
out.write_text(head_clean + '\n' + body)
print(out, f'{out.stat().st_size/1024/1024:.1f} MB')
