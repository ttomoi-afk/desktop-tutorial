#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""譲渡価格ではなく「買収当日にいくら用意するか」を積み上げる。

  python3 cash_need.py deal.json

譲渡価格は支出の一部でしかない。実際に動く金は次の差で決まる。

  出ていく  株式取得対価 ＋ 承継コスト ＋ 譲渡時に返済する借入 ＋ 承継直後の追加資金
  戻ってくる  対象会社の余剰現預金 ＋ 譲渡対象から外す非事業資産
  ───────────────────────────────────────
  ネット所要資金 − 買収借入 ＝ TE自己資金拠出額   ← No.1-2 の4億円と比べる数字

簿価NetCash の1本値からはこの表は作れない。現預金と有利子負債を分けて持つこと。
同じ NetCash でも「現金200・借入0」と「現金1,200・借入1,000」では、当日用意する額も
個人保証の解除可否も別物になる。

入力キー（すべて百万円。分からないものはキーごと省略する）
  equity_price      株式取得対価（譲渡価格）
  sales             直近期売上（min_cash の既定値に使う）
  cash              現預金
  debt              有利子負債の総額
  debt_repay        うち譲渡時に返済する額（省略＝全額返済）
  min_cash          対象会社に残す手元資金（省略＝月商1ヶ月）
  deal_cost         承継コスト（省略＝レーマン＋DDで概算）
  broker_fee_min    仲介の最低手数料（既定20）
  dd_cost           DD費用（省略＝規模から概算）
  wc_injection      承継直後に積み増す運転資金
  capex_1y          承継後1年の設備更新投資
  other_day1        その他の初期費用（システム統合・名義変更 等）
  real_estate       不動産の簿価（土地＋建物）
  real_estate_fv    不動産の時価（省略＝簿価）
  non_op_assets     譲渡対象から外す／売却できる非事業資産
  contingent        [["名目", 金額], ...] 簿外・偶発債務（本体には足さず別掲）
  debt_financing    買収借入（調達予定額）
  ltv               不動産の担保掛目（既定0.7）
  cap_rate          セール＆リースバック時の利回り（既定0.06）
"""
import json
import sys

TE_LIMIT = 400.0            # No.1-2 のTE拠出額上限（百万円）
DEFAULT_BROKER_MIN = 20.0
DEFAULT_LTV = 0.7
DEFAULT_CAP_RATE = 0.06


def lehman(amount):
    """レーマン方式の概算（取引金額ベース）。単位は百万円。"""
    bands = [(500, 0.05), (1000, 0.04), (5000, 0.03), (10000, 0.02)]
    fee, prev = 0.0, 0.0
    for cap, rate in bands:
        if amount <= prev:
            break
        fee += (min(amount, cap) - prev) * rate
        prev = cap
    if amount > prev:
        fee += (amount - prev) * 0.01
    return fee


def dd_estimate(amount):
    """財務・税務・法務DDの概算。規模にゆるく連動させる。"""
    if amount <= 300:
        return 10.0
    if amount <= 1000:
        return 20.0
    if amount <= 3000:
        return 30.0
    return 45.0


def get(d, key, default=None):
    v = d.get(key)
    return default if v is None else v


def build(d):
    """所要資金のはしごを (行のリスト, 要約dict) で返す。"""
    price = get(d, "equity_price")
    notes = []

    # --- 承継コスト -------------------------------------------------
    if "deal_cost" in d and d["deal_cost"] is not None:
        cost = float(d["deal_cost"])
        cost_note = "提示値"
    elif price is not None:
        fee = max(lehman(price), get(d, "broker_fee_min", DEFAULT_BROKER_MIN))
        dd = get(d, "dd_cost", dd_estimate(price))
        cost = fee + dd
        cost_note = (f"概算：仲介手数料{fee:,.0f}（レーマン{lehman(price):,.1f}と"
                     f"最低{get(d, 'broker_fee_min', DEFAULT_BROKER_MIN):,.0f}の大きい方）"
                     f"＋DD等{dd:,.0f}")
        notes.append("承継コストは概算。仲介ごとに最低手数料・着手金・中間金が異なるので要確認")
    else:
        cost, cost_note = None, "株式取得対価が未確定のため算出不可"

    # --- 譲渡時に返済する借入 ---------------------------------------
    debt = get(d, "debt")
    if debt is None:
        repay, repay_note = None, "有利子負債の額が未確認"
    else:
        repay = get(d, "debt_repay", debt)
        repay_note = ("全額返済の前提" if repay == debt
                      else f"有利子負債{debt:,.0f}のうち返済分")

    # --- 対象会社に残す手元資金と、抜ける余剰現預金 ------------------
    cash = get(d, "cash")
    sales = get(d, "sales")
    if "min_cash" in d and d["min_cash"] is not None:
        min_cash, mc_note = float(d["min_cash"]), "提示値"
    elif sales:
        min_cash, mc_note = sales / 12.0, f"既定：月商1ヶ月（売上{sales:,.0f}÷12）"
    else:
        min_cash, mc_note = None, "売上が不明で既定値を置けない"
    if cash is None or min_cash is None:
        surplus, sur_note = None, "現預金または必要手元資金が未確認"
    else:
        surplus = max(0.0, cash - min_cash)
        sur_note = f"現預金{cash:,.0f} − 残す手元資金{min_cash:,.0f}"
        if cash < min_cash:
            notes.append(f"現預金{cash:,.0f}が必要手元資金{min_cash:,.0f}に届かない。"
                         f"承継直後に{min_cash - cash:,.0f}の資金注入が要る")

    rows = [
        ("① 株式取得対価", price, get(d, "price_note", "")),
        ("② 承継コスト", cost, cost_note),
        ("③ 譲渡時に返済する借入", repay, repay_note),
        ("④ 運転資金の積み増し", get(d, "wc_injection"), ""),
        ("⑤ 承継後1年の設備更新投資", get(d, "capex_1y"), ""),
        ("⑥ その他の初期費用", get(d, "other_day1"), ""),
        ("⑦ 余剰現預金（戻り）", None if surplus is None else -surplus, sur_note),
        ("⑧ 非事業資産の売却（戻り）", None if get(d, "non_op_assets") is None
         else -float(d["non_op_assets"]), ""),
    ]

    out_rows = [r for r in rows if r[0][0] in "①②③④⑤⑥"]
    back_rows = [r for r in rows if r[0][0] in "⑦⑧"]
    gross_known = [v for _, v, _ in out_rows if v is not None]
    back_known = [v for _, v, _ in back_rows if v is not None]
    gross = sum(gross_known) if gross_known else None
    recover = sum(back_known) if back_known else 0.0
    known = [v for _, v, _ in rows if v is not None]
    net = sum(known) if known else None
    missing = [lbl for lbl, v, _ in rows if v is None and lbl.startswith(("①", "②", "③", "⑦"))]

    fin = get(d, "debt_financing")
    te = None if net is None else net - (fin or 0.0)

    summary = {
        "gross": gross, "recover": recover,
        "net": net, "te": te, "fin": fin, "missing": missing,
        "cash": cash, "min_cash": min_cash, "debt": debt, "repay": repay,
        "notes": notes,
    }
    return rows, summary


def realestate_block(d, summary):
    """不動産を持つ案件の3つの持ち方と、現金への効き方。"""
    re_bv = get(d, "real_estate")
    if not re_bv:
        return []
    fv = get(d, "real_estate_fv", re_bv)
    ltv = get(d, "ltv", DEFAULT_LTV)
    cap = get(d, "cap_rate", DEFAULT_CAP_RATE)
    out = [
        ("(a) そのまま承継", 0.0,
         f"所要資金は変わらない。時価{fv:,.0f}の担保余力 約{fv * ltv:,.0f}"
         f"（掛目{ltv:.0%}）が買収借入の裏付けになる"),
        ("(b) 譲渡対象から外す", -fv,
         f"オーナー保有のまま賃借。株式価値を{fv:,.0f}下げられるが、"
         f"年{fv * cap:,.1f}の賃料（利回り{cap:.0%}想定）が実態EBITDAから落ちる"),
        ("(c) 承継後にセール＆リースバック", -fv,
         f"売却代金{fv:,.0f}を回収。同じく年{fv * cap:,.1f}の賃料負担。"
         f"譲渡所得への課税と、金融機関の担保解除の同意が要る"),
    ]
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    rows, s = build(d)

    print(f"■ {d.get('name', '(案件名未設定)')}   単位：百万円")
    print()
    print("■ 買収に必要な金額（所要資金のはしご）")
    w = max(len(r[0]) for r in rows)
    for lbl, v, note in rows:
        val = "　　─ 未確認" if v is None else f"{v:>12,.1f}"
        print(f"  {lbl:<{w}} {val}   {note}")
    print("  " + "─" * 86)
    if s["gross"] is not None:
        print(f"  {'【A】譲渡日に用意する額':<{w}} {s['gross']:>12,.1f}   "
              f"①〜⑥の合計。⑦⑧の回収はこの後なので、当日はこの額が要る")
    if s["net"] is None:
        print("  ネット所要資金　　　　　　　　─ 未確認")
    else:
        tag = "（未確認の項目があるため下限値）" if s["missing"] else ""
        if s["recover"]:
            print(f"  {'　− 承継後に回収できる分':<{w}} {s['recover']:>12,.1f}   ⑦＋⑧")
        print(f"  {'【B】ネット所要資金':<{w}} {s['net']:>12,.1f}   {tag}")
        if s["fin"]:
            print(f"  {'　− 買収借入':<{w}} {-s['fin']:>12,.1f}")
        print(f"  {'TE自己資金拠出額':<{w}} {s['te']:>12,.1f}   "
              f"No.1-2の上限{TE_LIMIT:,.0f}に対し "
              + ("収まる" if s["te"] <= TE_LIMIT
                 else f"{s['te'] - TE_LIMIT:,.0f} 超過"))
        if s["te"] > TE_LIMIT:
            need = s["te"] - TE_LIMIT
            print(f"  {'　（4億円に収めるのに要る借入）':<{w}} {need:>12,.1f}")
    if s["missing"]:
        print(f"  ※ 未確認：{'、'.join(s['missing'])}")

    re_rows = realestate_block(d, s)
    if re_rows:
        print()
        print("■ 不動産の持ち方による差")
        w2 = max(len(r[0]) for r in re_rows)
        for lbl, v, note in re_rows:
            print(f"  {lbl:<{w2}} {v:>+10,.1f}   {note}")

    cont = d.get("contingent") or []
    if cont:
        print()
        print("■ 簿外・偶発債務（本体に足していない。顕在化すれば上乗せ）")
        w3 = max(len(c[0]) for c in cont)
        for name, amt in cont:
            print(f"  {name:<{w3}} {amt:>12,.1f}")
        print(f"  {'小計':<{w3}} {sum(a for _, a in cont):>12,.1f}")

    if s["notes"]:
        print()
        print("■ 注意")
        for n in s["notes"]:
            print(f"  ・{n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
