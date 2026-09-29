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
BAND_ROW, HEAD_ROW, FIRST, LAST = 3, 4, 5, 104
BLANK = 8                       # 5=記入例 6,7=実案件 なので素の挙動は8行目で見る
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
    (6, "実案件1 左官", {MULT: 19.4, REFM: 11.1, RANGE: "範囲内",
                         VERDICT: "C：見送り（Must×）", RATE: 0.455}),
    (7, "実案件2 動物カフェ", {MULT: 3.0, REFM: 3.0, RANGE: "範囲内",
                              VERDICT: "B：追加情報を取得", RATE: 0.455}),
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
print("⑥ 境界値（8行目＝未入力の行）")
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

# ⑦ 友井→服部（上申シート）
print("⑦ 友井→服部（上申シート）")
we = wb["友井→服部"]
EC = {}
for c in we[HEAD_ROW]:
    if c.value is not None:
        EC.setdefault(str(c.value).replace("\n", ""), c.column_letter)
bk = Book(wb, maxrow=LAST + 5)
# 5行目=記入例（A判定）→ ◎ 上申対象 / 6行目=尾形工業（C判定）→ —
chk("上申区分 5行", evaluate(bk, "友井→服部", we[f"{EC['上申区分']}5"].value), "◎ 上申対象")
chk("上申区分 6行", evaluate(bk, "友井→服部", we[f"{EC['上申区分']}6"].value), "—")
chk("企業名 5行", evaluate(bk, "友井→服部", we[f"{EC['企業名']}5"].value),
    "（記入例）株式会社サンプル配食サービス")
chk("企業名 6行（C判定は空）", evaluate(bk, "友井→服部", we[f"{EC['企業名']}6"].value), "")
chk("×が付いた項目 5行", evaluate(bk, "友井→服部", we[f"{EC['×が付いた項目']}5"].value), "")
chk("要確認 5行", evaluate(bk, "友井→服部", we[f"{EC['要確認（－）の項目']}5"].value), "")
chk("上申区分 8行（未入力）", evaluate(bk, "友井→服部", we[f"{EC['上申区分']}8"].value), "")
chk("上申区分 7行（動物カフェ・B判定）",
    evaluate(bk, "友井→服部", we[f"{EC['上申区分']}7"].value), "△ 要相談")
chk("×が付いた項目 7行", evaluate(bk, "友井→服部", we[f"{EC['×が付いた項目']}7"].value), "8-2 ")
chk("要確認 7行", evaluate(bk, "友井→服部", we[f"{EC['要確認（－）の項目']}7"].value), "11 ")
chk("集計行", evaluate(bk, "友井→服部", we[f"A{BAND_ROW}"].value),
    "◎ 上申対象 1 件　／　△ 要相談 1 件")
# 手動✓ で C判定でも拾えるか
bk2 = Book(wb, maxrow=LAST + 5)
bk2.set("友井→服部", "A6", "✓")
chk("手動✓で6行が対象化", evaluate(bk2, "友井→服部", we[f"{EC['上申区分']}6"].value),
    "◎ 上申対象")
chk("手動✓後の企業名", evaluate(bk2, "友井→服部", we[f"{EC['企業名']}6"].value), "尾形工業株式会社")
chk("手動✓後の×項目", evaluate(bk2, "友井→服部", we[f"{EC['×が付いた項目']}6"].value),
    "1-1 5 ")
chk("手動✓後の要確認", evaluate(bk2, "友井→服部", we[f"{EC['要確認（－）の項目']}6"].value),
    "11 ")
print("   自動判定・手動✓・×項目の抽出とも期待どおり")

# ⑧ 仲介会社管理シート（案件管理からの自動集計）
print("⑧ 仲介会社管理シート")
wm = wb["仲介会社管理シート"]
names = [wm.cell(r, 1).value for r in range(5, 41)]
chk("会社数", len(names), 36)
chk("案件管理の仲介会社DVが管理シートを参照",
    any("仲介会社管理シート" in (dv.formula1 or "") for dv in ws.data_validations.dataValidation),
    True)
# サンプル2件はどちらも 株式会社maXアドバイザリー。2026年9月に流入
mx = next(r for r in range(5, 41) if wm.cell(r, 1).value == "株式会社maXアドバイザリー")
bk = Book(wb, maxrow=max(LAST, 200) + 5)
sep_in, sep_hit = wm.cell(mx, 12), wm.cell(mx, 13)     # L=2026年9月の流入/合致
chk("maX 2026年9月 流入", evaluate(bk, "仲介会社管理シート", sep_in.value), 2.0)
chk("maX 2026年9月 合致", evaluate(bk, "仲介会社管理シート", sep_hit.value), 1.0)
oct_in = wm.cell(mx, 14)
chk("maX 2026年10月 流入", evaluate(bk, "仲介会社管理シート", oct_in.value), 0.0)
# 年間計と合致率
tail = 11 + 24 + 1
yi, yh, yr = (wm.cell(mx, tail).value, wm.cell(mx, tail + 1).value,
              wm.cell(mx, tail + 2).value)
chk("maX 年間流入計", evaluate(bk, "仲介会社管理シート", yi), 2.0)
chk("maX 年間合致計", evaluate(bk, "仲介会社管理シート", yh), 1.0)
_r = evaluate(bk, "仲介会社管理シート", yr)
chk("maX 合致率", round(_r, 3) if isinstance(_r, float) else _r, 0.5)
chk("全社合計 流入", evaluate(bk, "仲介会社管理シート", wm.cell(4, tail).value), 3.0)
chk("全社合計 合致", evaluate(bk, "仲介会社管理シート", wm.cell(4, tail + 1).value), 2.0)
ag = next(r for r in range(5, 41) if wm.cell(r, 1).value == "株式会社Anyglo")
chk("Anyglo 2026年9月 流入", evaluate(bk, "仲介会社管理シート", wm.cell(ag, 12).value), 1.0)
chk("Anyglo 2026年9月 合致", evaluate(bk, "仲介会社管理シート", wm.cell(ag, 13).value), 1.0)
chk("Anyglo 年間流入計", evaluate(bk, "仲介会社管理シート", wm.cell(ag, tail).value), 1.0)
chk("Anyglo 合致率", evaluate(bk, "仲介会社管理シート", wm.cell(ag, tail + 2).value), 1.0)
# レコフ（案件なし）は0件
rk = next(r for r in range(5, 41) if wm.cell(r, 1).value == "株式会社レコフ")
chk("レコフ 年間流入計", evaluate(bk, "仲介会社管理シート", wm.cell(rk, tail).value), 0.0)
chk("レコフ 合致率（0除算回避）", evaluate(bk, "仲介会社管理シート",
                                     wm.cell(rk, tail + 2).value), "")
# パラメータを変えると合致数が動くか（EBITDA下限を20に下げれば実案件も合致）
bk3 = Book(wb, maxrow=max(LAST, 200) + 5)
bk3.set("判定基準", "B32", 20)   # 実態EBITDA下限
chk("パラメータ連動（EBITDA下限20）",
    evaluate(bk3, "仲介会社管理シート", sep_hit.value), 1.0)
bk4 = Book(wb, maxrow=max(LAST, 200) + 5)
bk4.set("判定基準", "B32", 20)       # 実態EBITDA下限を20に
bk4.set("判定基準", "B34", 25)       # マルチプル上限を25倍に
bk4.set("判定基準", "B35", "なし")    # 除外業種を外す → 実案件も合致に入る
chk("パラメータ連動（下限20・倍率25倍・除外なし）maX",
    evaluate(bk4, "仲介会社管理シート", sep_hit.value), 2.0)
chk("パラメータ連動（除外なし）Anyglo",
    evaluate(bk4, "仲介会社管理シート", wm.cell(ag, 13).value), 1.0)
print("   月次・年間計・合致率・パラメータ連動とも期待どおり")

print()
print("=" * 62)
print("失敗:", len(fails))
for f in fails:
    print("  -", f)
sys.exit(1 if fails else 0)
