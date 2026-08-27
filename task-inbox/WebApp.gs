/**
 * WebApp.gs — 公開エンドポイント
 *
 *  GET  ?k=<CAPTURE_TOKEN>          … スマホ用の投げ込みページ
 *  POST ?k=<CAPTURE_TOKEN>          … LINE / Google Chat / 汎用JSON の受け口
 *
 * 【重要】Apps Script の doPost は受信ヘッダーを読めないため、LINE の
 * X-Line-Signature による署名検証は実装できません。代わりに Webhook URL の
 * クエリ ?k= に推測困難なトークンを載せ、それを照合します。
 * トークンは URL ごと秘密として扱ってください（README のセキュリティ節を参照）。
 */

function doGet(e) {
  if (!checkToken_(e)) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:2rem;text-align:center">' +
      '<h2>リンクが正しくありません</h2><p>管理者から共有された URL をそのままお使いください。</p></div>'
    );
  }
  var tpl = HtmlService.createTemplateFromFile('Capture');
  tpl.members = getMembers_().map(function (m) {
    return { key: m.key, full: m.full || m.key };
  });
  tpl.token = (e && e.parameter && e.parameter.k) || '';
  return tpl.evaluate()
    .setTitle('タスク投げ込み')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  if (!checkToken_(e)) return jsonOut_({ ok: false, error: 'invalid token' });

  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut_({ ok: false, error: 'invalid json' });
  }

  try {
    // Google Chat のアプリイベント
    if (body.type && (body.message || body.space)) {
      return jsonOut_(handleChatEvent_(body));
    }
    // LINE Messaging API の Webhook
    if (body.events && body.events.length !== undefined) {
      handleLineEvents_(body.events);
      return jsonOut_({ ok: true });
    }
    // 汎用（iOSショートカット・他アプリなど）: {text, from}
    if (body.text) {
      var r = ingest_(body.text, body.from || '', body.source || 'api');
      return jsonOut_({ ok: true, results: r.results, engine: r.engine, note: r.note });
    }
  } catch (err) {
    console.error(err);
    return jsonOut_({ ok: false, error: String(err) });
  }
  return jsonOut_({ ok: false, error: 'unsupported payload' });
}

/** URL の ?k= と CAPTURE_TOKEN を照合。トークン未設定なら誰でも通る（推奨しない）。 */
function checkToken_(e) {
  var want = prop_('CAPTURE_TOKEN', '');
  if (!want) return true;
  var got = (e && e.parameter && e.parameter.k) || '';
  return got === want;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 解析 → 書き込みまでを一気に行う共通処理（チャット経由はこちら）。
 * @return {{results:Array, engine:string, note:string, tasks:Array}}
 */
function ingest_(text, requesterKey, source) {
  var parsed = parseMessage_(text, requesterKey);
  if (!parsed.tasks.length) {
    return { results: [], engine: parsed.engine, note: parsed.note || 'タスクは見つかりませんでした', tasks: [] };
  }
  var results = writeTasks_(parsed.tasks, {
    source: source,
    rawMessage: text,
    engine: parsed.engine
  });
  return { results: results, engine: parsed.engine, note: parsed.note, tasks: parsed.tasks };
}

/* ---------------- スマホ投げ込みページ用（google.script.run から呼ぶ） ---------------- */

/** 解析だけして候補を返す（まだシートには書かない） */
function apiParse(payload) {
  payload = payload || {};
  if (!tokenOk_(payload.token)) return { ok: false, error: 'invalid token' };
  var parsed = parseMessage_(String(payload.text || ''), String(payload.from || ''));
  return {
    ok: true,
    tasks: parsed.tasks,
    engine: parsed.engine,
    note: parsed.note,
    today: todayStr_()
  };
}

/** 画面で確認・修正されたタスクをシートへ書き込む */
function apiCommit(payload) {
  payload = payload || {};
  if (!tokenOk_(payload.token)) return { ok: false, error: 'invalid token' };
  var tasks = (payload.tasks || []).map(cleanTask_).filter(function (t) { return t.title; });
  if (!tasks.length) return { ok: false, error: '登録するタスクがありません' };
  var results = writeTasks_(tasks, {
    source: payload.source || 'web',
    rawMessage: String(payload.raw || ''),
    engine: String(payload.engine || 'web')
  });
  return { ok: true, results: results };
}

/** 受信箱の直近履歴（投げ込みページの下部に出す） */
function apiRecent(payload) {
  payload = payload || {};
  if (!tokenOk_(payload.token)) return { ok: false, error: 'invalid token' };
  var sh = ensureInbox_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [] };
  var n = Math.min(8, last - 1);
  var vals = sh.getRange(last - n + 1, 1, n, INBOX_HEADERS.length).getDisplayValues();
  var rows = vals.reverse().map(function (v) {
    return {
      at: v[1], requester: v[3], assignee: v[4],
      title: v[6], due: v[8], status: v[11], sheet: v[12]
    };
  });
  return { ok: true, rows: rows };
}

function tokenOk_(given) {
  var want = prop_('CAPTURE_TOKEN', '');
  return !want || String(given || '') === want;
}
