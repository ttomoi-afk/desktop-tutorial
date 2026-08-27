/**
 * Setup.gs — 初期セットアップとスプレッドシート上のメニュー
 *
 * メンバー名簿は「設定」タブで編集する。スクリプトプロパティのJSONを直接触らなくて済む。
 * ただし APIキー等の秘密情報だけはシートに置かず、スクリプトプロパティに保存する。
 */

var SHEET_SETTINGS = '設定';
var SETTINGS_HEADERS = ['キー', '氏名', 'タブ名', '別名（／区切り）', 'LINE userId', 'メールアドレス'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('タスク投げ込み')
    .addItem('① 初期セットアップ', 'setup')
    .addItem('② Claude APIキーを設定…', 'promptApiKey')
    .addSeparator()
    .addItem('設定タブを開く', 'openSettings')
    .addItem('設定タブの内容を保存', 'loadSettingsFromSheet')
    .addSeparator()
    .addItem('スマホ用URL・Webhook URLを表示', 'showUrls')
    .addItem('解析テスト（書き込みなし）', 'testParse')
    .addToUi();
}

/** 受信箱・設定タブを作り、URL用トークンを発行する */
function setup() {
  var ui = safeUi_();
  ensureInbox_();
  ensureSettingsSheet_();

  if (!prop_('CAPTURE_TOKEN', '')) {
    props_().setProperty('CAPTURE_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  }
  if (!prop_('WRITE_TO_PERSON_SHEET', '')) {
    props_().setProperty('WRITE_TO_PERSON_SHEET', 'true');
  }

  var msg = 'セットアップが完了しました。\n\n' +
    '1. 「設定」タブでメンバーの タブ名 / LINE userId / メール を確認・記入\n' +
    '2. メニュー「② Claude APIキーを設定…」でキーを登録\n' +
    '3. デプロイ > 新しいデプロイ > ウェブアプリ（アクセス：全員）で公開\n' +
    '4. メニュー「スマホ用URL・Webhook URLを表示」で URL を取得\n\n' +
    'APIキーを登録しなくても簡易パーサで動きますが、日本語の読み取り精度は下がります。';
  if (ui) ui.alert('タスク投げ込み', msg, ui.ButtonSet.OK); else console.log(msg);
}

/** 設定タブを用意する（すでにあれば触らない） */
function ensureSettingsSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_SETTINGS);
  if (sh) return sh;

  sh = ss.insertSheet(SHEET_SETTINGS);
  sh.getRange(1, 1).setValue('設定：この表を編集したら メニュー「タスク投げ込み」→「設定タブの内容を保存」を押してください')
    .setFontWeight('bold');
  sh.getRange(3, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS])
    .setFontWeight('bold').setBackground('#e8f0e6');

  var members = getMembers_();
  var rows = members.map(function (m) {
    return [m.key, m.full || '', m.sheet || m.key, (m.aliases || []).join('／'), m.lineUserId || '', m.email || ''];
  });
  if (rows.length) sh.getRange(4, 1, rows.length, SETTINGS_HEADERS.length).setValues(rows);

  var infoRow = 4 + rows.length + 2;
  sh.getRange(infoRow, 1).setValue('個人タブへ転記する（false にすると受信箱だけに貯める）').setFontWeight('bold');
  sh.getRange(infoRow, 2).setValue('true');
  sh.getRange(infoRow + 2, 1).setValue('※ LINE userId は、LINEで「id」とだけ送ると本人に返信されます。');
  sh.getRange(infoRow + 3, 1).setValue('※ APIキーなどの秘密情報はこのタブには置きません（スクリプトプロパティに保存されます）。');

  sh.setColumnWidth(4, 260);
  sh.setColumnWidth(5, 260);
  sh.setColumnWidth(6, 220);
  return sh;
}

function openSettings() {
  var sh = ensureSettingsSheet_();
  ss_().setActiveSheet(sh);
}

/** 設定タブ → スクリプトプロパティへ反映 */
function loadSettingsFromSheet() {
  var ui = safeUi_();
  var sh = ss_().getSheetByName(SHEET_SETTINGS);
  if (!sh) {
    if (ui) ui.alert('「設定」タブがありません。先に「① 初期セットアップ」を実行してください。');
    return;
  }
  var last = sh.getLastRow();
  var members = [];
  for (var r = 4; r <= last; r++) {
    var v = sh.getRange(r, 1, 1, SETTINGS_HEADERS.length).getDisplayValues()[0];
    var key = String(v[0]).trim();
    if (!key) continue;
    if (key.indexOf('個人タブ') === 0 || key.indexOf('※') === 0) break;
    members.push({
      key: key,
      full: String(v[1]).trim(),
      sheet: String(v[2]).trim() || key,
      aliases: String(v[3]).split(/[／\/,、]/).map(function (s) { return s.trim(); }).filter(String),
      lineUserId: String(v[4]).trim(),
      email: String(v[5]).trim()
    });
  }
  if (!members.length) {
    if (ui) ui.alert('メンバーが1人も読み取れませんでした。4行目以降に「キー」を入力してください。');
    return;
  }
  setMembers_(members);

  // 転記トグル
  for (var r2 = 4; r2 <= last; r2++) {
    if (String(sh.getRange(r2, 1).getDisplayValue()).indexOf('個人タブへ転記') === 0) {
      var flag = String(sh.getRange(r2, 2).getDisplayValue()).trim().toLowerCase();
      props_().setProperty('WRITE_TO_PERSON_SHEET', (flag === 'false' || flag === 'いいえ') ? 'false' : 'true');
      break;
    }
  }
  try { CacheService.getScriptCache().remove('projects'); } catch (e) {}

  var msg = members.length + '人の設定を保存しました。\n' +
            members.map(function (m) { return '・' + m.key + ' → ' + m.sheet + ' タブ'; }).join('\n');
  if (ui) ui.alert('保存しました', msg, ui.ButtonSet.OK); else console.log(msg);
}

/** Claude APIキーの登録（入力値はシートに残らない） */
function promptApiKey() {
  var ui = safeUi_();
  if (!ui) { console.log('スプレッドシートのメニューから実行してください。'); return; }
  var cur = prop_('ANTHROPIC_API_KEY', '');
  var res = ui.prompt(
    'Claude APIキー',
    'console.anthropic.com で発行したキー（sk-ant- で始まる）を貼り付けてください。\n' +
    (cur ? '※ 現在すでに登録済みです。空のままOKを押すと変更しません。\n' : '') +
    '※ 入力内容はスクリプトプロパティに保存され、シートには残りません。',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) { ui.alert('変更しませんでした。'); return; }
  props_().setProperty('ANTHROPIC_API_KEY', key);
  ui.alert('保存しました', 'APIキーを登録しました。メニュー「解析テスト」で動作を確認できます。', ui.ButtonSet.OK);
}

/** デプロイ済みURLとトークンを表示 */
function showUrls() {
  var ui = safeUi_();
  var token = prop_('CAPTURE_TOKEN', '');
  var base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) {}

  var msg;
  if (!base) {
    msg = 'まだウェブアプリとしてデプロイされていません。\n\n' +
          'エディタ右上の「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」→\n' +
          '　次のユーザーとして実行：自分\n' +
          '　アクセスできるユーザー：全員\n' +
          'で公開してから、もう一度この項目を開いてください。';
  } else {
    var url = base + (token ? '?k=' + token : '');
    msg = '【スマホ用 投げ込みページ】ホーム画面に追加して使います\n' + url +
          '\n\n【LINE / Google Chat の Webhook URL】同じURLをそのまま貼ります\n' + url +
          '\n\n※ このURLを知っていれば誰でも書き込めます。チーム内だけで共有してください。';
  }
  if (ui) ui.alert('URL', msg, ui.ButtonSet.OK); else console.log(msg);
}

/** 書き込まずに解析結果だけ確認する */
function testParse() {
  var ui = safeUi_();
  var sample = '友井さんへ。今月中までに、弟子屈で使えそうな補助金を全部洗い出して欲しい。' +
               '特に新しい車を買うための助成金や補助金は急いで探して欲しい。';
  var text = sample;
  if (ui) {
    var res = ui.prompt('解析テスト', '解析したい文章を入力してください（空ならサンプルを使います）。\n\nサンプル:\n' + sample, ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    text = res.getResponseText().trim() || sample;
  }

  var parsed = parseMessage_(text, '');
  var lines = parsed.tasks.map(function (t, i) {
    return (i + 1) + '. 担当:' + (t.assignee || '（不明）') +
           ' / 案件:' + (t.project || '—') +
           '\n   ' + t.title +
           (t.detail ? '\n   詳細: ' + t.detail : '') +
           '\n   期限: ' + (t.due || '—') + (t.dueText ? '（' + t.dueText + '）' : '') +
           ' / 優先度: ' + t.priority;
  });
  var msg = '解析エンジン: ' + parsed.engine +
            (parsed.note ? '\n注記: ' + parsed.note : '') +
            '\n\n' + (lines.length ? lines.join('\n\n') : 'タスクは検出されませんでした') +
            '\n\n※これはテストです。シートには書き込んでいません。';
  if (ui) ui.alert('解析テスト', msg, ui.ButtonSet.OK); else console.log(msg);
}

function safeUi_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
