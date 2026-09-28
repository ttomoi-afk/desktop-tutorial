# -*- coding: utf-8 -*-
"""案件管理表_TeamEnergy.xlsx の全数式を実際に評価して検証する。

LibreOffice が起動しないため recalc.py の代替。
 ① 空欄状態で全数式がエラーを出さないか
 ② 記入例の行が期待値を返すか
 ③ 初期検討タブの総合判定が score.py と一致するか（乱数 5,000 件）
 ④ 案件管理タブの倍率が score.py と一致するか
 ⑤ タブ間参照が正しく引けているか
"""
import random
import sys

from openpyxl import load_workbook
from xlformula import Book, evaluate, Err

sys.path.insert(0, "/home/user/desktop-tutorial/.claude/skills/deal-screening/scripts")
from score import total, ORDER, ev_calc, book_multiple   # noqa: E402

F = "案件管理表_TeamEnergy.xlsx"
FIRST, LAST = 4, 103
GRADES = ["◯", "△〜◯", "△", "×〜△", "×", "－"]
EV_COLS = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]
fails = []


def chk(label, got, want):
    if got != want:
        fails.append(f"{label}: got {got!r} want {want!r}")
        print(" FAIL", label, "->", repr(got), "want", repr(want))


wb = load_workbook(F)
formulas = []
for name in wb.sheetnames:
    ws = wb[name]
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("="):
                formulas.append((name, c.coordinate, c.value))
print(f"① 数式の総数 {len(formulas)}")

# ① 空欄状態（記入例は残したまま）で全数式を評価
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

# ② 記入例の行
b2 = Book(wb, maxrow=LAST + 5)
print("② 記入例（4行目）")
# 列: K=EV/EBITDAマルチプル O=参考簿価ベース P=売上レンジ Q=総合判定 R=達成率
exp = {
    "K": 4.7,     # (480-(60-25))/95
    "O": 4.4,     # (480-60)/95
    "P": "範囲内",
    "Q": "A：進める（トップ面談・基本合意検討へ）",
    "R": 0.854,   # 得点20.5 ÷ (12×2)
}
for col, want in exp.items():
    got = evaluate(b2, "案件管理", wb["案件管理"][f"{col}4"].value)
    if isinstance(got, float):
        got = round(got, 3 if col == "R" else 1)
    chk(f"案件管理!{col}4", got, want)
    print(f"   {col}4 = {got!r}")
d = {"equity_price": 480, "ebitda": 95, "book_net_cash": 60, "avg_wc": 25}
chk("倍率 vs score.py", round(evaluate(b2, "案件管理", wb["案件管理"]["K4"].value), 1),
    round(ev_calc(d)[3], 1))
chk("簿価倍率 vs score.py", round(evaluate(b2, "案件管理", wb["案件管理"]["O4"].value), 1),
    round(book_multiple(d), 1))
chk("企業名の参照", evaluate(b2, "初期検討", wb["初期検討"]["B4"].value),
    "（記入例）株式会社サンプル配食サービス")
print("   初期検討!B4 =", evaluate(b2, "初期検討", wb["初期検討"]["B4"].value))

# ③ 総合判定を score.py と突き合わせ
print("③ 総合判定 vs score.py（乱数 5,000 件）")
random.seed(11)
ws_r = wb["初期検討"]
mism = 0
for n in range(5000):
    k = random.choice([0, 1, 2, 3, 5, 6, 7, 12, 12])
    idx = random.sample(range(12), k)
    g = {ORDER[i]: "－" for i in range(12)}
    bk = Book(wb, maxrow=LAST + 5)
    bk.set("初期検討", "A5", 999)
    for i in range(12):
        v = random.choice(GRADES[:5]) if i in idx else "－"
        g[ORDER[i]] = v
        bk.set("初期検討", f"{EV_COLS[i]}5", v)
    sheet_v = evaluate(bk, "初期検討", ws_r["S5"].value)
    py_v = total(g)[3]
    a = "未入力" if sheet_v == "未入力" else sheet_v[0]
    bb = "未入力" if py_v.startswith("未入力") else py_v[0]
    if a != bb:
        mism += 1
        if mism <= 3:
            print("  FAIL", g, "sheet=", sheet_v, "py=", py_v)
    # 達成率も突き合わせ
    sheet_rate = evaluate(bk, "初期検討", ws_r["T5"].value)
    py_rate = total(g)[2]
    if sheet_rate == "":
        if total(g)[1] != 0:
            mism += 1
    elif abs(sheet_rate - py_rate) > 1e-9:
        mism += 1
        if mism <= 3:
            print("  FAIL rate", g, sheet_rate, py_rate)
if mism:
    fails.append(f"総合判定/達成率 不一致 {mism}件")
print(f"   不一致 {mism} 件")

# ④ 倍率と売上レンジを乱数で突き合わせ
print("④ 倍率・売上レンジ vs score.py（乱数 2,000 件）")
ws_d = wb["案件管理"]
mism2 = 0
for _ in range(2000):
    price = round(random.uniform(10, 900), 1)
    ebitda = round(random.uniform(1, 300), 1)
    sales = round(random.uniform(100, 4000), 1)
    bnc = round(random.uniform(-400, 200), 1)
    wc = round(random.uniform(0, 300), 1)
    bk = Book(wb, maxrow=LAST + 5)
    for col, v in (("I", price), ("J", ebitda), ("L", sales), ("M", bnc), ("N", wc)):
        bk.set("案件管理", f"{col}5", v)
    k = evaluate(bk, "案件管理", ws_d["K5"].value)
    o = evaluate(bk, "案件管理", ws_d["O5"].value)
    p = evaluate(bk, "案件管理", ws_d["P5"].value)
    d = {"equity_price": price, "ebitda": ebitda, "book_net_cash": bnc, "avg_wc": wc}
    if abs(k - ev_calc(d)[3]) > 1e-9 or abs(o - book_multiple(d)) > 1e-9:
        mism2 += 1
    want_p = ("下限未満（対象外）" if sales < 300
              else "上限超（対象外）" if sales > 3000 else "範囲内")
    if p != want_p:
        mism2 += 1
if mism2:
    fails.append(f"倍率/売上レンジ 不一致 {mism2}件")
print(f"   不一致 {mism2} 件")

# ⑤ 境界値
print("⑤ 境界値（6行目＝未入力の行で確認）")
R0 = 6      # 4行目=記入例、5行目=実案件なので、素の挙動は6行目で見る
for sales, want in [(299.9, "下限未満（対象外）"), (300, "範囲内"), (3000, "範囲内"),
                    (3000.1, "上限超（対象外）")]:
    bk = Book(wb, maxrow=LAST + 5)
    bk.set("案件管理", f"L{R0}", sales)
    chk(f"売上{sales}", evaluate(bk, "案件管理", ws_d[f"P{R0}"].value), want)
# EBITDA<=0 と空欄でエラーにならず空文字を返すこと
for label, sets in [("EBITDA=0", {"I": 100, "J": 0, "M": 0, "N": 0}),
                    ("EBITDA負", {"I": 100, "J": -5, "M": 0, "N": 0}),
                    ("運転資金だけ空欄", {"I": 100, "J": 50, "M": 0}),
                    ("全空欄", {})]:
    bk = Book(wb, maxrow=LAST + 5)
    for c, v in sets.items():
        bk.set("案件管理", f"{c}{R0}", v)
    chk(f"倍率 {label}", evaluate(bk, "案件管理", ws_d[f"K{R0}"].value), "")
    chk(f"総合判定 {label}", evaluate(bk, "案件管理", ws_d[f"Q{R0}"].value), "")
# 実案件（5行目）が score.py と一致すること
bk = Book(wb, maxrow=LAST + 5)
chk("実案件 倍率", round(evaluate(bk, "案件管理", ws_d["K5"].value), 1), 19.4)
chk("実案件 簿価倍率", round(evaluate(bk, "案件管理", ws_d["O5"].value), 1), 11.1)
chk("実案件 総合判定", evaluate(bk, "案件管理", ws_d["Q5"].value), "C：見送り（Must項目に×）")
chk("実案件 達成率", round(evaluate(bk, "案件管理", ws_d["R5"].value), 3), 0.455)
chk("実案件 企業名参照", evaluate(bk, "初期検討", wb["初期検討"]["B5"].value), "尾形工業株式会社")
print("   実案件5行目: 19.4倍 / 11.1倍 / C：見送り / 45%")

print()
print("=" * 60)
print("失敗:", len(fails))
for f in fails:
    print("  -", f)
sys.exit(1 if fails else 0)
