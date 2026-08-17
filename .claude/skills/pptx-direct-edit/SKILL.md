---
name: pptx-direct-edit
description: Edit and refine existing PowerPoint decks by rewriting the slide XML directly, then verify the layout by measurement instead of rendering. Use this whenever the task is to change a .pptx that already exists — restructuring pages, rewriting copy, moving or resizing shapes, adding or deleting or reordering slides, unifying fonts, fixing text that overlaps or wraps or looks squashed, or producing a second edition of a deck for a different audience. Use it also when the user sends back a deck they edited themselves in PowerPoint and asks for further changes, and when they report a visual problem ("文字が重なっている", "フォントが潰れて見える", "余白が大きい", "折り返している") that has to be diagnosed without opening the file. Prefer this over python-pptx for any deck whose design must survive the edit.
---

# Editing an existing .pptx directly

python-pptx rebuilds parts of the XML it touches and quietly drops formatting a
hand-built deck depends on. Editing the slide XML as text preserves everything
you did not name. This skill is that workflow plus the measurement harness that
replaces "just look at it" — LibreOffice, `soffice` and `pdftoppm` are usually
not installed, so **layout correctness has to be established numerically.**

`scripts/pptxlib.py` holds the helpers, `scripts/inspect_deck.py` prints the
deck, `scripts/check_layout.py` finds the faults. Read
`references/pitfalls.md` before any structural change or font change — every
entry in it is a bug that already shipped once.

## The loop

```bash
S=/tmp/.../scratchpad                       # never work inside the user's repo
K=<this skill>/scripts
python3 -c "import sys;sys.path.insert(0,'$K');from pptxlib import *;unpack('in.pptx','$S/w')"
python3 $K/inspect_deck.py $S/w > $S/map.txt   # 1. read the deck
#                                               2. write an edit script
python3 $K/check_layout.py $S/w --font Meiryo # 3. measure
python3 -c "...;pack('$S/w','out.pptx')"      # 4. repack
python3 <pptx-skill>/scripts/office/validate.py out.pptx   # 5. validate
```

Never hand-edit slide XML in the middle of a long shell line. Write a small,
commented Python script per change set (`$S/rename_pages.py`) — the user comes
back days later asking for a variant, and the script is the record of what was
done and why.

### 1. Read before writing

`inspect_deck.py` lists every shape as
`name  x= y= w= h=  kind  sz=  anchor/align  text`. Shape **names** (`Text 12`,
`Hotel P0`) are the addressing scheme for every helper — they survive
PowerPoint round-trips, ids do not. **File numbering is not display order**;
always take the order from `slide_order()`.

Name new shapes for what they are (`TOC Head0`, `Cn V1`, `Sr D3`), not
`Text 47`. A later session reads those names as documentation.

### 2. Edit

```python
import sys; sys.path.insert(0, K)
from pptxlib import *

x = load(root, 'slide7.xml')
x = set_text(x, 'Text 3', 'Team Energy Group の強み')   # collapses to one run
x = geom(x, 'Text 3', xi=1.25, yi=1.42, wi=17.50)       # inches
x = align(x, 'Text 28', 'r')
x = drop(x, 'Text 16')
x = append(x, clone(block(x, 'Text 15'), max_id(x)+1, 'Text 33', 16.10, 5.48,
                    2.65, 0.78, '単月黒字化'))          # inherits formatting
save(root, 'slide7.xml', x)
```

Prefer `clone()` of a sibling over building a shape from scratch: colour,
font, insets, bullet suppression and spacing all come along for free.

Structural work (`add_slide`, `set_order`) must happen **before** content edits,
because it renames nothing but changes which file is which page.

### 3. Measure

`check_layout.py` reports four things. Two are defects, two are hygiene:

| report | meaning | act? |
|---|---|---|
| 文字の重なり | ink overlaps ink | **always fix** |
| 1行枠の折返し | a label built for one line now wraps | **always fix** |
| 枠が1行より低い | frame shorter than its own line | fix — PowerPoint will re-shrink the type |
| 枠が本文コラム外 | frame past the margin, ink usually inside | judgement; invisible when left-aligned |

Pass `--font` — leading differs enough between Japanese faces (Meiryo 1.50,
BIZ UDP 1.30, 游ゴシック 1.40) that the wrong value invalidates every vertical
result.

A clean run is not proof. Also re-read `inspect_deck.py` output for the pages
you touched, and grep the whole deck for wording that no longer belongs
(audience-specific terms, `（仮）`, draft notices) after any repurposing.

### 4. Deliver

Version every output (`..._v24.pptx`) and keep the previous ones — the user
edits decks in PowerPoint between turns and sometimes reverts. When they upload
their own edit, **that file becomes the new base**; diff it against your last
version before doing anything, because their save may have introduced damage
(see pitfalls) alongside their intended changes, and you must keep their work.

State what was measured, not that it "looks good".

## Working with a user who edits in PowerPoint

Their round-trip is lossy in specific ways: characters vanish from strings they
dragged, boxes drift off the grid by 0.08in, autofit bakes in `fontScale`, and
line-spacing percentages appear from nowhere. Diff geometry and text against
your previous version to separate their intent from the damage:

```python
# report name -> (x,y,w,h), text for both versions and print the differences
```

Fix the damage silently; never overwrite their intent.

## Diagnosing a reported visual problem

Work from the file, not from a theory. Before proposing anything, check in this
order: autofit remnants, explicit `lnSpc`, negative `spc`, non-uniform group
scaling, then the font slots at every layer. Report which of these were clean —
ruling causes out is most of the answer. If none is at fault, the typeface's
own proportions are the explanation, and that is a choice for the user, not a
bug to fix. Say so plainly and offer alternatives with their trade-offs.

## Reference

- `references/pitfalls.md` — the failure catalogue. Read it before structural
  or font changes.
- `references/deck-conventions.md` — the layout grid, tokens and page chrome
  of the Team Energy deck family.
