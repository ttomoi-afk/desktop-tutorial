/**
 * 取込タブに貼った内容を、案件管理と質問リストに振り分ける。
 *
 * 使い方
 *   1. 案件管理表をGoogleスプレッドシートに変換して開く
 *   2. 拡張機能 → Apps Script → このファイルを貼って保存
 *   3. 関数 onOpen を一度実行（初回のみ承認が出る）
 *   4. 以降はシート上部のメニュー「案件取込」から実行
 *
 * 前提
 *   ・取込タブの行位置は tools/build_pipeline.py の IN_* 定数と揃えてある
 *   ・列は見出し名で対応を取るので、案件管理の列順が変わっても壊れない
 */

var SH_DEAL = '案件管理';
var SH_Q = '質問リスト';
var SH_IN = '取込';

var DEAL_HEAD_ROW = 4;      // 案件管理の見出し行
var DEAL_FIRST = 5;         // 案件管理の明細先頭
var Q_HEAD_ROW = 3;         // 質問リストの見出し行
var Q_FIRST = 4;            // 質問リストの明細先頭

var IN_DEAL_HEAD = 5, IN_DEAL_ROW = 6;
var IN_Q_HEAD = 9, IN_Q_FIRST = 10, IN_Q_LAST = 59;
var IN_LOG_ROW = 61;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('案件取込')
    .addItem('取込を実行', 'importDeal')
    .addItem('貼った内容をクリア', 'clearIntake')
    .addToUi();
}

/** 見出し行を読んで {見出し: 列番号} を返す。改行は詰める。 */
function headerMap_(sh, row) {
  var last = sh.getLastColumn();
  var vals = sh.getRange(row, 1, 1, last).getValues()[0];
  var m = {};
  for (var i = 0; i < vals.length; i++) {
    var h = String(vals[i] === null ? '' : vals[i]).replace(/\n/g, '').trim();
    if (h && !(h in m)) m[h] = i + 1;
  }
  return m;
}

/** 案件管理で値が入っている最後の行の次。No列で判定する。 */
function nextDealRow_(sh, noCol) {
  var last = sh.getLastRow();
  for (var r = last; r >= DEAL_FIRST; r--) {
    if (sh.getRange(r, noCol).getValue() !== '') return r + 1;
  }
  return DEAL_FIRST;
}

function maxDealNo_(sh, noCol) {
  var last = sh.getLastRow();
  if (last < DEAL_FIRST) return 0;
  var vals = sh.getRange(DEAL_FIRST, noCol, last - DEAL_FIRST + 1, 1).getValues();
  var mx = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = Number(vals[i][0]);
    if (!isNaN(v) && v > mx) mx = v;
  }
  return mx;
}

/** 企業名が既にあればその行番号、なければ 0。 */
function findDealRowByName_(sh, nameCol, noCol, name) {
  var last = sh.getLastRow();
  if (!name || last < DEAL_FIRST) return 0;
  var vals = sh.getRange(DEAL_FIRST, 1, last - DEAL_FIRST + 1,
                         Math.max(nameCol, noCol)).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][nameCol - 1]).trim() === String(name).trim()) {
      return DEAL_FIRST + i;
    }
  }
  return 0;
}

function importDeal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var shIn = ss.getSheetByName(SH_IN);
  var shDeal = ss.getSheetByName(SH_DEAL);
  var shQ = ss.getSheetByName(SH_Q);
  if (!shIn || !shDeal || !shQ) {
    ui.alert('取込・案件管理・質問リストのいずれかのシートが見つかりません。');
    return;
  }

  var inHead = headerMap_(shIn, IN_DEAL_HEAD);
  var dealHead = headerMap_(shDeal, DEAL_HEAD_ROW);
  var qHead = headerMap_(shQ, Q_HEAD_ROW);

  // ── 貼られた案件の1行を読む ──────────────────────────────
  var inLast = shIn.getLastColumn();
  var dealVals = shIn.getRange(IN_DEAL_ROW, 1, 1, inLast).getValues()[0];
  var payload = {};
  var filled = 0;
  for (var h in inHead) {
    var v = dealVals[inHead[h] - 1];
    if (v !== '' && v !== null) { payload[h] = v; filled++; }
  }
  if (filled === 0) {
    ui.alert('■案件 の行が空です。TSVを ' + IN_DEAL_ROW + ' 行目に貼ってください。');
    return;
  }
  var name = payload['企業名'];
  if (!name) {
    ui.alert('企業名が空です。企業名は必須です。');
    return;
  }

  // ── 追加先の行と案件Noを決める ────────────────────────────
  var noCol = dealHead['No'];
  var nameCol = dealHead['企業名'];
  var existing = findDealRowByName_(shDeal, nameCol, noCol, name);
  var targetRow, dealNo, mode;
  if (existing) {
    var res = ui.alert(
      '「' + name + '」は既に ' + existing + ' 行目にあります。',
      'この行を上書きしますか？\n\n' +
      'はい  = ' + existing + ' 行目を上書き（質問は追加されます）\n' +
      'いいえ = 別案件として新しい行に追加',
      ui.ButtonSet.YES_NO_CANCEL);
    if (res === ui.Button.CANCEL) return;
    if (res === ui.Button.YES) {
      targetRow = existing;
      dealNo = shDeal.getRange(existing, noCol).getValue();
      mode = '上書き';
    }
  }
  if (!targetRow) {
    targetRow = nextDealRow_(shDeal, noCol);
    dealNo = maxDealNo_(shDeal, noCol) + 1;
    mode = '新規追加';
  }

  // ── 案件管理へ書き込む（数式列には触らない）──────────────────
  var wrote = [];
  shDeal.getRange(targetRow, noCol).setValue(dealNo);
  for (var h2 in payload) {
    var col = dealHead[h2];
    if (!col) continue;                        // 取込側にしかない見出しは無視
    var cell = shDeal.getRange(targetRow, col);
    if (String(cell.getFormula()).charAt(0) === '=') continue;   // 数式は守る
    cell.setValue(payload[h2]);
    wrote.push(h2);
  }

  // ── 質問を読む ────────────────────────────────────────
  var qIn = headerMap_(shIn, IN_Q_HEAD);
  var n = IN_Q_LAST - IN_Q_FIRST + 1;
  var qVals = shIn.getRange(IN_Q_FIRST, 1, n, shIn.getLastColumn()).getValues();
  var rows = [];
  for (var i = 0; i < qVals.length; i++) {
    var q = qVals[i][(qIn['質問（このまま読める文）'] || 2) - 1];
    if (q === '' || q === null) continue;
    rows.push({
      '分類': qVals[i][(qIn['分類'] || 1) - 1],
      '質問（このまま読める文）': q,
      '何を確かめたいか': qVals[i][(qIn['何を確かめたいか'] || 3) - 1],
      '関連項目': qVals[i][(qIn['関連項目'] || 4) - 1],
      '優先度': qVals[i][(qIn['優先度'] || 5) - 1]
    });
  }

  // ── 質問リストへ追記。案件Noを全行に入れ、Q#はその案件の続きから ──
  var added = 0;
  if (rows.length) {
    var qNoCol = qHead['案件No'];
    var qSeqCol = qHead['Q#'];
    var qLast = shQ.getLastRow();
    var seq = 0, writeRow = Q_FIRST;
    if (qLast >= Q_FIRST) {
      var exist = shQ.getRange(Q_FIRST, 1, qLast - Q_FIRST + 1,
                               Math.max(qNoCol, qSeqCol)).getValues();
      for (var j = 0; j < exist.length; j++) {
        if (exist[j][qNoCol - 1] !== '') {
          writeRow = Q_FIRST + j + 1;
          if (Number(exist[j][qNoCol - 1]) === Number(dealNo)) {
            var sq = Number(exist[j][qSeqCol - 1]);
            if (!isNaN(sq) && sq > seq) seq = sq;
          }
        }
      }
    }
    for (var k = 0; k < rows.length; k++) {
      var r = writeRow + k;
      shQ.getRange(r, qNoCol).setValue(dealNo);
      shQ.getRange(r, qSeqCol).setValue(seq + k + 1);
      for (var hh in rows[k]) {
        var c = qHead[hh];
        if (c && rows[k][hh] !== '' && rows[k][hh] !== null) {
          shQ.getRange(r, c).setValue(rows[k][hh]);
        }
      }
      if (qHead['状態']) shQ.getRange(r, qHead['状態']).setValue('未質問');
      added++;
    }
  }

  clearIntake_(shIn);
  var log = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
    + '　' + mode + '：案件No ' + dealNo + '「' + name + '」を '
    + targetRow + ' 行目へ（' + wrote.length + '項目）。質問 ' + added + ' 件を追加。';
  shIn.getRange(IN_LOG_ROW, 2).setValue(log);
  SpreadsheetApp.getUi().alert(log);
}

function clearIntake() {
  clearIntake_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_IN));
}

function clearIntake_(shIn) {
  var last = shIn.getLastColumn();
  shIn.getRange(IN_DEAL_ROW, 1, 1, last).clearContent();
  shIn.getRange(IN_Q_FIRST, 1, IN_Q_LAST - IN_Q_FIRST + 1, last).clearContent();
}
