# -*- coding: utf-8 -*-
"""Catch layout faults without rendering the deck.

    python3 check_layout.py <unpacked-dir> [--font Meiryo] [--margin 1.25,18.75]

LibreOffice is usually unavailable, so correctness is established by measuring
instead of looking. Four checks:

  1. frame past the content margin   — sloppy, usually invisible
  2. one-line frame that now wraps   — a real defect (labels split in two)
  3. frame shorter than its own text — PowerPoint will re-shrink the type
  4. ink overlap between shapes      — the one users actually see

Text width is measured per character: East-Asian wide glyphs are 1 em, Latin
caps/digits ~0.62, lowercase ~0.52. Line height comes from the font table
below — Japanese UI faces differ enough that using the wrong one throws the
vertical results off completely.
"""
import re, io, sys, html, math, unicodedata, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pptxlib import slide_order, E

# empirical leading used for layout math, not exact font metrics
LINE_HEIGHT = {'Meiryo': 1.50, 'メイリオ': 1.50,
               'BIZ UDPゴシック': 1.30, 'BIZ UDゴシック': 1.30,
               '游ゴシック': 1.40, 'Yu Gothic': 1.40,
               'MS Pゴシック': 1.20, 'Noto Sans JP': 1.36}

root = sys.argv[1]
font = 'Meiryo'
left, right = 1.25, 18.75
for i, a in enumerate(sys.argv):
    if a == '--font':    font = sys.argv[i+1]
    if a == '--margin':  left, right = [float(v) for v in sys.argv[i+1].split(',')]
LH = LINE_HEIGHT.get(font, 1.40)

def adv(t):
    w = 0.0
    for c in t:
        if unicodedata.east_asian_width(c) in 'WF': w += 1.0
        elif c.isupper() or c.isdigit():            w += 0.62
        elif c == ' ':                              w += 0.28
        else:                                       w += 0.52
    return w

margin = wrap = short = overlap = 0
for i, f in enumerate(slide_order(root), 1):
    x = io.open('%s/ppt/slides/%s' % (root, f), encoding='utf-8').read()
    boxes = []
    for m in re.finditer(r'<p:(sp|pic)>.*?</p:\1>', x, re.S):
        b = m.group(0)
        nm = re.search(r'name="([^"]*)"', b)
        g = re.search(r'<a:off x="(-?\d+)" y="(-?\d+)"/><a:ext cx="(\d+)" cy="(\d+)"', b)
        if not (nm and g):
            continue
        nm = nm.group(1)
        X, Y, W, H = (int(v)/float(E) for v in g.groups())
        if X + W > right + 0.02 or X < left - 0.02:
            margin += 1
            print('P%02d  枠が本文コラム外   %-16s x=%.2f 右端=%.2f' % (i, nm, X, X + W))
        if m.group(1) == 'pic' or '<a:t>' not in b:
            continue
        bp = re.search(r'<a:bodyPr[^>]*>', b).group(0)
        def ins(k):                                   # OOXML default is 0.1in
            mm = re.search(k + r'="(\d+)"', bp)
            return int(mm.group(1))/float(E) if mm else 0.1
        avail = W - ins('lIns') - ins('rIns')
        room  = H - ins('tIns') - ins('bIns')
        ink = 0.0; widest = 0.0
        for p in re.findall(r'<a:p>.*?</a:p>', b, re.S):
            t = ''.join(html.unescape(u) for u in re.findall(r'<a:t>(.*?)</a:t>', p))
            szs = [int(v) for v in re.findall(r'\ssz="(\d+)"', p)]
            if not szs:
                continue
            pt = max(szs)/100.0
            spc = max([int(v) for v in re.findall(r'\sspc="(-?\d+)"', p)] or [0])/100.0
            need = adv(t)*pt/72.0 + max(0, len(t)-1)*spc/72.0
            n = max(1, int(math.ceil(need/avail))) if t.strip() else 1
            sa = re.search(r'<a:spcAft><a:spcPts val="(\d+)"', p)
            ink += n*(pt/72.0*LH) + (int(sa.group(1))/100/72.0 if sa else 0)
            widest = max(widest, min(need, avail))
            if n > 1 and H < 2*pt/72.0*1.35:          # frame was built for one line
                wrap += 1
                print('P%02d  1行の枠が折返し   %-16s %r' % (i, nm, t[:44]))
            if n == 1 and pt/72.0*LH > room + 0.02:
                short += 1
                print('P%02d  枠が1行より低い   %-16s %.0fpt 必要%.2f > 枠内%.2f'
                      % (i, nm, pt, pt/72.0*LH, room))
        anc = re.search(r'anchor="(\w+)"', bp)
        anc = anc.group(1) if anc else 't'
        top = Y+(H-ink)/2 if anc == 'ctr' else (Y+H-ink if anc == 'b' else Y)
        alg = 'r' if 'algn="r"' in b else ('ctr' if 'algn="ctr"' in b else 'l')
        L = (X+W-ins('rIns')-widest if alg == 'r' else
             X+(W-widest)/2 if alg == 'ctr' else X+ins('lIns'))
        boxes.append((nm, L, top, L+widest, top+ink))
    for a in range(len(boxes)):
        for c in range(a+1, len(boxes)):
            n1, l1, t1, r1, b1 = boxes[a]; n2, l2, t2, r2, b2 = boxes[c]
            ox, oy = min(r1, r2)-max(l1, l2), min(b1, b2)-max(t1, t2)
            if ox > 0.04 and oy > 0.04:
                overlap += 1
                print('P%02d  文字の重なり     %s × %s (%.2f×%.2f in)' % (i, n1, n2, ox, oy))

print('\n--- %s / 行送り %.2f ---' % (font, LH))
print('枠が本文コラム外 %d ／ 1行枠の折返し %d ／ 枠が1行より低い %d ／ 文字の重なり %d'
      % (margin, wrap, short, overlap))
sys.exit(1 if (wrap or overlap) else 0)
