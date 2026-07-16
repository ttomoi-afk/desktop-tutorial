// notify-queue.mjs — task-added notifications for プロジェクト管理シート.
// When a task is added, the app writes a request to boards/<code>/_notify/<id>.
// This job (run frequently by .github/workflows/task-add-notify.yml) emails the
// task's project participants EXCEPT the person who added it, then clears the
// processed request. Pure logic is exported for offline unit tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const STATUS_LABEL = { none: '未着手', run: '進行中', rev: 'レビュー中', done: '完了' };
const __dir = dirname(fileURLToPath(import.meta.url));
const md = (iso) => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };

// ── pure logic ─────────────────────────────────────────────────────────────
// Resolves each pending _notify request into { recipients, task, project, ... }.
// `drop:true` marks stale requests (bad type / task or project gone) for cleanup.
export function computeTaskAddNotifications(board) {
  const vals = (o) => Object.values(o || {});
  const members = vals(board && board.members);
  const projects = vals(board && board.projects);
  const tasks = vals(board && board.tasks);
  const notify = (board && board._notify) ? board._notify : {};
  const byId = (arr, id) => arr.find((x) => x.id === id);

  const items = [];
  for (const [reqId, req] of Object.entries(notify)) {
    if (!req || req.type !== 'task-added') { items.push({ reqId, drop: true }); continue; }
    const task = byId(tasks, req.taskId);
    const project = byId(projects, req.projectId);
    if (!task || !project) { items.push({ reqId, drop: true }); continue; }
    const partIds = (project.members && project.members.length) ? project.members : members.map((m) => m.id);
    const recipients = partIds
      .filter((mid) => mid !== req.byMemberId)
      .map((mid) => byId(members, mid))
      .filter((m) => m && m.email && String(m.email).trim());
    const memberIds = Array.isArray(task.memberIds) ? task.memberIds : (task.memberId ? [task.memberId] : []);
    const assignees = memberIds.map((id) => byId(members, id)).filter(Boolean);
    const byName = req.byName || (byId(members, req.byMemberId) || {}).name || '';
    items.push({ reqId, task, project, assignees, byName, recipients });
  }
  return items;
}

export function renderNotifyEmail(item, appUrl) {
  const { task, project, assignees, byName } = item;
  const who = (assignees && assignees.length) ? assignees.map((a) => a.name).join('、') : '未設定';
  const subject = `【${project.name}】新しいタスク：${task.title}`;
  const text = [
    `${project.name} に新しいタスクが追加されました。`, '',
    `タスク：${task.title}`,
    `担当：${who}`,
    `期限：${md(task.end) || '未設定'}`,
    `ステータス：${STATUS_LABEL[task.status] || task.status}`,
    `追加者：${byName || '不明'}`, '',
    `アプリで確認： ${appUrl}`, '', '— プロジェクト管理シート（自動送信）',
  ].join('\n');
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const row = (k, v) => `<tr><td style="padding:2px 12px 2px 0;color:#777">${k}</td><td style="padding:2px 0">${v}</td></tr>`;
  const html = `<div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.7;color:#201e1d">
<p><b>${esc(project.name)}</b> に新しいタスクが追加されました。</p>
<table style="border-collapse:collapse;font-size:14px">
${row('タスク', `<b>${esc(task.title)}</b>`)}${row('担当', esc(who))}
${row('期限', md(task.end) || '未設定')}${row('ステータス', STATUS_LABEL[task.status] || task.status)}${row('追加者', esc(byName || '不明'))}
</table>
<p style="margin-top:14px"><a href="${esc(appUrl)}" style="color:#0b8457">アプリで確認する</a></p>
<p style="color:#999;font-size:12px">— プロジェクト管理シート（自動送信）</p></div>`;
  return { subject, text, html };
}

function firebaseValues() {
  let apiKey = process.env.FIREBASE_API_KEY, databaseURL = process.env.FIREBASE_DB_URL;
  if (!apiKey || !databaseURL) {
    try {
      const src = readFileSync(join(__dir, '..', 'firebase-config.js'), 'utf8');
      const pick = (k) => { const m = src.match(new RegExp(k + ":\\s*['\"]([^'\"]+)['\"]")); return m ? m[1] : ''; };
      apiKey = apiKey || pick('apiKey'); databaseURL = databaseURL || pick('databaseURL');
    } catch (e) { /* ignore */ }
  }
  return { apiKey, databaseURL };
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const CODE = process.env.PMS_TEAM_CODE;
  const APP_URL = process.env.APP_URL || 'https://ttomoi-afk.github.io/desktop-tutorial/pms/';
  const DRY = String(process.env.DRY_RUN) === 'true' || String(process.env.DRY_RUN) === '1';
  if (!CODE) { console.log('PMS_TEAM_CODE が未設定のためスキップします。'); return; }
  const { apiKey, databaseURL } = firebaseValues();
  if (!apiKey || !databaseURL || /YOUR_/.test(apiKey)) { console.log('Firebase 構成が未設定のためスキップします。'); return; }

  const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then((r) => r.json());
  if (!auth.idToken) { console.error('匿名ログイン失敗:', (auth.error && auth.error.message) || auth); process.exit(1); }
  const token = auth.idToken;
  const board = await fetch(`${databaseURL}/boards/${encodeURIComponent(CODE)}.json?auth=${token}`).then((r) => r.json());
  if (!board) { console.log(`ボード boards/${CODE} が空です。`); return; }

  const items = computeTaskAddNotifications(board);
  const actionable = items.filter((i) => !i.drop);
  console.log(`通知予約 ${items.length}件（送信対象 ${actionable.length}件 / 期限切れ・欠落 ${items.length - actionable.length}件）`);
  if (!items.length) { console.log('キューは空です。'); return; }

  if (DRY) {
    actionable.forEach((i) => { const m = renderNotifyEmail(i, APP_URL); console.log(`\n[DRY] To: ${i.recipients.map((r) => r.email).join(', ') || '(宛先なし)'}\nSubject: ${m.subject}`); });
    console.log('\nDRY_RUN のため送信・削除していません。'); return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.log('SMTP 未設定のためスキップ（予約は保持し、設定後に処理）。'); return; }
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  const from = MAIL_FROM || SMTP_USER;
  const del = (reqId) => fetch(`${databaseURL}/boards/${encodeURIComponent(CODE)}/_notify/${encodeURIComponent(reqId)}.json?auth=${token}`, { method: 'DELETE' });

  let sent = 0;
  for (const it of items) {
    if (it.drop) { await del(it.reqId); continue; }
    const msg = renderNotifyEmail(it, APP_URL);
    for (const r of it.recipients) {
      try { await transport.sendMail({ from, to: r.email, subject: msg.subject, text: msg.text, html: msg.html }); sent++; console.log(`送信: ${r.name} <${r.email}> — ${msg.subject}`); }
      catch (err) { console.error(`送信失敗 ${r.email}:`, err.message); }
    }
    await del(it.reqId); // at-most-once: clear after attempting (avoids duplicate spam)
  }
  console.log(`完了：${sent}通を送信、予約を消化しました。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
