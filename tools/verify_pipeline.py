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
OPENQ = COL["未解決質問"]

print("① 列の並び")
for h in ("No", "企業名", "事業内容", "業種区分", "譲渡価格", "実態EBITDA", "売上",
          "総合判定", "達成率", "未解決質問", "得点", "Must×"):
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
for row, want in ((5, 0.0), (6, 13.0), (7, 15.0)):
    bk = Book(wb, maxrow=max(LAST, 310))
    chk(f"未解決質問 {row}行", evaluate(bk, SH, ws[f"{OPENQ}{row}"].value), want)
print("   未解決質問 5行=0 / 6行=13 / 7行=15")

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

# ⑨ 質問リスト
print("⑨ 質問リスト")
wq = wb["質問リスト"]
QC = {}
for c in wq[3]:
    if c.value is not None:
        QC.setdefault(str(c.value).replace("\n", ""), c.column_letter)
rows = [r for r in range(4, 304) if wq[f"A{r}"].value is not None]
chk("質問の件数", len(rows), 28)
per = {}
for r in rows:
    per[wq[f"A{r}"].value] = per.get(wq[f"A{r}"].value, 0) + 1
chk("案件別の件数", per, {2: 13, 3: 15})
bk = Book(wb, maxrow=310)
chk("企業名の自動反映（No.2）", evaluate(bk, "質問リスト", wq[f'{QC["企業名"]}4'].value),
    "尾形工業株式会社")
chk("仲介会社の自動反映", evaluate(bk, "質問リスト", wq[f'{QC["仲介会社"]}4'].value),
    "株式会社maXアドバイザリー")
chk("案件担当者の自動反映", evaluate(bk, "質問リスト", wq[f'{QC["案件担当者"]}4'].value),
    "稲見様")
chk("企業名の自動反映（No.3）", evaluate(bk, "質問リスト", wq[f'{QC["企業名"]}17'].value),
    "株式会社SAMOEDO'S")
chk("未入力行は空", evaluate(bk, "質問リスト", wq[f'{QC["企業名"]}200'].value), "")
# Q# が案件ごとに振り直されているか
q2 = [wq[f'{QC["Q#"]}{r}'].value for r in rows if wq[f"A{r}"].value == 2]
q3 = [wq[f'{QC["Q#"]}{r}'].value for r in rows if wq[f"A{r}"].value == 3]
chk("Q#（No.2）", q2, list(range(1, 14)))
chk("Q#（No.3）", q3, list(range(1, 16)))
# 状態を解決にすると案件管理のカウントが減る
bk2 = Book(wb, maxrow=310)
bk2.set("質問リスト", f'{QC["状態"]}4', "解決")
chk("解決でカウントが減る", evaluate(bk2, SH, ws[f"{OPENQ}6"].value), 12.0)
# 全質問に優先度・分類・関連項目が入っているか
for r in rows:
    for h in ("分類", "優先度", "何を確かめたいか", "質問（このまま読める文）"):
        if not wq[f"{QC[h]}{r}"].value:
            chk(f"{h} が空（{r}行）", None, "入っていること")
print(f"   28件（No.2:13 / No.3:15）／自動反映・Q#・解決連動とも期待どおり")

# ⑩ 取込タブと Apps Script の対応、および取込を通した結果
print("⑩ 取込（gas/案件取込.gs との対応）")
import re as _re                                              # noqa: E402
import shutil as _sh                                          # noqa: E402
from sim_intake import import_deal, headers as _hd, IN_DEAL_HEAD as _IDH  # noqa: E402
from sim_intake import IN_DEAL_ROW as _IDR, IN_Q_HEAD as _IQH  # noqa: E402
from sim_intake import IN_Q_FIRST as _IQF                      # noqa: E402

_gs = open("/home/user/desktop-tutorial/gas/案件取込.gs", encoding="utf-8").read()
for nm, pat, want in [("IN_DEAL_HEAD", r"IN_DEAL_HEAD = (\d+)", "5"),
                      ("IN_DEAL_ROW", r"IN_DEAL_ROW = (\d+)", "6"),
                      ("IN_Q_HEAD", r"IN_Q_HEAD = (\d+)", "9"),
                      ("IN_Q_FIRST", r"IN_Q_FIRST = (\d+)", "10"),
                      ("IN_Q_LAST", r"IN_Q_LAST = (\d+)", "59"),
                      ("DEAL_HEAD_ROW", r"DEAL_HEAD_ROW = (\d+)", "4"),
                      ("DEAL_FIRST", r"DEAL_FIRST = (\d+)", "5"),
                      ("Q_HEAD_ROW", r"Q_HEAD_ROW = (\d+)", "3"),
                      ("Q_FIRST", r"var Q_FIRST = (\d+)", "4")]:
    m = _re.search(pat, _gs)
    chk(f"gs定数 {nm}", m.group(1) if m else None, want)

_ih = _hd(wb["取込"], _IDH)
_dh = _hd(wb[SH], HEAD_ROW)
_qh = _hd(wb["質問リスト"], 3)
_iq = _hd(wb["取込"], _IQH)
chk("取込の案件見出しが全て案件管理にある", [h for h in _ih if h not in _dh], [])
_fcols = [h for h, c in _dh.items()
          if isinstance(wb[SH].cell(FIRST, c).value, str)
          and str(wb[SH].cell(FIRST, c).value).startswith("=")]
chk("数式列が取込に混入していない", [h for h in _ih if h in _fcols], [])
chk("取込に案件管理の入力列が揃っている",
    [h for h in _dh if h not in _ih and h not in _fcols and h != "No"], [])
chk("質問見出しの対応", [h for h in _iq if h not in _qh], [])
chk("評価12列が取込にある",
    len([h for h in _ih if h.lstrip("★") in
         ("1-1", "1-2", "1-3", "2", "3", "4", "5", "8-1", "8-2", "9", "11", "12")]), 12)

# 実際に取込を通して、数式が壊れず判定まで出るか
import datetime as _dt                                        # noqa: E402
from openpyxl import load_workbook as _lw                     # noqa: E402
_sh.copy(F, "_verify_intake.xlsx")
_wb = _lw("_verify_intake.xlsx")
_si = _wb["取込"]
_d = {"企業名": "取込テスト株式会社", "事業内容": "ビルメンテナンス",
      "業種区分": "重点②AI・DXで伸ばせる業種", "流入日": _dt.date(2026, 10, 5),
      "仲介会社": "株式会社ストライク", "仲介担当者": "三浦様",
      "譲渡価格": 900, "実態EBITDA": 160, "売上": 1800,
      "簿価NetCash": 120, "平均必要運転資金": 80,
      "★1-1": "◯", "★1-2": "△", "1-3": "◯", "★2": "◯", "3": "△", "4": "◯",
      "★5": "◯", "8-1": "◯", "8-2": "◯", "9": "△〜◯", "11": "△〜◯", "12": "△",
      "ステータス": "初期検討中"}
for _h, _v in _d.items():
    _si.cell(_IDR, _ih[_h]).value = _v
for _i, _q in enumerate(["質問A", "質問B", "質問C"]):
    _si.cell(_IQF + _i, _iq["質問（このまま読める文）"]).value = _q
    _si.cell(_IQF + _i, _iq["優先度"]).value = "必須"
_res = import_deal(_wb)
_wb.save("_verify_intake.xlsx")
_wb2 = _lw("_verify_intake.xlsx")
_b = Book(_wb2, maxrow=320)
_ws, _DC = _wb2[SH], _hd(_wb2[SH], HEAD_ROW)
chk("取込 行", _res["row"], 8)
chk("取込 案件No", _res["no"], 4.0)
chk("取込後の総合判定",
    evaluate(_b, SH, _ws.cell(8, _DC["総合判定"]).value), "A：進める")
chk("取込後の達成率",
    round(evaluate(_b, SH, _ws.cell(8, _DC["達成率"]).value), 3), 0.833)
chk("取込後の未解決質問",
    evaluate(_b, SH, _ws.cell(8, _DC["未解決質問"]).value), 3.0)
_wq, _QC = _wb2["質問リスト"], _hd(_wb2["質問リスト"], 3)
chk("質問の案件No", _wq.cell(32, _QC["案件No"]).value, 4.0)
chk("質問のQ#", [_wq.cell(32 + i, _QC["Q#"]).value for i in range(3)], [1, 2, 3])
chk("質問の企業名が自動反映",
    evaluate(_b, "質問リスト", _wq.cell(32, _QC["企業名"]).value), "取込テスト株式会社")
chk("取込タブがクリアされた",
    all(_wb2["取込"].cell(_IDR, c).value in ("", None)
        for c in range(1, len(_ih) + 1)), True)
_e = 0
for _n in _wb2.sheetnames:
    for _row in _wb2[_n].iter_rows():
        for _c in _row:
            if isinstance(_c.value, str) and _c.value.startswith("="):
                try:
                    evaluate(_b, _n, _c.value)
                except Err:
                    _e += 1
chk("取込後の数式エラー", _e, 0)
for _r, _w in ((5, "A：進める"), (6, "C：見送り（Must×）"), (7, "B：追加情報を取得")):
    chk(f"既存{_r}行が壊れていない",
        evaluate(_b, SH, _ws.cell(_r, _DC["総合判定"]).value), _w)
print("   見出しの対応・取込の実行・既存行の保全とも期待どおり")

print()
print("=" * 62)
print("失敗:", len(fails))
for f in fails:
    print("  -", f)
sys.exit(1 if fails else 0)
