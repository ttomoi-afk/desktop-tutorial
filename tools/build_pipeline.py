# -*- coding: utf-8 -*-
"""案件管理表を生成する。

タブ構成
  案件管理            1行=1案件。企業名・事業内容＋数値＋青塗り12項目の◯△×＋判定＋進行
  質問リスト           1行=1質問。仲介の案件担当者に聞く文面と、回答で動く評価項目
  友井→服部           上席に上げる案件だけを案件管理から自動で抜き出す
  仲介会社管理シート    36社の属性と、月次の流入／条件合致件数（案件管理から自動集計）
  判定基準            ルーブリックの閾値と、条件合致の判定パラメータ
  選択肢              ドロップダウンの元データ

連携の要は仲介会社名。案件管理の仲介会社ドロップダウンは
仲介会社管理シートのA列を直接参照するので、名称が常に一致し集計が0件にならない。
"""
from datetime import date

from mediators import MEDIATORS
from questions import (QUESTIONS, Q_CATEGORIES, Q_PRIORITY, Q_STATUS)
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

# 仲介会社管理シートの月次列。アップロード版は 9〜12月が3回繰り返されていたので
# 事業年度（9月開始）12ヶ月に振り直した。年度が違う場合はここだけ直せばよい。
FY_START = (2026, 9)
MONTHS = [((FY_START[0] + (FY_START[1] - 1 + i) // 12),
           ((FY_START[1] - 1 + i) % 12) + 1) for i in range(12)]
Q_FIRST, Q_LAST = 4, 303          # 質問リストの行範囲
MED_FIRST = 5                     # 仲介会社の先頭行
MED_LAST = MED_FIRST + len(MEDIATORS) - 1
ESC_JUDGE = ["進める", "条件付きで進める", "追加検討", "見送り"]

# 判定基準タブの「条件合致の判定パラメータ」の先頭行。ここを起点に
# EBITDA下限／EBITDA上限／マルチプル上限／除外業種 が4行並ぶ。
# 仲介会社管理シートの COUNTIFS もこの定数から参照を組むので、ずれない。
PARAM_ROW = 32
P_EB_LO, P_EB_HI = PARAM_ROW, PARAM_ROW + 1
P_MULT, P_EXCL = PARAM_ROW + 2, PARAM_ROW + 3

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
ITEM_NAMES = [s for s, _, _ in ITEMS]

# (見出し, 幅, 種別)  種別 in=入力 / calc=数式 / eval=◯△× / hide=内部計算
# 並びは「1画面で読める順」。先頭からステータスまでで約230文字幅＝1画面に収まる。
# 仲介・価格の内訳・保管先は毎回見ないので右側にまとめた。
COLS = (
    [("No", 5, "in"), ("企業名", 22, "in")]
    + [("事業内容", 30, "in"), ("業種区分", 18, "in")]
    + [("譲渡価格", 9, "in"), ("実態EBITDA", 10, "in"), (MULT_H, 11, "calc"),
       ("売上", 9, "in")]
    + [(("★\n" if m else "") + s_, 5.0, "eval") for s_, _, m in ITEMS]
    + [("総合判定", 16, "calc"), ("達成率", 8, "calc"), ("未解決\n質問", 7, "calc")]
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
OPENQ_C = L["未解決\n質問"]

BANDS = [  # (開始見出し, 終了見出し, ラベル, 色)
    ("No", "企業名", "キー", "5B7C99"),
    ("事業内容", "業種区分", "案件情報", "7B8B9A"),
    ("譲渡価格", "売上", "主要数値（単位：百万円）", "3D6B8E"),
    (COLS[EV_FIRST - 1][0], COLS[EV_LAST - 1][0],
     "初期検討（投資条件タブ 青塗り12項目）　★=Must", "1F4E79"),
    ("総合判定", "未解決\n質問", "判定", "2E6B4F"),
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
    # 名称のゆれで集計が0件になるのを防ぐため、仲介会社管理シートのA列を直接参照する
    dv_i = DataValidation(
        type="list",
        formula1=f"=仲介会社管理シート!$A${MED_FIRST}:$A${MED_LAST}",
        allow_blank=True)
    dv_s = DataValidation(type="list",
                          formula1=f"=選択肢!$A$3:$A${2 + len(SECTORS)}",
                          allow_blank=True)
    dv_t = DataValidation(type="list",
                          formula1=f"=選択肢!$C$3:$C${2 + len(STATUS)}",
                          allow_blank=True)
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
        # 未解決の質問件数。状態が空欄（未質問）も未解決として数える
        ws[f"{OPENQ_C}{r}"] = (
            f'=IF($A{r}="","",COUNTIFS('
            f'質問リスト!$A${Q_FIRST}:$A${Q_LAST},$A{r},'
            f'質問リスト!${Q_STATE_C}${Q_FIRST}:${Q_STATE_C}${Q_LAST},"<>解決"))')
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
          "業種区分": "重点①シニア", "流入日": date(2026, 9, 20),
          "仲介会社": "株式会社maXアドバイザリー", "仲介担当者": "稲見様", "所在地": "大阪府",
          "譲渡価格": 480, "実態EBITDA": 95, "売上": 1240,
          "簿価NetCash": 60, WC_H: 25,
          "ステータス": "初期検討中", "次アクション": "得意先別売上構成の受領を依頼",
          "期限": date(2026, 10, 3), "意向表明期限": date(2026, 10, 31),
          "初期検討メモ": "ストック性が高く重点業種に直球。価格は②5.1倍で許容内",
          "資料保管先／IM": "仲介会社資料管理／maX",
          "備考": "架空の例。使い始めるときに削除してください"}
    ex_g = ["◯", "◯", "◯", "◯", "◯", "◯", "△〜◯", "◯", "△〜◯", "△", "△〜◯", "△"]
    real = {"No": 2, "企業名": "尾形工業株式会社",
            "事業内容": "左官工事。マンション・ビルの補修／断面修復が約70%、一般住宅の漆喰・珪藻土塗りが約30%。自社職人33名",
            "業種区分": "NG業種7カテゴリ", "流入日": date(2026, 9, 28),
            "仲介会社": "株式会社maXアドバイザリー", "仲介担当者": "稲見様",
            "所在地": "千葉県船橋市",
            "譲渡価格": 60, "実態EBITDA": 24.1, "売上": 774.0,
            "簿価NetCash": -206.9, WC_H: 200.4,
            "ステータス": "見送り",
            "次アクション": "見送りの連絡と、今後の案件テーマのすり合わせ",
            "期限": date(2026, 10, 2),
            "初期検討メモ": "業種がNG❹（職人依存型の建設工事）。粗利率18.4%、外注費53%。得意先別売上は未開示",
            "見送り理由": "NG業種に該当し、EV/EBITDAも19.4倍で価格条件を満たさない",
            "資料保管先／IM": "仲介会社資料管理／maX",
            "備考": "IMに第三者公表を控える旨の記載あり。外部共有時は注意"}
    real_g = ["×", "◯", "×〜△", "◯", "×〜△", "△", "×", "△", "△〜◯", "×〜△", "－", "△"]
    # 実案件2（動物カフェ7店舗。倍率は◯だが業種がNG❶に該当し総合C）
    real2 = {"No": 3, "企業名": "株式会社SAMOEDO'S",
             "事業内容": "犬とのふれあいを提供する体験型ペットサービス7店舗"
                         "（札幌・仙台・大阪・岡山・広島・福岡2）。社員16名＋アルバイト84名",
             "業種区分": "その他", "流入日": date(2026, 9, 3),
             "仲介会社": "株式会社Anyglo", "仲介担当者": "尾仲様・室伏様",
             "所在地": "東京都品川区",
             "譲渡価格": 555.4, "実態EBITDA": 185.1, "売上": 423.9,
             "簿価NetCash": 0, WC_H: 6.6,
             "ステータス": "追加情報待ち",
             "次アクション": "質問リスト12項目を送付し、意向表明期限の延長可否を確認",
             "期限": date(2026, 10, 3), "意向表明期限": date(2026, 9, 30),
             "初期検討メモ": "倍率3.0倍・非キャッシュ性資産0.9倍で価格と資産は◯。"
                             "業種はチェーン展開かつ動物で通常の飲食と毛色が違うため△（代表判断）。"
                             "残る論点は業歴2期・ブーム依存(8-2×)・本部長不在の運営体制",
             "資料保管先／IM": "仲介会社資料管理／Anyglo",
             "備考": "NNシート8/17受領・企業概要書9/3。意向表明期限が9月で実質期限切れ間近。"
                     "両資料に第三者公表を控える旨の記載あり"}
    # 1-1 は「チェーン展開／動物で通常の飲食とは毛色が違う」との代表判断で △
    real2_g = ["△", "×〜△", "◯", "×〜△", "△〜◯", "△", "◯", "×〜△", "×", "×〜△",
               "－", "×〜△"]
    for row, data, grades in ((FIRST, ex, ex_g), (FIRST + 1, real, real_g),
                              (FIRST + 2, real2, real2_g)):
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


# ════════════════════════════════════════════════════════════════
#  質問リスト（仲介の案件担当者に聞く）
# ════════════════════════════════════════════════════════════════
Q_COLS = [
    ("案件\nNo", 6, "in"),
    ("企業名", 22, "link"),
    ("仲介会社", 18, "link"),
    ("案件担当者", 12, "link"),
    ("Q#", 5, "in"),
    ("分類", 18, "in"),
    ("質問（このまま読める文）", 62, "in"),
    ("何を確かめたいか", 40, "in"),
    ("関連\n項目", 10, "in"),
    ("優先度", 8, "in"),
    ("聞いた日", 10, "in"),
    ("回答", 52, "in"),
    ("回答日", 10, "in"),
    ("回答で動く評価", 28, "in"),
    ("状態", 14, "in"),
]
QC = {}
for _i, (_h, _w, _k) in enumerate(Q_COLS, start=1):
    QC.setdefault(_h, get_column_letter(_i))
Q_STATE_C = QC["状態"]


def build_questions(ws, d):
    ws["A1"] = "質問リスト（仲介会社の案件担当者向け）"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("案件Noを入れると企業名・仲介会社・案件担当者が案件管理から入ります。"
                "「関連項目」は、その回答で動く12項目の番号。"
                "状態を「解決」にすると案件管理の未解決質問カウントから外れます。"
                "案件Noで絞り込めば、その案件だけの質問票として読めます。"
                "優先度は 必須＝これが無いと評価が付かない／重要＝回答で評価が動く／"
                "確認＝リスクの念押し。")
    ws["A2"].font = NOTE_F
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(f"A2:{get_column_letter(len(Q_COLS))}2")
    ws.row_dimensions[2].height = 28

    for i, (h, _, kind) in enumerate(Q_COLS, start=1):
        c = ws.cell(3, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL if kind == "in" else PatternFill("solid", fgColor="E2E2E2")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(left=thin, right=thin, top=thin, bottom=med)
    ws.row_dimensions[3].height = 32

    dv_cat = DataValidation(type="list",
                            formula1=f"=選択肢!$I$3:$I${2 + len(Q_CATEGORIES)}",
                            allow_blank=True)
    dv_pri = DataValidation(type="list", formula1=f'"{",".join(Q_PRIORITY)}"',
                            allow_blank=True)
    dv_st = DataValidation(type="list", formula1=f'"{",".join(Q_STATUS)}"',
                           allow_blank=True)
    for dv in (dv_cat, dv_pri, dv_st):
        ws.add_data_validation(dv)

    PULL = {"企業名": "企業名", "仲介会社": "仲介会社", "案件担当者": "仲介担当者"}
    for r in range(Q_FIRST, Q_LAST + 1):
        for h, src in PULL.items():
            ws[f"{QC[h]}{r}"] = (
                f'=IF($A{r}="","",IFERROR(INDEX(案件管理!${d[src]}:${d[src]},'
                f'MATCH($A{r},案件管理!${d["No"]}:${d["No"]},0)),""))')
        for i, (h, _, kind) in enumerate(Q_COLS, start=1):
            c = ws.cell(r, i)
            c.font = BODY_F
            c.border = BOX
            c.fill = IN_FILL if kind == "in" else CALC_FILL
            c.alignment = Alignment(
                vertical="top",
                wrap_text=h in ("質問（このまま読める文）", "何を確かめたいか", "回答",
                                "回答で動く評価"))
        for h in ("案件\nNo", "Q#", "関連\n項目", "優先度", "状態"):
            ws[f"{QC[h]}{r}"].alignment = Alignment(horizontal="center",
                                                    vertical="top")
        for h in ("聞いた日", "回答日"):
            ws[f"{QC[h]}{r}"].number_format = "yyyy/mm/dd"
        dv_cat.add(ws[f'{QC["分類"]}{r}'])
        dv_pri.add(ws[f'{QC["優先度"]}{r}'])
        dv_st.add(ws[f'{QC["状態"]}{r}'])

    # 洗い出し済みの質問を流し込む（案件ごとに Q# を振り直す）
    seq = {}
    for j, (no, cat, q, aim, rel, pri) in enumerate(QUESTIONS):
        r = Q_FIRST + j
        seq[no] = seq.get(no, 0) + 1
        vals = {"案件\nNo": no, "Q#": seq[no], "分類": cat,
                "質問（このまま読める文）": q, "何を確かめたいか": aim,
                "関連\n項目": rel, "優先度": pri, "状態": "未質問"}
        for h, v in vals.items():
            c = ws[f"{QC[h]}{r}"]
            c.value = v
            c.font = Font(name=FONT, size=10, color=BLUE_TXT)
        ws.row_dimensions[r].height = 44

    for i, (h, w, _) in enumerate(Q_COLS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = f'{QC["Q#"]}{Q_FIRST}'
    pri = QC["優先度"]
    for txt, color in [("必須", "F4C7C3"), ("重要", "FFF2CC"), ("確認", "EFEFEF")]:
        ws.conditional_formatting.add(
            f"{pri}{Q_FIRST}:{pri}{Q_LAST}",
            FormulaRule(formula=[f'EXACT({pri}{Q_FIRST},"{txt}")'],
                        fill=PatternFill("solid", fgColor=color)))
    st = QC["状態"]
    ws.conditional_formatting.add(
        f"{st}{Q_FIRST}:{st}{Q_LAST}",
        FormulaRule(formula=[f'EXACT({st}{Q_FIRST},"解決")'],
                    fill=PatternFill("solid", fgColor="B7E1CD")))
    ws.auto_filter.ref = f"A3:{get_column_letter(len(Q_COLS))}{Q_LAST}"


# ════════════════════════════════════════════════════════════════
#  友井→服部（上席に上げる案件）
# ════════════════════════════════════════════════════════════════
# 案件管理の 5〜104 行と 1:1 で対応させる。配列数式（FILTER 等）は
# openpyxl で書くと Excel 側で展開されないため使わず、行ごとの IF で表現する。
ESC_COLS = [
    ("上申\n手動✓", 7, "in"),
    ("上申区分", 13, "calc"),
    ("No", 5, "link"),
    ("企業名", 22, "link"),
    ("事業内容", 30, "link"),
    ("業種区分", 18, "link"),
    ("譲渡価格", 9, "link"),
    ("実態EBITDA", 10, "link"),
    (MULT_H, 11, "link"),
    ("売上", 9, "link"),
    ("総合判定", 16, "link"),
    ("達成率", 8, "link"),
    ("×が付いた項目", 20, "calc"),
    ("要確認（－）の項目", 20, "calc"),
    ("友井コメント（初期検討メモ）", 36, "link"),
    ("ステータス", 12, "link"),
    ("上申日", 10, "in"),
    ("服部判断", 15, "in"),
    ("服部コメント", 36, "in"),
    ("指示後の次アクション", 30, "in"),
]


def build_escalation(ws, d):
    """d = 案件管理の列レター辞書（L）"""
    E = {}
    for i, (h, _, _) in enumerate(ESC_COLS, start=1):
        E.setdefault(h, get_column_letter(i))
    ws["A1"] = "友井 → 服部（上席に上げる案件）"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("案件管理タブの5〜104行と同じ行番号で対応しています。"
                "総合判定がAなら自動で「◎ 上申対象」、Bなら「△ 要相談」。"
                "Cの案件と未入力行は空欄になります。"
                "判定に関わらず上げたい案件は、A列に ✓ を入れてください。"
                "白地の列（上申日・服部判断・服部コメント・指示後の次アクション）だけが入力欄で、"
                "残りは案件管理からの自動反映です。")
    ws["A2"].font = NOTE_F
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(f"A2:{get_column_letter(len(ESC_COLS))}2")
    ws.row_dimensions[2].height = 30

    ws[f"A{BAND_ROW}"] = (f"上申対象の件数： ◎ "
                          f"")
    ws[f"A{BAND_ROW}"].value = None
    cnt = (f'="◎ 上申対象 "&COUNTIF($B${FIRST}:$B${LAST},"◎ 上申対象")'
           f'&" 件　／　△ 要相談 "&COUNTIF($B${FIRST}:$B${LAST},"△ 要相談")&" 件"')
    c = ws[f"A{BAND_ROW}"]
    c.value = cnt
    c.font = Font(name=FONT, size=11, bold=True, color=INK)
    ws.merge_cells(f"A{BAND_ROW}:{get_column_letter(len(ESC_COLS))}{BAND_ROW}")
    ws[f"A{BAND_ROW}"].fill = PatternFill("solid", fgColor="E8F0E4")
    ws[f"A{BAND_ROW}"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[BAND_ROW].height = 20

    for i, (h, _, kind) in enumerate(ESC_COLS, start=1):
        cc = ws.cell(HEAD_ROW, i, h)
        cc.font = HDR_F
        cc.fill = (HDR_FILL if kind == "in"
                   else PatternFill("solid", fgColor="E2E2E2"))
        cc.alignment = Alignment(horizontal="center", vertical="center",
                                 wrap_text=True)
        cc.border = Border(left=thin, right=thin, top=thin, bottom=med)
    ws.row_dimensions[HEAD_ROW].height = 34

    dv_j = DataValidation(type="list", formula1=f'"{",".join(ESC_JUDGE)}"',
                          allow_blank=True)
    dv_c = DataValidation(type="list", formula1='"✓"', allow_blank=True)
    ws.add_data_validation(dv_j)
    ws.add_data_validation(dv_c)

    # 案件管理から引く列の対応（上申シートの見出し → 案件管理の見出し）
    PULL = {"No": "No", "企業名": "企業名", "事業内容": "事業内容",
            "業種区分": "業種区分", "譲渡価格": "譲渡価格",
            "実態EBITDA": "実態EBITDA", MULT_H: MULT_H,
            "売上": "売上", "総合判定": "総合判定", "達成率": "達成率",
            "友井コメント（初期検討メモ）": "初期検討メモ",
            "ステータス": "ステータス"}
    V = d["総合判定"]
    for r in range(FIRST, LAST + 1):
        guard = f'IF(OR($B{r}="",$B{r}="—"),""'
        ws[f"{E['上申区分']}{r}"] = (
            f'=IF(案件管理!${d["No"]}{r}="","",'
            f'IF(OR($A{r}="✓",LEFT(案件管理!${V}{r},2)="A："),"◎ 上申対象",'
            f'IF(LEFT(案件管理!${V}{r},2)="B：","△ 要相談","—")))')
        for h, src_h in PULL.items():
            ws[f"{E[h]}{r}"] = f'={guard},案件管理!${d[src_h]}{r})'
        for h, mark in (("×が付いた項目", "×"), ("要確認（－）の項目", "－")):
            parts = "&".join(
                f'IF(案件管理!${c_}{r}="{mark}","{n} ","")'
                for n, c_ in zip(ITEM_NAMES, EVC))
            ws[f"{E[h]}{r}"] = f'={guard},{parts})'
        for i, (h, _, kind) in enumerate(ESC_COLS, start=1):
            cc = ws.cell(r, i)
            cc.font = BODY_F
            cc.border = BOX
            cc.fill = IN_FILL if kind == "in" else CALC_FILL
            cc.alignment = Alignment(
                vertical="top",
                wrap_text=h in ("事業内容", "友井コメント（初期検討メモ）",
                                "服部コメント", "指示後の次アクション",
                                "×が付いた項目", "要確認（－）の項目"))
        ws.cell(r, 1).alignment = Alignment(horizontal="center")
        ws[f"{E['譲渡価格']}{r}"].number_format = "#,##0.0"
        ws[f"{E['実態EBITDA']}{r}"].number_format = "#,##0.0"
        ws[f"{E['売上']}{r}"].number_format = "#,##0.0"
        ws[f"{E[MULT_H]}{r}"].number_format = '0.0"倍"'
        ws[f"{E['達成率']}{r}"].number_format = "0%"
        ws[f"{E['上申日']}{r}"].number_format = "yyyy/mm/dd"
        dv_j.add(ws[f"{E['服部判断']}{r}"])
        dv_c.add(ws[f"A{r}"])

    for i, (h, w, _) in enumerate(ESC_COLS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = f"{E['事業内容']}{FIRST}"
    b = E["上申区分"]
    for txt, color in [("◎ 上申対象", "B7E1CD"), ("△ 要相談", "FFF2CC")]:
        ws.conditional_formatting.add(
            f"{b}{FIRST}:{b}{LAST}",
            FormulaRule(formula=[f'EXACT({b}{FIRST},"{txt}")'],
                        fill=PatternFill("solid", fgColor=color)))
    ws.auto_filter.ref = f"A{HEAD_ROW}:{get_column_letter(len(ESC_COLS))}{LAST}"


# ════════════════════════════════════════════════════════════════
#  仲介会社管理シート
# ════════════════════════════════════════════════════════════════
MED_ATTRS = [("仲介会社名", 28), ("合計", 8), ("仲介重要度", 10), ("担当者", 10),
             ("初回面談日", 11), ("NDA締結日", 13), ("備考", 24), ("手数料", 14),
             ("算定方式", 14), ("着手金", 11), ("中間報酬", 11)]
MED_TAIL = [("年間\n流入計", 9), ("年間\n合致計", 9), ("合致率", 9)]


def build_mediators(ws, d):
    n_attr = len(MED_ATTRS)
    first_m = n_attr + 1                       # 月次列の開始（L）
    ws["A1"] = ("※条件合致＝EV/EBITDAマルチプルが上限以下 かつ 実態EBITDAが範囲内 かつ "
                "業種区分がNG業種以外。しきい値は判定基準タブ（下部のパラメータ）で変更できます。")
    ws["A1"].font = NOTE_F
    ws.merge_cells(f"A1:{get_column_letter(n_attr + 24 + 3)}1")

    for i, (h, _) in enumerate(MED_ATTRS, start=1):
        ws.merge_cells(start_row=2, start_column=i, end_row=3, end_column=i)
        c = ws.cell(2, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL
        c.alignment = Alignment(horizontal="center", vertical="center",
                                wrap_text=True)
    for k, (y, m) in enumerate(MONTHS):
        c0 = first_m + k * 2
        ws.merge_cells(start_row=2, start_column=c0, end_row=2, end_column=c0 + 1)
        c = ws.cell(2, c0, f"{y}年{m}月")
        c.font = BAND_F
        c.fill = PatternFill("solid", fgColor="3D6B8E")
        c.alignment = Alignment(horizontal="center", vertical="center")
        for off, lab in ((0, "流入\n案件数"), (1, "条件合致\n案件数")):
            cc = ws.cell(3, c0 + off, lab)
            cc.font = HDR_F
            cc.fill = HDR_FILL
            cc.alignment = Alignment(horizontal="center", vertical="center",
                                     wrap_text=True)
    tail0 = first_m + 24
    for i, (h, _) in enumerate(MED_TAIL):
        col = tail0 + i
        ws.merge_cells(start_row=2, start_column=col, end_row=3, end_column=col)
        c = ws.cell(2, col, h)
        c.font = BAND_F
        c.fill = PatternFill("solid", fgColor="2E6B4F")
        c.alignment = Alignment(horizontal="center", vertical="center",
                                wrap_text=True)
    ws.row_dimensions[2].height = 20
    ws.row_dimensions[3].height = 30

    inflow = f'案件管理!${d["流入日"]}${FIRST}:${d["流入日"]}${LAST}'
    med = f'案件管理!${d["仲介会社"]}${FIRST}:${d["仲介会社"]}${LAST}'
    eb = f'案件管理!${d["実態EBITDA"]}${FIRST}:${d["実態EBITDA"]}${LAST}'
    mu = f'案件管理!${d[MULT_H]}${FIRST}:${d[MULT_H]}${LAST}'
    sec = f'案件管理!${d["業種区分"]}${FIRST}:${d["業種区分"]}${LAST}'

    def month_args(y, m):
        y2, m2 = (y + 1, 1) if m == 12 else (y, m + 1)
        return (f'{inflow},">="&DATE({y},{m},1),'
                f'{inflow},"<"&DATE({y2},{m2},1)')

    # 合計行（4行目）
    ws.cell(4, 1, "全社合計").font = HDR_F
    ws.cell(4, 1).fill = PatternFill("solid", fgColor="F3F3F3")
    ws.cell(4, 2, "合計").font = HDR_F
    ws.cell(4, 2).fill = PatternFill("solid", fgColor="F3F3F3")
    for i in range(1, tail0 + len(MED_TAIL)):
        cc = ws.cell(4, i)
        cc.fill = PatternFill("solid", fgColor="F3F3F3")
        cc.border = BOX
        cc.font = Font(name=FONT, size=10, bold=True, color=INK)
    for c0 in range(first_m, tail0 + len(MED_TAIL)):
        cl = get_column_letter(c0)
        ws[f"{cl}4"] = f"=SUM({cl}{MED_FIRST}:{cl}{MED_LAST})"
        ws[f"{cl}4"].font = Font(name=FONT, size=10, bold=True, color=INK)
    rate_cl = get_column_letter(tail0 + 2)
    in_cl, hit_cl = get_column_letter(tail0), get_column_letter(tail0 + 1)
    ws[f"{rate_cl}4"] = (f'=IF({in_cl}4=0,"",{hit_cl}4/{in_cl}4)')
    ws[f"{rate_cl}4"].number_format = "0%"

    # 会社行
    for j, rowdata in enumerate(MEDIATORS):
        r = MED_FIRST + j
        for i in range(1, n_attr + 1):
            v = rowdata[i - 1] if i - 1 < len(rowdata) else None
            cc = ws.cell(r, i)
            if i == 2:
                cc.fill = CALC_FILL
            else:
                cc.fill = IN_FILL
                if v is not None:
                    if i in (5, 6) and isinstance(v, str) and len(v) == 10 \
                            and v[4] == "-":
                        from datetime import date
                        y_, m_, dd_ = (int(x) for x in v.split("-"))
                        cc.value = date(y_, m_, dd_)
                        cc.number_format = "yyyy/mm/dd"
                    else:
                        cc.value = v
            cc.font = BODY_F
            cc.border = BOX
            cc.alignment = Alignment(vertical="top", wrap_text=(i == 7))
        for k, (y, m) in enumerate(MONTHS):
            c0 = first_m + k * 2
            a = month_args(y, m)
            ws.cell(r, c0).value = f"=COUNTIFS({a},{med},$A{r})"
            ws.cell(r, c0 + 1).value = (
                f"=COUNTIFS({a},{med},$A{r},"
                f'{eb},">="&判定基準!$B${P_EB_LO},'
                f'{eb},"<="&判定基準!$B${P_EB_HI},'
                f'{mu},"<="&判定基準!$B${P_MULT},'
                f'{sec},"<>"&判定基準!$B${P_EXCL})')
            for off in (0, 1):
                cc = ws.cell(r, c0 + off)
                cc.font = BODY_F
                cc.fill = CALC_FILL
                cc.border = BOX
                cc.alignment = Alignment(horizontal="center")
        in_r = "+".join(get_column_letter(first_m + k * 2) + str(r)
                        for k in range(12))
        hit_r = "+".join(get_column_letter(first_m + k * 2 + 1) + str(r)
                         for k in range(12))
        ws[f"{in_cl}{r}"] = f"={in_r}"
        ws[f"{hit_cl}{r}"] = f"={hit_r}"
        ws[f"{rate_cl}{r}"] = f'=IF({in_cl}{r}=0,"",{hit_cl}{r}/{in_cl}{r})'
        ws[f"{rate_cl}{r}"].number_format = "0%"
        for cl in (in_cl, hit_cl, rate_cl):
            cc = ws[f"{cl}{r}"]
            cc.font = BODY_F
            cc.fill = CALC_FILL
            cc.border = BOX
            cc.alignment = Alignment(horizontal="center")

    for i, (h, w) in enumerate(MED_ATTRS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for c0 in range(first_m, tail0):
        ws.column_dimensions[get_column_letter(c0)].width = 9
    for i, (h, w) in enumerate(MED_TAIL):
        ws.column_dimensions[get_column_letter(tail0 + i)].width = w
    ws.freeze_panes = "B4"
    dv_r = DataValidation(type="list", formula1='"A,B,C"', allow_blank=True)
    ws.add_data_validation(dv_r)
    for r in range(MED_FIRST, MED_LAST + 1):
        dv_r.add(ws.cell(r, 3))
    ws.conditional_formatting.add(
        f"C{MED_FIRST}:C{MED_LAST}",
        FormulaRule(formula=[f'EXACT(C{MED_FIRST},"A")'],
                    fill=PatternFill("solid", fgColor="B7E1CD")))


def build_choices(ws):
    ws["A1"] = "選択肢（ドロップダウンの元データ）"
    ws["A1"].font = TITLE_F
    ws["A2"] = None
    cols = [("A", "業種区分", SECTORS, 34), ("C", "ステータス", STATUS, 16),
            ("E", "評価", ["◯", "△〜◯", "△", "×〜△", "×", "－"], 8),
            ("G", "服部判断", ESC_JUDGE, 18),
            ("I", "質問の分類", Q_CATEGORIES, 24),
            ("K", "優先度", Q_PRIORITY, 10),
            ("M", "質問の状態", Q_STATUS, 16)]
    for col, h, vals, w in cols:
        c = ws[f"{col}2"]
        c.value = h
        c.font = HDR_F
        c.fill = HDR_FILL
        for i, v in enumerate(vals, start=3):
            ws[f"{col}{i}"] = v
            ws[f"{col}{i}"].font = BODY_F
        ws.column_dimensions[col].width = w
    for col in ("B", "D", "F", "H", "J", "L"):
        ws.column_dimensions[col].width = 2
    ws["A20"] = ("仲介会社の一覧はここには置いていない。仲介会社管理シートのA列が唯一の正で、"
                 "案件管理の仲介会社ドロップダウンはそこを直接参照している。"
                 "会社を増やすときは仲介会社管理シートに行を足し、"
                 "tools/build_pipeline.py の MED_LAST が指す範囲を広げること。")
    ws["A20"].font = NOTE_F
    ws["A20"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A20:M22")


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
    ws.cell(PARAM_ROW - 2, 1, "条件合致の判定パラメータ").font = TITLE_F
    ws.cell(PARAM_ROW - 1, 1,
            "仲介会社管理シートの「条件合致案件数」は、この4つのしきい値で"
            "案件管理タブを数えている。ここを直せば36社×12ヶ月すべてに効く。").font = NOTE_F
    ws.merge_cells(start_row=PARAM_ROW - 1, start_column=1,
                   end_row=PARAM_ROW - 1, end_column=5)
    params = [
        ("実態EBITDA 下限（百万円）", 50, "投資条件：調整後EBITDA 5,000万〜4億円"),
        ("実態EBITDA 上限（百万円）", 400, "同上"),
        ("EV/EBITDAマルチプル 上限（倍）", 7, "投資条件タブ No.5 の記載値。"
                                              "友井タブは5倍、仲介向け資料は6倍で不一致"),
        ("除外する業種区分", "NG業種7カテゴリ", "案件管理タブの業種区分の値と完全一致させる"),
    ]
    for i, (label, val, note) in enumerate(params, start=PARAM_ROW):
        ws.cell(i, 1, label).font = BODY_F
        c = ws.cell(i, 2, val)
        c.font = Font(name=FONT, size=10, bold=True, color=BLUE_TXT)
        c.fill = IN_FILL
        c.border = BOX
        c.alignment = Alignment(horizontal="center")
        ws.cell(i, 3, note).font = NOTE_F
        ws.merge_cells(start_row=i, start_column=3, end_row=i, end_column=5)

    for col, w in [("A", 30), ("B", 24), ("C", 30), ("D", 30), ("E", 34), ("F", 7)]:
        ws.column_dimensions[col].width = w


wb = Workbook()
ws_deal = wb.active
ws_deal.title = "案件管理"
ws_q = wb.create_sheet("質問リスト")
ws_esc = wb.create_sheet("友井→服部")
ws_med = wb.create_sheet("仲介会社管理シート")
ws_cri = wb.create_sheet("判定基準")
ws_cho = wb.create_sheet("選択肢")

build_deals(ws_deal)
build_questions(ws_q, L)
build_escalation(ws_esc, L)
build_mediators(ws_med, L)
build_criteria(ws_cri)
build_choices(ws_cho)

out = "案件管理表_TeamEnergy.xlsx"
wb.save(out)
print("saved", out)
print(f"案件管理   列{len(COLS)} 評価{EVC[0]}〜{EVC[-1]} Must{MUST} 判定{VERDICT_C}{RATE_C}")
print(f"友井→服部  列{len(ESC_COLS)} 行{FIRST}〜{LAST}（案件管理と1:1）")
print(f"質問リスト  {len(QUESTIONS)}件 行{Q_FIRST}〜{Q_LAST}")
print(f"仲介会社   {len(MEDIATORS)}社 行{MED_FIRST}〜{MED_LAST} "
      f"月次{MONTHS[0][0]}/{MONTHS[0][1]}〜{MONTHS[-1][0]}/{MONTHS[-1][1]}")
