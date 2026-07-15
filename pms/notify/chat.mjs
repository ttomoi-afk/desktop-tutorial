// chat.mjs — Google Chat message builders for プロジェクト管理シート.
// Pure, dependency-free ES module shared by three callers:
//   • the app (app.js) — posts instantly when a task is added / completed,
//   • the reminder job (reminders.mjs) — posts a morning deadline digest,
//   • the offline unit tests.
// Google Chat incoming webhooks accept a simple { text } payload with light
// markup: *bold*, _italic_, and <url|label> links; newlines are literal "\n".

const STATUS_LABEL = { none: '未着手', run: '進行中', rev: 'レビュー中', done: '完了' };
const md = (iso) => {
  if (!iso) return '未定';
  const p = String(iso).split('-');
  return p.length === 3 ? `${+p[1]}/${+p[2]}` : String(iso);
};
const link = (appUrl, label = 'アプリで開く') => (appUrl ? `<${appUrl}|${label}>` : '');

// Google Chat message envelope. Kept tiny so callers just POST JSON.stringify(...).
export function chatPayload(text) { return { text }; }

// A task was added → announce it to the space.
export function taskAddedText({ projectName, title, who, end, status, byName, appUrl } = {}) {
  const lines = [
    `📋 *新しいタスク* ／ ${projectName || '—'}`,
    `「${title || '（無題）'}」`,
    `担当：${who || '未設定'}　期限：${md(end)}　${STATUS_LABEL[status] || status || ''}`.trim(),
  ];
  if (byName) lines.push(`追加：${byName}`);
  const l = link(appUrl);
  if (l) lines.push(l);
  return lines.join('\n');
}

// A task moved to 完了 → celebrate briefly.
export function taskDoneText({ projectName, title, byName, appUrl } = {}) {
  const lines = [
    `✅ *タスク完了* ／ ${projectName || '—'}`,
    `「${title || '（無題）'}」を完了しました${byName ? `（${byName}）` : ''}`,
  ];
  const l = link(appUrl);
  if (l) lines.push(l);
  return lines.join('\n');
}

// Morning digest of today's deadlines and overdue tasks across the team.
// items: [{ name, dueToday:[{title,project,end}], overdue:[{title,project,end}] }]
export function dailyDigestText({ items = [], todayISO, appUrl } = {}) {
  const totalDue = items.reduce((s, r) => s + (r.dueToday ? r.dueToday.length : 0), 0);
  const totalOver = items.reduce((s, r) => s + (r.overdue ? r.overdue.length : 0), 0);
  const head = `🗓 *本日の締切・期限超過*（${md(todayISO)}）　本日 ${totalDue}件 ・ 超過 ${totalOver}件`;
  const one = (t) => `　・[${t.project}] ${t.title}（${md(t.end)}）`;
  const blocks = items.map((r) => {
    const rows = [`*${r.name}*　本日 ${r.dueToday.length} ・ 超過 ${r.overdue.length}`];
    r.overdue.forEach((t) => rows.push(one(t) + ' ⚠超過'));
    r.dueToday.forEach((t) => rows.push(one(t)));
    return rows.join('\n');
  });
  const l = link(appUrl);
  return [head, ...blocks, l].filter(Boolean).join('\n');
}

// One-tap "does my webhook work?" message from the settings screen.
export function testText(appUrl) {
  return `🔔 *接続テスト* ／ プロジェクト管理シート\nこのスペースに通知が届きます。${link(appUrl) ? '\n' + link(appUrl) : ''}`;
}
