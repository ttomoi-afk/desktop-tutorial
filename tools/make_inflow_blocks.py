#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次情報タブへ貼るブロックを作る（案件管理表＝Googleスプレッドシートの現物向け）。

一次情報＝仲介会社から友井・sourcing@ 宛てに届いた案件情報（メルマガを除く）。1行＝1案件。
仲介会社管理シートの右端に、一次情報の月次件数と年間計・ネームクリア率（流入÷一次情報）を
数式で出す。現物にまだタブや列が無ければ、作るためのブロックも一緒に出す。

  python3 tools/make_inflow_blocks.py --layout live.xlsx --rows rows.json \
          --out blocks.txt [--verify]

rows.json
  {
    "new_brokers": ["株式会社…"],          # 仲介会社管理シートA列に足す会社（無ければ省略）
    "rows": [{"受信日": "2026/10/26", "仲介会社": "…", "担当者": "…", "宛先": "友井",
              "件名": "…", "案件の要点": "…", "資料": "NN", "経路": "仲介から",
              "案件管理No": 27, "備考": "…", "メール": "https://…"}, ...]
  }
  ・キーは一次情報タブの見出しそのまま。No は書かない（続きの番号を振る）
  ・仲介会社は仲介会社管理シートA列の正式名称。A列に無い名前は new_brokers に書いたものだけ通す
    （打ち間違いを新しい会社として足してしまわないため）
  ・受信日・仲介会社・件名・案件の要点が同じ行がすでにタブにあれば貼らない（二重計上を防ぐ。
    1通で複数の案件が来たときは件名まで同じなので、案件の要点で見分ける）

--verify を付けると、貼った後の状態を作って仲介会社管理シートの数式を評価し、
仲介会社×月の一次情報の件数が rows.json から数えた件数と一致するかを確かめる。
"""
import argparse
import collections
import datetime
import io
import json
import os
import re
import shutil
import sys

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_pipeline as B                                    # noqa: E402
from make_paste_blocks import is_formula, head_map, write_head  # noqa: E402

SH_MED = "仲介会社管理シート"
MED_HEAD = 2                      # 見出しは2・3行目（2行目＝月、3行目＝流入／条件合致／一次情報）
HEADS = [h for h, _ in B.INF_COLS]


def norm(v):
    return str(v).replace("\n", "").strip() if v is not None else ""


def cell_text(v):
    """TSV に載せる文字。タブ・改行は貼り先の行と列をずらすので空白にする。"""
    if v is None:
        return ""
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.strftime("%Y/%m/%d")
    return str(v).replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def to_date(v):
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if isinstance(v, str) and v.count("/") == 2:
        y, m, d = (int(x) for x in v.split("/"))
        return datetime.date(y, m, d)
    return None


class MedLayout:
    """仲介会社管理シートのうち、このツールが触る場所。"""

    def __init__(self, ws):
        self.ws = ws
        row2 = {norm(c.value): c.column for c in ws[2] if c.value is not None}
        self.in_col = row2.get("年間流入計")
        if self.in_col is None:
            raise SystemExit(f"{SH_MED}の2行目に「年間流入計」が見つかりません。")
        # 会社の行：月次の流入（L列）に数式が入っている行。現物は行を下へ伸ばしてある
        self.first = B.MED_FIRST
        self.last = max(r for r in range(self.first, ws.max_row + 1)
                        if is_formula(ws.cell(r, B.MED_ATTRS.__len__() + 1).value))
        self.names = {norm(ws.cell(r, 1).value): r for r in range(self.first, self.last + 1)
                      if ws.cell(r, 1).value not in (None, "")}
        inf = [c.column for c in ws[3] if norm(c.value) == "一次情報"]
        self.has_inf = bool(inf)
        used = max([c.column for c in ws[2] if c.value is not None]
                   + [c.column for c in ws[3] if c.value is not None])
        self.inf0 = inf[0] if inf else used + 1
        self.width = len(B.MONTHS) + len(B.MED_INF_TAIL)
        # Googleスプレッドシートの書き出しは列数がシートの枠そのものになる。足りていれば列を足す手順は要らない
        self.need_cols = max(0, self.inf0 + self.width - 1 - ws.max_column)

    def free_rows(self, n):
        rows = [r for r in range(self.first, self.last + 1)
                if self.ws.cell(r, 1).value in (None, "")]
        if len(rows) < n:
            raise SystemExit(f"{SH_MED}の空き行が足りません（数式は{self.last}行目まで）。"
                             "数式の入った行を下へコピーして伸ばしてください。")
        return rows[:n]

    def setup_cells(self):
        """一次情報の列の見出し（2・3行目）と式（4行目〜）を {(行, 列): 値} で返す。"""
        out = {}
        row2, row3 = B.inf_heads()
        for k, (h2, h3) in enumerate(zip(row2, row3)):
            out[(2, self.inf0 + k)] = as_text(norm(h2))
            out[(3, self.inf0 + k)] = h3
        in_cl = get_column_letter(self.in_col)
        for r in range(4, self.last + 1):
            fs = B.inf_formulas(r, self.inf0, in_cl, self.first, self.last, total=(r == 4))
            for k, f in enumerate(fs):
                out[(r, self.inf0 + k)] = f
        return out


class InfLayout:
    """一次情報タブ。まだ無ければ作る前提で、見出しは build_pipeline の並びを使う。"""

    def __init__(self, wb):
        self.exists = B.INF_SH in wb.sheetnames
        self.ws = wb[B.INF_SH] if self.exists else None
        if self.exists:
            hm = head_map(self.ws, B.INF_HEAD)
            missing = [h for h in HEADS if h not in hm]
            if missing:
                raise SystemExit(f"一次情報タブの見出しに {missing} がありません。")
            self.col = {h: hm[h] for h in HEADS}
        else:
            self.col = {h: i for i, h in enumerate(HEADS, start=1)}

    def existing(self):
        """すでに入っている行（No・重複判定のキー）。"""
        if not self.exists:
            return []
        out = []
        for r in range(B.INF_FIRST, self.ws.max_row + 1):
            vals = {h: self.ws.cell(r, c).value for h, c in self.col.items()}
            if all(vals[h] in (None, "") for h in HEADS if h != "No"):
                continue
            out.append((r, vals))
        return out

    def next_row(self):
        rows = [r for r, _ in self.existing()]
        return max(rows) + 1 if rows else B.INF_FIRST


def key(vals):
    d = to_date(vals.get("受信日"))
    return (d, norm(vals.get("仲介会社")), norm(vals.get("件名")), norm(vals.get("案件の要点")))


def plan(layout, spec):
    wb = load_workbook(layout)
    med = MedLayout(wb[SH_MED])
    inf = InfLayout(wb)
    rows = spec.get("rows", [])
    new_brokers = [b for b in spec.get("new_brokers", []) if norm(b) not in med.names]

    unknown_keys = sorted({k for r in rows for k in r if k not in HEADS or k == "No"})
    if unknown_keys:
        raise SystemExit(f"一次情報タブに無い見出し（または No）が rows に含まれています: {unknown_keys}")
    bad = sorted({norm(r.get("仲介会社")) for r in rows}
                 - set(med.names) - {norm(b) for b in new_brokers})
    if bad:
        raise SystemExit("仲介会社管理シートA列に無い仲介会社名があります（略称だと月次集計が0件に"
                         f"なります）。正式名称に直すか、新しい会社なら new_brokers に書いてください: {bad}")
    for r in rows:
        if to_date(r.get("受信日")) is None:
            raise SystemExit(f"受信日が YYYY/MM/DD ではありません: {r}")

    seen = {key(v) for _, v in inf.existing()}
    fresh, dup = [], []
    for r in sorted(rows, key=lambda x: to_date(x["受信日"])):
        (dup if key(r) in seen else fresh).append(r)
        seen.add(key(r))
    nos = [v.get("No") for _, v in inf.existing()]
    start_no = int(max([float(n) for n in nos if isinstance(n, (int, float))], default=0)) + 1
    for i, r in enumerate(fresh):
        r["No"] = start_no + i
    return wb, med, inf, fresh, dup, new_brokers


def tsv_block(out, n, title, cols, rows, label=""):
    """見出し1行のすぐ下にデータだけを置く（見出しの書き方は make_paste_blocks と共通）。"""
    write_head(out, n, title, cols, len(rows), label)
    for vals in rows:
        out.write("\t".join(cell_text(v) for v in vals) + "\n")
    out.write("\n")


def as_text(label):
    """「2026年9月」はGoogleスプレッドシートが日付に変えてしまうので、先頭に ' を付けて文字のまま貼る。"""
    return "'" + label if re.match(r"^\d{4}年\d{1,2}月$", label) else label


def build(layout, spec):
    wb, med, inf, fresh, dup, new_brokers = plan(layout, spec)
    out = io.StringIO()
    out.write("【案件管理表への貼り付け：一次情報】Apps Scriptは使いません。\n")
    out.write(f"一次情報 {len(fresh)}件を追記")
    if dup:
        out.write(f"（すでにタブにある {len(dup)}件は外しました）")
    out.write("。指定セルを1つクリックして貼れば数式は壊れません。\n\n")
    n = 0
    prep = []
    if not inf.exists:
        prep.append(f"シートを1枚追加して、名前を「{B.INF_SH}」にする"
                    "（画面左下の＋ → 新しいタブをダブルクリックして名前を変更）。")
    if not med.has_inf and med.need_cols:
        n_add = med.need_cols
        a, z = get_column_letter(med.inf0), get_column_letter(med.inf0 + med.width - 1)
        last = get_column_letter(med.inf0 + med.width - 1 - n_add)
        prep.append(f"「{SH_MED}」の右端に列を{n_add}列足す（{a}〜{z}列を使う。{last}列の見出しを"
                    f"右クリック →「右に1列挿入」を繰り返すか、{n_add}列を選んで「右に{n_add}列挿入」）。")
    if prep:
        out.write("━━━ 貼る前に（1回だけ）\n")
        for i, t in enumerate(prep, 1):
            out.write(f"  {i}. {t}\n")
        out.write("\n")

    if not inf.exists:
        n += 1
        blank = [""] * (len(HEADS) - 1)
        tsv_block(out, n, f"「{B.INF_SH}」の A1 をクリックして貼る", HEADS,
                  [["一次情報（メルマガを除く）"] + blank, [B.INF_NOTE] + blank, HEADS],
                  "1行目タイトル・2行目説明・3行目見出し")
    if not med.has_inf:
        cells = med.setup_cells()
        cols = [norm(h) for h in B.inf_heads()[0]]
        a = get_column_letter(med.inf0)
        n += 1
        tsv_block(out, n, f"「{SH_MED}」の {a}2 をクリックして貼る（見出し）", cols,
                  [[cells[(r, med.inf0 + k)] for k in range(med.width)] for r in (2, 3)])
        n += 1
        tsv_block(out, n, f"「{SH_MED}」の {a}4 をクリックして貼る（式。{4}〜{med.last}行目）", cols,
                  [[cells[(r, med.inf0 + k)] for k in range(med.width)]
                   for r in range(4, med.last + 1)])
    if new_brokers:
        rows = med.free_rows(len(new_brokers))
        if rows != list(range(rows[0], rows[0] + len(rows))):
            raise SystemExit(f"{SH_MED}の空き行が飛び飛びです: {rows}")
        n += 1
        tsv_block(out, n, f"「{SH_MED}」の A{rows[0]} をクリックして貼る（仲介会社を足す）",
                  ["仲介会社名"], [[b] for b in new_brokers])
    if fresh:
        r0 = inf.next_row()
        n += 1
        tsv_block(out, n, f"「{B.INF_SH}」の A{r0} をクリックして貼る", HEADS,
                  [[r.get(h, "") for h in HEADS] for r in fresh])
    return out.getvalue(), dict(fresh=fresh, dup=dup, new_brokers=new_brokers, blocks=n)


def verify(layout, spec, info, save=None):
    """貼った後の状態を作り、仲介会社管理シートの数式を評価して件数を突き合わせる。"""
    from xlformula import Book, evaluate, Err
    tmp = save or "_inflow_verify.xlsx"
    shutil.copy(layout, tmp)
    wb = load_workbook(tmp)
    med = MedLayout(wb[SH_MED])
    inf = InfLayout(wb)
    if not inf.exists:
        ws = wb.create_sheet(B.INF_SH)
        ws["A1"], ws["A2"] = "一次情報（メルマガを除く）", B.INF_NOTE
        for i, h in enumerate(HEADS, start=1):
            ws.cell(B.INF_HEAD, i, h)
        inf = InfLayout(wb)
    if not med.has_inf:
        for (r, c), v in med.setup_cells().items():
            # 先頭の ' は「文字として貼る」の印で、Googleスプレッドシートはセルに残さない
            med.ws.cell(r, c).value = v[1:] if isinstance(v, str) and v.startswith("'") else v
        med = MedLayout(wb[SH_MED])
    for r, b in zip(med.free_rows(len(info["new_brokers"])), info["new_brokers"]):
        med.ws.cell(r, 1).value = b
    med = MedLayout(wb[SH_MED])
    r0 = inf.next_row()
    for i, row in enumerate(info["fresh"]):
        for h in HEADS:
            v = row.get(h, "")
            if v in ("", None):
                continue
            inf.ws.cell(r0 + i, inf.col[h]).value = to_date(v) if h == "受信日" else v
    wb.save(tmp)

    wb = load_workbook(tmp)
    ws = wb[SH_MED]
    last_inf = max(B.INF_FIRST, InfLayout(wb).next_row())
    bk = Book(wb, maxrow=max(last_inf, med.last, 1100) + 5)
    fails, errs = [], collections.Counter()
    vals = {}
    # このツールが書く列（一次情報の14列）と、ネームクリア率が引く年間流入計だけを評価する。
    # 条件合致の列は案件管理の倍率の式を毎回引き直すので、全部評価すると数分かかる
    cols = [med.in_col] + list(range(med.inf0, med.inf0 + med.width))
    for r in range(4, med.last + 1):
        for c in cols:
            v = ws.cell(r, c).value
            if is_formula(v):
                try:
                    vals[(r, c)] = evaluate(bk, SH_MED, v)
                except Err as e:
                    errs[e.kind.split(" ")[0]] += 1
            elif c != med.in_col:
                fails.append(f"{SH_MED}!{get_column_letter(c)}{r} に式が入っていない")
    if errs:
        fails.append(f"{SH_MED}の数式エラー {dict(errs)}")

    # 期待値：タブに入っている全行（既存＋今回）を Python で数える
    want = collections.Counter()
    for _, v in InfLayout(wb).existing():
        d = to_date(v.get("受信日"))
        if d:
            want[(norm(v.get("仲介会社")), d.year, d.month)] += 1
    months = B.MONTHS
    table = []
    for name, r in sorted(med.names.items(), key=lambda x: x[1]):
        got = [vals.get((r, med.inf0 + k)) for k in range(len(months))]
        exp = [float(want[(name, y, m)]) for y, m in months]
        if got != exp:
            fails.append(f"{name}: sheet {got} want {exp}")
        ann = vals.get((r, med.inf0 + len(months)))
        rate = vals.get((r, med.inf0 + len(months) + 1))
        inflow = vals.get((r, med.in_col))
        if ann:
            table.append((name, got, ann, inflow, rate))
    outside = sum(n for (nm, y, m), n in want.items() if (y, m) not in months)
    tot = [vals.get((4, med.inf0 + k)) for k in range(med.width)]
    print(f"検証：{SH_MED}の数式エラー {sum(errs.values())}件／"
          f"仲介会社×月の不一致 {len([f for f in fails if ':' in f])}件"
          + (f"／月次の対象外（{months[0][0]}/{months[0][1]}より前など）{outside}件" if outside else ""))
    labels = [f"{m}月" for _, m in months]
    used_m = [k for k in range(len(months)) if tot[k]]
    print("  仲介会社".ljust(26) + "".join(labels[k].rjust(6) for k in used_m)
          + "  年間  流入  ネームクリア率")
    for name, got, ann, inflow, rate in table:
        r = f"{rate:.0%}" if isinstance(rate, float) else "－"
        print("  " + name[:22].ljust(24) + "".join(f"{int(got[k]):6d}" for k in used_m)
              + f"{int(ann):6d}{int(inflow or 0):6d}  {r}")
    r = f"{tot[-1]:.0%}" if isinstance(tot[-1], float) else "－"
    print("  " + "全社合計".ljust(24) + "".join(f"{int(tot[k]):6d}" for k in used_m)
          + f"{int(tot[len(months)]):6d}{int(vals.get((4, med.in_col)) or 0):6d}  {r}")
    if not save:
        os.remove(tmp)
    return fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", required=True, help="ドライブの現物をダウンロードした xlsx")
    ap.add_argument("--rows", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--save", help="検証に使った貼り付け後の状態を残す xlsx")
    a = ap.parse_args()
    spec = json.load(open(a.rows, encoding="utf-8"))
    text, info = build(a.layout, spec)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"ブロック {info['blocks']}個 → {a.out}（追記 {len(info['fresh'])}件"
          + (f"、重複で外した {len(info['dup'])}件" if info["dup"] else "") + "）")
    if a.verify:
        fails = verify(a.layout, spec, info, save=a.save)
        print("失敗:", len(fails))
        for f in fails:
            print("  -", f)
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
