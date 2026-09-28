#!/usr/bin/env python3
"""案件概要書から拾った数字を ◯△× に落とし、総合判定まで出す。

  python3 score.py deal.json            # 表で出す
  python3 score.py deal.json --json     # 貼り付け用 JSON も出す

未確認の項目は JSON のキーごと省略する。0 を入れると「ゼロという事実」として
判定されてしまう。省略したものは － （判定不能）になり、分母から外れる。
金額の単位は百万円で統一する（rubric の閾値は億円表記だが内部は百万円）。
"""
import json
import sys

GRADES = ["◯", "△〜◯", "△", "×〜△", "×"]
SCORE = {"◯": 2.0, "△〜◯": 1.5, "△": 1.0, "×〜△": 0.5, "×": 0.0}
MUST = {"1-1", "1-2", "2", "5"}
UNKNOWN = "－"


def band(value, cuts, ascending_is_good=False):
    """cuts = 4 個の境界。value <= cuts[i] の最初の i の評価を返す。

    既定は「小さいほど良い」。cuts は昇順で ◯/△〜◯/△/×〜△ の上限。
    """
    for i, c in enumerate(cuts):
        if value <= c:
            return GRADES[i]
    return GRADES[4]


def band_desc(value, cuts):
    """「大きいほど良い」指標。cuts は降順で ◯/△〜◯/△/×〜△ の下限。"""
    for i, c in enumerate(cuts):
        if value >= c:
            return GRADES[i]
    return GRADES[4]


def has(d, *keys):
    return all(k in d and d[k] is not None for k in keys)


def ev_calc(d):
    """(実質NetCash, EV, 承継コスト, ①EV/EBITDA, ②(EV+承継コスト)/EBITDA) か None。

    投資条件タブの定義そのまま:
      実質NetCash = 簿価NetCash − 平均必要運転資金  （マイナスなら実質NetDebt）
      EV          = 譲渡価格（株式価値） − 実質NetCash
    """
    if not (has(d, "equity_price", "ebitda", "book_net_cash", "avg_wc")
            and d["ebitda"] > 0):
        return None
    real_nc = d["book_net_cash"] - d["avg_wc"]
    ev = d["equity_price"] - real_nc
    cost = d.get("deal_cost", 0)
    return real_nc, ev, cost, ev / d["ebitda"], (ev + cost) / d["ebitda"]


def book_multiple(d):
    """運転資金を調整しない簿価NetDebtベースの倍率。仲介側の提示値と突き合わせる用。"""
    if not (has(d, "equity_price", "ebitda", "book_net_cash") and d["ebitda"] > 0):
        return None
    return (d["equity_price"] - d["book_net_cash"]) / d["ebitda"]


def judge(d):
    """定量6項目を判定。戻りは {no: (評価, 根拠1行)}。"""
    out = {}

    # --- 1-2 TE拠出額 4億円以下か -------------------------------------
    if has(d, "equity_price"):
        cost = d.get("deal_cost", 0)
        if "debt_financing" in d and d["debt_financing"] is not None:
            te = d["equity_price"] + cost - d["debt_financing"]
            g = band(te, [300, 400, 450, 500])
            out["1-2"] = (g, f"TE拠出額 {te:,.0f}百万円"
                             f"（株式価値{d['equity_price']:,.0f}＋承継コスト{cost:,.0f}"
                             f"−借入{d['debt_financing']:,.0f}）")
        else:
            # 借入未定。株式価値のみで4億超なら借入前提でも厳しい
            bare = d["equity_price"] + cost
            if bare > 400:
                out["1-2"] = (GRADES[3], f"買収借入が未定。株式価値＋承継コストのみで"
                                         f"{bare:,.0f}百万円（4億円超）")
            else:
                out["1-2"] = (UNKNOWN, f"買収借入が未定。株式価値＋承継コスト"
                                       f"{bare:,.0f}百万円（借入次第で4億円以下に収まる）")
    else:
        out["1-2"] = (UNKNOWN, "希望株式価値の記載なし")

    # --- 1-3 非キャッシュ性資産の重さ ---------------------------------
    if has(d, "ebitda") and d["ebitda"] > 0 and ("ppe" in d or "inventory" in d):
        heavy = d.get("ppe", 0) + d.get("inventory", 0)
        mult = heavy / d["ebitda"]
        g = band(mult, [2.0, 3.0, 5.0, 8.0])
        out["1-3"] = (g, f"(有形固定資産{d.get('ppe',0):,.0f}＋棚卸{d.get('inventory',0):,.0f})"
                         f"÷実態EBITDA{d['ebitda']:,.0f} = {mult:.1f}倍")
    else:
        out["1-3"] = (UNKNOWN, "有形固定資産／棚卸資産または実態EBITDAの記載なし")

    # --- 2 安定黒字か --------------------------------------------------
    e3 = d.get("ebitda_3y")
    if e3 and len(e3) == 3 and all(v is not None for v in e3):
        neg = sum(1 for v in e3 if v <= 0)
        seq = "→".join(f"{v:,.0f}" for v in e3)
        if neg >= 2:
            out["2"] = (GRADES[4], f"実態EBITDA {seq}（{neg}期赤字）")
        elif neg == 1:
            out["2"] = (GRADES[3], f"実態EBITDA {seq}（1期赤字）")
        elif e3[2] >= max(e3):
            out["2"] = (GRADES[0], f"実態EBITDA {seq}（3期連続黒字・増加基調）")
        elif e3[2] >= max(e3) * 0.9:
            out["2"] = (GRADES[1], f"実態EBITDA {seq}（3期連続黒字・横ばい）")
        elif e3[2] <= e3[1] * 0.8:
            out["2"] = (GRADES[2], f"実態EBITDA {seq}（3期連続黒字だが直近前期比"
                                   f"{(e3[2]/e3[1]-1)*100:+.0f}%）")
        else:
            out["2"] = (GRADES[1], f"実態EBITDA {seq}（3期連続黒字）")
    else:
        out["2"] = (UNKNOWN, "3期分の実態EBITDAが揃わない")

    # --- 3 粗利率 3期連続30%以上か ------------------------------------
    gm = d.get("gross_margin_3y")
    if gm and len(gm) == 3 and all(v is not None for v in gm):
        avg = sum(gm) / 3
        seq = "→".join(f"{v:.1f}%" for v in gm)
        below = sum(1 for v in gm if v < 30)
        drop = gm[0] - gm[2]
        if avg < 20 or drop >= 5:
            why = "3期平均20%未満" if avg < 20 else f"3期で{drop:.1f}pt低下"
            out["3"] = (GRADES[4], f"粗利率 {seq}（{why}）")
        elif avg < 25:
            out["3"] = (GRADES[3], f"粗利率 {seq}（3期平均{avg:.1f}%）")
        elif avg < 30:
            out["3"] = (GRADES[2], f"粗利率 {seq}（3期平均{avg:.1f}%）")
        elif below == 0:
            out["3"] = (GRADES[0], f"粗利率 {seq}（3期すべて30%以上）")
        else:
            out["3"] = (GRADES[1], f"粗利率 {seq}（3期平均{avg:.1f}%・{below}期が30%未満）")
    else:
        out["3"] = (UNKNOWN, "3期分の粗利率が揃わない")

    # --- 5 価格は割高ではないか ----------------------------------------
    ev_parts = ev_calc(d)
    if ev_parts:
        real_nc, ev, cost, m1, m2 = ev_parts
        g = band(m2, [5.0, 6.0, 7.0, 8.0])
        # 実質NetCash はマイナスなら NetDebt。符号を文言側に吸わせて
        # 「−実質NetDebt-407」のような二重否定を出さない。
        if real_nc >= 0:
            nc = f"−実質NetCash{real_nc:,.0f}"
        else:
            nc = f"＋実質NetDebt{-real_nc:,.0f}"
        out["5"] = (g, f"①EV/EBITDA {m1:.1f}倍／②(EV＋承継コスト)/EBITDA {m2:.1f}倍"
                       f"（EV {ev:,.0f}＝株式価値{d['equity_price']:,.0f}{nc}"
                       f"、承継コスト{cost:,.0f}）")
    else:
        missing = [k for k in ("equity_price", "ebitda", "book_net_cash", "avg_wc")
                   if not has(d, k)]
        out["5"] = (UNKNOWN, "EV算出に必要な項目が不足："
                             + "／".join({"equity_price": "希望株式価値",
                                          "ebitda": "実態EBITDA",
                                          "book_net_cash": "簿価NetCash",
                                          "avg_wc": "平均必要運転資金"}[k]
                                         for k in missing))

    # --- 11 特定取引先への依存 -----------------------------------------
    c = d.get("top_customer_pct")
    s = d.get("top_supplier_pct")
    vals = [(v, lbl) for v, lbl in ((c, "上位顧客"), (s, "上位仕入先")) if v is not None]
    if vals:
        worst, lbl = max(vals)
        g = band(worst, [10, 20, 30, 50])
        detail = "／".join(f"{l} {v:.0f}%" for v, l in vals)
        out["11"] = (g, f"{detail}（判定は{lbl} {worst:.0f}%）")
    else:
        out["11"] = (UNKNOWN, "上位取引先の集中度の記載なし")

    return out


SALES_MIN, SALES_MAX = 300, 3000     # 売上目安（百万円）。投資条件友井タブ No.20／仲介向け資料P10


def summary(d):
    """譲渡価格・EBITDA・EV/EBITDAマルチプル・売上 の4項目を組み立てる。

    戻りは (表示行のリスト, 貼り付け用の4値) 。値が取れないものは '－'。
    """
    na = "－"
    rows, tsv = [], []

    # 譲渡価格（株式価値）
    if has(d, "equity_price"):
        note = d.get("price_note", "")
        rows.append(("譲渡価格", f"{d['equity_price']:,.1f}", note))
        tsv.append(f"{d['equity_price']:,.1f}")
    else:
        rows.append(("譲渡価格", na, "希望価格の記載なし"))
        tsv.append(na)

    # 実態EBITDA（直近期）
    if has(d, "ebitda"):
        rows.append(("実態EBITDA", f"{d['ebitda']:,.1f}", ""))
        tsv.append(f"{d['ebitda']:,.1f}")
    else:
        rows.append(("実態EBITDA", na, "実態EBITDAの記載なし"))
        tsv.append(na)

    # EV/EBITDAマルチプル
    ev_parts = ev_calc(d)
    if ev_parts:
        real_nc, ev, cost, m1, m2 = ev_parts
        nc = (f"実質NetCash {real_nc:,.1f}" if real_nc >= 0
              else f"実質NetDebt {-real_nc:,.1f}")
        rows.append(("EV/EBITDAマルチプル", f"{m1:.1f}倍",
                     f"TE定義：EV {ev:,.1f}（{nc}）÷ EBITDA"))
        tsv.append(f"{m1:.1f}")
        if cost:
            rows.append(("", f"{m2:.1f}倍", f"②承継コスト{cost:,.1f}加味後（評価5の判定基準）"))
    else:
        if has(d, "ebitda") and d["ebitda"] <= 0:
            why = "実態EBITDAが0以下のため倍率を算出できない"
        else:
            why = ("譲渡価格／実態EBITDA／簿価NetCash／平均必要運転資金のうち "
                   + "／".join({"equity_price": "譲渡価格", "ebitda": "実態EBITDA",
                                "book_net_cash": "簿価NetCash",
                                "avg_wc": "平均必要運転資金"}[k]
                               for k in ("equity_price", "ebitda",
                                         "book_net_cash", "avg_wc")
                               if not has(d, k)) + " が不足")
        rows.append(("EV/EBITDAマルチプル", na, why))
        tsv.append(na)
    bm = book_multiple(d)
    if bm is not None:
        rows.append(("", f"{bm:.1f}倍", "参考：簿価NetDebtベース（運転資金の調整なし）"))

    # 売上（直近期）。売上目安 300〜3,000 の範囲チェックを添える
    sales = d.get("sales")
    if sales is None and d.get("sales_3y"):
        s3 = [v for v in d["sales_3y"] if v is not None]
        sales = s3[-1] if s3 else None
    if sales is not None:
        if sales < SALES_MIN:
            j = f"売上目安 {SALES_MIN:,}〜{SALES_MAX:,} の下限未満（投資条件友井 No.20 で対象外）"
        elif sales > SALES_MAX:
            j = f"売上目安 {SALES_MIN:,}〜{SALES_MAX:,} の上限超（投資条件友井 No.20 で対象外）"
        else:
            j = f"売上目安 {SALES_MIN:,}〜{SALES_MAX:,} の範囲内"
        rows.append(("売上", f"{sales:,.1f}", j))
        tsv.append(f"{sales:,.1f}")
    else:
        rows.append(("売上", na, "売上高の記載なし"))
        tsv.append(na)

    return rows, tsv


LABELS = {
    "1-1": "投資ポリシー／業種ターゲットとの整合",
    "1-2": "投資ポリシー／TE拠出額4億円以下",
    "1-3": "投資ポリシー／非キャッシュ性資産",
    "2": "安定黒字か",
    "3": "付加価値は高いか",
    "4": "永続性は高いか",
    "5": "価格は割高ではないか",
    "8-1": "ボラティリティ／ストック型かフロー型か",
    "8-2": "ボラティリティ／流行り廃りはあるか",
    "9": "売却理由",
    "11": "特定取引先に依存していないか",
    "12": "特定人材に依存していないか",
}
ORDER = ["1-1", "1-2", "1-3", "2", "3", "4", "5", "8-1", "8-2", "9", "11", "12"]
QUALITATIVE = ["1-1", "4", "8-1", "8-2", "9", "12"]


def total(grades):
    """grades = {no: 評価}。12項目そろっていなくても計算する。"""
    judged = [g for g in grades.values() if g in SCORE]
    pts = sum(SCORE[g] for g in judged)
    n = len(judged)
    rate = pts / (n * 2) if n else 0.0
    nx = sum(1 for g in judged if g == "×")
    must_x = [k for k, g in grades.items() if k in MUST and g == "×"]
    if n == 0:
        verdict = "未入力（評価が1つも入っていない）"
    elif must_x:
        verdict = f"C：見送り（Must項目 {'・'.join(sorted(must_x))} が ×）"
    elif nx >= 2:
        verdict = f"C：見送り（× が {nx} 項目）"
    elif n < 6:
        verdict = f"B：追加情報を取得して再判定（判定できたのは {n} 項目のみ・情報量不足）"
    elif nx == 0 and rate >= 0.75:
        verdict = "A：進める（トップ面談・基本合意検討へ）"
    else:
        verdict = "B：追加情報を取得して再判定"
    return pts, n, rate, verdict


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    quant = judge(d)
    manual = d.get("qualitative", {})

    grades, reasons = {}, {}
    for no in ORDER:
        if no in quant:
            grades[no], reasons[no] = quant[no]
        elif no in manual:
            v = manual[no]
            grades[no] = v[0] if isinstance(v, (list, tuple)) else v
            reasons[no] = v[1] if isinstance(v, (list, tuple)) and len(v) > 1 else ""
        else:
            grades[no], reasons[no] = UNKNOWN, "（定性項目・未入力）"

    print(f"■ {d.get('name', '(案件名未設定)')}   単位：百万円")
    print()
    print("■ 数値サマリー（管理表転記用）")
    srows, stsv = summary(d)
    lw = max(len(r[0]) for r in srows)
    for label, val, note in srows:
        print(f"  {label:<{lw}}  {val:>10}   {note}")
    print("  貼り付け用 → 譲渡価格 / EBITDA / EV\u002fEBITDAマルチプル / 売上")
    print("  " + "\t".join(stsv))
    print()

    w = max(len(LABELS[n]) for n in ORDER)
    print("-" * 100)
    for no in ORDER:
        mark = "★" if no in MUST else "　"
        tag = "定量" if no in quant else "定性"
        print(f"{mark}{no:<4}{tag} {LABELS[no]:<{w}}  {grades[no]:<5}  {reasons[no]}")
    print("-" * 100)
    pts, n, rate, verdict = total(grades)
    print(f"得点 {pts:.1f} / 判定済 {n}項目 / 達成率 {rate:.0%}")
    print(f"総合判定  {verdict}")
    unknown = [no for no in ORDER if grades[no] == UNKNOWN]
    if unknown:
        print(f"要確認（－）  {'、'.join(unknown)}")
    print("★ = Must項目（× が1つでも付けば総合C）")

    if "--json" in sys.argv:
        print("\n" + json.dumps(
            {"name": d.get("name"), "verdict": verdict, "rate": round(rate, 3),
             "summary": dict(zip(["譲渡価格", "EBITDA", "EV/EBITDAマルチプル", "売上"], stsv)),
             "rows": [{"no": no, "軸": LABELS[no], "評価": grades[no],
                       "根拠": reasons[no]} for no in ORDER]},
            ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
