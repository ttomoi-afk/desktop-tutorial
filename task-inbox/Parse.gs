/**
 * Parse.gs — 自然文（LINE / チャット / 音声入力）→ タスク構造化
 *
 * 本命は Claude API（Messages API を UrlFetchApp で直接叩く）。
 * APIキー未設定・API障害・拒否応答のときは、正規表現ベースの簡易パーサへ自動で落ちる。
 * どちらで解釈したかは戻り値の engine で分かる。
 */

/** 既定モデル。スクリプトプロパティ CLAUDE_MODEL で変更可。 */
var DEFAULT_MODEL = 'claude-opus-5';

/**
 * 既定 effort は low。
 * Apps Script の UrlFetchApp は応答待ちが約60秒で打ち切られるため、
 * 短文抽出であるこの用途では速さを優先する。精度を上げたい場合は
 * スクリプトプロパティ CLAUDE_EFFORT に medium / high を設定する。
 */
var DEFAULT_EFFORT = 'low';

/** 構造化出力のスキーマ（output_config.format で強制する） */
var TASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks'],
  properties: {
    tasks: {
      type: 'array',
      description: '投稿から読み取れるタスク。1つの投稿に複数の依頼が含まれていれば分割する。',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['assignee', 'requester', 'project', 'title', 'detail', 'due', 'dueText', 'priority', 'confidence'],
        properties: {
          assignee:   { type: 'string', description: '担当者。名簿の「キー」をそのまま返す。判別できなければ空文字。' },
          requester:  { type: 'string', description: '依頼者。名簿のキー。分からなければ与えられた既定の依頼者、それも無ければ空文字。' },
          project:    { type: 'string', description: '案件名。既存の案件一覧にあるものを優先して使う。該当が無ければ短く付ける。不明なら空文字。' },
          title:      { type: 'string', description: 'タスク名。体言止めで30字以内。' },
          detail:     { type: 'string', description: '補足・条件・背景。無ければ空文字。' },
          due:        { type: 'string', description: '期限を YYYY-MM-DD で。期限の記載が無ければ空文字。推測で埋めない。' },
          dueText:    { type: 'string', description: '原文での期限表現（例：今月中、来週火曜）。無ければ空文字。' },
          priority:   { type: 'string', enum: ['高', '中', '低'], description: '「急ぎ」「至急」「特に」等があれば高。' },
          confidence: { type: 'number', description: '担当者の判別の自信度 0〜1。' }
        }
      }
    }
  }
};

/**
 * 投稿文を解析してタスク配列を返す。
 * @param {string} text 投稿の本文
 * @param {string} defaultRequester 依頼者の既定値（LINEの送信者など）。名簿のキー。
 * @return {{tasks: Array, engine: string, note: string}}
 */
function parseMessage_(text, defaultRequester) {
  var body = String(text || '').trim();
  if (!body) return { tasks: [], engine: 'none', note: '本文が空です' };

  var apiKey = prop_('ANTHROPIC_API_KEY', '');
  if (!apiKey) {
    var r = ruleParse_(body, defaultRequester);
    r.note = 'ANTHROPIC_API_KEY が未設定のため簡易パーサで解釈しました';
    return r;
  }

  try {
    return callClaude_(body, defaultRequester, apiKey);
  } catch (err) {
    console.error('Claude 解析に失敗: ' + err);
    var fb = ruleParse_(body, defaultRequester);
    fb.note = 'AI解析に失敗したため簡易パーサで解釈しました（' + err + '）';
    return fb;
  }
}

/** Claude Messages API を叩いて構造化する */
function callClaude_(body, defaultRequester, apiKey) {
  var model = prop_('CLAUDE_MODEL', DEFAULT_MODEL);
  var effort = prop_('CLAUDE_EFFORT', DEFAULT_EFFORT);

  var payload = {
    model: model,
    max_tokens: 4000,
    system: buildSystemPrompt_(defaultRequester),
    messages: [{ role: 'user', content: body }],
    output_config: {
      format: { type: 'json_schema', schema: TASK_SCHEMA },
      effort: effort
    },
    // 安全性分類器が断った場合に、同一リクエスト内で別モデルへ自動回送させる。
    fallbacks: 'default'
  };

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var raw = res.getContentText();
  if (code !== 200) {
    throw new Error('Anthropic API ' + code + ': ' + raw.slice(0, 400));
  }

  var data = JSON.parse(raw);

  // 拒否応答は例外ではなく HTTP 200 で返る。content を読む前に必ず確認する。
  if (data.stop_reason === 'refusal') {
    var cat = (data.stop_details && data.stop_details.category) || '不明';
    throw new Error('モデルが応答を拒否しました（category: ' + cat + '）');
  }

  var text = (data.content || [])
    .filter(function (c) { return c.type === 'text'; })
    .map(function (c) { return c.text; })
    .join('');
  if (!text) throw new Error('応答にテキストがありません: ' + raw.slice(0, 300));

  var parsed = JSON.parse(text);
  var tasks = (parsed.tasks || []).map(cleanTask_).filter(function (t) { return t.title; });

  return {
    tasks: tasks,
    engine: 'claude:' + (data.model || model),
    note: tasks.length ? '' : 'タスクとして読み取れる内容がありませんでした'
  };
}

/** 名簿・案件一覧・今日の日付を織り込んだシステムプロンプト */
function buildSystemPrompt_(defaultRequester) {
  var members = getMembers_();
  var roster = members.map(function (m) {
    var al = (m.aliases || []).join('／');
    return '- キー「' + m.key + '」＝ ' + (m.full || m.key) + (al ? '（別名: ' + al + '）' : '');
  }).join('\n');

  var projects = collectProjects_();
  var projectBlock = projects.length
    ? '\n\n# 既存の案件名（できるだけこの中から選ぶ）\n' + projects.map(function (p) { return '- ' + p; }).join('\n')
    : '';

  var today = new Date();
  var todayLine = Utilities.formatDate(today, TZ, 'yyyy年M月d日(E)') + '（= ' + todayStr_() + '）';
  var monthEnd = Utilities.formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0), TZ, 'yyyy-MM-dd');

  return [
    'あなたはチームのタスク管理アシスタントです。チャットに投稿された日本語の走り書きを、スプレッドシートに転記できるタスクへ構造化してください。',
    '',
    '# 今日',
    todayLine + '。今月末は ' + monthEnd + '。',
    '',
    '# メンバー名簿（assignee / requester はこの「キー」の文字列だけを返す）',
    roster,
    projectBlock,
    '',
    '# ルール',
    '1. 1つの投稿に複数の依頼が含まれていれば、タスクを分割する。「特に〜は急いで」のように優先度が違うものは別タスクにしてよい。',
    '2. 担当者は「〜さんへ」「To 〜」「@〜」「〜お願い」などから判断する。名簿に無い人物なら assignee は空文字にする。勝手に誰かへ割り当てない。',
    '3. 依頼者が本文から読み取れないときは requester に「' + (defaultRequester || '') + '」を入れる（空なら空文字のまま）。',
    '4. 期限は今日を基準に実日付へ変換する。「今月中」「月内」→ ' + monthEnd + '。「来週」→ 翌週の金曜。「月末」→ その月の最終日。期限の記載がまったく無ければ due は空文字にし、決して推測で埋めない。',
    '5. dueText には原文の期限表現をそのまま入れる（「今月中までに」など）。',
    '6. title は体言止めで簡潔に。依頼の言い回し（〜して欲しい）は落とす。条件・背景は detail へ回す。',
    '7. 「急ぎ」「至急」「特に」「最優先」などがあれば priority を「高」にする。',
    '8. 挨拶・雑談・報告だけで依頼が無い投稿は tasks を空配列で返す。'
  ].join('\n');
}

/** モデル出力の正規化（想定外の値が来ても壊れないように寄せる） */
function cleanTask_(t) {
  t = t || {};
  var assignee = String(t.assignee || '').trim();
  var requester = String(t.requester || '').trim();
  var am = assignee ? findMember_(assignee) : null;
  var rm = requester ? findMember_(requester) : null;
  var due = String(t.due || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) due = '';
  var pri = String(t.priority || '中').trim();
  if (['高', '中', '低'].indexOf(pri) < 0) pri = '中';

  return {
    assignee: am ? am.key : '',
    assigneeRaw: assignee,
    requester: rm ? rm.key : requester,
    project: String(t.project || '').trim(),
    title: String(t.title || '').trim(),
    detail: String(t.detail || '').trim(),
    due: due,
    dueText: String(t.dueText || '').trim(),
    priority: pri,
    confidence: typeof t.confidence === 'number' ? t.confidence : (am ? 0.6 : 0.2)
  };
}

/* ------------------------------------------------------------------ *
 *  簡易パーサ（APIキーなし／API障害時のフォールバック）
 * ------------------------------------------------------------------ */

function ruleParse_(body, defaultRequester) {
  var assignee = '';
  var members = getMembers_();

  // 「友井さんへ」「To 友井」「@友井」「>友井」などを拾う
  var patterns = [
    /(?:^|\n)\s*(?:to|To|TO)[\s:：]+([^\s、。\n]+)/,
    /(?:^|\n)\s*[@＠>＞]\s*([^\s、。\n]+)/,
    /([^\s、。\n]{1,8})\s*(?:さん|くん|君)?\s*(?:へ|に|宛)(?:[、。\s]|お願い|やって)/
  ];
  for (var p = 0; p < patterns.length && !assignee; p++) {
    var m = body.match(patterns[p]);
    if (m) {
      var hit = findMember_(m[1]);
      if (hit) assignee = hit.key;
    }
  }
  // それでも決まらなければ、本文に名前が出てくる人を採用
  if (!assignee) {
    for (var i = 0; i < members.length; i++) {
      var cands = [members[i].key, members[i].full].concat(members[i].aliases || []);
      for (var j = 0; j < cands.length; j++) {
        if (cands[j] && body.indexOf(cands[j]) >= 0) { assignee = members[i].key; break; }
      }
      if (assignee) break;
    }
  }

  var dueInfo = ruleDue_(body);
  var priority = /急ぎ|至急|最優先|なるべく早く|今すぐ|特に/.test(body) ? '高' : '中';

  // 宛先・期限の表現を落として本文だけにする
  var title = body
    .replace(/(?:^|\n)\s*(?:to|To|TO)[\s:：]+[^\s、。\n]+/g, ' ')
    .replace(/(?:^|\n)\s*[@＠>＞]\s*[^\s、。\n]+/g, ' ')
    .replace(/[^\s、。\n]{1,8}\s*(?:さん|くん|君)\s*(?:へ|に|宛)/g, ' ')
    .replace(dueInfo.text || '＿＿＿＿', ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 除去のあとに残る句読点で先頭が空にならないよう、空でない節を拾う
  var segs = title.split(/[。\n]/)
    .map(function (s) { return s.replace(/^[\s、。，,]+/, '').replace(/^(?:に|は|を|へ)(?=[^\s])/, '').trim(); })
    .filter(String);
  var firstLine = segs.length ? segs[0] : '';
  var rest = segs.slice(1).join('。');

  return {
    tasks: firstLine ? [{
      assignee: assignee,
      assigneeRaw: assignee,
      requester: defaultRequester || '',
      project: '',
      title: firstLine.slice(0, 60),
      detail: rest,
      due: dueInfo.date,
      dueText: dueInfo.text,
      priority: priority,
      confidence: assignee ? 0.4 : 0.1
    }] : [],
    engine: 'rule',
    note: ''
  };
}

/** 日本語の期限表現 → {date:'YYYY-MM-DD', text:'原文'} */
function ruleDue_(body) {
  var now = new Date();
  var y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();
  var fmt = function (dt) { return Utilities.formatDate(dt, TZ, 'yyyy-MM-dd'); };
  var monthEnd = function (yy, mm) { return new Date(yy, mm + 1, 0); };
  var m;

  if ((m = body.match(/(今日|本日)(?:中|まで)?/)))       return { date: fmt(new Date(y, mo, d)),     text: m[0] };
  if ((m = body.match(/明後日(?:中|まで)?/)))            return { date: fmt(new Date(y, mo, d + 2)), text: m[0] };
  if ((m = body.match(/明日(?:中|まで)?/)))              return { date: fmt(new Date(y, mo, d + 1)), text: m[0] };
  if ((m = body.match(/(\d{1,3})日後/)))                 return { date: fmt(new Date(y, mo, d + Number(m[1]))), text: m[0] };

  // 「9月末」「来月末」は汎用の「月末」より先に判定する（部分一致に食われるため）
  if ((m = body.match(/(\d{1,2})月末(?:までに|まで|に)?/))) {
    var em = Number(m[1]) - 1;
    var ey = em < mo ? y + 1 : y;
    return { date: fmt(monthEnd(ey, em)), text: m[0] };
  }
  if ((m = body.match(/来月(?:中|末|いっぱい)?(?:までに|まで|に)?/))) return { date: fmt(monthEnd(y, mo + 1)), text: m[0] };
  if ((m = body.match(/(今月中|今月末|月内|月末)(?:までに|まで|に)?/))) return { date: fmt(monthEnd(y, mo)), text: m[0] };

  if ((m = body.match(/今週(?:中|末|いっぱい)?(?:までに|まで|に)?/))) {
    var toSun = (7 - now.getDay()) % 7;
    return { date: fmt(new Date(y, mo, d + toSun)), text: m[0] };
  }
  // 「来週」は翌週の金曜（システムプロンプト側の指示と揃える）
  if ((m = body.match(/来週(?:中|まで)?/))) {
    var toFri = (5 - now.getDay() + 7) % 7 || 7;
    return { date: fmt(new Date(y, mo, d + toFri + 7)), text: m[0] };
  }
  if ((m = body.match(/(\d{1,2})[\/月](\d{1,2})日?(?:までに|まで|に)?/))) {
    var mm = Number(m[1]) - 1, dd = Number(m[2]);
    var yy = (mm < mo || (mm === mo && dd < d)) ? y + 1 : y;
    return { date: fmt(new Date(yy, mm, dd)), text: m[0] };
  }
  return { date: '', text: '' };
}
