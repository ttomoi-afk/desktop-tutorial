/**
 * (TE版)投資検討_テンプレ_2607ver に「初期検討」タブを生成する。
 *
 * 対象は `投資条件` タブの青塗り（#CFE2F3）＝友井が初期検討で担当する12項目と
 * 基本情報3行のみ。No.6/7/10/13/14/15 は他メンバー担当なので載せない。
 *
 * 使い方
 *   1. スプレッドシートを開く → 拡張機能 → Apps Script
 *   2. このファイルの内容を貼って保存
 *   3. 関数 createScreeningSheet を一度実行（初回のみ承認が出る）
 *   4. 以降はシート上部のメニュー「初期検討」から作成できる
 */

var SHEET_PREFIX = '初期検討';
var GRADES = ['◯', '△〜◯', '△', '×〜△', '×', '－'];
var BLUE = '#cfe2f3';

/** No, 評価軸, 評価基準, Must か */
var ITEMS = [
  ['1-1', '投資ポリシーとの合致', '業種ターゲットとの整合（重点業種①②③／NG7カテゴリ／追加候補業種A・B・C群）', true],
  ['1-2', '投資ポリシーとの合致', '4億円以下のTE拠出額で承継できるか（株式価値＋承継コスト−買収借入）', true],
  ['1-3', '投資ポリシーとの合致', '非キャッシュ性資産が重くないか（有形固定資産＋棚卸）÷実態EBITDA', false],
  ['2',   '安定黒字か', '実態EBITDAが3期連続黒字か', true],
  ['3',   '付加価値は高いか', '3期連続で粗利率30%以上か', false],
  ['4',   '永続性は高いか', '市場は10年後も残り続けるか', false],
  ['5',   '価格は割高ではないか', '②(EV＋承継コスト)/EBITDA ※①EV/EBITDA も根拠欄に併記。EVは実質NetCash（簿価NetCash−平均必要運転資金）で算出', true],
  ['8-1', '事業ボラティリティは低いか', 'ストック型かフロー型か（定期契約・会費のストック比率）', false],
  ['8-2', '事業ボラティリティは低いか', '流行り廃りはあるか', false],
  ['9',   '売却理由', '隠された大きなリスクは無いか', false],
  ['11',  '特定取引先に依存していないか', '上位1社の売上比率／仕入比率（悪い方で判定）', false],
  ['12',  '特定人材に依存していないか', '依存している人材はいないか、いる場合は代替可能か', false]
];

var HDR = 22;              // 評価表の見出し行
var SALES_MIN = 300, SALES_MAX = 3000;   // 売上目安（百万円）
var TOP = HDR + 1;         // 明細の先頭行
var BOT = HDR + ITEMS.length;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('初期検討')
    .addItem('新規シートを作成', 'createScreeningSheet')
    .addToUi();
}

function createScreeningSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = uniqueName_(ss, SHEET_PREFIX);
  var sh = ss.insertSheet(name, ss.getNumSheets());

  buildHead_(sh);
  buildSummary_(sh);
  buildVerdict_(sh);
  buildTable_(sh);
  styleSheet_(sh);

  sh.activate();
  SpreadsheetApp.getUi().alert(
    'シート「' + name + '」を作成しました。\n' +
    '評価列はプルダウン（◯／△〜◯／△／×〜△／×／－）です。\n' +
    '－ は判定不能。達成率の分母から外れます。');
  return sh;
}

function uniqueName_(ss, base) {
  if (!ss.getSheetByName(base)) return base;
  for (var i = 2; i < 200; i++) {
    if (!ss.getSheetByName(base + '_' + i)) return base + '_' + i;
  }
  return base + '_' + new Date().getTime();
}

function buildHead_(sh) {
  sh.getRange('A1').setValue('初期検討サマリー').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('案件名');
  sh.getRange('A3').setValue('仲介会社');
  sh.getRange('A4').setValue('出所（案件概要書）');
  ['B2:D2', 'B3:D3', 'B4:D4'].forEach(function (a) { sh.getRange(a).merge(); });
  sh.getRange('E2').setValue('作成日');
  sh.getRange('F2').setValue(new Date()).setNumberFormat('yyyy/mm/dd');

  sh.getRange('A6').setValue('基本情報（○△×は付けない。事実を記録する）')
    .setFontWeight('bold').setBackground(BLUE);
  sh.getRange('A6:G6').merge();
  var rows = [
    ['価格', '希望株式価値と算定根拠（純資産＋営業権○年、EBITDA○倍 等）。幅があれば下限・上限'],
    ['進行期業績', '進行期の売上・実態EBITDA見込みと前期比。月次進捗があれば何ヶ月経過時点か'],
    ['意向表明期限', '仲介提示の期限日。記載がなければ「未提示」']
  ];
  for (var i = 0; i < rows.length; i++) {
    var r = 7 + i;
    sh.getRange(r, 1).setValue(rows[i][0]).setFontWeight('bold');
    sh.getRange(r, 2, 1, 6).merge().setNote(rows[i][1]);
  }
}

/**
 * 数値サマリー（管理表転記用）。譲渡価格・EBITDA・EV/EBITDAマルチプル・売上 の4項目。
 * マルチプルは入力値から再計算されるので、数字を直せば追随する。
 */
function buildSummary_(sh) {
  sh.getRange('A11').setValue('数値サマリー（管理表転記用・単位：百万円）')
    .setFontWeight('bold').setBackground(BLUE);
  sh.getRange('A11:G11').merge();

  var mult =
    '=IF(OR($B$12="",$B$13="",$B$15="",$B$16="",$B$13<=0),"",' +
    '($B$12-($B$15-$B$16))/$B$13)';
  var book =
    '=IF(OR($B$12="",$B$13="",$B$15="",$B$13<=0),"",($B$12-$B$15)/$B$13)';
  var lo = SALES_MIN.toLocaleString('en-US');
  var hi = SALES_MAX.toLocaleString('en-US');
  var band = '売上目安 ' + lo + '〜' + hi;
  var salesChk =
    '=IF($B$14="","",IF($B$14<' + SALES_MIN + ',"' + band +
    ' の下限未満（投資条件友井 No.20 で対象外）",IF($B$14>' + SALES_MAX + ',"' + band +
    ' の上限超（投資条件友井 No.20 で対象外）","' + band + ' の範囲内")))';

  // [ラベル, 入力かどうか, 数式, 右側の注記]
  var rows = [
    ['譲渡価格',               true,  null,   '希望株式価値。条件付き（進行期の純資産積み上げ分 等）はここに明記'],
    ['実態EBITDA（直近期）',   true,  null,   '役員報酬・私的経費等の調整後。実態収益＋減価償却費'],
    ['売上（直近期）',         true,  null,   salesChk],
    ['簿価NetCash',            true,  null,   '現預金 − 有利子負債。マイナスなら NetDebt'],
    ['平均必要運転資金',       true,  null,   '3期分の（売上債権＋棚卸（仕掛工事含む）−仕入債務）の平均'],
    ['EV/EBITDAマルチプル',    false, mult,   'TE定義：EV＝譲渡価格−実質NetCash（＝簿価NetCash−平均必要運転資金）'],
    ['参考：簿価NetDebtベース', false, book,  '運転資金を調整しない倍率。仲介提示値との突き合わせ用']
  ];
  for (var i = 0; i < rows.length; i++) {
    var r = 12 + i;
    sh.getRange(r, 1).setValue(rows[i][0]).setFontWeight('bold');
    var v = sh.getRange(r, 2);
    if (rows[i][2]) {
      v.setFormula(rows[i][2]).setNumberFormat('0.0"倍"').setFontWeight('bold');
    } else {
      v.setNumberFormat('#,##0.0').setBackground('#fffde7');   // 入力セル
    }
    var note = sh.getRange(r, 3, 1, 5).merge();
    if (String(rows[i][3]).charAt(0) === '=') note.setFormula(rows[i][3]);
    else note.setValue(rows[i][3]).setFontColor('#7f7f7f').setFontSize(9);
  }
  sh.getRange('A12:G18').setBorder(true, true, true, true, true, true);
  sh.getRange('B12:B18').setHorizontalAlignment('right');
}

/** ◯2.0 / △〜◯1.5 / △1.0 / ×〜△0.5 / ×0。－ は加算も分母もしない。 */
function scoreExpr_() {
  var r = 'E' + TOP + ':E' + BOT;
  return "COUNTIF(" + r + ',"◯")*2+COUNTIF(' + r + ',"△〜◯")*1.5+COUNTIF(' + r +
         ',"△")+COUNTIF(' + r + ',"×〜△")*0.5';
}

function judgedExpr_() {
  var r = 'E' + TOP + ':E' + BOT;
  return "COUNTIF(" + r + ',"◯")+COUNTIF(' + r + ',"△〜◯")+COUNTIF(' + r +
         ',"△")+COUNTIF(' + r + ',"×〜△")+COUNTIF(' + r + ',"×")';
}

function buildVerdict_(sh) {
  var rng = 'E' + TOP + ':E' + BOT;
  var mst = 'D' + TOP + ':D' + BOT;

  var verdict =
    '=LET(sc,' + scoreExpr_() + ',jd,' + judgedExpr_() +
    ',nx,COUNTIF(' + rng + ',"×")' +
    ',mx,SUMPRODUCT((' + mst + '="必須")*(' + rng + '="×"))' +
    ',IF(jd=0,"未入力"' +
    ',IF(mx>0,"C：見送り（Must項目に ×）"' +
    ',IF(nx>=2,"C：見送り（× が2項目以上）"' +
    ',IF(jd<6,"B：追加情報を取得して再判定（概要書の情報量が不足）"' +
    ',IF(AND(nx=0,sc/(jd*2)>=0.75),"A：進める（トップ面談・基本合意検討へ）"' +
    ',"B：追加情報を取得して再判定"))))))';

  var rate =
    '=LET(sc,' + scoreExpr_() + ',jd,' + judgedExpr_() +
    ',IF(jd=0,"",TEXT(sc/(jd*2),"0%")&"　（得点 "&TEXT(sc,"0.0")&"／判定済 "&jd&"/' +
    ITEMS.length + ' 件）"))';

  sh.getRange('A20').setValue('総合判定').setFontWeight('bold');
  sh.getRange('B20:D20').merge().setFormula(verdict)
    .setFontWeight('bold').setFontSize(11);
  sh.getRange('E20').setValue('達成率').setFontWeight('bold');
  sh.getRange('F20:G20').merge().setFormula(rate);
  sh.getRange('A20:G20').setBackground('#f3f3f3');
}

function buildTable_(sh) {
  var head = ['No', '評価軸', '評価基準', '必須', '評価', '根拠（1行）', '確認事項'];
  sh.getRange(HDR, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground(BLUE)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  var body = ITEMS.map(function (it) {
    return [it[0], it[1], it[2], it[3] ? '必須' : '', '', '', ''];
  });
  sh.getRange(TOP, 1, body.length, 7).setValues(body);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(GRADES, true)
    .setAllowInvalid(false)
    .setHelpText('◯／△〜◯／△／×〜△／× のいずれか。判定できないときは －')
    .build();
  sh.getRange(TOP, 5, ITEMS.length, 1).setDataValidation(rule);

  sh.getRange(TOP, 1, ITEMS.length, 1).setHorizontalAlignment('center');
  sh.getRange(TOP, 4, ITEMS.length, 2).setHorizontalAlignment('center');
  sh.getRange(HDR, 1, ITEMS.length + 1, 7).setBorder(true, true, true, true, true, true);
  sh.getRange(TOP, 1, ITEMS.length, 7).setVerticalAlignment('top').setWrap(true);
}

function styleSheet_(sh) {
  var w = [160, 130, 300, 54, 86, 330, 300];
  for (var i = 0; i < w.length; i++) sh.setColumnWidth(i + 1, w[i]);
  sh.setFrozenRows(HDR);

  var cell = sh.getRange(TOP, 5, ITEMS.length, 1);
  var colors = {'◯': '#b7e1cd', '△〜◯': '#d9ead3', '△': '#fff2cc',
                '×〜△': '#fce5cd', '×': '#f4c7c3', '－': '#efefef'};
  var rules = [];
  Object.keys(colors).forEach(function (g) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(g)
      .setBackground(colors[g])
      .setRanges([cell]).build());
  });
  // Must 行を太字に
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$D' + TOP + '="必須"')
    .setBold(true)
    .setRanges([sh.getRange(TOP, 1, ITEMS.length, 3)]).build());
  sh.setConditionalFormatRules(rules);

  var note = sh.getRange(HDR, 4);
  note.setNote('Must項目（1-1・1-2・2・5）に × が1つでも付いたら総合C。' +
               '他項目の ◯ で埋め合わせない。');
  sh.getRange(HDR, 5).setNote('－ は判定不能。達成率の分母から外れる。' +
                              '－ が多いこと自体が情報開示の質の情報になる。');
}
