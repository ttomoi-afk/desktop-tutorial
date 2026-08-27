/**
 * Chatbots.gs — LINE / Google Chat の受け口と返信
 *
 * 【構造化入力の考え方】
 * 宛先はタスクの生命線なので、読み取れなかったときに推測で埋めない。
 * 代わりにその場で聞き返す:
 *   LINE          … クイックリプライのボタンを1タップ
 *   Google Chat   … 名前だけを返信（「友井」）
 * どちらも投稿内容はいったん保留（Cache）に置き、宛先が決まってから書き込む。
 */

/** 保留の有効期間（秒）。CacheService の上限は6時間。 */
var PENDING_TTL = 21600;

function pendingKey_(source, userId) {
  return 'pending:' + source + ':' + (userId || 'anon');
}

function stashPending_(key, obj) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(obj), PENDING_TTL);
    return true;
  } catch (err) {
    console.error('保留の保存に失敗: ' + err);
    return false;
  }
}

/** 保留を取り出して消す（1回だけ使える） */
function takePending_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(key);
    if (!raw) return null;
    cache.remove(key);
    return JSON.parse(raw);
  } catch (err) {
    console.error('保留の取り出しに失敗: ' + err);
    return null;
  }
}

/**
 * 解析して、宛先が揃っていれば書き込み、足りなければ保留にする。
 * @return {{kind:'done'|'ask'|'none', ...}}
 */
function ingestOrAsk_(text, requesterKey, source, pendKey) {
  var parsed = parseMessage_(text, requesterKey);
  if (!parsed.tasks.length) {
    return { kind: 'none', note: parsed.note || '' };
  }

  var missing = parsed.tasks.filter(function (t) { return !t.assignee; }).length;
  if (missing && stashPending_(pendKey, {
    tasks: parsed.tasks, raw: text, engine: parsed.engine, source: source, requester: requesterKey
  })) {
    return { kind: 'ask', tasks: parsed.tasks, missing: missing };
  }

  var results = writeTasks_(parsed.tasks, { source: source, rawMessage: text, engine: parsed.engine });
  return { kind: 'done', results: results, engine: parsed.engine, note: parsed.note || '' };
}

/**
 * 保留していたタスクの宛先を確定して書き込む。
 * @param {string} assigneeKey 空文字なら「宛先なし」として受信箱にだけ残す
 */
function resolvePending_(pendKey, assigneeKey) {
  var pend = takePending_(pendKey);
  if (!pend) return null;
  pend.tasks.forEach(function (t) {
    if (!t.assignee) { t.assignee = assigneeKey; t.confidence = assigneeKey ? 1 : 0; }
  });
  var results = writeTasks_(pend.tasks, {
    source: pend.source, rawMessage: pend.raw, engine: pend.engine
  });
  return { results: results, note: '' };
}

/** 宛先を尋ねる文面 */
function askAssigneeText_(tasks) {
  var head = tasks.length === 1
    ? '「' + tasks[0].title + '」'
    : tasks.length + '件';
  return head + ' を誰にお願いしますか？\n下のボタンから選んでください。';
}

/* ------------------------------ 返信文 ------------------------------ */

/** 書き込み結果を人が読める1通のテキストにまとめる */
function formatResultText_(r) {
  if (!r.results.length) {
    return '📝 タスクとしては読み取れませんでした。\n' +
           (r.note ? '（' + r.note + '）\n' : '') +
           '例：「友井さんへ　今月中に弟子屈で使える補助金を洗い出して」';
  }

  var ok = r.results.filter(function (x) { return x.wrote; }).length;
  var head = ok === r.results.length
    ? '✅ ' + ok + '件を登録しました'
    : '⚠️ ' + r.results.length + '件のうち ' + ok + '件を登録しました';

  var marks = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  var lines = r.results.map(function (x, i) {
    var t = x.task;
    var who = x.assignee ? x.assignee + 'さん' : '担当者ふめい';
    var s = (marks[i] || '・') + ' ' + who + (t.priority === '高' ? '【急ぎ】' : '');
    s += '\n　' + t.title;
    if (t.detail) s += '\n　' + t.detail;
    if (t.due) {
      s += '\n　期限 ' + t.due.replace(/^\d{4}-0?/, '').replace('-', '/');
      if (t.dueText) s += '（' + t.dueText + '）';
    } else if (t.dueText) {
      s += '\n　期限 ' + t.dueText;
    } else {
      s += '\n　期限 なし';
    }
    if (t.project) s += '\n　案件 ' + t.project;
    s += x.wrote
      ? '\n　→ ' + x.sheet + ' タブ ' + x.row + '行目'
      : '\n　→ 受信箱に保留（' + (x.reason || '要確認') + '）';
    return s;
  });
  return head + '\n\n' + lines.join('\n\n');
}

/** 「宛先だけを返信して完了させる」ときに受け付ける短い返信かどうか */
function asAssigneeReply_(text) {
  var t = String(text || '').trim();
  if (!t || t.length > 12) return null;
  if (/^(なし|宛先なし|保留|後で|あとで)$/.test(t)) return { key: '' };
  var m = findMember_(t.replace(/(?:さん|くん|君)?(?:へ|に)?$/, ''));
  return m ? { key: m.key } : null;
}

/* --------------------------------- LINE --------------------------------- */

/** 宛先を選ばせるクイックリプライ（LINEは最大13個） */
function assigneeQuickReply_() {
  var items = getMembers_().slice(0, 12).map(function (m) {
    return {
      type: 'action',
      action: { type: 'postback', label: m.key, data: 'a=' + encodeURIComponent(m.key), displayText: m.key + 'さんへ' }
    };
  });
  items.push({
    type: 'action',
    action: { type: 'postback', label: '宛先なしで保存', data: 'a=', displayText: '宛先なしで保存' }
  });
  return { items: items };
}

function handleLineEvents_(events) {
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var userId = (ev.source && ev.source.userId) || '';
    var key = pendingKey_('LINE', userId);

    // ボタンが押されたとき
    if (ev.type === 'postback') {
      var picked = decodeURIComponent(((ev.postback && ev.postback.data) || '').replace(/^a=/, ''));
      var done = resolvePending_(key, picked);
      replyLine_(ev.replyToken, done
        ? formatResultText_(done)
        : '⌛ 時間が経ちすぎたため取り消されました。もう一度送ってください。');
      continue;
    }

    if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') continue;
    var text = String(ev.message.text || '').trim();
    if (!text) continue;
    var me = findMemberByLineId_(userId);

    // 「id」と送ると自分の userId が返る。名簿に登録するための導線。
    if (/^(id|ID|ＩＤ|わたしは誰)$/.test(text)) {
      replyLine_(ev.replyToken,
        'あなたの userId は\n' + userId +
        '\n\nスプレッドシートの メニュー「タスク投げ込み」→「設定タブを開く」で、' +
        'あなたの行の LINE userId 欄に貼り付けてください。' +
        (me ? '\n\n現在の登録: ' + me.key + 'さん' : '\n\n現在は未登録です。'));
      continue;
    }

    // 宛先だけを返信して、保留中のタスクを確定させる経路
    var short = asAssigneeReply_(text);
    if (short) {
      var resolved = resolvePending_(key, short.key);
      if (resolved) { replyLine_(ev.replyToken, formatResultText_(resolved)); continue; }
      // 保留が無ければ、ふつうの投稿として扱う
    }

    var r;
    try {
      r = ingestOrAsk_(text, me ? me.key : '', 'LINE', key);
    } catch (err) {
      console.error(err);
      replyLine_(ev.replyToken, '⚠️ 登録に失敗しました。\n' + String(err).slice(0, 200));
      continue;
    }

    if (r.kind === 'none') {
      replyLine_(ev.replyToken, formatResultText_({ results: [], note: r.note }));
    } else if (r.kind === 'ask') {
      replyLine_(ev.replyToken, askAssigneeText_(r.tasks), assigneeQuickReply_());
    } else {
      var msg = formatResultText_(r);
      if (!me) msg += '\n\n※あなたの LINE が名簿と未連携です。「id」と送ると登録できます。';
      replyLine_(ev.replyToken, msg);
    }
  }
}

/** LINE へ返信する（replyToken は1回・短時間だけ有効） */
function replyLine_(replyToken, text, quickReply) {
  var token = prop_('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!token) { console.warn('LINE_CHANNEL_ACCESS_TOKEN が未設定のため返信できません'); return; }
  if (!replyToken) return;

  var message = { type: 'text', text: String(text).slice(0, 4900) };
  if (quickReply) message.quickReply = quickReply;

  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: [message] }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      console.warn('LINE reply ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
  } catch (err) {
    console.error('LINE reply 失敗: ' + err);
  }
}

/* ----------------------------- Google Chat ----------------------------- */

function handleChatEvent_(body) {
  if (body.type === 'ADDED_TO_SPACE') {
    return { text: 'タスク投げ込みを追加しました。\n\n' +
                   '「友井さんへ　今月中に弟子屈で使える補助金を洗い出して」のように投稿すると、' +
                   '担当者のタブへ自動で転記します。\n' +
                   '宛先が分からないときは聞き返すので、名前だけ返信してください。' };
  }
  if (body.type !== 'MESSAGE' || !body.message) return {};

  var msg = body.message;
  var text = String(msg.argumentText || msg.text || '').trim();
  if (!text) return { text: '本文が空でした。' };

  var sender = msg.sender || {};
  var me = findMemberByEmail_(sender.email) || findMember_(sender.displayName || '');
  var key = pendingKey_('GoogleChat', sender.email || sender.name || '');

  // 名前だけの返信で、保留中のタスクを確定させる
  var short = asAssigneeReply_(text);
  if (short) {
    var resolved = resolvePending_(key, short.key);
    if (resolved) return { text: formatResultText_(resolved) };
  }

  var r;
  try {
    r = ingestOrAsk_(text, me ? me.key : '', 'GoogleChat', key);
  } catch (err) {
    console.error(err);
    return { text: '⚠️ 登録に失敗しました。\n' + String(err).slice(0, 300) };
  }

  if (r.kind === 'none') return { text: formatResultText_({ results: [], note: r.note }) };
  if (r.kind === 'ask') {
    return { text: askAssigneeText_(r.tasks).replace('下のボタンから選んでください。', '') +
                   '名前だけ返信してください（' +
                   getMembers_().map(function (m) { return m.key; }).join(' / ') +
                   ' / なし）' };
  }
  return { text: formatResultText_(r) };
}
