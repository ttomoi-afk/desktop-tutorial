/**
 * Chatbots.gs — LINE / Google Chat の受け口と返信文
 *
 * どちらも「投稿する → 吸い取って担当者のタブに転記 → その場で結果を返す」だけの薄い層。
 * 実処理は ingest_()（WebApp.gs）に寄せてある。
 */

/* ------------------------------ 共通の返信文 ------------------------------ */

/** 書き込み結果を人が読める1通のテキストにまとめる */
function formatResultText_(r) {
  if (!r.results.length) {
    return '📝 タスクとしては読み取れませんでした。\n' +
           (r.note ? '（' + r.note + '）\n' : '') +
           '例：「友井さんへ　今月中に弟子屈で使える補助金を洗い出して。特に新車の助成金は急ぎで」';
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
    }
    if (t.project) s += '\n　案件 ' + t.project;
    s += x.wrote
      ? '\n　→ ' + x.sheet + ' タブ ' + x.row + '行目'
      : '\n　→ 受信箱に保留（' + (x.reason || '要確認') + '）';
    return s;
  });

  var tail = '';
  if (r.results.some(function (x) { return !x.assignee; })) {
    tail = '\n\n宛先が分かるように「◯◯さんへ」と頭に付けると自動で振り分けます。';
  }
  return head + '\n\n' + lines.join('\n\n') + tail;
}

/* --------------------------------- LINE --------------------------------- */

/**
 * LINE Webhook のイベント配列を処理する。
 * 送信者を名簿の lineUserId で引き当て、依頼者として使う。
 */
function handleLineEvents_(events) {
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') continue;

    var text = String(ev.message.text || '').trim();
    var userId = (ev.source && ev.source.userId) || '';
    var me = findMemberByLineId_(userId);

    // 「id」と送ると自分の userId が返る。設定画面で名簿に貼り付けるための導線。
    if (/^(id|ID|ＩＤ|わたしは誰)$/.test(text)) {
      replyLine_(ev.replyToken,
        'あなたの userId は\n' + userId +
        '\n\nスプレッドシートの メニュー「タスク投げ込み」→「設定を開く」で、' +
        'あなたの行の LINE userId 欄に貼り付けてください。' +
        (me ? '\n\n現在の登録: ' + me.key + 'さん' : '\n\n現在は未登録です。'));
      continue;
    }

    if (!text) continue;

    var r;
    try {
      r = ingest_(text, me ? me.key : '', 'LINE');
    } catch (err) {
      console.error(err);
      replyLine_(ev.replyToken, '⚠️ 登録に失敗しました。\n' + String(err).slice(0, 200));
      continue;
    }

    var msg = formatResultText_(r);
    if (!me && r.results.length) {
      msg += '\n\n※あなたの LINE が名簿と未連携です。「id」と送って userId を登録すると、依頼者が自動で入ります。';
    }
    replyLine_(ev.replyToken, msg);
  }
}

/** LINE へ返信する（replyToken は1回・約30秒だけ有効） */
function replyLine_(replyToken, text) {
  var token = prop_('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!token) { console.warn('LINE_CHANNEL_ACCESS_TOKEN が未設定のため返信できません'); return; }
  if (!replyToken) return;
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: String(text).slice(0, 4900) }]
      }),
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

/**
 * Google Chat アプリのイベントを処理して、その場に返すJSONを組み立てる。
 * 送信者はメールアドレスで名簿と突き合わせる。
 */
function handleChatEvent_(body) {
  if (body.type === 'ADDED_TO_SPACE') {
    return { text: 'タスク投げ込みを追加しました。\n\n' +
                   '「友井さんへ　今月中に弟子屈で使える補助金を洗い出して」のように投稿すると、' +
                   '担当者のタブへ自動で転記します。' };
  }
  if (body.type !== 'MESSAGE' || !body.message) return {};   // 空テキストは返さない

  var msg = body.message;
  var text = String(msg.argumentText || msg.text || '').trim();
  if (!text) return { text: '本文が空でした。' };

  var sender = msg.sender || {};
  var me = findMemberByEmail_(sender.email) || findMember_(sender.displayName || '');

  var r;
  try {
    r = ingest_(text, me ? me.key : '', 'GoogleChat');
  } catch (err) {
    console.error(err);
    return { text: '⚠️ 登録に失敗しました。\n' + String(err).slice(0, 300) };
  }
  return { text: formatResultText_(r) };
}
