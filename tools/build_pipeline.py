# -*- coding: utf-8 -*-
"""案件管理表を生成する。案件管理と初期検討を1タブに統合した版。

タブ構成
  案件管理  1行=1案件。企業名・事業内容＋数値＋青塗り12項目の◯△×＋判定＋進行
  判定基準  ルーブリックの閾値（参照用）
  選択肢    ドロップダウンの元データ
"""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule, FormulaRule

FONT = "Arial"
INK, GREY = "141414", "6D6D6F"
BLUE_TXT = "0000FF"
HDR_FILL = PatternFill("solid", fgColor="CFE2F3")
IN_FILL = PatternFill("solid", fgColor="FFFDE7")
CALC_FILL = PatternFill("solid", fgColor="F3F3F3")
TITLE_F = Font(name=FONT, size=14, bold=True, color=INK)
HDR_F = Font(name=FONT, size=9, bold=True, color=INK)
BAND_F = Font(name=FONT, size=9, bold=True, color="FFFFFF")
BODY_F = Font(name=FONT, size=10, color=INK)
NOTE_F = Font(name=FONT, size=9, color=GREY)
thin = Side(style="thin", color="BFBFBF")
med = Side(style="medium", color="9E9E9E")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

MULT_H = "EV/EBITDA\nマルチプル"      # 見出しは2行だが f-string 内で使うので別名にする
REF_H = "参考：簿価\nベース倍率"
WC_H = "平均必要\n運転資金"

BAND_ROW, HEAD_ROW = 3, 4
FIRST, LAST = 5, 104            # 5=記入例 6=実案件 7〜104=入力用
GRADE_LIST = "◯,△〜◯,△,×〜△,×,－"
GRADE_COLORS = [("◯", "B7E1CD"), ("△〜◯", "D9EAD3"), ("△", "FFF2CC"),
                ("×〜△", "FCE5CD"), ("×", "F4C7C3"), ("－", "EFEFEF")]
SALES_MIN, SALES_MAX = 300, 3000

INTERMEDIARIES = [
    "M&Aクラウド", "レコフ", "たすき", "インクグロウ", "シェアモル", "ゴエンキャピタル",
    "ソーシング・ブラザーズ", "M&Aロイヤル", "Innovation M&A", "M&Aフォース", "Byside",
    "NEWOLD CAPITAL", "リンクタイズワークス", "M&Aサクシード", "スピカコンサルティング",
    "アイコンキャピタル", "fundbook", "maXアドバイザリー", "ウィルゲート", "バディーズ",
    "M&A総合研究所", "M&A承継機構", "名南M&A", "HCフィナンシャル",
    "M&Aキャピタルパートナーズ", "Anyglo", "M&A Lead", "プレックス", "ストライク",
    "インテグループ", "オンデック", "M&A開発支援", "ブティックス", "M&Aプロパティーズ",
]
SECTORS = ["重点①シニア", "重点②AI・DXで伸ばせる業種", "重点③エネルギー関連",
           "追加A群（狙える逆張り）", "追加B群（化けるが罠が多い・要選別）",
           "追加C群（構造的にNG寄り・見送り推奨）", "NG業種7カテゴリ", "その他"]
STATUS = ["未着手", "初期検討中", "追加情報待ち", "NDA締結", "トップ面談", "意向表明",
          "基本合意", "DD", "最終契約", "クロージング", "見送り", "先方都合で終了"]

# 12項目: (短い見出し, 吹き出しに出す評価軸と基準, Must か)
ITEMS = [
    ("1-1", "投資ポリシーとの合致／業種ターゲットとの整合\n"
            "◯ 重点業種①②③に直接該当／△ 追加B群で罠を回避できる形／× NG業種7カテゴリ・追加C群", True),
    ("1-2", "投資ポリシーとの合致／4億円以下のTE拠出額で承継できるか\n"
            "◯ 3.0億円以下／△ 4.0〜4.5億円／× 5.0億円超", True),
    ("1-3", "投資ポリシーとの合致／非キャッシュ性資産が重くないか\n"
            "（有形固定資産＋棚卸）÷実態EBITDA　◯ 2.0倍以下／△ 3.0〜5.0倍／× 8.0倍超", False),
    ("2", "安定黒字か／実態EBITDAが3期連続黒字か\n"
          "◯ 3期連続黒字かつ増加基調／△ 直近が前期比▲20%以上／× 2期以上赤字", True),
    ("3", "付加価値は高いか／3期連続で粗利率30%以上か\n"
          "◯ 3期すべて30%以上／△ 3期平均25〜30%／× 3期平均20%未満・5pt以上低下", False),
    ("4", "永続性は高いか／市場は10年後も残り続けるか\n"
          "◯ 人口動態・法定需要が後押し／△ 横ばい・代替技術の影響が読めない／× 構造的に消える", False),
    ("5", "価格は割高ではないか／②(EV＋承継コスト)/EBITDA\n"
          "EV＝譲渡価格−実質NetCash（＝簿価NetCash−平均必要運転資金）\n"
          "◯ 5.0倍以下／△ 6.0〜7.0倍／× 8.0倍超", True),
    ("8-1", "事業ボラティリティは低いか／ストック型かフロー型か\n"
            "◯ ストック比率70%以上／△ リピート中心だが契約なし／× スポット・案件単位が主", False),
    ("8-2", "事業ボラティリティは低いか／流行り廃りはあるか\n"
            "◯ 生活必需・法定需要／△ 一部商材がトレンド依存／× 嗜好・流行・立地が売上を左右", False),
    ("9", "売却理由／隠された大きなリスクは無いか\n"
          "◯ 高齢・後継者不在で業績と整合／△ 理由が一般的で裏付け不足／× 業績悪化・係争の兆候と符合", False),
    ("11", "特定取引先に依存していないか／上位1社の売上比率・仕入比率（悪い方）\n"
           "◯ 10%未満／△ 20〜30%／× 50%以上・代替不能な単一発注先", False),
    ("12", "特定人材に依存していないか／依存人材の代替可能性\n"
           "◯ 社長不在でも運営可／△ 社長の営業依存（顧問就任で緩和）／× 有資格者が社長のみ・職人依存", False),
]

# (見出し, 幅, 種別)  種別 in=入力 / calc=数式 / eval=◯△× / hide=内部計算
# 並びは「1画面で読める順」。先頭からステータスまでで約230文字幅＝1画面に収まる。
# 仲介・価格の内訳・保管先は毎回見ないので右側にまとめた。
COLS = (
    [("No", 5, "in"), ("企業名", 22, "in")]
    + [("事業内容", 30, "in"), ("業種区分", 18, "in")]
    + [("譲渡価格", 9, "in"), ("実態EBITDA", 10, "in"), (MULT_H, 11, "calc"),
       ("売上", 9, "in")]
    + [(("★\n" if m else "") + s_, 5.0, "eval") for s_, _, m in ITEMS]
    + [("総合判定", 16, "calc"), ("達成率", 8, "calc")]
    + [("ステータス", 12, "in"), ("次アクション", 26, "in"), ("期限", 10, "in"),
       ("意向表明期限", 11, "in"), ("初期検討メモ", 34, "in"),
       ("見送り理由", 26, "in")]
    + [("流入日", 10, "in"), ("仲介会社", 18, "in"), ("仲介担当者", 12, "in"),
       ("所在地", 11, "in"), ("簿価NetCash", 11, "in"), (WC_H, 12, "in"),
       ("売上レンジ", 15, "calc"), (REF_H, 12, "calc"),
       ("資料保管先／IM", 18, "in"), ("備考", 22, "in")]
    + [("得点", 7, "hide"), ("判定済", 7, "hide"), ("×件数", 7, "hide"),
       ("Must×", 7, "hide")]
)
IDX = {}
for i, (h, _, _) in enumerate(COLS, start=1):
    IDX.setdefault(h, get_column_letter(i))
L = IDX
EV_FIRST = next(i for i, (_, _, k) in enumerate(COLS, start=1) if k == "eval")
EV_LAST = EV_FIRST + len(ITEMS) - 1
EVC = [get_column_letter(c) for c in range(EV_FIRST, EV_LAST + 1)]
MUST = [EVC[i] for i, (_, _, m) in enumerate(ITEMS) if m]
SCORE_C, JUDGED_C = L["得点"], L["判定済"]
NX_C, MUSTX_C = L["×件数"], L["Must×"]
VERDICT_C, RATE_C = L["総合判定"], L["達成率"]

BANDS = [  # (開始見出し, 終了見出し, ラベル, 色)
    ("No", "企業名", "キー", "5B7C99"),
    ("事業内容", "業種区分", "案件情報", "7B8B9A"),
    ("譲渡価格", "売上", "主要数値（単位：百万円）", "3D6B8E"),
    (COLS[EV_FIRST - 1][0], COLS[EV_LAST - 1][0],
     "初期検討（投資条件タブ 青塗り12項目）　★=Must", "1F4E79"),
    ("総合判定", "達成率", "判定", "2E6B4F"),
    ("ステータス", "見送り理由", "進行管理", "6B7F8C"),
    ("流入日", "備考", "補足（仲介・価格の内訳・保管先）", "9AA5AD"),
]


def eval_rng(r):
    return f"${EVC[0]}{r}:${EVC[-1]}{r}"


def build_deals(ws):
    ws["A1"] = "案件管理（初期検討まで1ページ）"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("【凡例】薄い黄色＝入力欄、灰色＝自動計算（触らない）。金額は百万円。"
                "◯△×の12列は右クリック→メモで評価基準が出ます。"
                "5行目は架空の記入例（削除可）、6行目は実案件の入力済みサンプル。"
                "得点・判定済などの内部計算列は右端に隠してあります。")
    ws["A2"].font = NOTE_F

    # 帯（グループ見出し）
    for start, end, label, color in BANDS:
        c1, c2 = L[start], L[end]
        ws.merge_cells(f"{c1}{BAND_ROW}:{c2}{BAND_ROW}")
        cell = ws[f"{c1}{BAND_ROW}"]
        cell.value = label
        cell.font = BAND_F
        cell.fill = PatternFill("solid", fgColor=color)
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[BAND_ROW].height = 18

    # 列見出し
    for i, (h, _, kind) in enumerate(COLS, start=1):
        c = ws.cell(HEAD_ROW, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL if kind in ("in", "eval") else PatternFill(
            "solid", fgColor="E2E2E2")
        c.alignment = Alignment(horizontal="center", vertical="center",
                                wrap_text=True)
        c.border = Border(left=thin, right=thin, top=thin, bottom=med)
    ws.row_dimensions[HEAD_ROW].height = 34
    # 12項目の見出しに評価基準をメモで付ける（短縮名だけでは伝わらないため）
    for i, (short, tip, must) in enumerate(ITEMS):
        c = ws[f"{EVC[i]}{HEAD_ROW}"]
        body = ("【Must】×が1つでも付けば総合C\n" if must else "") + tip
        c.comment = Comment(body, "deal-screening", height=150, width=430)

    dv_g = DataValidation(type="list", formula1=f'"{GRADE_LIST}"', allow_blank=True,
                          showErrorMessage=True, errorTitle="評価の入力",
                          error="◯／△〜◯／△／×〜△／×／－ から選んでください")
    dv_i = DataValidation(type="list", formula1="=選択肢!$A$3:$A$36", allow_blank=True)
    dv_s = DataValidation(type="list", formula1="=選択肢!$C$3:$C$10", allow_blank=True)
    dv_t = DataValidation(type="list", formula1="=選択肢!$E$3:$E$14", allow_blank=True)
    for dv in (dv_g, dv_i, dv_s, dv_t):
        ws.add_data_validation(dv)

    for r in range(FIRST, LAST + 1):
        rng = eval_rng(r)
        for i, (h, _, kind) in enumerate(COLS, start=1):
            c = ws.cell(r, i)
            c.font = BODY_F
            c.border = BOX
            c.fill = IN_FILL if kind in ("in", "eval") else CALC_FILL
            if kind == "eval":
                c.alignment = Alignment(horizontal="center", vertical="center")
            else:
                c.alignment = Alignment(
                    vertical="top",
                    wrap_text=h in ("事業内容", "次アクション", "初期検討メモ",
                                    "見送り理由", "備考"))
        p, e = L["譲渡価格"], L["実態EBITDA"]
        s, nc, wc = L["売上"], L["簿価NetCash"], L[WC_H]
        ws[f'{L[MULT_H]}{r}'] = (
            f'=IF(OR(${p}{r}="",${e}{r}="",${nc}{r}="",${wc}{r}="",${e}{r}<=0),"",'
            f'(${p}{r}-(${nc}{r}-${wc}{r}))/${e}{r})')
        ws[f'{L[REF_H]}{r}'] = (
            f'=IF(OR(${p}{r}="",${e}{r}="",${nc}{r}="",${e}{r}<=0),"",'
            f'(${p}{r}-${nc}{r})/${e}{r})')
        ws[f'{L["売上レンジ"]}{r}'] = (
            f'=IF(${s}{r}="","",IF(${s}{r}<{SALES_MIN},"下限未満（対象外）",'
            f'IF(${s}{r}>{SALES_MAX},"上限超（対象外）","範囲内")))')
        ws[f"{SCORE_C}{r}"] = (
            f'=COUNTIF({rng},"◯")*2+COUNTIF({rng},"△〜◯")*1.5'
            f'+COUNTIF({rng},"△")*1+COUNTIF({rng},"×〜△")*0.5')
        ws[f"{JUDGED_C}{r}"] = (
            f'=COUNTIF({rng},"◯")+COUNTIF({rng},"△〜◯")+COUNTIF({rng},"△")'
            f'+COUNTIF({rng},"×〜△")+COUNTIF({rng},"×")')
        ws[f"{NX_C}{r}"] = f'=COUNTIF({rng},"×")'
        ws[f"{MUSTX_C}{r}"] = "=" + "+".join(f'COUNTIF(${m}{r},"×")' for m in MUST)
        ws[f"{VERDICT_C}{r}"] = (
            f'=IF(${JUDGED_C}{r}=0,"",'
            f'IF(${MUSTX_C}{r}>0,"C：見送り（Must×）",'
            f'IF(${NX_C}{r}>=2,"C：見送り（×2件以上）",'
            f'IF(${JUDGED_C}{r}<6,"B：追加情報を取得",'
            f'IF(AND(${NX_C}{r}=0,${SCORE_C}{r}/(${JUDGED_C}{r}*2)>=0.75),'
            f'"A：進める",'
            f'"B：追加情報を取得")))))')
        ws[f"{RATE_C}{r}"] = (f'=IF(${JUDGED_C}{r}=0,"",'
                              f'${SCORE_C}{r}/(${JUDGED_C}{r}*2))')
        for h in ("譲渡価格", "実態EBITDA", "売上", "簿価NetCash", WC_H):
            ws[f"{L[h]}{r}"].number_format = "#,##0.0"
        for h in (MULT_H, REF_H):
            ws[f"{L[h]}{r}"].number_format = '0.0"倍"'
        ws[f"{RATE_C}{r}"].number_format = "0%"
        ws[f"{SCORE_C}{r}"].number_format = "0.0"
        for h in ("流入日", "期限", "意向表明期限"):
            ws[f"{L[h]}{r}"].number_format = "yyyy/mm/dd"
        for i in range(len(ITEMS)):
            dv_g.add(ws[f"{EVC[i]}{r}"])
        dv_i.add(ws[f'{L["仲介会社"]}{r}'])
        dv_s.add(ws[f'{L["業種区分"]}{r}'])
        dv_t.add(ws[f'{L["ステータス"]}{r}'])

    # 記入例（架空）と実案件
    ex = {"No": 1, "企業名": "（記入例）株式会社サンプル配食サービス",
          "事業内容": "高齢者向けの栄養管理食を製造し、定期宅配で提供。売上の8割が月額定期契約",
          "業種区分": "重点①シニア", "流入日": "2026/09/20",
          "仲介会社": "maXアドバイザリー", "仲介担当者": "稲見様", "所在地": "大阪府",
          "譲渡価格": 480, "実態EBITDA": 95, "売上": 1240,
          "簿価NetCash": 60, WC_H: 25,
          "ステータス": "初期検討中", "次アクション": "得意先別売上構成の受領を依頼",
          "期限": "2026/10/03", "意向表明期限": "2026/10/31",
          "初期検討メモ": "ストック性が高く重点業種に直球。価格は②5.1倍で許容内",
          "資料保管先／IM": "仲介会社資料管理／maX",
          "備考": "架空の例。使い始めるときに削除してください"}
    ex_g = ["◯", "◯", "◯", "◯", "◯", "◯", "△〜◯", "◯", "△〜◯", "△", "△〜◯", "△"]
    real = {"No": 2, "企業名": "尾形工業株式会社",
            "事業内容": "左官工事。マンション・ビルの補修／断面修復が約70%、一般住宅の漆喰・珪藻土塗りが約30%。自社職人33名",
            "業種区分": "NG業種7カテゴリ", "流入日": "2026/09/28",
            "仲介会社": "maXアドバイザリー", "仲介担当者": "稲見様",
            "所在地": "千葉県船橋市",
            "譲渡価格": 60, "実態EBITDA": 24.1, "売上": 774.0,
            "簿価NetCash": -206.9, WC_H: 200.4,
            "ステータス": "見送り",
            "次アクション": "見送りの連絡と、今後の案件テーマのすり合わせ",
            "期限": "2026/10/02",
            "初期検討メモ": "業種がNG❹（職人依存型の建設工事）。粗利率18.4%、外注費53%。得意先別売上は未開示",
            "見送り理由": "NG業種に該当し、EV/EBITDAも19.4倍で価格条件を満たさない",
            "資料保管先／IM": "仲介会社資料管理／maX",
            "備考": "IMに第三者公表を控える旨の記載あり。外部共有時は注意"}
    real_g = ["×", "◯", "×〜△", "◯", "×〜△", "△", "×", "△", "△〜◯", "×〜△", "－", "△"]
    for row, data, grades in ((FIRST, ex, ex_g), (FIRST + 1, real, real_g)):
        for h, v in data.items():
            c = ws[f"{L[h]}{row}"]
            c.value = v
            c.font = Font(name=FONT, size=10, color=BLUE_TXT)
            if h in ("流入日", "期限", "意向表明期限"):
                c.number_format = "yyyy/mm/dd"
        for i, v in enumerate(grades):
            c = ws[f"{EVC[i]}{row}"]
            c.value = v
            c.font = Font(name=FONT, size=10, color=BLUE_TXT)
            c.alignment = Alignment(horizontal="center", vertical="center")

    for i, (h, w, kind) in enumerate(COLS, start=1):
        cl = get_column_letter(i)
        ws.column_dimensions[cl].width = w
        if kind == "hide":
            ws.column_dimensions[cl].hidden = True
    ws.freeze_panes = f"{L['事業内容']}{FIRST}"     # No・企業名と見出し4行を固定

    # 色分け
    all_ev = f"{EVC[0]}{FIRST}:{EVC[-1]}{LAST}"
    for grade, color in GRADE_COLORS:
        ws.conditional_formatting.add(all_ev, FormulaRule(
            formula=[f'EXACT({EVC[0]}{FIRST},"{grade}")'],
            fill=PatternFill("solid", fgColor=color)))
    for pre, color in [("A：", "B7E1CD"), ("B：", "FFF2CC"), ("C：", "F4C7C3")]:
        ws.conditional_formatting.add(
            f"{VERDICT_C}{FIRST}:{VERDICT_C}{LAST}",
            FormulaRule(formula=[f'LEFT({VERDICT_C}{FIRST},2)="{pre}"'],
                        fill=PatternFill("solid", fgColor=color)))
    sr = L["売上レンジ"]
    ws.conditional_formatting.add(
        f"{sr}{FIRST}:{sr}{LAST}",
        FormulaRule(formula=[f'AND({sr}{FIRST}<>"",{sr}{FIRST}<>"範囲内")'],
                    fill=PatternFill("solid", fgColor="F4C7C3")))
    sc = L["売上"]   # 目安レンジ外は売上そのものを赤くして、1画面で気づけるように
    ws.conditional_formatting.add(
        f"{sc}{FIRST}:{sc}{LAST}",
        FormulaRule(formula=[f'AND({sc}{FIRST}<>"",OR({sc}{FIRST}<{SALES_MIN},'
                             f'{sc}{FIRST}>{SALES_MAX}))'],
                    fill=PatternFill("solid", fgColor="F4C7C3")))
    mc = L[MULT_H]
    ws.conditional_formatting.add(
        f"{mc}{FIRST}:{mc}{LAST}",
        CellIsRule(operator="greaterThan", formula=["7"],
                   fill=PatternFill("solid", fgColor="F4C7C3")))
    ws.auto_filter.ref = f"A{HEAD_ROW}:{get_column_letter(len(COLS))}{LAST}"


def build_choices(ws):
    ws["A1"] = "選択肢（ドロップダウンの元データ）"
    ws["A1"].font = TITLE_F
    for col, h in {"A": "仲介会社", "C": "業種区分", "E": "ステータス",
                   "G": "評価"}.items():
        c = ws[f"{col}2"]
        c.value = h
        c.font = HDR_F
        c.fill = HDR_FILL
    for col, vals in (("A", INTERMEDIARIES), ("C", SECTORS), ("E", STATUS),
                      ("G", ["◯", "△〜◯", "△", "×〜△", "×", "－"])):
        for i, v in enumerate(vals, start=3):
            ws[f"{col}{i}"] = v
            ws[f"{col}{i}"].font = BODY_F
    for col, w in [("A", 26), ("B", 2), ("C", 34), ("D", 2), ("E", 16),
                   ("F", 2), ("G", 8)]:
        ws.column_dimensions[col].width = w
    ws["A40"] = ("仲介会社は「仲介会社資料管理」フォルダの34社。"
                 "増えたらここに足せば案件管理タブの選択肢に反映される。")
    ws["A40"].font = NOTE_F


def build_criteria(ws):
    ws["A1"] = "判定基準（青塗り12項目のルーブリック抜粋）"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("正本は .claude/skills/deal-screening/references/rubric.md。"
                "ここは参照用の写しなので、閾値を変えるときは rubric.md と両方直すこと。")
    ws["A2"].font = NOTE_F
    rows = [
        ("No", "評価軸", "◯", "△", "×", "Must"),
        ("1-1", "業種ターゲットとの整合", "重点業種①②③に直接該当",
         "追加B群（罠を回避できる形）", "NG業種7カテゴリ／追加C群", "★"),
        ("1-2", "TE拠出額4億円以下", "3.0億円以下", "4.0〜4.5億円", "5.0億円超", "★"),
        ("1-3", "非キャッシュ性資産", "EBITDA比2.0倍以下", "3.0〜5.0倍",
         "8.0倍超／装置産業・不動産主体", ""),
        ("2", "安定黒字か", "3期連続黒字かつ増加基調", "3期黒字だが直近▲20%以上",
         "2期以上赤字／実態調整後に直近赤字", "★"),
        ("3", "付加価値は高いか", "3期すべて粗利率30%以上", "3期平均25〜30%",
         "3期平均20%未満／3期で5pt以上低下", ""),
        ("4", "永続性は高いか", "人口動態・法定需要が後押し",
         "横ばい・代替技術の影響が読めない", "10年で構造的に消える", ""),
        ("5", "価格は割高ではないか", "②5.0倍以下", "②6.0〜7.0倍", "②8.0倍超", "★"),
        ("8-1", "ストック型かフロー型か", "ストック比率70%以上",
         "リピート中心だが契約なし", "スポット・案件単位が主", ""),
        ("8-2", "流行り廃りはあるか", "生活必需・法定需要", "一部商材がトレンド依存",
         "嗜好・流行・立地が売上を左右", ""),
        ("9", "売却理由", "高齢・後継者不在で業績と整合", "理由は一般的だが裏付け不足",
         "業績悪化・係争・簿外債務の兆候と符合", ""),
        ("11", "特定取引先に依存していないか", "上位1社10%未満", "20〜30%",
         "50%以上／代替不能な単一発注先", ""),
        ("12", "特定人材に依存していないか", "社長不在でも運営可",
         "社長の営業依存（顧問就任で緩和）", "有資格者が社長のみ／職人依存", ""),
    ]
    for ri, row in enumerate(rows, start=4):
        for ci, v in enumerate(row, start=1):
            c = ws.cell(ri, ci, v)
            c.border = BOX
            c.alignment = Alignment(vertical="top", wrap_text=True)
            c.font = HDR_F if ri == 4 else BODY_F
            if ri == 4:
                c.fill = HDR_FILL
    ws.cell(18, 1, "総合判定").font = HDR_F
    for i, (a, b) in enumerate([
        ("C：見送り", "Must項目（1-1・1-2・2・5）に×が1つ以上、または全体で×が2項目以上"),
        ("A：進める", "×ゼロ、かつ達成率75%以上（達成率＝得点÷(判定済×2)）"),
        ("B：追加情報", "上記以外。判定済が6項目未満のときは達成率に関わらずB"),
    ], start=19):
        ws.cell(i, 1, a).font = BODY_F
        ws.cell(i, 2, b).font = BODY_F
        ws.merge_cells(start_row=i, start_column=2, end_row=i, end_column=5)
    ws.cell(23, 1, "スコア").font = HDR_F
    ws.cell(23, 2, "◯2.0／△〜◯1.5／△1.0／×〜△0.5／×0。"
                   "－は判定不能で、加算も達成率の分母もしない。").font = BODY_F
    ws.merge_cells("B23:E23")
    ws.cell(25, 1, "売上目安").font = HDR_F
    ws.cell(25, 2, f"{SALES_MIN:,}〜{SALES_MAX:,}百万円（投資条件友井タブ No.20／"
                   "仲介向け資料P10）。青塗り外の項目なので◯△×には算入せず、"
                   "範囲内かの表示のみ。").font = BODY_F
    ws.merge_cells("B25:E25")
    ws.cell(27, 1, "EV/EBITDAの閾値").font = HDR_F
    ws.cell(27, 2, "投資条件タブ7倍／投資条件友井タブ5倍／仲介向け資料6倍と3資料で"
                   "異なるため、◯=5倍以下・△=7倍以下・×=8倍超の段階評価に畳んでいる。"
                   "統一の決定が出たら直すこと。").font = BODY_F
    ws.merge_cells("B27:E27")
    for col, w in [("A", 16), ("B", 30), ("C", 30), ("D", 30), ("E", 34), ("F", 7)]:
        ws.column_dimensions[col].width = w


wb = Workbook()
ws_deal = wb.active
ws_deal.title = "案件管理"
build_deals(ws_deal)
build_criteria(wb.create_sheet("判定基準"))
build_choices(wb.create_sheet("選択肢"))
out = "案件管理表_TeamEnergy.xlsx"
wb.save(out)
print("saved", out)
print("列数", len(COLS), "／ 評価列", EVC[0], "〜", EVC[-1],
      "／ Must", MUST, "／ 判定", VERDICT_C, RATE_C,
      "／ 固定", ws_deal.freeze_panes)
