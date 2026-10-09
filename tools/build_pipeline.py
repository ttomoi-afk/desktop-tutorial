# -*- coding: utf-8 -*-
"""案件管理表を生成する。

タブ構成
  案件管理            1行=1案件。企業名・事業内容＋数値＋青塗り12項目の◯△×＋判定＋進行
                      4〜6行に判定基準を敷いて見出しごと固定。判定はAI総合判定（自動）と
                      友井判定（手入力A/B/C）の2本
  取込                Claudeが出したTSVを貼る場所。1回の取込＝1案件。
                      Apps Script（gas/案件取込.gs）が案件管理と質問リストへ振り分ける
  質問リスト           1行=1質問。仲介の案件担当者に聞く文面と、回答で動く評価項目
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

# 3=帯 4〜6=判定基準（◯／△／×の3行）7=列見出し 8〜107=明細
# 判定基準タブを見に行かずに済むよう、基準を見出しの直上に置いて見出しごと固定する。
BAND_ROW = 3
CRIT_O, CRIT_D, CRIT_X = 4, 5, 6
HEAD_ROW = 7
FIRST, LAST = 8, 107            # 8=記入例 9,10=実案件 11〜107=入力用
EVAL_W = 7.0                    # ◯△×12列の幅。基準帯の文字が3行で収まる幅
GRADE_LIST = "◯,△〜◯,△,×〜△,×,－"
TOMOI_LIST = "A,B,C"            # 友井判定（手入力）のドロップダウン
GRADE_COLORS = [("◯", "B7E1CD"), ("△〜◯", "D9EAD3"), ("△", "FFF2CC"),
                ("×〜△", "FCE5CD"), ("×", "F4C7C3"), ("－", "EFEFEF")]
SALES_MIN, SALES_MAX = 300, 3000

# 仲介会社管理シートの月次列。アップロード版は 9〜12月が3回繰り返されていたので
# 事業年度（9月開始）12ヶ月に振り直した。年度が違う場合はここだけ直せばよい。
FY_START = (2026, 9)
MONTHS = [((FY_START[0] + (FY_START[1] - 1 + i) // 12),
           ((FY_START[1] - 1 + i) % 12) + 1) for i in range(12)]
Q_FIRST, Q_LAST = 4, 303          # 質問リストの行範囲
# 取込タブの固定行。Apps Script（gas/案件取込.gs）が同じ番号を見る。
IN_DEAL_HEAD, IN_DEAL_ROW = 5, 6
IN_Q_HEAD, IN_Q_FIRST, IN_Q_LAST = 9, 10, 59
IN_LOG_ROW = 61
MED_FIRST = 5                     # 仲介会社の先頭行
MED_LAST = MED_FIRST + len(MEDIATORS) - 1
# 選択肢タブの「服部判断」に出す語。上申シート自体は廃止したが語は残す。
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

# 12項目: (短い見出し, 吹き出しに出す評価軸と基準, Must か,
#          基準帯に出す◯, 同△, 同×)
# 基準帯の3文字列は列幅7に3行で収まる長さ（全角9文字まで）に詰めてある。
ITEMS = [
    ("1-1", "投資ポリシーとの合致／業種ターゲットとの整合\n"
            "◯ 重点業種①②③に直接該当／△ 追加B群で罠を回避できる形／× NG業種7カテゴリ・追加C群", True,
     "重点①②③", "追加B群", "NG7・追加C群"),
    ("1-2", "投資ポリシーとの合致／1件あたりの資金負担\n"
            "TE自己資金拠出額（ネット所要資金−買収借入）が買収予算25億円に占める割合\n"
            "◯ 20%以下（5億円）／△ 30〜40%（7.5〜10億円）／× 50%超（12.5億円超）", False,
     "20%以下", "30〜40%", "50%超"),
    ("1-3", "投資ポリシーとの合致／非キャッシュ性資産が重くないか\n"
            "（有形固定資産＋棚卸）÷実態EBITDA　◯ 2.0倍以下／△ 3.0〜5.0倍／× 8.0倍超", True,
     "2.0倍以下", "3〜5倍", "8倍超"),
    ("2", "安定黒字か／実態EBITDAが3期連続黒字か\n"
          "◯ 3期連続黒字かつ増加基調／△ 直近が前期比▲20%以上／× 2期以上赤字", True,
     "3期黒字で増加", "直近▲20%超", "2期以上赤字"),
    ("3", "付加価値は高いか／3期連続で粗利率30%以上か\n"
          "◯ 3期すべて30%以上／△ 3期平均25〜30%／× 3期平均20%未満・5pt以上低下", False,
     "3期30%以上", "平均25〜30%", "平均20%未満"),
    ("4", "永続性は高いか／市場は10年後も残り続けるか\n"
          "◯ 人口動態・法定需要が後押し／△ 横ばい・代替技術の影響が読めない／× 構造的に消える", False,
     "法定・人口が後押し", "横ばい", "10年で消える"),
    ("5", "価格は割高ではないか／②(EV＋承継コスト)/EBITDA\n"
          "EV＝譲渡価格−実質NetCash（＝簿価NetCash−平均必要運転資金）\n"
          "◯ 5.0倍以下／△ 6.0〜7.0倍／× 8.0倍超", True,
     "②5.0倍以下", "②6〜7倍", "②8倍超"),
    ("8-1", "事業ボラティリティは低いか／ストック型かフロー型か\n"
            "◯ ストック比率70%以上／△ リピート中心だが契約なし／× スポット・案件単位が主", False,
     "ストック70%超", "リピートのみ", "スポット主"),
    ("8-2", "事業ボラティリティは低いか／流行り廃りはあるか\n"
            "◯ 生活必需・法定需要／△ 一部商材がトレンド依存／× 嗜好・流行・立地が売上を左右", False,
     "生活必需・法定", "一部トレンド", "嗜好・流行・立地"),
    ("9", "売却理由／隠された大きなリスクは無いか\n"
          "◯ 高齢・後継者不在で業績と整合／△ 理由が一般的で裏付け不足／× 業績悪化・係争の兆候と符合", False,
     "高齢・後継者不在", "裏付け不足", "業績悪化と符合"),
    ("11", "特定取引先に依存していないか／上位1社の売上比率・仕入比率（悪い方）\n"
           "◯ 10%未満／△ 20〜30%／× 50%以上・代替不能な単一発注先", False,
     "上位1社10%未満", "20〜30%", "50%以上"),
    ("12", "特定人材に依存していないか／依存人材の代替可能性\n"
           "◯ 社長不在でも運営可／△ 社長の営業依存（顧問就任で緩和）／× 有資格者が社長のみ・職人依存", False,
     "社長不在でも可", "社長の営業依存", "社長のみ有資格"),
]
ITEM_NAMES = [it[0] for it in ITEMS]

# (見出し, 幅, 種別)  種別 in=入力 / calc=数式 / eval=◯△× / hide=内部計算
# 並びは「1画面で読める順」。先頭からステータスまでで約230文字幅＝1画面に収まる。
# 仲介・価格の内訳・保管先は毎回見ないので右側にまとめた。
COLS = (
    [("No", 5, "in"), ("企業名", 22, "in")]
    + [("事業内容", 30, "in"), ("業種区分", 18, "in")]
    + [("譲渡価格", 9, "in"), ("実態EBITDA", 10, "in"), (MULT_H, 11, "calc"),
       ("売上", 9, "in")]
    + [(("★\n" if it[2] else "") + it[0], EVAL_W, "eval") for it in ITEMS]
    + [("AI総合判定", 16, "calc"), ("友井判定", 8, "manual"),
       ("達成率", 8, "calc"), ("未解決\n質問", 7, "calc")]
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
MUST = [EVC[i] for i, it in enumerate(ITEMS) if it[2]]
SCORE_C, JUDGED_C = L["得点"], L["判定済"]
NX_C, MUSTX_C = L["×件数"], L["Must×"]
VERDICT_C, RATE_C = L["AI総合判定"], L["達成率"]
TOMOI_C = L["友井判定"]
OPENQ_C = L["未解決\n質問"]

BANDS = [  # (開始見出し, 終了見出し, ラベル, 色)
    ("No", "企業名", "キー", "5B7C99"),
    ("事業内容", "業種区分", "案件情報", "7B8B9A"),
    ("譲渡価格", "売上", "主要数値（単位：百万円）", "3D6B8E"),
    (COLS[EV_FIRST - 1][0], COLS[EV_LAST - 1][0],
     "初期検討（投資条件タブ 青塗り12項目）　★=Must", "1F4E79"),
    ("AI総合判定", "未解決\n質問", "判定（AI＝自動／友井＝手入力）", "2E6B4F"),
    ("ステータス", "見送り理由", "進行管理", "6B7F8C"),
    ("流入日", "備考", "補足（仲介・価格の内訳・保管先）", "9AA5AD"),
]


def eval_rng(r):
    return f"${EVC[0]}{r}:${EVC[-1]}{r}"

# 基準帯（4〜6行）に出す文章。◯△×12項目だけは列ごとに3行で書き、
# それ以外のグループは帯の幅いっぱいに1枠でまとめる。
# キーは BANDS のラベルと一致させる（ずれたら build_deals が KeyError で落ちる）。
CRIT_ROWS = [(CRIT_O, "◯ ＝ 2.0点", 3, "B7E1CD"),
             (CRIT_D, "△ ＝ 1.0点", 4, "FFF2CC"),
             (CRIT_X, "× ＝ 0点", 5, "F4C7C3")]
CRIT_NOTE_FILL = PatternFill("solid", fgColor="FAFAFA")
CRIT_NOTES = {
    "案件情報":
        "業種区分は選択肢タブの8区分から選ぶ。\n"
        "NG業種7カテゴリ・追加C群を選んだ案件は 1-1 が×（＝Mustなので総合C）。",
    "主要数値（単位：百万円）":
        "EV ＝ 譲渡価格 −（簿価NetCash − 平均必要運転資金）\n"
        "マルチプル② ＝（EV ＋ 承継コスト）÷ 実態EBITDA。7倍超は赤く出る。\n"
        f"売上の目安は {SALES_MIN:,}〜{SALES_MAX:,} 百万円。"
        "青塗り外の条件なので◯△×には入れず、範囲外を赤く出すだけ。",
    "判定（AI＝自動／友井＝手入力）":
        "A：進める ＝ ×ゼロ かつ 達成率75%以上\n"
        "B：追加情報 ＝ 上記以外。判定済が6項目未満のときは達成率に関わらずB\n"
        "C：見送り ＝ Must（1-1・1-3・2・5）に×が1つ以上、または全体で×が2項目以上\n"
        "友井判定はAI判定を手で上書きする欄（A／B／C）。"
        "AI判定の頭文字と違う字を入れると、その案件だけ紫に変わる。",
    "進行管理":
        "スコアは ◯2.0／△〜◯1.5／△1.0／×〜△0.5／×0。\n"
        "－ は判定不能。加算もせず達成率の分母にも入れない（情報が足りない案件は"
        "達成率が高く出やすいので、判定済の数も一緒に見る）。\n"
        "達成率 ＝ 得点 ÷（判定済 × 2）。",
    "補足（仲介・価格の内訳・保管先）":
        "ルーブリックの正本は .claude/skills/deal-screening/references/rubric.md。"
        "この帯はその写しなので、閾値を変えるときは両方直すこと。\n"
        "買収に必要な金額の積み上げ（譲渡日に用意する額／ネット所要資金）は "
        "references/acquisition-funding.md。\n"
        "仲介会社管理シートの「条件合致案件数」のしきい値は判定基準タブの下部にある。",
}


def build_criteria_band(ws):
    """判定基準を列見出しの直上に敷く。見出しごと固定するので、
    どの案件行までスクロールしても◯△×の基準が目に入る。"""
    for row, label, idx, color in CRIT_ROWS:
        ws.merge_cells(f'{L["No"]}{row}:{L["企業名"]}{row}')
        c = ws[f'{L["No"]}{row}']
        c.value = label
        c.font = Font(name=FONT, size=10, bold=True, color=INK)
        c.fill = PatternFill("solid", fgColor=color)
        c.alignment = Alignment(horizontal="right", vertical="center")
        c.border = BOX
        for i, it in enumerate(ITEMS):
            cc = ws[f"{EVC[i]}{row}"]
            cc.value = it[idx]
            cc.font = Font(name=FONT, size=8, color=INK)
            cc.fill = PatternFill("solid", fgColor=color)
            cc.alignment = Alignment(horizontal="center", vertical="center",
                                     wrap_text=True)
            cc.border = BOX
        ws.row_dimensions[row].height = 33
        ws.row_dimensions[row].outlineLevel = 1   # 畳めるようにしておく

    for start, end, label, _ in BANDS:
        note = CRIT_NOTES.get(label)
        if note is None:
            continue
        ws.merge_cells(f"{L[start]}{CRIT_O}:{L[end]}{CRIT_X}")
        c = ws[f"{L[start]}{CRIT_O}"]
        c.value = note
        c.font = NOTE_F
        c.fill = CRIT_NOTE_FILL
        c.alignment = Alignment(horizontal="left", vertical="top",
                                wrap_text=True)
        for r in range(CRIT_O, CRIT_X + 1):
            for cl in range(ws[f"{L[start]}1"].column, ws[f"{L[end]}1"].column + 1):
                ws.cell(r, cl).border = BOX


def build_deals(ws, samples=True):
    ws["A1"] = "案件管理（初期検討まで1ページ）"
    ws["A1"].font = TITLE_F
    ws["A2"] = (f"【凡例】薄い黄色＝入力欄、灰色＝自動計算（触らない）。金額は百万円。"
                f"{CRIT_O}〜{CRIT_X}行目が判定基準で、見出しごと固定してあるので"
                f"どこまでスクロールしても見えます（左の＋−で畳めます）。"
                f"もっと詳しい基準は◯△×の見出しを右クリック→メモ。"
                f"判定はAI総合判定（自動）と友井判定（手入力のA／B／C）の2本立て。"
                f"{FIRST}行目は架空の記入例（削除可）、{FIRST + 1}行目以降が実案件。"
                f"得点・判定済などの内部計算列は右端に隠してあります。")
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

    build_criteria_band(ws)

    # 列見出し
    for i, (h, _, kind) in enumerate(COLS, start=1):
        c = ws.cell(HEAD_ROW, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL if kind in ("in", "eval", "manual") else PatternFill(
            "solid", fgColor="E2E2E2")
        c.alignment = Alignment(horizontal="center", vertical="center",
                                wrap_text=True)
        c.border = Border(left=thin, right=thin, top=thin, bottom=med)
    ws.row_dimensions[HEAD_ROW].height = 34
    # 12項目の見出しに評価基準をメモで付ける（短縮名だけでは伝わらないため）
    for i, (short, tip, must, *_) in enumerate(ITEMS):
        c = ws[f"{EVC[i]}{HEAD_ROW}"]
        body = ("【Must】×が1つでも付けば総合C\n" if must else "") + tip
        c.comment = Comment(body, "deal-screening", height=150, width=430)
    ws[f"{TOMOI_C}{HEAD_ROW}"].comment = Comment(
        "友井さんが手で付ける総合判定（A／B／C）。\n"
        "AI総合判定はルーブリックの機械的な集計なので、"
        "業種の毛色・代表判断・交渉余地のような数字に落ちない論点は反映されない。\n"
        "ここに入れた字がAI総合判定の頭文字と違うと、そのセルが紫になる。\n"
        "A＝進める／B＝追加情報を取得して再判定／C＝見送り",
        "deal-screening", height=130, width=360)

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
    dv_m = DataValidation(type="list", formula1=f'"{TOMOI_LIST}"', allow_blank=True,
                          showErrorMessage=True, errorTitle="友井判定の入力",
                          error="A／B／C から選んでください")
    for dv in (dv_g, dv_i, dv_s, dv_t, dv_m):
        ws.add_data_validation(dv)

    for r in range(FIRST, LAST + 1):
        rng = eval_rng(r)
        for i, (h, _, kind) in enumerate(COLS, start=1):
            c = ws.cell(r, i)
            c.font = BODY_F
            c.border = BOX
            c.fill = IN_FILL if kind in ("in", "eval", "manual") else CALC_FILL
            if kind in ("eval", "manual"):
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
        # 未解決の質問件数。状態が空欄（未質問）も未解決として数える。
        # 列全体を数える：質問リストを下に伸ばしても数え漏れない
        # （行を固定していたら、304行目より下の質問が数えられていなかった）
        ws[f"{OPENQ_C}{r}"] = (
            f'=IF($A{r}="","",COUNTIFS('
            f'質問リスト!$A:$A,$A{r},'
            f'質問リスト!${Q_STATE_C}:${Q_STATE_C},"<>解決"))')
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
        dv_m.add(ws[f"{TOMOI_C}{r}"])

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
    rows = (((FIRST, ex, ex_g), (FIRST + 1, real, real_g),
             (FIRST + 2, real2, real2_g)) if samples else ())
    for row, data, grades in rows:
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
    # 先に入れた規則の方が優先される。食い違いの紫を A/B/C の色より前に置く。
    tm = f"{TOMOI_C}{FIRST}:{TOMOI_C}{LAST}"
    ws.conditional_formatting.add(tm, FormulaRule(
        formula=[f'AND({TOMOI_C}{FIRST}<>"",{VERDICT_C}{FIRST}<>"",'
                 f'{TOMOI_C}{FIRST}<>LEFT({VERDICT_C}{FIRST},1))'],
        fill=PatternFill("solid", fgColor="D9D2E9"), stopIfTrue=True))
    for letter, color in [("A", "B7E1CD"), ("B", "FFF2CC"), ("C", "F4C7C3")]:
        ws.conditional_formatting.add(tm, FormulaRule(
            formula=[f'EXACT({TOMOI_C}{FIRST},"{letter}")'],
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
#  取込（ClaudeのTSVを貼る場所）
# ════════════════════════════════════════════════════════════════
IN_Q_COLS = ["分類", "質問（このまま読める文）", "何を確かめたいか", "関連項目", "優先度"]


def build_intake(ws, d):
    """案件管理の入力列をそのまま見出しに使う。Apps Script は見出し名で対応を取るので
    列の順番が変わっても取り違えない。"""
    deal_heads = [h for h, _, k in COLS if k in ("in", "eval") and h != "No"]

    ws["A1"] = "取込（案件概要書の分析結果を貼る）"
    ws["A1"].font = TITLE_F
    ws["A2"] = ("① Claudeに案件概要書を渡す → ② 出てきたTSVを下の2ブロックに貼る"
                "（■案件は1行だけ、■質問は何行でも）→ "
                "③ メニュー「案件取込」→「取込を実行」。"
                "案件Noは自動で振られ、質問の全行に同じ案件Noが入ります。"
                "取込が終わると貼った内容は自動でクリアされます。"
                "企業名が既にある案件と一致した場合は、上書きするか新規追加するかを聞きます。")
    ws["A2"].font = NOTE_F
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(f"A2:{get_column_letter(max(len(deal_heads), 12))}2")
    ws.row_dimensions[2].height = 42

    def band(row, text, color, span):
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
        c = ws.cell(row, 1, text)
        c.font = BAND_F
        c.fill = PatternFill("solid", fgColor=color)
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[row].height = 18

    band(IN_DEAL_HEAD - 1, "■ 案件（1行だけ貼る。No は自動で振られます）",
         "3D6B8E", len(deal_heads))
    for i, h in enumerate(deal_heads, start=1):
        c = ws.cell(IN_DEAL_HEAD, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(left=thin, right=thin, top=thin, bottom=med)
        cc = ws.cell(IN_DEAL_ROW, i)
        cc.fill = IN_FILL
        cc.border = BOX
        cc.font = BODY_F
        cc.alignment = Alignment(vertical="top", wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width = \
            next(w for hh, w, _ in COLS if hh == h)
    ws.row_dimensions[IN_DEAL_HEAD].height = 34
    ws.row_dimensions[IN_DEAL_ROW].height = 40

    band(IN_Q_HEAD - 1, "■ この案件への質問（何行でも。案件Noは取込時に入ります）",
         "1F4E79", len(IN_Q_COLS))
    for i, h in enumerate(IN_Q_COLS, start=1):
        c = ws.cell(IN_Q_HEAD, i, h)
        c.font = HDR_F
        c.fill = HDR_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(left=thin, right=thin, top=thin, bottom=med)
    for r in range(IN_Q_FIRST, IN_Q_LAST + 1):
        for i in range(1, len(IN_Q_COLS) + 1):
            cc = ws.cell(r, i)
            cc.fill = IN_FILL
            cc.border = BOX
            cc.font = BODY_F
            cc.alignment = Alignment(vertical="top", wrap_text=True)

    ws.cell(IN_LOG_ROW, 1, "取込ログ").font = HDR_F
    ws.cell(IN_LOG_ROW, 1).fill = PatternFill("solid", fgColor="F3F3F3")
    ws.merge_cells(start_row=IN_LOG_ROW, start_column=2,
                   end_row=IN_LOG_ROW, end_column=max(len(deal_heads), 8))
    ws.cell(IN_LOG_ROW, 2, "（取込を実行すると、ここに結果が出ます）").font = NOTE_F
    ws.freeze_panes = "A5"


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
    ws["A2"] = (f"この表の内容は案件管理タブの{CRIT_O}〜{CRIT_X}行目に短縮して敷いてある"
                "ので、普段はそちらを見ればよい。このタブは全文の控えと、"
                "下部の「条件合致の判定パラメータ」（仲介会社管理シートの集計が参照する"
                "唯一の置き場）のために残している。"
                "正本は .claude/skills/deal-screening/references/rubric.md。"
                "閾値を変えるときは rubric.md・このタブ・案件管理タブの基準帯の3つを直すこと。")
    ws["A2"].font = NOTE_F
    rows = [
        ("No", "評価軸", "◯", "△", "×", "Must"),
        ("1-1", "業種ターゲットとの整合", "重点業種①②③に直接該当",
         "追加B群（罠を回避できる形）", "NG業種7カテゴリ／追加C群", "★"),
        ("1-2", "1件あたりの資金負担（買収予算25億円比）", "20%以下（5億円）",
         "30〜40%（7.5〜10億円）", "50%超（12.5億円超）", ""),
        ("1-3", "非キャッシュ性資産", "EBITDA比2.0倍以下", "3.0〜5.0倍",
         "8.0倍超／装置産業・不動産主体", "★"),
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
        ("C：見送り", "Must項目（1-1・1-3・2・5）に×が1つ以上、または全体で×が2項目以上"),
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


SHEETS = ["案件管理", "取込", "質問リスト", "仲介会社管理シート", "判定基準", "選択肢"]


def build_book(samples=True):
    wb = Workbook()
    ws_deal = wb.active
    ws_deal.title = SHEETS[0]
    sh = {SHEETS[0]: ws_deal}
    for name in SHEETS[1:]:
        sh[name] = wb.create_sheet(name)
    build_deals(sh["案件管理"], samples=samples)
    build_intake(sh["取込"], L)
    build_questions(sh["質問リスト"], L)
    build_mediators(sh["仲介会社管理シート"], L)
    build_criteria(sh["判定基準"])
    build_choices(sh["選択肢"])
    return wb


def main():
    wb = build_book()
    out = "案件管理表_TeamEnergy.xlsx"
    wb.save(out)
    print("saved", out)
    print(f"案件管理   列{len(COLS)} 評価{EVC[0]}〜{EVC[-1]} Must{MUST} "
          f"判定{VERDICT_C}（AI）/{TOMOI_C}（友井）{RATE_C}")
    print(f"           基準帯{CRIT_O}〜{CRIT_X}行 見出し{HEAD_ROW}行 明細{FIRST}〜{LAST}行")
    print(f"取込       案件列{len([h for h, _, k in COLS if k in ('in', 'eval') and h != 'No'])}"
          f" / 質問行{IN_Q_FIRST}〜{IN_Q_LAST}")
    print(f"質問リスト  {len(QUESTIONS)}件 行{Q_FIRST}〜{Q_LAST}")
    print(f"仲介会社   {len(MEDIATORS)}社 行{MED_FIRST}〜{MED_LAST} "
          f"月次{MONTHS[0][0]}/{MONTHS[0][1]}〜{MONTHS[-1][0]}/{MONTHS[-1][1]}")


if __name__ == "__main__":
    main()
