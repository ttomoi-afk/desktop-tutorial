# -*- coding: utf-8 -*-
"""現物の案件管理表を、判定基準を敷いた新レイアウトへ組み替える。

build_pipeline.py は空の表を作る。こちらは**すでに案件が入っている現物**を
入力として、案件管理タブだけを新レイアウトで作り直し、値を移し替える。

  python3 tools/relayout_live.py 案件管理表_更新版.xlsx -o 案件管理表_新.xlsx

やること
  ・案件管理     4〜6行に判定基準の帯／7行に見出し／8行以降に明細。
                 総合判定→AI総合判定、友井判定（手入力A/B/C）を追加。
                 ドロップダウン・見出しメモ・列幅・非表示列も張り直す
                 （Googleスプレッドシートを往復した現物では落ちている）
  ・友井→服部    タブごと削除
  ・仲介会社管理  案件管理を指す COUNTIFS の列と行を新しい位置へ付け替え
  ・取込         見出しの★を現在のMust（1-1・1-3・2・5）に合わせて作り直す
  ・質問リスト／選択肢／判定基準  そのまま（判定基準は冒頭の注記だけ差し替え）
"""
import argparse
import os
import re
import sys

from openpyxl import load_workbook
from openpyxl.worksheet.formula import ArrayFormula

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_pipeline as B                                    # noqa: E402

SH = "案件管理"
OLD_HEAD, OLD_FIRST, OLD_LAST = 4, 5, 104
DROP = ["友井→服部（自動リストアップ）", "友井→服部"]
RENAME = {"総合判定": "AI総合判定"}      # 旧見出し → 新見出し


def is_formula(v):
    return isinstance(v, ArrayFormula) or (isinstance(v, str) and v.startswith("="))


def norm(v):
    return str(v).replace("\n", "").strip()


def head_map(ws, row, last_col=None):
    out = {}
    for c in ws[row]:
        if c.value is None or (last_col and c.column > last_col):
            continue
        out.setdefault(norm(c.value), c.column_letter)
    return out


def harvest(ws):
    """旧案件管理から、数式でないセルを見出し名つきで拾う。"""
    hm = head_map(ws, OLD_HEAD)
    deals = []
    for r in range(OLD_FIRST, OLD_LAST + 1):
        if ws.cell(r, 1).value in (None, ""):
            continue
        row = {}
        for h, cl in hm.items():
            v = ws[f"{cl}{r}"].value
            if v in (None, "") or is_formula(v):
                continue
            row[RENAME.get(h, h)] = v
        deals.append(row)
    return deals


# 案件管理を指す参照の形。① 行まで絞った範囲 ② 列まるごと（質問リストのINDEX/MATCH）
REF = r"(?:'案件管理'|案件管理)!"
RANGED = re.compile(REF + r"\$[A-Z]{1,2}\$\d+:\$[A-Z]{1,2}\$\d+")
WHOLE = re.compile(REF + r"\$[A-Z]{1,2}:\$[A-Z]{1,2}")
ANY_REF = re.compile(REF)


def repoint_text(f, col_map, row_map):
    """1つの数式の中の案件管理参照を、新しい列・行へ付け替えて返す。
    見たことのない形の参照が残っていたら黙って通さず例外にする。"""
    def ranged(m):
        pre, rest = m.group(0).split("!", 1)
        c1, r1, c2, r2 = re.match(
            r"\$([A-Z]{1,2})\$(\d+):\$([A-Z]{1,2})\$(\d+)", rest).groups()
        return (f"{pre}!${col_map.get(c1, c1)}${row_map.get(int(r1), r1)}"
                f":${col_map.get(c2, c2)}${row_map.get(int(r2), r2)}")

    def whole(m):
        pre, rest = m.group(0).split("!", 1)
        c1, c2 = re.match(r"\$([A-Z]{1,2}):\$([A-Z]{1,2})", rest).groups()
        return f"{pre}!${col_map.get(c1, c1)}:${col_map.get(c2, c2)}"

    out = WHOLE.sub(whole, RANGED.sub(ranged, f))
    # 置き換え後も「案件管理!」の数だけ既知の形が並んでいるか数えて確かめる
    known = len(RANGED.findall(out)) + len(WHOLE.findall(out))
    if known != len(ANY_REF.findall(out)):
        raise SystemExit(f"付け替えられない形の案件管理参照がある: {f}")
    return out


def repoint(ws, col_map, row_map):
    """案件管理を指す参照を、新しい位置へ付け替える。
    Googleスプレッドシートを往復した現物では INDEX/MATCH が ArrayFormula に
    なっていて素の文字列ではないので、どちらの持ち方も見る。"""
    n = 0
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            arr = isinstance(v, ArrayFormula)
            f = v.text if arr else v
            if not isinstance(f, str) or "案件管理" not in f:
                continue
            new = repoint_text(f, col_map, row_map)
            if new != f:
                c.value = ArrayFormula(v.ref, new) if arr else new
                n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    wb = load_workbook(a.src)
    old = wb[SH]
    old_cols = head_map(old, OLD_HEAD)
    deals = harvest(old)
    print(f"案件 {len(deals)}件を回収（No.{deals[0].get('No')}〜{deals[-1].get('No')}）")

    # ── 案件管理を新レイアウトで作り直す ──────────────────────────────
    idx = wb.sheetnames.index(SH)
    del wb[SH]
    ws = wb.create_sheet(SH, idx)
    B.build_deals(ws, samples=False)
    new_cols = head_map(ws, B.HEAD_ROW)
    missing = [h for h in old_cols if RENAME.get(h, h) not in new_cols]
    if missing:
        raise SystemExit(f"新レイアウトに無い旧見出し: {missing}")
    for i, d in enumerate(deals):
        r = B.FIRST + i
        for h, v in d.items():
            ws[f"{new_cols[h]}{r}"].value = v
    print(f"   {B.FIRST}〜{B.FIRST + len(deals) - 1}行へ転記"
          f"（空き {B.LAST - (B.FIRST + len(deals) - 1)}行）")

    # ── 自動リストアップのタブを落とす ────────────────────────────────
    for name in DROP:
        if name in wb.sheetnames:
            del wb[name]
            print(f"削除 {name}")

    # ── 案件管理を指す参照を付け替える ────────────────────────────────
    col_map = {cl: new_cols[RENAME.get(h, h)] for h, cl in old_cols.items()}
    row_map = {OLD_FIRST: B.FIRST, OLD_LAST: B.LAST}
    for name in wb.sheetnames:
        if name == SH:
            continue
        n = repoint(wb[name], col_map, row_map)
        if n:
            print(f"参照の付け替え {name}: {n}セル")

    # ── 取込を作り直す（★の位置が現在のMustと食い違っているため）────────
    stale = [(c.coordinate, c.value) for c in wb["取込"][B.IN_DEAL_ROW]
             if c.value not in (None, "")]
    del wb["取込"]
    ws_in = wb.create_sheet("取込", wb.sheetnames.index(SH) + 1)
    B.build_intake(ws_in, B.L)
    if stale:
        print(f"取込を作り直した（貼り付け欄に残っていた"
              f"「{stale[0][1]}」は案件管理に登録済みなのでクリア）")

    # ── 判定基準タブの冒頭注記だけ差し替える ──────────────────────────
    wc = wb["判定基準"]
    wc["A2"] = (f"この表の内容は案件管理タブの{B.CRIT_O}〜{B.CRIT_X}行目に短縮して"
                "敷いてあるので、普段はそちらを見ればよい。このタブは全文の控えと、"
                "下部の「条件合致の判定パラメータ」（仲介会社管理シートの集計が"
                "参照する唯一の置き場）のために残している。"
                "正本は .claude/skills/deal-screening/references/rubric.md。")
    wc["A2"].font = B.NOTE_F

    order = [n for n in B.SHEETS if n in wb.sheetnames]
    wb._sheets = [wb[n] for n in order] + [s for s in wb._sheets
                                           if s.title not in order]
    wb.save(a.out)
    print("saved", a.out, "/ タブ", wb.sheetnames)


if __name__ == "__main__":
    main()
