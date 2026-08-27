/**
 * SheetIO.gs — スプレッドシートの読み書き
 *
 * 設計の要点:
 *  - 「受信箱」タブが機械の正本。投稿は必ず全件ここに原文つきで残る（あとから検索・修正できる）。
 *  - 個人タブへの転記は、既存レイアウトを壊さないよう「見出し行を探して列を特定 → 末尾に追記」だけを行う。
 *    共香タブのように表がB列から始まっていても、結合セルが混ざっていても壊れない。
 */

var INBOX_HEADERS = [
  'ID', '受信日時', '経路', '依頼者', '担当者', 'プロジェクト', 'タスク', 'タスク詳細',
  '期限', '期限(原文)', '優先度', '状況', '転記先', '解析エンジン', '元メッセージ'
];

/** 受信箱タブを用意する（無ければ作る） */
function ensureInbox_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_INBOX);
  if (!sh) {
    sh = ss.insertSheet(SHEET_INBOX, 0);
  }
  if (sh.getLastRow() === 0 || String(sh.getRange(1, 1).getValue()) !== 'ID') {
    sh.getRange(1, 1, 1, INBOX_HEADERS.length).setValues([INBOX_HEADERS]);
    sh.getRange(1, 1, 1, INBOX_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#e8f0e6');
    sh.setFrozenRows(1);
    sh.setColumnWidth(7, 260);   // タスク
    sh.setColumnWidth(8, 260);   // タスク詳細
    sh.setColumnWidth(15, 380);  // 元メッセージ
  }
  return sh;
}

/** 受信箱へ1件追記して、採番したIDを返す */
function logInbox_(rec) {
  var sh = ensureInbox_();
  var id = 'T' + Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmmss') +
           '-' + Math.floor(Math.random() * 900 + 100);
  sh.appendRow([
    id,
    nowStr_(),
    rec.source || '',
    rec.requester || '',
    rec.assignee || '',
    rec.project || '',
    rec.title || '',
    rec.detail || '',
    toDate_(rec.due) || rec.dueText || '',
    rec.dueText || '',
    rec.priority || '中',
    rec.status || '',
    rec.wroteTo || '',
    rec.engine || '',
    rec.rawMessage || ''
  ]);
  return id;
}

/** タブ名を末尾空白・全半角のゆれを許して引く（「友井 」対策） */
function matchSheetName_(name) {
  var ss = ss_();
  var direct = ss.getSheetByName(name);
  if (direct) return direct;
  var want = norm_(name);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (norm_(sheets[i].getName()) === want) return sheets[i];
  }
  return null;
}

/** メンバーの個人タブを取得。無ければ「原本」をコピーして作る。 */
function getPersonSheet_(member, createIfMissing) {
  var sh = matchSheetName_(member.sheet || member.key);
  if (sh) return sh;
  if (!createIfMissing) return null;

  var ss = ss_();
  var tpl = matchSheetName_(SHEET_TEMPLATE);
  if (!tpl) return null;
  var created = tpl.copyTo(ss).setName(member.sheet || member.key);
  ss.setActiveSheet(created);
  ss.moveActiveSheet(ss.getNumSheets());
  // テンプレートの見出し（「　さん タスク一覧」）を本人の名前に差し替える
  var a1 = String(created.getRange(1, 1).getValue() || '');
  if (a1.indexOf('タスク一覧') >= 0) {
    created.getRange(1, 1).setValue((member.full || member.key) + 'さん タスク一覧（プロジェクト別）');
  }
  return created;
}

/**
 * 見出し行を探して列番号を割り出す。
 * 上から12行をスキャンし、「タスク」と「期限」が同じ行に並んでいる行を見出し行とみなす。
 * @return {{headerRow:number, cols:{project:number,title:number,detail:number,due:number,status:number}}|null}
 */
function mapColumns_(sheet) {
  var scanRows = Math.min(12, sheet.getMaxRows());
  var scanCols = Math.min(20, sheet.getMaxColumns());
  if (scanRows < 1 || scanCols < 1) return null;
  var grid = sheet.getRange(1, 1, scanRows, scanCols).getDisplayValues();

  for (var r = 0; r < scanRows; r++) {
    var cols = { project: 0, title: 0, detail: 0, due: 0, status: 0 };
    for (var c = 0; c < scanCols; c++) {
      var cell = norm_(grid[r][c]);
      if (!cell) continue;
      for (var key in COL_KEYS) {
        if (cols[key]) continue;                  // 先に見つかった方を採用
        var names = COL_KEYS[key];
        for (var n = 0; n < names.length; n++) {
          if (cell === norm_(names[n])) { cols[key] = c + 1; break; }
        }
      }
    }
    // 「タスク」と「期限」が揃っていれば見出し行と判断
    if (cols.title && cols.due) {
      return { headerRow: r + 1, cols: cols };
    }
  }
  return null;
}

/** 追記して安全な行を探す（結合セルとシート末尾を避ける） */
function findAppendRow_(sheet, map) {
  var cols = [map.cols.project, map.cols.title, map.cols.detail, map.cols.due, map.cols.status]
    .filter(function (c) { return c > 0; });
  var minCol = Math.min.apply(null, cols);
  var maxCol = Math.max.apply(null, cols);
  var start = map.headerRow + 1;
  var lastRow = sheet.getLastRow();

  var used = map.headerRow;
  if (lastRow >= start) {
    var vals = sheet.getRange(start, minCol, lastRow - start + 1, maxCol - minCol + 1).getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      for (var j = 0; j < vals[i].length; j++) {
        if (String(vals[i][j]).trim() !== '') { used = start + i; break; }
      }
    }
  }

  var row = used + 1;
  // 結合セルにぶつかったら1行ずつ下げる（結合範囲へ書くと表示が崩れるため）
  for (var guard = 0; guard < 50; guard++) {
    if (row > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), 5);
    }
    if (!sheet.getRange(row, minCol, 1, maxCol - minCol + 1).isPartOfMerge()) break;
    row++;
  }
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 5);
  return row;
}

/**
 * 個人タブへ1件転記する。
 * @return {{ok:boolean, sheet:string, row:number, reason:string}}
 */
function appendToPersonSheet_(member, task) {
  var sh = getPersonSheet_(member, true);
  if (!sh) return { ok: false, sheet: '', row: 0, reason: '個人タブが見つからず、テンプレート「' + SHEET_TEMPLATE + '」も無いため作成できませんでした' };

  var map = mapColumns_(sh);
  if (!map) return { ok: false, sheet: sh.getName().trim(), row: 0, reason: '「タスク」「期限」の見出し行が見つかりませんでした' };

  var row = findAppendRow_(sh, map);
  var c = map.cols;

  if (c.project) sh.getRange(row, c.project).setValue(task.project || '');
  if (c.title)   sh.getRange(row, c.title).setValue(task.title || '');

  if (c.detail) {
    var detail = task.detail || '';
    if (task.requester) detail = '（' + task.requester + 'さん依頼）' + (detail ? ' ' + detail : '');
    if (task.priority === '高') detail = '【急ぎ】' + detail;
    sh.getRange(row, c.detail).setValue(detail);
  }

  if (c.due) {
    var d = toDate_(task.due);
    var cell = sh.getRange(row, c.due);
    if (d) {
      cell.setValue(d).setNumberFormat('yyyy/M/d');
    } else {
      cell.setValue(task.dueText || '');
    }
  }
  // 状況は空＝未着手。既存シートの慣習に合わせて何も書かない。

  return { ok: true, sheet: sh.getName().trim(), row: row, reason: '' };
}

/**
 * 解析済みタスクを書き込む本体。受信箱には必ず、個人タブには可能なら転記する。
 * @param {Array} tasks 解析結果
 * @param {{source:string, rawMessage:string, engine:string}} meta
 * @return {Array} 1件ごとの結果
 */
function writeTasks_(tasks, meta) {
  meta = meta || {};
  var toPerson = prop_('WRITE_TO_PERSON_SHEET', 'true') !== 'false';
  var out = [];

  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var member = t.assignee ? findMember_(t.assignee) : null;
    var res = { ok: false, sheet: '', row: 0, reason: '' };

    if (!member) {
      res.reason = '担当者を特定できませんでした';
    } else if (!toPerson) {
      res.reason = '個人タブへの転記は設定でオフになっています';
    } else {
      try {
        res = appendToPersonSheet_(member, t);
      } catch (err) {
        res = { ok: false, sheet: member.sheet || member.key, row: 0, reason: String(err) };
      }
    }

    var id = logInbox_({
      source: meta.source || '',
      requester: t.requester || '',
      assignee: member ? member.key : (t.assigneeRaw || ''),
      project: t.project,
      title: t.title,
      detail: t.detail,
      due: t.due,
      dueText: t.dueText,
      priority: t.priority,
      status: res.ok ? '転記済' : '要確認',
      wroteTo: res.ok ? (res.sheet + '!' + res.row + '行') : '',
      engine: meta.engine || '',
      rawMessage: meta.rawMessage || ''
    });

    out.push({
      id: id,
      task: t,
      assignee: member ? member.key : '',
      wrote: res.ok,
      sheet: res.sheet,
      row: res.row,
      reason: res.reason
    });
  }
  // 案件一覧のキャッシュを捨てて、次の解析に新しい案件名が反映されるようにする
  try { CacheService.getScriptCache().remove('projects'); } catch (e) {}
  return out;
}

/** 全個人タブから既存の案件名を集める（AIに既存案件を使わせるため）。10分キャッシュ。 */
function collectProjects_() {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var hit = cache.get('projects');
    if (hit) return JSON.parse(hit);
  } catch (e) {}

  var seen = {}, list = [];
  var sheets = ss_().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    if (SKIP_SHEETS.indexOf(sh.getName()) >= 0) continue;
    var map = null;
    try { map = mapColumns_(sh); } catch (e) { continue; }
    if (!map || !map.cols.project) continue;
    var last = sh.getLastRow();
    if (last <= map.headerRow) continue;
    var vals = sh.getRange(map.headerRow + 1, map.cols.project, last - map.headerRow, 1).getDisplayValues();
    for (var r = 0; r < vals.length; r++) {
      var v = String(vals[r][0]).trim();
      if (!v || v.length > 30 || seen[v]) continue;
      seen[v] = true;
      list.push(v);
      if (list.length >= 60) break;
    }
    if (list.length >= 60) break;
  }

  try { if (cache) cache.put('projects', JSON.stringify(list), 600); } catch (e) {}
  return list;
}
