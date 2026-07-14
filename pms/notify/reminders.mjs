// reminders.mjs — daily task-deadline email reminders for プロジェクト管理シート.
// Run by .github/workflows/task-reminders.yml on a schedule. Reads the shared
// Firebase board (anonymous auth, same as the app), finds each member's tasks
// due today / overdue-and-unfinished, and emails that member via SMTP.
//
// Pure logic (buildReminders / renderEmail) is exported for offline unit tests;
// network + email only run when this file is executed directly.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const STATUS_LABEL = { none: '未着手', run: '進行中', rev: 'レビュー中', done: '完了' };
const __dir = dirname(fileURLToPath(import.meta.url));

// ── pure logic (no I/O; unit-tested) ───────────────────────────────────────
export function todayInTZ(tz, now = new Date()) {
  // en-CA formats as YYYY-MM-DD; evaluate "today" in the team's timezone.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function buildReminders(board, todayISO) {
  const vals = (o) => Object.values(o || {});
  const members = vals(board && board.members);
  const projects = vals(board && board.projects);
  const tasks = vals(board && board.tasks);
  const projName = (id) => { const p = projects.find((x) => x.id === id); return p ? p.name : '—'; };

  const byMember = new Map();
  for (const t of tasks) {
    if (!t || t.status === 'done' || !t.end) continue;
    let bucket = null;
    if (t.end === todayISO) bucket = 'dueToday';
    else if (t.end < todayISO) bucket = 'overdue';
    if (!bucket) continue;
    if (!byMember.has(t.memberId)) byMember.set(t.memberId, { dueToday: [], overdue: [] });
    byMember.get(t.memberId)[bucket].push({ ...t, project: projName(t.projectId) });
  }

  const perMember = [], skippedNoEmail = [];
  for (const [memberId, buckets] of byMember) {
    const total = buckets.dueToday.length + buckets.overdue.length;
    if (!total) continue;
    const m = members.find((x) => x.id === memberId);
    if (!m || !m.email || !String(m.email).trim()) { skippedNoEmail.push({ name: m ? m.name : '(担当未設定)', count: total }); continue; }
    const sortByEnd = (a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0);
    perMember.push({ member: m, dueToday: buckets.dueToday.sort(sortByEnd), overdue: buckets.overdue.sort(sortByEnd) });
  }
  return { perMember, skippedNoEmail };
}

export function renderEmail(entry, appUrl, todayISO) {
  const { member, dueToday, overdue } = entry;
  const md = (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };
  const line = (t) => `・[${t.project}] ${t.title}（期限 ${md(t.end)}・進捗 ${t.pct ?? 0}%・${STATUS_LABEL[t.status] || t.status}）`;
  const subject = `【進行管理】本日締切 ${dueToday.length}件` + (overdue.length ? ` ・ 期限超過 ${overdue.length}件` : '');

  const t = [`${member.name} さん`, '', `本日（${md(todayISO)}）締切、および期限超過のタスクのお知らせです。`, ''];
  if (dueToday.length) { t.push(`■ 本日締切（${dueToday.length}件）`); dueToday.forEach((x) => t.push(line(x))); t.push(''); }
  if (overdue.length) { t.push(`■ 期限超過・未完了（${overdue.length}件）`); overdue.forEach((x) => t.push(line(x))); t.push(''); }
  t.push(`アプリで確認： ${appUrl}`, '', '— プロジェクト管理シート（自動送信）');
  const text = t.join('\n');

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const ul = (arr) => '<ul style="margin:4px 0 0;padding-left:20px">' + arr.map((x) =>
    `<li style="margin:3px 0">[${esc(x.project)}] ${esc(x.title)} <span style="color:#777">（期限 ${md(x.end)}・進捗 ${x.pct ?? 0}%・${STATUS_LABEL[x.status] || x.status}）</span></li>`).join('') + '</ul>';
  const html = `<div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.7;color:#201e1d">
<p>${esc(member.name)} さん</p><p>本日（${md(todayISO)}）締切、および期限超過のタスクのお知らせです。</p>
${dueToday.length ? `<h3 style="margin:18px 0 2px;font-size:15px">本日締切（${dueToday.length}件）</h3>${ul(dueToday)}` : ''}
${overdue.length ? `<h3 style="margin:18px 0 2px;font-size:15px;color:#d6006c">期限超過・未完了（${overdue.length}件）</h3>${ul(overdue)}` : ''}
<p style="margin-top:18px"><a href="${esc(appUrl)}" style="color:#0088b0">アプリで確認する</a></p>
<p style="color:#999;font-size:12px">— プロジェクト管理シート（自動送信）</p></div>`;
  return { subject, text, html };
}

// ── config source (single source of truth: pms/firebase-config.js) ─────────
function firebaseValues() {
  let apiKey = process.env.FIREBASE_API_KEY, databaseURL = process.env.FIREBASE_DB_URL;
  if (!apiKey || !databaseURL) {
    try {
      const src = readFileSync(join(__dir, '..', 'firebase-config.js'), 'utf8');
      const pick = (k) => { const m = src.match(new RegExp(k + ":\\s*['\"]([^'\"]+)['\"]")); return m ? m[1] : ''; };
      apiKey = apiKey || pick('apiKey');
      databaseURL = databaseURL || pick('databaseURL');
    } catch (e) { /* fall through */ }
  }
  return { apiKey, databaseURL };
}

// ── main (network + SMTP; runs only when executed directly) ────────────────
async function main() {
  const TZ = process.env.REMINDER_TZ || 'Asia/Tokyo';
  const CODE = process.env.PMS_TEAM_CODE;
  const APP_URL = process.env.APP_URL || 'https://ttomoi-afk.github.io/desktop-tutorial/pms/';
  const DRY = String(process.env.DRY_RUN) === 'true' || String(process.env.DRY_RUN) === '1';

  if (!CODE) { console.log('PMS_TEAM_CODE が未設定のためスキップします（送信なし）。README を参照してください。'); return; }
  const { apiKey, databaseURL } = firebaseValues();
  if (!apiKey || !databaseURL || /YOUR_/.test(apiKey)) { console.log('Firebase 構成が未設定のためスキップします。'); return; }

  // anonymous auth (same path as the app; security rules allow authed reads)
  const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then((r) => r.json());
  if (!auth.idToken) { console.error('匿名ログイン失敗:', (auth.error && auth.error.message) || auth); process.exit(1); }

  const board = await fetch(`${databaseURL}/boards/${encodeURIComponent(CODE)}.json?auth=${auth.idToken}`).then((r) => r.json());
  if (!board) { console.log(`ボード boards/${CODE} が空です。送信なし。`); return; }

  const todayISO = todayInTZ(TZ);
  const { perMember, skippedNoEmail } = buildReminders(board, todayISO);
  console.log(`対象日 ${todayISO}（${TZ}） / 送信対象 ${perMember.length}名 / メール未登録スキップ ${skippedNoEmail.length}名`);
  skippedNoEmail.forEach((s) => console.log(`  - メール未登録のため送れず: ${s.name}（${s.count}件）`));
  if (!perMember.length) { console.log('本日の対象タスクはありません。'); return; }

  if (DRY) {
    for (const e of perMember) { const m = renderEmail(e, APP_URL, todayISO); console.log(`\n[DRY] To: ${e.member.email}\nSubject: ${m.subject}\n${m.text}`); }
    console.log('\nDRY_RUN のため実送信していません。'); return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.log('SMTP 認証情報が未設定のためスキップします（送信なし）。README を参照してください。'); return; }
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  const from = MAIL_FROM || SMTP_USER;

  let sent = 0;
  for (const e of perMember) {
    const msg = renderEmail(e, APP_URL, todayISO);
    try { await transport.sendMail({ from, to: e.member.email, subject: msg.subject, text: msg.text, html: msg.html }); sent++; console.log(`送信: ${e.member.name} <${e.member.email}>`); }
    catch (err) { console.error(`送信失敗 ${e.member.email}:`, err.message); }
  }
  console.log(`完了：${sent}/${perMember.length} 通を送信しました。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
