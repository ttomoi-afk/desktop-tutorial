# -*- coding: utf-8 -*-
"""Direct OOXML editing helpers for .pptx decks.

python-pptx cannot preserve a hand-built deck's formatting through an
edit-save cycle, so every operation here works on the slide XML as text:
unpack the archive, rewrite `ppt/slides/slideN.xml`, repack. Every helper
targets a shape by its `name` attribute, which survives PowerPoint
round-trips even when ids are renumbered.

Typical use:

    from pptxlib import *
    unpack('deck.pptx', 'work')
    x = load('work', 'slide3.xml')
    x = set_text(x, 'Text 4', '新しい見出し')
    x = geom(x, 'Text 4', yi=2.51, wi=17.50)
    save('work', 'slide3.xml', x)
    pack('work', 'deck_v2.pptx')
"""
import re, io, os, html, glob, shutil, subprocess

E = 914400                      # EMU per inch
def emu(v):   return int(round(v * E))
def inch(v):  return v / float(E)

# --------------------------------------------------------------- package ---
def unpack(pptx, root):
    if os.path.isdir(root):
        shutil.rmtree(root)
    os.makedirs(root)
    subprocess.check_call(['unzip', '-q', os.path.abspath(pptx)], cwd=root)
    return root

def pack(root, pptx):
    out = os.path.abspath(pptx)
    if os.path.exists(out):
        os.remove(out)
    subprocess.check_call(['zip', '-Xrq', out, '.'], cwd=root)
    return out

def load(root, f):
    return io.open('%s/ppt/slides/%s' % (root, f), encoding='utf-8').read()

def save(root, f, x):
    io.open('%s/ppt/slides/%s' % (root, f), 'w', encoding='utf-8').write(x)

def slide_order(root):
    """Filenames in presentation order. File numbering is NOT display order."""
    pres = io.open(root + '/ppt/presentation.xml', encoding='utf-8').read()
    rels = io.open(root + '/ppt/_rels/presentation.xml.rels', encoding='utf-8').read()
    r2f = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="slides/(slide\d+\.xml)"', rels))
    return [r2f[m] for m in re.findall(r'<p:sldId [^>]*r:id="(rId\d+)"', pres)]

def canvas(root):
    pres = io.open(root + '/ppt/presentation.xml', encoding='utf-8').read()
    m = re.search(r'sldSz cx="(\d+)" cy="(\d+)"', pres)
    return inch(int(m.group(1))), inch(int(m.group(2)))

# ----------------------------------------------------------------- shapes ---
def sp_bounds(x, name):
    """Byte range of the <p:sp>/<p:pic> whose cNvPr name is `name`."""
    i = x.find('name="%s"' % name)
    assert i >= 0, 'shape not found: ' + name
    s = max(x.rfind('<p:sp>', 0, i), x.rfind('<p:pic>', 0, i))
    tag = 'p:sp' if x.startswith('<p:sp>', s) else 'p:pic'
    return s, x.find('</%s>' % tag, i) + len(tag) + 3

def has(x, name):
    return ('name="%s"' % name) in x

def block(x, name):
    a, b = sp_bounds(x, name); return x[a:b]

def drop(x, name):
    a, b = sp_bounds(x, name); return x[:a] + x[b:]

def geom(x, name, xi=None, yi=None, wi=None, hi=None):
    """Move/resize in inches. Only the first <a:off>/<a:ext> pair is touched."""
    a, b = sp_bounds(x, name); blk = x[a:b]
    if xi is not None:
        blk = re.sub(r'(<a:off x=")-?\d+(")', r'\g<1>%d\g<2>' % emu(xi), blk, count=1)
    if yi is not None:
        blk = re.sub(r'(<a:off x="-?\d+" y=")-?\d+(")', r'\g<1>%d\g<2>' % emu(yi), blk, count=1)
    if wi is not None:
        blk = re.sub(r'(<a:ext cx=")\d+(")', r'\g<1>%d\g<2>' % emu(wi), blk, count=1)
    if hi is not None:
        blk = re.sub(r'(<a:ext cx="\d+" cy=")\d+(")', r'\g<1>%d\g<2>' % emu(hi), blk, count=1)
    return x[:a] + blk + x[b:]

def align(x, name, algn):
    """algn: l | ctr | r"""
    a, b = sp_bounds(x, name); blk = x[a:b]
    if 'algn="' in blk:
        blk = re.sub(r'algn="\w+"', 'algn="%s"' % algn, blk)
    else:
        blk = blk.replace('<a:pPr', '<a:pPr algn="%s"' % algn)
    return x[:a] + blk + x[b:]

def size(x, name, sz):
    """Set every run size in the shape. sz is in hundredths of a point."""
    a, b = sp_bounds(x, name)
    return x[:a] + re.sub(r'(\ssz=")\d+(")', r'\g<1>%d\g<2>' % sz, x[a:b]) + x[b:]

def set_text(x, name, new):
    """Collapse the shape to one run that keeps the FIRST run's formatting.

    PowerPoint splits a line into several runs whenever the user retypes part
    of it, so replacing <a:t> globally would scatter the new string. Dropping
    the trailing runs keeps one clean run.
    """
    a, b = sp_bounds(x, name); blk = x[a:b]
    runs = re.findall(r'<a:r>.*?</a:r>', blk, re.S)
    assert runs, 'no text runs in ' + name
    first = re.sub(r'(<a:t>).*?(</a:t>)',
                   lambda m: m.group(1) + html.escape(new, quote=False) + m.group(2),
                   runs[0], count=1, flags=re.S)
    out = blk
    for r in runs[1:]:
        out = out.replace(r, '', 1)
    return x[:a] + out.replace(runs[0], first, 1) + x[b:]

def get_text(x, name):
    return ''.join(html.unescape(t) for t in
                   re.findall(r'<a:t>(.*?)</a:t>', block(x, name)))

def clone(src, nid, name, xi, yi, wi=None, hi=None, text=None):
    """Copy an existing shape's XML so the new shape inherits its formatting.

    Safer than building a shape from scratch: colour, font, spacing, bullet
    suppression and body insets all come along.
    """
    b = re.sub(r'<p:cNvPr id="\d+" name="[^"]*"',
               '<p:cNvPr id="%d" name="%s"' % (nid, name), src, count=1)
    b = re.sub(r'(<a:off x=")-?\d+(" y=")-?\d+(")',
               r'\g<1>%d\g<2>%d\g<3>' % (emu(xi), emu(yi)), b, count=1)
    if wi is not None:
        b = re.sub(r'(<a:ext cx=")\d+(")', r'\g<1>%d\g<2>' % emu(wi), b, count=1)
    if hi is not None:
        b = re.sub(r'(<a:ext cx="\d+" cy=")\d+(")', r'\g<1>%d\g<2>' % emu(hi), b, count=1)
    if text is not None:
        b = re.sub(r'(<a:t>).*?(</a:t>)',
                   lambda m: m.group(1) + html.escape(text, quote=False) + m.group(2),
                   b, count=1, flags=re.S)
    return b

def append(x, *shapes):
    """Add shapes at the end of the tree, i.e. on top in z-order."""
    return x.replace('</p:spTree>', ''.join(shapes) + '</p:spTree>')

def max_id(x):
    return max(int(v) for v in re.findall(r'<p:cNvPr id="(\d+)"', x))

# ---------------------------------------------------------------- builders ---
def tbox(nid, name, xi, yi, wi, hi, text, sz, color, font,
         bold=False, algn='l', anchor='t', ins=0.028):
    """A plain text box. sz is hundredths of a point (2100 == 21pt)."""
    i = emu(ins)
    return ('<p:sp><p:nvSpPr><p:cNvPr id="%d" name="%s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/></p:spPr>'
            '<p:txBody><a:bodyPr wrap="square" lIns="%d" tIns="%d" rIns="%d" bIns="%d" '
            'rtlCol="0" anchor="%s"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
            '<a:p><a:pPr marL="0" indent="0" algn="%s"><a:buNone/></a:pPr>'
            '<a:r><a:rPr lang="ja-JP" altLang="en-US" sz="%d"%s kern="0" dirty="0">'
            '<a:solidFill><a:srgbClr val="%s"/></a:solidFill>%s</a:rPr>'
            '<a:t>%s</a:t></a:r></a:p></p:txBody></p:sp>'
            % (nid, name, emu(xi), emu(yi), emu(wi), emu(hi), i, i, i, i, anchor,
               algn, sz, ' b="1"' if bold else '', color, fontrefs(font),
               html.escape(text, quote=False)))

def rule(nid, name, xi, yi, wi, color, thick=0.01):
    """A hairline / divider. Never thinner than one EMU-safe hairline."""
    return ('<p:sp><p:nvSpPr><p:cNvPr id="%d" name="%s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
            '<a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:ln/></p:spPr>'
            '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ja-JP"/></a:p>'
            '</p:txBody></p:sp>'
            % (nid, name, emu(xi), emu(yi), emu(wi), max(emu(thick), 9525), color))

def fontrefs(font):
    return ('<a:latin typeface="%s"/><a:ea typeface="%s"/><a:cs typeface="%s"/>'
            % (font, font, font))

# ------------------------------------------------------------- deck surgery ---
def set_order(root, keep):
    """Reorder to `keep` (filenames) and delete every slide not listed.

    Also removes the orphaned slide rels, notesSlides, notesSlide rels and
    [Content_Types].xml overrides. Skipping any of those makes PowerPoint
    report the file as corrupt.
    """
    rp = root + '/ppt/_rels/presentation.xml.rels'
    rels = io.open(rp, encoding='utf-8').read()
    f2rid = {f: r for r, f in re.findall(
        r'Id="(rId\d+)"[^>]*Target="slides/(slide\d+\.xml)"', rels)}
    remove = [f for f in f2rid if f not in keep]
    missing = [f for f in keep if f not in f2rid]
    assert not missing, 'not registered in presentation.xml.rels: %s' % missing

    pres = io.open(root + '/ppt/presentation.xml', encoding='utf-8').read()
    lst = re.search(r'<p:sldIdLst>(.*?)</p:sldIdLst>', pres, re.S)
    by_rid = {re.search(r'r:id="(rId\d+)"', e).group(1): e
              for e in re.findall(r'<p:sldId [^>]*/>', lst.group(1))}
    pres = pres[:lst.start(1)] + ''.join(by_rid[f2rid[f]] for f in keep) + pres[lst.end(1):]
    io.open(root + '/ppt/presentation.xml', 'w', encoding='utf-8').write(pres)

    ct = io.open(root + '/[Content_Types].xml', encoding='utf-8').read()
    for f in remove:
        rels = re.sub(r'<Relationship [^>]*Target="slides/%s"/>' % f, '', rels)
        rf = '%s/ppt/slides/_rels/%s.rels' % (root, f)
        note = None
        if os.path.exists(rf):
            m = re.search(r'notesSlides/(notesSlide\d+\.xml)',
                          io.open(rf, encoding='utf-8').read())
            note = m.group(1) if m else None
            os.remove(rf)
        os.remove('%s/ppt/slides/%s' % (root, f))
        ct = re.sub(r'<Override PartName="/ppt/slides/%s"[^>]*/>' % f, '', ct)
        if note:
            for p in ('%s/ppt/notesSlides/%s' % (root, note),
                      '%s/ppt/notesSlides/_rels/%s.rels' % (root, note)):
                if os.path.exists(p):
                    os.remove(p)
            ct = re.sub(r'<Override PartName="/ppt/notesSlides/%s"[^>]*/>' % note, '', ct)
    io.open(rp, 'w', encoding='utf-8').write(rels)
    io.open(root + '/[Content_Types].xml', 'w', encoding='utf-8').write(ct)
    return remove

def add_slide(root, src, dst):
    """Duplicate an existing slide (layout, chrome and formatting included).

    The copy carries only the slideLayout relationship, so it never inherits
    the source's speaker notes. Register it, then place it with set_order().
    """
    shutil.copy('%s/ppt/slides/%s' % (root, src), '%s/ppt/slides/%s' % (root, dst))
    srels = io.open('%s/ppt/slides/_rels/%s.rels' % (root, src), encoding='utf-8').read()
    srels = re.sub(r'<Relationship [^>]*notesSlide[^>]*/>', '', srels)
    io.open('%s/ppt/slides/_rels/%s.rels' % (root, dst), 'w', encoding='utf-8').write(srels)

    ct = io.open(root + '/[Content_Types].xml', encoding='utf-8').read()
    ct = ct.replace('</Types>',
                    '<Override PartName="/ppt/slides/%s" ContentType="application/'
                    'vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
                    '</Types>' % dst)
    io.open(root + '/[Content_Types].xml', 'w', encoding='utf-8').write(ct)

    rp = root + '/ppt/_rels/presentation.xml.rels'
    rels = io.open(rp, encoding='utf-8').read()
    rid = 'rId%d' % (max(int(v) for v in re.findall(r'Id="rId(\d+)"', rels)) + 1)
    rels = rels.replace('</Relationships>',
                        '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/'
                        'officeDocument/2006/relationships/slide" Target="slides/%s"/>'
                        '</Relationships>' % (rid, dst))
    io.open(rp, 'w', encoding='utf-8').write(rels)

    pres = io.open(root + '/ppt/presentation.xml', encoding='utf-8').read()
    ids = [int(v) for v in re.findall(r'<p:sldId id="(\d+)"', pres)]
    pres = pres.replace('</p:sldIdLst>',
                        '<p:sldId id="%d" r:id="%s"/></p:sldIdLst>' % (max(ids) + 1, rid))
    io.open(root + '/ppt/presentation.xml', 'w', encoding='utf-8').write(pres)
    return dst

# ------------------------------------------------------------- deck hygiene ---
def _all_parts(root):
    return (glob.glob(root + '/ppt/slides/*.xml') +
            glob.glob(root + '/ppt/slideLayouts/*.xml') +
            glob.glob(root + '/ppt/slideMasters/*.xml') +
            glob.glob(root + '/ppt/notesSlides/*.xml') +
            glob.glob(root + '/ppt/notesMasters/*.xml') +
            glob.glob(root + '/ppt/theme/*.xml') +
            [root + '/ppt/presentation.xml'])

def set_font(root, name, panose=None):
    """Repoint EVERY font slot in the package at one typeface.

    Must cover slides, layouts, masters, notes, theme and presentation.xml.
    Missing any layer leaves text that silently resolves to Calibri or to the
    theme's Japanese fallback. The theme's <a:font script="Jpan"> entries are
    the usual culprit: they override the ea slot for Japanese text.
    """
    n = 0
    for p in _all_parts(root):
        x = io.open(p, encoding='utf-8').read()
        y, a = re.subn(r'(<a:(?:latin|ea|cs)[^>]*typeface=")[^"]*(")',
                       r'\g<1>%s\g<2>' % name, x)
        y, b = re.subn(r'(<a:font script="Jpan" typeface=")[^"]*(")',
                       r'\g<1>%s\g<2>' % name, y)
        # a stale panose makes substitution pick the wrong face when the font
        # is absent; drop it unless the caller supplies the right one
        repl = (' panose="%s"' % panose) if panose else ''
        y = re.sub(r'(<a:(?:latin|ea|cs)[^>]*typeface="%s")\s+panose="[^"]*"'
                   % re.escape(name), r'\g<1>' + repl, y)
        if y != x:
            io.open(p, 'w', encoding='utf-8').write(y); n += a + b
    return n

def no_autofit(root):
    """Turn off "shrink text on overflow" everywhere.

    While it is on, PowerPoint rescales type whenever a string outgrows its
    box — which is how declared sizes silently drift between saves.
    """
    n = 0
    for p in glob.glob(root + '/ppt/slides/*.xml'):
        x = io.open(p, encoding='utf-8').read()
        y, k = re.subn(r'<a:normAutofit[^/]*/>', '<a:noAutofit/>', x)
        io.open(p, 'w', encoding='utf-8').write(y); n += k
    return n

def strip_lnspc(root):
    """Remove explicit line-spacing overrides so type uses its natural leading.

    Round-tripped decks accumulate odd values (77%, 105%, 134%…) from absolute
    spacing converted to percentages. Below ~85% a line box is shorter than the
    glyphs need and large text looks crushed.
    """
    n = 0
    for p in glob.glob(root + '/ppt/slides/*.xml'):
        x = io.open(p, encoding='utf-8').read()
        y, k = re.subn(r'<a:lnSpc><a:spc(?:Pct|Pts) val="\d+"/></a:lnSpc>', '', x)
        io.open(p, 'w', encoding='utf-8').write(y); n += k
    return n
