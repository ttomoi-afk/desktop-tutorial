# -*- coding: utf-8 -*-
"""案件管理スプレッドシートを生成する。

タブ構成
  案件管理  1行=1案件。企業名・事業内容＋数値4項目＋判定＋ステータス
  初期検討  1行=1案件。青塗り12項目の◯△×と総合判定（score.py と同一ロジック）
  判定基準  ルーブリックの閾値（参照用）
  選択肢    ドロップダウンの元データ
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule, FormulaRule

FONT = "Arial"
INK, GREY = "141414", "6D6D6F"
BLUE_TXT, GREEN_TXT = "0000FF", "008000"      # 入力 / 他シート参照
HDR_FILL = PatternFill("solid", fgColor="CFE2F3")   # 元シートと同じ青
IN_FILL = PatternFill("solid", fgColor="FFFDE7")    # 入力セル
CALC_FILL = PatternFill("solid", fgColor="F3F3F3")  # 自動計算
TITLE_F = Font(name=FONT, size=14, bold=True, color=INK)
HDR_F = Font(name=FONT, size=9, bold=True, color=INK)
BODY_F = Font(name=FONT, size=10, color=INK)
NOTE_F = Font(name=FONT, size=9, color=GREY)
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

FIRST, LAST = 4, 103        # 記入例=4行目、入力は5〜103行目
GRADES = ["◯", "△〜◯", "△", "×〜△", "－"]  # 並びは下で組み直す
GRADE_LIST = "◯,△〜◯,△,×〜△,×,－"
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

# ── 案件管理タブの列定義 (見出し, 幅, 種別) ───────────────────────────
# 種別: in=入力 / calc=数式 / link=他シート参照
DEAL_COLS = [
    ("No",                    6,  "in"),
    ("流入日",                11,  "in"),
    ("仲介会社",              20,  "in"),
    ("仲介担当者",            13,  "in"),
    ("企業名",                26,  "in"),
    ("事業内容",              46,  "in"),
    ("業種区分",              26,  "in"),
    ("所在地",                13,  "in"),
    ("譲渡価格",              11,  "in"),
    ("実態EBITDA",            11,  "in"),
    ("EV/EBITDAマルチプル",   17,  "calc"),
    ("売上",                  11,  "in"),
    ("簿価NetCash",           12,  "in"),
    ("平均必要運転資金",      15,  "in"),
    ("参考：簿価ベース倍率",  17,  "calc"),
    ("売上レンジ",            15,  "calc"),
    ("総合判定",              27,  "link"),
    ("達成率",                 8,  "link"),
    ("ステータス",            14,  "in"),
    ("次アクション",          28,  "in"),
    ("期限",                  11,  "in"),
    ("意向表明期限",          12,  "in"),
    ("見送り理由",            28,  "in"),
    ("資料保管先／IM",        22,  "in"),
    ("備考",                  28,  "in"),
]
C = {h: get_column_letter(i + 1) for i, (h, _, _) in enumerate(DEAL_COLS)}

# ── 初期検討タブの列定義 ──────────────────────────────────────────
ITEMS = [  # (列見出し, Must か)
    ("1-1 業種ターゲット整合", True),
    ("1-2 TE拠出額4億円以下", True),
    ("1-3 非キャッシュ性資産", False),
    ("2 安定黒字か", True),
    ("3 粗利率30%以上", False),
    ("4 永続性", False),
    ("5 価格の妥当性", True),
    ("8-1 ストック型か", False),
    ("8-2 流行り廃り", False),
    ("9 売却理由", False),
    ("11 取引先依存", False),
    ("12 人材依存", False),
]
EVAL_FIRST, EVAL_LAST = 3, 14          # C列〜N列
E = {i: get_column_letter(EVAL_FIRST + i) for i in range(len(ITEMS))}
MUST_COLS = [E[i] for i, (_, m) in enumerate(ITEMS) if m]


def style_header(ws, row, headers, kinds=None):
    for i, h in enumerate(headers, start=1):
        c = ws.cell(row, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BOX
    ws.row_dimensions[row].height = 32


def grade_rng(r):
    return f"${E[0]}{r}:${E[len(ITEMS)-1]}{r}"


def build_review(ws):
    ws["A1"] = "初期検討｜投資条件タブ 青塗り12項目の評価"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("◯2.0／△〜◯1.5／△1.0／×〜△0.5／×0。－は判定不能で達成率の分母から外れる。"
                "★はMust項目で、×が1つでも付けば総合C。")
    ws["A2"].font = NOTE_F

    heads = ["No", "企業名"] + [("★ " if m else "") + h for h, m in ITEMS] \
        + ["得点", "判定済", "×件数", "Must×", "総合判定", "達成率"]
    style_header(ws, 3, heads)

    dv = DataValidation(type="list", formula1=f'"{GRADE_LIST}"',
                        allow_blank=True, showErrorMessage=True,
                        errorTitle="評価の入力", error="◯／△〜◯／△／×〜△／×／－ から選んでください")
    ws.add_data_validation(dv)

    g = len(ITEMS)
    col_score, col_judged = get_column_letter(3 + g), get_column_letter(4 + g)
    col_nx, col_must = get_column_letter(5 + g), get_column_letter(6 + g)
    col_verdict, col_rate = get_column_letter(7 + g), get_column_letter(8 + g)

    for r in range(FIRST, LAST + 1):
        rng = grade_rng(r)
        ws.cell(r, 1).font = BODY_F
        ws.cell(r, 1).fill = IN_FILL
        b = ws.cell(r, 2)
        b.value = (f'=IF($A{r}="","",IFERROR(INDEX(案件管理!$E:$E,'
                   f'MATCH($A{r},案件管理!$A:$A,0)),""))')
        b.font = Font(name=FONT, size=10, color=GREEN_TXT)
        for i in range(g):
            c = ws.cell(r, EVAL_FIRST + i)
            c.font = BODY_F
            c.fill = IN_FILL
            c.alignment = Alignment(horizontal="center")
            dv.add(c)
        ws[f"{col_score}{r}"] = (
            f'=COUNTIF({rng},"◯")*2+COUNTIF({rng},"△〜◯")*1.5'
            f'+COUNTIF({rng},"△")*1+COUNTIF({rng},"×〜△")*0.5')
        ws[f"{col_judged}{r}"] = (
            f'=COUNTIF({rng},"◯")+COUNTIF({rng},"△〜◯")+COUNTIF({rng},"△")'
            f'+COUNTIF({rng},"×〜△")+COUNTIF({rng},"×")')
        ws[f"{col_nx}{r}"] = f'=COUNTIF({rng},"×")'
        ws[f"{col_must}{r}"] = "+".join(f'COUNTIF(${mc}{r},"×")' for mc in MUST_COLS)
        ws[f"{col_must}{r}"] = "=" + ws[f"{col_must}{r}"].value
        ws[f"{col_verdict}{r}"] = (
            f'=IF(${col_judged}{r}=0,"未入力",'
            f'IF(${col_must}{r}>0,"C：見送り（Must項目に×）",'
            f'IF(${col_nx}{r}>=2,"C：見送り（×が2項目以上）",'
            f'IF(${col_judged}{r}<6,"B：追加情報を取得して再判定",'
            f'IF(AND(${col_nx}{r}=0,${col_score}{r}/(${col_judged}{r}*2)>=0.75),'
            f'"A：進める（トップ面談・基本合意検討へ）",'
            f'"B：追加情報を取得して再判定")))))')
        ws[f"{col_rate}{r}"] = (f'=IF(${col_judged}{r}=0,"",'
                                f'${col_score}{r}/(${col_judged}{r}*2))')
        for cl in (col_score, col_judged, col_nx, col_must, col_verdict, col_rate):
            cc = ws[f"{cl}{r}"]
            cc.font = BODY_F
            cc.fill = CALC_FILL
            cc.border = BOX
        ws[f"{col_score}{r}"].number_format = "0.0"
        ws[f"{col_rate}{r}"].number_format = "0%"
        for i in range(1, 9 + g):
            ws.cell(r, i).border = BOX

    # 記入例（配食サービスの架空案件。inputs.example.json と同じ評価）
    ex = ["◯", "◯", "◯", "◯", "◯", "◯", "△〜◯", "◯", "△〜◯", "△", "△〜◯", "△"]
    ws.cell(FIRST, 1, 1).font = Font(name=FONT, size=10, color=BLUE_TXT)
    for i, v in enumerate(ex):
        c = ws.cell(FIRST, EVAL_FIRST + i, v)
        c.font = Font(name=FONT, size=10, color=BLUE_TXT)
        c.alignment = Alignment(horizontal="center")

    # 実案件（左官工事）の評価
    real = ["×", "◯", "×〜△", "◯", "×〜△", "△", "×", "△", "△〜◯", "×〜△", "－", "△"]
    ws.cell(FIRST + 1, 1, 2).font = Font(name=FONT, size=10, color=BLUE_TXT)
    for i, v in enumerate(real):
        c = ws.cell(FIRST + 1, EVAL_FIRST + i, v)
        c.font = Font(name=FONT, size=10, color=BLUE_TXT)
        c.alignment = Alignment(horizontal="center")

    widths = [6, 24] + [13] * g + [7, 7, 7, 7, 30, 8]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "C4"

    # 評価セルの色分け
    rng_all = f"{E[0]}{FIRST}:{E[g-1]}{LAST}"
    for grade, color in [("◯", "B7E1CD"), ("△〜◯", "D9EAD3"), ("△", "FFF2CC"),
                         ("×〜△", "FCE5CD"), ("×", "F4C7C3"), ("－", "EFEFEF")]:
        ws.conditional_formatting.add(rng_all, FormulaRule(
            formula=[f'EXACT(${E[0]}{FIRST},"{grade}")'.replace(
                f"${E[0]}{FIRST}", f"{E[0]}{FIRST}")],
            fill=PatternFill("solid", fgColor=color), stopIfTrue=False))
    return col_verdict, col_rate


def build_deals(ws, rev_verdict, rev_rate):
    ws["A1"] = "案件管理"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("【凡例】薄い黄色のセルが入力欄、灰色は自動計算（触らない）。"
                "緑字は初期検討タブからの参照。金額の単位はすべて百万円。"
                "4行目は架空の記入例（削除可）、5行目は実案件の入力済みサンプルです。")
    ws["A2"].font = NOTE_F

    style_header(ws, 3, [h for h, _, _ in DEAL_COLS])
    # 入力欄／自動計算の区別を見出しにも出す
    for i, (h, _, kind) in enumerate(DEAL_COLS, start=1):
        if kind != "in":
            ws.cell(3, i).fill = PatternFill("solid", fgColor="E2E2E2")

    dv_int = DataValidation(type="list", formula1="=選択肢!$A$3:$A$36", allow_blank=True)
    dv_sec = DataValidation(type="list", formula1="=選択肢!$C$3:$C$10", allow_blank=True)
    dv_sta = DataValidation(type="list", formula1="=選択肢!$E$3:$E$14", allow_blank=True)
    for dv in (dv_int, dv_sec, dv_sta):
        ws.add_data_validation(dv)

    for r in range(FIRST, LAST + 1):
        for i, (h, _, kind) in enumerate(DEAL_COLS, start=1):
            c = ws.cell(r, i)
            c.font = BODY_F
            c.border = BOX
            c.fill = IN_FILL if kind == "in" else CALC_FILL
            c.alignment = Alignment(vertical="top",
                                    wrap_text=h in ("事業内容", "次アクション",
                                                    "見送り理由", "備考"))
        i_, j_, l_ = C["譲渡価格"], C["実態EBITDA"], C["売上"]
        m_, n_ = C["簿価NetCash"], C["平均必要運転資金"]
        ws[f'{C["EV/EBITDAマルチプル"]}{r}'] = (
            f'=IF(OR(${i_}{r}="",${j_}{r}="",${m_}{r}="",${n_}{r}="",${j_}{r}<=0),"",'
            f'(${i_}{r}-(${m_}{r}-${n_}{r}))/${j_}{r})')
        ws[f'{C["参考：簿価ベース倍率"]}{r}'] = (
            f'=IF(OR(${i_}{r}="",${j_}{r}="",${m_}{r}="",${j_}{r}<=0),"",'
            f'(${i_}{r}-${m_}{r})/${j_}{r})')
        ws[f'{C["売上レンジ"]}{r}'] = (
            f'=IF(${l_}{r}="","",IF(${l_}{r}<{SALES_MIN},"下限未満（対象外）",'
            f'IF(${l_}{r}>{SALES_MAX},"上限超（対象外）","範囲内")))')
        ws[f'{C["総合判定"]}{r}'] = (
            f'=IF($A{r}="","",IFERROR(INDEX(初期検討!${rev_verdict}:${rev_verdict},'
            f'MATCH($A{r},初期検討!$A:$A,0)),""))')
        ws[f'{C["達成率"]}{r}'] = (
            f'=IF($A{r}="","",IFERROR(INDEX(初期検討!${rev_rate}:${rev_rate},'
            f'MATCH($A{r},初期検討!$A:$A,0)),""))')
        for h in ("譲渡価格", "実態EBITDA", "売上", "簿価NetCash", "平均必要運転資金"):
            ws[f"{C[h]}{r}"].number_format = "#,##0.0"
        for h in ("EV/EBITDAマルチプル", "参考：簿価ベース倍率"):
            ws[f"{C[h]}{r}"].number_format = '0.0"倍"'
        ws[f'{C["達成率"]}{r}'].number_format = "0%"
        for h in ("流入日", "期限", "意向表明期限"):
            ws[f"{C[h]}{r}"].number_format = "yyyy/mm/dd"
        dv_int.add(ws[f'{C["仲介会社"]}{r}'])
        dv_sec.add(ws[f'{C["業種区分"]}{r}'])
        dv_sta.add(ws[f'{C["ステータス"]}{r}'])

    # 記入例（架空の配食サービス案件）
    example = {
        "No": 1, "流入日": "2026/09/20", "仲介会社": "maXアドバイザリー",
        "仲介担当者": "稲見様", "企業名": "（記入例）株式会社サンプル配食サービス",
        "事業内容": "高齢者向けの栄養管理食を製造し、定期宅配で提供。売上の8割が月額定期契約",
        "業種区分": "重点①シニア", "所在地": "大阪府",
        "譲渡価格": 480, "実態EBITDA": 95, "売上": 1240,
        "簿価NetCash": 60, "平均必要運転資金": 25,
        "ステータス": "初期検討中",
        "次アクション": "得意先別売上構成の受領を依頼", "期限": "2026/10/03",
        "意向表明期限": "2026/10/31",
        "資料保管先／IM": "仲介会社資料管理／maX",
        "備考": "架空の例。使い始めるときにこの行を削除してください",
    }
    for h, v in example.items():
        c = ws[f"{C[h]}{FIRST}"]
        c.value = v
        c.font = Font(name=FONT, size=10, color=BLUE_TXT)
        if h in ("流入日", "期限", "意向表明期限"):
            c.number_format = "yyyy/mm/dd"

    # 実案件（IMを初期検討済み。総合C）
    real = {
        "No": 2, "流入日": "2026/09/28", "仲介会社": "maXアドバイザリー",
        "仲介担当者": "稲見様", "企業名": "尾形工業株式会社",
        "事業内容": "左官工事。マンション・ビルの補修／断面修復が約70%、一般住宅の漆喰・珪藻土塗りが約30%。自社職人33名",
        "業種区分": "NG業種7カテゴリ", "所在地": "千葉県船橋市",
        "譲渡価格": 60, "実態EBITDA": 24.1, "売上": 774.0,
        "簿価NetCash": -206.9, "平均必要運転資金": 200.4,
        "ステータス": "見送り",
        "次アクション": "見送りの連絡と、今後の案件テーマのすり合わせ",
        "期限": "2026/10/02",
        "見送り理由": "業種がNG❹（職人依存型の建設工事）に該当。EV/EBITDAも19.4倍で価格条件を満たさない",
        "資料保管先／IM": "仲介会社資料管理／maX",
        "備考": "IMに第三者公表を控える旨の記載あり。外部共有時は注意",
    }
    for h, v in real.items():
        c = ws[f"{C[h]}{FIRST + 1}"]
        c.value = v
        c.font = Font(name=FONT, size=10, color=BLUE_TXT)
        if h in ("流入日", "期限", "意向表明期限"):
            c.number_format = "yyyy/mm/dd"

    for i, (h, w, _) in enumerate(DEAL_COLS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "F4"

    # 総合判定の色分け／売上レンジ外の警告
    v = C["総合判定"]
    for pre, color in [("A：", "B7E1CD"), ("B：", "FFF2CC"), ("C：", "F4C7C3")]:
        ws.conditional_formatting.add(
            f"{v}{FIRST}:{v}{LAST}",
            FormulaRule(formula=[f'LEFT({v}{FIRST},2)="{pre}"'],
                        fill=PatternFill("solid", fgColor=color)))
    s = C["売上レンジ"]
    ws.conditional_formatting.add(
        f"{s}{FIRST}:{s}{LAST}",
        FormulaRule(formula=[f'AND({s}{FIRST}<>"",{s}{FIRST}<>"範囲内")'],
                    fill=PatternFill("solid", fgColor="F4C7C3")))
    k = C["EV/EBITDAマルチプル"]
    ws.conditional_formatting.add(
        f"{k}{FIRST}:{k}{LAST}",
        CellIsRule(operator="greaterThan", formula=["7"],
                   fill=PatternFill("solid", fgColor="F4C7C3")))


def build_choices(ws):
    ws["A1"] = "選択肢（ドロップダウンの元データ）"
    ws["A1"].font = TITLE_F
    heads = {"A": "仲介会社", "C": "業種区分", "E": "ステータス", "G": "評価"}
    for col, h in heads.items():
        c = ws[f"{col}2"]
        c.value = h
        c.font = HDR_F
        c.fill = HDR_FILL
    for i, v in enumerate(INTERMEDIARIES, start=3):
        ws[f"A{i}"] = v
        ws[f"A{i}"].font = BODY_F
    for i, v in enumerate(SECTORS, start=3):
        ws[f"C{i}"] = v
        ws[f"C{i}"].font = BODY_F
    for i, v in enumerate(STATUS, start=3):
        ws[f"E{i}"] = v
        ws[f"E{i}"].font = BODY_F
    for i, v in enumerate(["◯", "△〜◯", "△", "×〜△", "×", "－"], start=3):
        ws[f"G{i}"] = v
        ws[f"G{i}"].font = BODY_F
    for col, w in [("A", 26), ("B", 2), ("C", 34), ("D", 2), ("E", 16),
                   ("F", 2), ("G", 8)]:
        ws.column_dimensions[col].width = w
    ws["A40"] = "仲介会社は「仲介会社資料管理」フォルダの34社。増えたらここに足せば案件管理タブの選択肢に反映される。"
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
        ("4", "永続性は高いか", "人口動態・法定需要が後押し", "横ばい・代替技術の影響が読めない",
         "10年で構造的に消える", ""),
        ("5", "価格は割高ではないか", "②5.0倍以下", "②6.0〜7.0倍", "②8.0倍超", "★"),
        ("8-1", "ストック型かフロー型か", "ストック比率70%以上", "リピート中心だが契約なし",
         "スポット・案件単位が主", ""),
        ("8-2", "流行り廃りはあるか", "生活必需・法定需要", "一部商材がトレンド依存",
         "嗜好・流行・立地が売上を左右", ""),
        ("9", "売却理由", "高齢・後継者不在で業績と整合", "理由は一般的だが裏付け不足",
         "業績悪化・係争・簿外債務の兆候と符合", ""),
        ("11", "特定取引先に依存していないか", "上位1社10%未満", "20〜30%",
         "50%以上／代替不能な単一発注先", ""),
        ("12", "特定人材に依存していないか", "社長不在でも運営可", "社長の営業依存（顧問就任で緩和）",
         "有資格者が社長のみ／職人依存", ""),
    ]
    for ri, row in enumerate(rows, start=4):
        for ci, v in enumerate(row, start=1):
            c = ws.cell(ri, ci, v)
            c.border = BOX
            c.alignment = Alignment(vertical="top", wrap_text=True)
            if ri == 4:
                c.font = HDR_F
                c.fill = HDR_FILL
            else:
                c.font = BODY_F
    ws.cell(18, 1, "総合判定")
    ws.cell(18, 1).font = HDR_F
    verdicts = [
        ("C：見送り", "Must項目（1-1・1-2・2・5）に×が1つ以上、または全体で×が2項目以上"),
        ("A：進める", "×ゼロ、かつ達成率75%以上（達成率＝得点÷(判定済×2)）"),
        ("B：追加情報", "上記以外。判定済が6項目未満のときは達成率に関わらずB"),
    ]
    for i, (a, b) in enumerate(verdicts, start=19):
        ws.cell(i, 1, a).font = BODY_F
        ws.cell(i, 2, b).font = BODY_F
        ws.merge_cells(start_row=i, start_column=2, end_row=i, end_column=5)
    ws.cell(23, 1, "売上目安")
    ws.cell(23, 1).font = HDR_F
    ws.cell(23, 2, f"{SALES_MIN:,}〜{SALES_MAX:,}百万円（投資条件友井タブ No.20／仲介向け資料P10）。"
                   "青塗り外の項目なので◯△×には算入せず、範囲内かの表示のみ。").font = BODY_F
    ws.merge_cells("B23:E23")
    ws.cell(25, 1, "EV/EBITDAの閾値").font = HDR_F
    ws.cell(25, 2, "投資条件タブ7倍／投資条件友井タブ5倍／仲介向け資料6倍と3資料で異なるため、"
                   "◯=5倍以下・△=7倍以下・×=8倍超の段階評価に畳んでいる。統一の決定が出たら直すこと。").font = BODY_F
    ws.merge_cells("B25:E25")
    for col, w in [("A", 14), ("B", 30), ("C", 30), ("D", 30), ("E", 34), ("F", 7)]:
        ws.column_dimensions[col].width = w


wb = Workbook()
ws_deal = wb.active
ws_deal.title = "案件管理"
ws_rev = wb.create_sheet("初期検討")
ws_cri = wb.create_sheet("判定基準")
ws_cho = wb.create_sheet("選択肢")

vcol, rcol = build_review(ws_rev)
build_deals(ws_deal, vcol, rcol)
build_criteria(ws_cri)
build_choices(ws_cho)

out = "案件管理表_TeamEnergy.xlsx"
wb.save(out)
print("saved", out, "verdict col =", vcol, "rate col =", rcol)
