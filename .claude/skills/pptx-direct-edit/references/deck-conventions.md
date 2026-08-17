# Team Energy deck conventions

The layout grid the 会社概要 / 会社紹介 decks are built on. Match it when adding
a page; a new page that lands off this grid is immediately visible.

## Canvas and grid

- Slide **20.00 × 11.25 in** (16:9 at 1.5× a 13.33in deck). Declared point
  sizes therefore read ~1.5× smaller than on a normal deck — 14.25pt here looks
  like 9.5pt. Size type accordingly.
- Content column **1.25 → 18.75 in** (width 17.50). Every rule, footer and
  right-aligned element ends at 18.75.
- Two columns: 1.25 (w 8.25) and 10.50 (w 8.25). Three: 1.25 / 7.31 / 13.36
  (w 5.39).
- Body insets are `25400` EMU (0.028in) on custom boxes; OOXML's default when
  the attribute is absent is 0.1in — `check_layout.py` accounts for both.

## Page chrome (identical on every inner page)

| element | shape | x | y | w | h | size |
|---|---|---|---|---|---|---|
| eyebrow (English label) | `Text 0` | 1.25 | 0.79 | 8.00 | 0.35 | 1425 |
| page number | `Text 1` | 14.75 | 0.79 | 4.00 | 0.35 | 1425, algn=r |
| header rule | `Shape 2` | 1.25 | 1.21 | 17.50 | 0.02 | — |
| title | `Text 3` | 1.25 | 1.42 | 17.50 | — | 4650 |
| lead sentence | `Text 4` | 1.25 | 2.51 | 17.50 | 0.45+ | 1950 |
| footer rule | — | 1.25 | 10.10 | 17.50 | 0.01 | — |
| footer left | — | 1.25 | 10.28 | 8.00 | 0.32 | 1350, algn=l |
| footer right | — | 10.75 | 10.28 | 8.00 | 0.32 | 1350, algn=r |

Both footer boxes share y and height so their baselines match; giving each a
wide box with opposite alignment makes them flush to the rule's two ends and
removes any chance of wrapping.

## Colours

| token | hex | use |
|---|---|---|
| INK | `141414` | headings, primary text |
| ACCENT | `10325E` | navy — figures, page refs |
| MUTED | `3A3A3C` | body copy |
| GREY | `6D6D6F` | field labels |
| HAIR | `DAD9D6` | rules, dividers |
| PALE | `E8E8E6` | fills |
| A6A6A8 | `A6A6A8` | footer, page number |

## Type scale (hundredths of a point)

`1350` footer · `1425` eyebrow · `1650` KPI label · `1800` field label ·
`1950` body / lead · `2100` list item · `2400` sub-head · `2700` section head ·
`2850` card heading · `3300` KPI figure · `3900`–`4650` name / large figure ·
`4650` page title · `5100` hero · `7800` cover title

## Editions

Two audiences share one design. The intermediary edition carries the investment
criteria; the general edition drops them.

| | 仲介会社様向け | 一般商談用 |
|---|---|---|
| cover / footer | 【仲介会社様向け】会社概要 | 会社紹介 |
| pages | 16 | 12 |
| criteria pages | 投資対象領域 / NG業種詳細 / 重点業種詳細 ×2 / 担当体制 | removed |
| in their place | — | 事業領域, 強み, お問い合わせ |

Repurposing between editions is **not** a page-selection job. Body copy carries
the old framing — 承継, 投資基準, NG業種, 売主, 買い手 — and has to be reworded
page by page. Grep for those terms and for `（仮）` and draft notices before
delivering.
