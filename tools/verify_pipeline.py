# -*- coding: utf-8 -*-
"""案件管理表_TeamEnergy.xlsx（1タブ統合版）の全数式を実際に評価して検証する。

LibreOffice がこのコンテナで起動しない（3セルのファイルでもタイムアウト）ため
recalc.py の代替。xlformula.py で Excel の必要な部分だけを実装し、値を計算して
score.py と突き合わせる。
"""
import random
import sys

from openpyxl import load_workbook
from xlformula import Book, evaluate, Err

sys.path.insert(0, "/home/user/desktop-tutorial/.claude/skills/deal-screening/scripts")
from score import total, ORDER, ev_calc, book_multiple   # noqa: E402

F = "案件管理表_TeamEnergy.xlsx"
SH = "案件管理"
HEAD_ROW, FIRST, LAST = 4, 5, 104
BLANK = 7                       # 5=記入例 6=実案件 なので素の挙動は7行目で見る
GRADES = ["◯", "△〜◯", "△", "×〜△", "×", "－"]
ITEM_NAMES = ["1-1", "1-2", "1-3", "2", "3", "4", "5", "8-1", "8-2", "9", "11", "12"]
MUST_NAMES = ["1-1", "1-2", "2", "5"]
fails = []


def chk(label, got, want):
    if got != want:
        fails.append(f"{label}: got {got!r} want {want!r}")
        print(" FAIL", label, "->", repr(got), "want", repr(want))


def head(label, col):
    return f"{label} ({col})"


wb = load_workbook(F)
ws = wb[SH]

# 列は見出し行から引く（並び替えても検証が追従するように）
COL, EVCOL = {}, {}
for c in ws[HEAD_ROW]:
    if c.value is None:
        continue
    h = str(c.value).replace("\n", "")
    COL.setdefault(h, c.column_letter)
    if h.lstrip("★") in ITEM_NAMES:
        EVCOL[h.lstrip("★")] = c.column_letter
EV = [EVCOL[n] for n in ITEM_NAMES]
PRICE, EBITDA = COL["譲渡価格"], COL["実態EBITDA"]
MULT, SALES = COL["EV/EBITDAマルチプル"], COL["売上"]
BNC, WC = COL["簿価NetCash"], COL["平均必要運転資金"]
REFM, RANGE = COL["参考：簿価ベース倍率"], COL["売上レンジ"]
VERDICT, RATE = COL["総合判定"], COL["達成率"]

print("① 列の並び")
for h in ("No", "企業名", "事業内容", "業種区分", "譲渡価格", "実態EBITDA", "売上",
          "総合判定", "達成率", "得点", "Must×"):
    if h not in COL:
        chk(f"見出し{h}", None, "存在すること")
chk("12項目すべて存在", sorted(EVCOL), sorted(ITEM_NAMES))
must = [ITEM_NAMES[i] for i, c in enumerate(EV)
        if str(ws[f"{c}{HEAD_ROW}"].value).startswith("★")]
chk("Must項目", must, MUST_NAMES)
chk("評価列が連続", [ws[f"{c}{HEAD_ROW}"].column for c in EV],
    list(range(ws[f"{EV[0]}{HEAD_ROW}"].column,
               ws[f"{EV[0]}{HEAD_ROW}"].column + 12)))
hidden = [c for c in (COL["得点"], COL["判定済"], COL["×件数"], COL["Must×"])
          if ws.column_dimensions[c].hidden]
chk("内部計算列を隠す", len(hidden), 4)
chk("12項目の見出しメモ", sum(1 for c in EV if ws[f"{c}{HEAD_ROW}"].comment is not None), 12)
prim = 0
for c in ws[HEAD_ROW]:
    if c.value is None:
        continue
    d = ws.column_dimensions[c.column_letter]
    if not d.hidden:
        prim += d.width or 8.43
    if str(c.value) == "ステータス":
        break
print(f"   評価列 {EV[0]}〜{EV[-1]}／Must {must}／固定 {ws.freeze_panes}")
print(f"   先頭〜ステータスの幅 {prim:.0f}文字 ≒ {prim * 7:.0f}px")
if prim > 240:
    fails.append(f"主要ブロックが広すぎる {prim:.0f}文字")

# ② 空欄状態で全数式がエラーを出さないか
formulas = [(n, c.coordinate, c.value) for n in wb.sheetnames for row in wb[n].iter_rows()
            for c in row if isinstance(c.value, str) and c.value.startswith("=")]
print(f"② 数式の総数 {len(formulas)}")
b = Book(wb, maxrow=LAST + 5)
errs = {}
for sheet, addr, f in formulas:
    try:
        evaluate(b, sheet, f)
    except Err as e:
        errs.setdefault(e.kind.split(" ")[0], []).append(f"{sheet}!{addr}")
if errs:
    for k, v in errs.items():
        print(f" FAIL エラー {k}: {len(v)}件 例 {v[:4]}")
        fails.append(f"formula error {k} x{len(v)}")
else:
    print("   エラーなし（#DIV/0!・#N/A・#REF!・#NAME? いずれも発生せず）")

# ③ 入力済みの2行
print("③ 入力済みの2行")
for row, label, exp in (
    (5, "記入例", {MULT: 4.7, REFM: 4.4, RANGE: "範囲内",
                   VERDICT: "A：進める", RATE: 0.854}),
    (6, "実案件", {MULT: 19.4, REFM: 11.1, RANGE: "範囲内",
                   VERDICT: "C：見送り（Must×）", RATE: 0.455}),
):
    bk = Book(wb, maxrow=LAST + 5)
    out = []
    for col, want in exp.items():
        got = evaluate(bk, SH, ws[f"{col}{row}"].value)
        if isinstance(got, float):
            got = round(got, 3 if col == RATE else 1)
        chk(f"{label} {col}{row}", got, want)
        out.append(f"{col}={got}")
    print(f"   {label}（{row}行目） " + " / ".join(str(x) for x in out))
# 実案件が score.py と一致するか
d = {"equity_price": 60, "ebitda": 24.1, "book_net_cash": -206.9, "avg_wc": 200.4}
bk = Book(wb, maxrow=LAST + 5)
chk("実案件 倍率 vs score.py",
    round(evaluate(bk, SH, ws[f"{MULT}6"].value), 1), round(ev_calc(d)[3], 1))
chk("実案件 簿価倍率 vs score.py",
    round(evaluate(bk, SH, ws[f"{REFM}6"].value), 1), round(book_multiple(d), 1))

# ④ 総合判定・達成率を score.py と突き合わせ
print("④ 総合判定・達成率 vs score.py（乱数 5,000 件）")
random.seed(11)
mism = 0
for _ in range(5000):
    k = random.choice([0, 1, 2, 3, 5, 6, 7, 12, 12])
    idx = random.sample(range(12), k)
    g = {ORDER[i]: "－" for i in range(12)}
    bk = Book(wb, maxrow=LAST + 5)
    for i in range(12):
        v = random.choice(GRADES[:5]) if i in idx else "－"
        g[ORDER[i]] = v
        bk.set(SH, f"{EV[i]}{BLANK}", v)
    sv = evaluate(bk, SH, ws[f"{VERDICT}{BLANK}"].value)
    pv = total(g)[3]
    # 空行に「未入力」と出すと100行が騒がしいので、シートは "" を返す設計
    a = "未入力" if sv == "" else sv[0]
    bb = "未入力" if pv.startswith("未入力") else pv[0]
    if a != bb:
        mism += 1
        if mism <= 3:
            print("  FAIL", g, "sheet=", repr(sv), "py=", pv)
    sr = evaluate(bk, SH, ws[f"{RATE}{BLANK}"].value)
    pr, pj = total(g)[2], total(g)[1]
    if sr == "":
        if pj != 0:
            mism += 1
    elif abs(sr - pr) > 1e-9:
        mism += 1
if mism:
    fails.append(f"総合判定/達成率 不一致 {mism}件")
print(f"   不一致 {mism} 件")

# ⑤ 倍率・売上レンジを score.py と突き合わせ
print("⑤ 倍率・売上レンジ vs score.py（乱数 2,000 件）")
mism2 = 0
for _ in range(2000):
    price = round(random.uniform(10, 900), 1)
    eb = round(random.uniform(1, 300), 1)
    sl = round(random.uniform(100, 4000), 1)
    nc = round(random.uniform(-400, 200), 1)
    wc = round(random.uniform(0, 300), 1)
    bk = Book(wb, maxrow=LAST + 5)
    for col, v in ((PRICE, price), (EBITDA, eb), (SALES, sl), (BNC, nc), (WC, wc)):
        bk.set(SH, f"{col}{BLANK}", v)
    m = evaluate(bk, SH, ws[f"{MULT}{BLANK}"].value)
    rm = evaluate(bk, SH, ws[f"{REFM}{BLANK}"].value)
    rg = evaluate(bk, SH, ws[f"{RANGE}{BLANK}"].value)
    d = {"equity_price": price, "ebitda": eb, "book_net_cash": nc, "avg_wc": wc}
    if abs(m - ev_calc(d)[3]) > 1e-9 or abs(rm - book_multiple(d)) > 1e-9:
        mism2 += 1
    want = ("下限未満（対象外）" if sl < 300
            else "上限超（対象外）" if sl > 3000 else "範囲内")
    if rg != want:
        mism2 += 1
if mism2:
    fails.append(f"倍率/売上レンジ 不一致 {mism2}件")
print(f"   不一致 {mism2} 件")

# ⑥ 境界値と未入力
print("⑥ 境界値（7行目＝未入力の行）")
for sl, want in [(299.9, "下限未満（対象外）"), (300, "範囲内"), (3000, "範囲内"),
                 (3000.1, "上限超（対象外）")]:
    bk = Book(wb, maxrow=LAST + 5)
    bk.set(SH, f"{SALES}{BLANK}", sl)
    chk(f"売上{sl}", evaluate(bk, SH, ws[f"{RANGE}{BLANK}"].value), want)
for label, sets in [("EBITDA=0", {PRICE: 100, EBITDA: 0, BNC: 0, WC: 0}),
                    ("EBITDA負", {PRICE: 100, EBITDA: -5, BNC: 0, WC: 0}),
                    ("運転資金だけ空欄", {PRICE: 100, EBITDA: 50, BNC: 0}),
                    ("全空欄", {})]:
    bk = Book(wb, maxrow=LAST + 5)
    for c, v in sets.items():
        bk.set(SH, f"{c}{BLANK}", v)
    chk(f"倍率 {label}", evaluate(bk, SH, ws[f"{MULT}{BLANK}"].value), "")
    chk(f"総合判定 {label}", evaluate(bk, SH, ws[f"{VERDICT}{BLANK}"].value), "")
print("   すべて空文字を返す（エラーにならない）")

print()
print("=" * 62)
print("失敗:", len(fails))
for f in fails:
    print("  -", f)
sys.exit(1 if fails else 0)
