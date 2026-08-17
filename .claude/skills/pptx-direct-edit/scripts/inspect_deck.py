# -*- coding: utf-8 -*-
"""Print every shape of every slide, in presentation order.

    python3 inspect_deck.py <unpacked-dir> [page]

Columns: shape name, geometry in inches, kind, font sizes, anchor/alignment,
text. The shape name is what every pptxlib helper takes, so this listing is
the map you edit from. Always run it before and after a change.
"""
import re, io, sys, html, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pptxlib import slide_order, canvas, E

root = sys.argv[1]
only = int(sys.argv[2]) if len(sys.argv) > 2 else None
w, h = canvas(root)
order = slide_order(root)
print('canvas %.2f x %.2f in / %d slides' % (w, h, len(order)))
for i, f in enumerate(order, 1):
    if only and i != only:
        continue
    x = io.open('%s/ppt/slides/%s' % (root, f), encoding='utf-8').read()
    print('\n===== P%02d  %s =====' % (i, f))
    for m in re.finditer(r'<p:(sp|pic)>.*?</p:\1>', x, re.S):
        b = m.group(0)
        nm = re.search(r'<p:cNvPr id="\d+" name="([^"]*)"', b)
        nm = nm.group(1) if nm else '?'
        g = re.search(r'<a:off x="(-?\d+)" y="(-?\d+)"/><a:ext cx="(\d+)" cy="(\d+)"', b)
        geo = ('x=%6.2f y=%6.2f w=%6.2f h=%5.2f'
               % tuple(int(v)/float(E) for v in g.groups())) if g else 'inherits placeholder'
        txt = ' | '.join(html.unescape(t) for t in re.findall(r'<a:t>(.*?)</a:t>', b))
        szs = sorted(set(int(v) for v in re.findall(r'\ssz="(\d+)"', b)))
        anc = re.search(r'anchor="(\w+)"', b)
        alg = sorted(set(re.findall(r'algn="(\w+)"', b)))
        print('  %-16s %s %-4s %-12s %-10s %s'
              % (nm, geo, m.group(1),
                 'sz=' + ','.join(str(s) for s in szs) if szs else '',
                 (anc.group(1) if anc else '-') + (('/' + ','.join(alg)) if alg else ''),
                 txt[:88]))
