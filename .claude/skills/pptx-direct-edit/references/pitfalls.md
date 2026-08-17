# Failure catalogue

Every entry here is a bug that reached a delivered file at least once.

## Structure

**Deleting a slide corrupts the file unless five things go.** The slide XML,
its `ppt/slides/_rels/slideN.xml.rels`, its `[Content_Types].xml` override,
**and** the notesSlide it pointed at plus that notesSlide's own rels. Leaving
the notesSlide behind produces "PowerPoint found a problem with content" —
`validate.py` reports it as a broken reference to `../slides/slideN.xml`.
`set_order()` handles all five; do not hand-roll it.

**File numbering is not display order.** `slide12.xml` may be page 5. Read the
order from `<p:sldIdLst>` in `presentation.xml`, mapped through
`presentation.xml.rels`. After PowerPoint re-saves, files are renumbered to
match display order — so a filename you noted last session may now be a
different page.

**Do structural work first.** Reordering after content edits means your notes
about "page 7" refer to the wrong slide.

**A duplicated slide must not inherit the source's notes rel** — two slides
pointing at one notesSlide is invalid. `add_slide()` strips it.

## Text and runs

**PowerPoint splits one line into several runs.** After a user retypes part of
a string, `<a:t>` appears two or three times in the same paragraph. Replacing
each one scatters the new text. `set_text()` keeps the first run's formatting
and deletes the rest.

**Never global-replace a string across a slide.** 「グループ」 appears in a KPI
label and in body copy. Scope every replacement to a named shape.

**Renaming text does not resize its box.** After shortening or lengthening a
string, re-check the width — "INVESTMENT EXPERIENCE" in a box cut to fit
"TRACK RECORD" wraps to two lines and reads as a broken heading. This is the
single most repeated defect.

## Type that changes size or shape by itself

**`<a:normAutofit>` is "shrink text on overflow".** While it is set, PowerPoint
rescales type whenever a string outgrows its box, and writes `fontScale="85000"
lnSpcReduction="10000"` into the file. That is why declared sizes drift between
saves and why a heading renders smaller than its neighbours. Replace with
`<a:noAutofit/>` (`no_autofit()`) once the frames are known to fit.

**Explicit `<a:lnSpc>` accumulates junk values.** Round-tripped decks collect
percentages like 76.7%, 105.3%, 134.1% — absolute point spacing converted to a
percentage of a different font's leading. Below ~85% the line box is shorter
than the glyphs need and large type looks crushed. `strip_lnspc()` restores
natural leading; afterwards many frames will be shorter than one line, so grow
the top-anchored ones downward (invisible, and it stops autofit re-engaging).

**Nothing in DrawingML scales glyphs horizontally.** If text looks narrow or
flat, the cause is font substitution or the typeface itself — check
`<a:font script="Jpan">`, the font slots, and non-uniform group scaling
(`chExt` vs `ext`) before concluding anything.

## Fonts

**A font change must touch six layers**, or text silently resolves to Calibri
or to the theme's Japanese fallback:

1. `ppt/slides/*.xml`
2. `ppt/slideLayouts/*.xml`
3. `ppt/slideMasters/*.xml`
4. `ppt/notesSlides/*.xml`, `ppt/notesMasters/*.xml`
5. `ppt/theme/*.xml` — `majorFont`/`minorFont`, **including the empty `<a:ea/>`
   slot** and every `<a:font script="Jpan">` entry
6. `ppt/presentation.xml` `defaultTextStyle`

**`<a:font script="Jpan">` overrides the `ea` slot for Japanese text.** A deck
can look fully converted at run level and still render Japanese in 游ゴシック
because the theme says so.

**A stale `panose` misdirects substitution.** If the attribute describes the
old face, a machine without the new font picks something unrelated. Drop it
unless you know the correct value.

**Japanese font availability differs by platform.** Meiryo and BIZ UD ship with
Windows only; 游ゴシック is on Windows 8.1+ and macOS. Choosing for a user
whose OS you do not know is a guess — ask.

## Environment

- No LibreOffice, `soffice`, `pdftoppm`, `markitdown` or `pandoc`. Verify by
  measurement.
- `defusedxml` and `lxml` are often missing; `pip install` them before
  `validate.py`.
- **The container is wiped between sessions.** Scratch files, unpacked decks
  and uploads all vanish. Anything worth keeping goes in the repo. When
  resuming, expect to ask the user to re-attach the deck — and say why.
- Pasted images do not reach disk; only file uploads land in the uploads
  directory. Ask for an attachment rather than claiming the image was embedded.
- The egress proxy blocks most hosts: `WebFetch` fails where `WebSearch` works.

## Packing

Repack from inside the directory so paths stay relative:
`cd work && zip -Xrq ../out.pptx .` — `zip -r out.pptx work/` produces an
archive PowerPoint cannot open.
