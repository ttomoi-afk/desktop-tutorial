#!/usr/bin/env bash
# 公開用ファイル一式を dist/site/ に集め、dist/teamenergy-site.zip を作る。
# PLAN.md・docs/（会社紹介資料）・tools/ など、サイトの表示に使わないものは含めない。
# 使い方: teamenergy/ で  bash tools/build-dist.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=dist/site
rm -rf dist
mkdir -p "$OUT"

FILES=(index.html sourcing.html 404.html robots.txt sitemap.xml)
DIRS=(assets cases data)

for f in "${FILES[@]}"; do cp "$f" "$OUT/"; done
for d in "${DIRS[@]}"; do cp -R "$d" "$OUT/"; done

# 内部リンク・画像の参照切れを確認（外部URL・mailto・#だけのリンクは対象外）
python3 - "$OUT" <<'PY'
import os, re, sys
root = sys.argv[1]
bad = []
for dp, _, fs in os.walk(root):
    for fn in fs:
        if not fn.endswith('.html'):
            continue
        p = os.path.join(dp, fn)
        html = open(p, encoding='utf-8').read()
        for ref in re.findall(r'(?:href|src|poster)="([^"]+)"', html):
            if re.match(r'(https?:|mailto:|tel:|#|data:)', ref):
                continue
            path = ref.split('#')[0].split('?')[0]
            if not path:
                continue
            target = os.path.join(root, path.lstrip('/')) if path.startswith('/') else os.path.join(dp, path)
            if path.endswith('/') or path in ('.', './'):
                target = os.path.join(target, 'index.html')
            if not os.path.exists(os.path.normpath(target)):
                bad.append(f'{os.path.relpath(p, root)} -> {ref}')
for d in ('data',):
    for fn in os.listdir(os.path.join(root, d)):
        js = open(os.path.join(root, d, fn), encoding='utf-8').read()
        for ref in re.findall(r'"(?:url|image)":\s*"([^"]+)"', js):
            if ref and not ref.startswith('http') and not os.path.exists(os.path.join(root, ref)):
                bad.append(f'{d}/{fn} -> {ref}')
if bad:
    print('参照切れ:'); print('\n'.join(bad)); sys.exit(1)
print('リンク確認 OK')
PY

(cd "$OUT" && zip -qr ../teamenergy-site.zip .)
echo "作成: dist/site/ と dist/teamenergy-site.zip"
du -sh "$OUT" dist/teamenergy-site.zip
