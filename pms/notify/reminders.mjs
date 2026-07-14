// reminders.mjs — daily task-deadline emails + Google Calendar (.ics) sync for
// プロジェクト管理シート. Run by .github/workflows/task-reminders.yml.
//
// Each run reads the shared Firebase board (anonymous auth, same as the app) and,
// per member with an email:
//   • sends a morning reminder for tasks due today / overdue-and-unfinished, and
//   • attaches a .ics of all their open deadlines so Gmail can "add to calendar".
// A content hash per member is stored at boards/<code>/_calsync so a calendar
// email is (re)sent only when that member's deadline set actually changes —
// no daily spam. Pure logic is exported for offline unit tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const STATUS_LABEL = { none: '未着手', run: '進行中', rev: 'レビュー中', done: '完了' };
const __dir = dirname(fileURLToPath(import.meta.url));

// ── date / helpers ─────────────────────────────────────────────────────────
export function todayInTZ(tz, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const md = (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };
const compact = (iso) => iso.replace(/-/g, '');
const nextDayCompact = (iso) => { const [y, m, d] = iso.split('-').map(Number); const t = Date.UTC(y, m - 1, d) + 86400000; const x = new Date(t); return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`; };

// ── classification (pure) ──────────────────────────────────────────────────
// Buckets every open (undone, dated) task per member into dueToday/overdue/future.
export function classify(board, todayISO) {
  const vals = (o) => Object.values(o || {});
  const members = vals(board && board.members);
  const projects = vals(board && board.projects);
  const tasks = vals(board && board.tasks);
  const projName = (id) => { const p = projects.find((x) => x.id === id); return p ? p.name : '—'; };
  const byEnd = (a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0);

  const map = new Map();
  for (const t of tasks) {
    if (!t || t.status === 'done' || !t.end) continue;
    const bucket = t.end === todayISO ? 'dueToday' : t.end < todayISO ? 'overdue' : 'future';
    if (!map.has(t.memberId)) map.set(t.memberId, { dueToday: [], overdue: [], future: [] });
    map.get(t.memberId)[bucket].push({ ...t, project: projName(t.projectId) });
  }
  const rows = [];
  for (const [memberId, b] of map) {
    const member = members.find((x) => x.id === memberId) || null;
    const calTasks = [...b.overdue, ...b.dueToday, ...b.future].sort(byEnd);
    rows.push({ memberId, member, dueToday: b.dueToday.sort(byEnd), overdue: b.overdue.sort(byEnd), future: b.future.sort(byEnd), calTasks });
  }
  return rows;
}

// Backward-compatible reminder view (tasks due today / overdue, by member).
export function buildReminders(board, todayISO) {
  const perMember = [], skippedNoEmail = [];
  for (const r of classify(board, todayISO)) {
    const urgent = r.dueToday.length + r.overdue.length;
    if (!urgent) continue;
    if (!r.member || !r.member.email || !String(r.member.email).trim()) { skippedNoEmail.push({ name: r.member ? r.member.name : '(担当未設定)', count: urgent }); continue; }
    perMember.push({ member: r.member, dueToday: r.dueToday, overdue: r.overdue });
  }
  return { perMember, skippedNoEmail };
}

export function calHash(calTasks) {
  const norm = calTasks.map((t) => `${t.id}|${t.end}|${t.title}|${t.status}|${t.pct ?? 0}|${t.project}`).join('\n');
  return createHash('sha1').update(norm).digest('hex').slice(0, 16);
}

// ── reminder email body (pure) ─────────────────────────────────────────────
export function renderEmail(entry, appUrl, todayISO) {
  const { member, dueToday, overdue } = entry;
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

// ── iCalendar (.ics) for a member's open deadlines (pure) ───────────────────
export function makeICS(calTasks, member, appUrl, dtstamp) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//project-sheet//task-deadlines//JP', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const t of calTasks) {
    L.push('BEGIN:VEVENT');
    L.push(`UID:pms-${t.id}@teamenergy-pms`);
    L.push(`DTSTAMP:${dtstamp}`);
    L.push(`DTSTART;VALUE=DATE:${compact(t.end)}`);
    L.push(`DTEND;VALUE=DATE:${nextDayCompact(t.end)}`);
    L.push(`SUMMARY:${esc('【締切】' + t.title + '（' + t.project + '）')}`);
    L.push(`DESCRIPTION:${esc(`担当: ${member.name} / 進捗 ${t.pct ?? 0}% / 状態 ${STATUS_LABEL[t.status] || t.status}\nアプリ: ${appUrl}`)}`);
    L.push('SEQUENCE:0', 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

export function calendarBody(member, calTasks, appUrl) {
  const subject = `【進行管理】締切カレンダーを更新（${calTasks.length}件）`;
  const list = calTasks.map((t) => `・${md(t.end)} ${t.title}（${t.project}）`).join('\n');
  const text = `${member.name} さん\n\n担当タスクの締切に変更がありました。添付の .ics を開いて「カレンダーに追加」すると、Googleカレンダーに反映できます。\n\n${list}\n\nアプリ： ${appUrl}\n\n— プロジェクト管理シート（自動送信）`;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.7;color:#201e1d">
<p>${esc(member.name)} さん</p><p>担当タスクの締切に変更がありました。添付の <b>.ics</b> を開いて「カレンダーに追加」すると、Googleカレンダーに反映できます。</p>
<ul style="padding-left:20px">${calTasks.map((t) => `<li>${md(t.end)} ${esc(t.title)}（${esc(t.project)}）</li>`).join('')}</ul>
<p><a href="${esc(appUrl)}" style="color:#0088b0">アプリで確認する</a></p>
<p style="color:#999;font-size:12px">— プロジェクト管理シート（自動送信）</p></div>`;
  return { subject, text, html };
}

// ── config source ──────────────────────────────────────────────────────────
function firebaseValues() {
  let apiKey = process.env.FIREBASE_API_KEY, databaseURL = process.env.FIREBASE_DB_URL;
  if (!apiKey || !databaseURL) {
    try {
      const src = readFileSync(join(__dir, '..', 'firebase-config.js'), 'utf8');
      const pick = (k) => { const m = src.match(new RegExp(k + ":\\s*['\"]([^'\"]+)['\"]")); return m ? m[1] : ''; };
      apiKey = apiKey || pick('apiKey');
      databaseURL = databaseURL || pick('databaseURL');
    } catch (e) { /* ignore */ }
  }
  return { apiKey, databaseURL };
}

// ── main (network + SMTP; runs only when executed directly) ────────────────
async function main() {
  const TZ = process.env.REMINDER_TZ || 'Asia/Tokyo';
  const CODE = process.env.PMS_TEAM_CODE;
  const APP_URL = process.env.APP_URL || 'https://ttomoi-afk.github.io/desktop-tutorial/pms/';
  const DRY = String(process.env.DRY_RUN) === 'true' || String(process.env.DRY_RUN) === '1';
  if (!CODE) { console.log('PMS_TEAM_CODE が未設定のためスキップします（送信なし）。'); return; }

  const { apiKey, databaseURL } = firebaseValues();
  if (!apiKey || !databaseURL || /YOUR_/.test(apiKey)) { console.log('Firebase 構成が未設定のためスキップします。'); return; }

  const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }).then((r) => r.json());
  if (!auth.idToken) { console.error('匿名ログイン失敗:', (auth.error && auth.error.message) || auth); process.exit(1); }
  const token = auth.idToken;
  const board = await fetch(`${databaseURL}/boards/${encodeURIComponent(CODE)}.json?auth=${token}`).then((r) => r.json());
  if (!board) { console.log(`ボード boards/${CODE} が空です。送信なし。`); return; }

  const todayISO = todayInTZ(TZ);
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const rows = classify(board, todayISO);
  const stored = board._calsync || {};

  const toSend = [], skippedNoEmail = [];
  for (const r of rows) {
    const urgent = r.dueToday.length + r.overdue.length;
    if (!r.member || !r.member.email || !String(r.member.email).trim()) { if (urgent) skippedNoEmail.push({ name: r.member ? r.member.name : '(担当未設定)', count: urgent }); continue; }
    const hash = calHash(r.calTasks);
    const changed = hash !== ((stored[r.memberId] && stored[r.memberId].hash) || '');
    if (urgent || (changed && r.calTasks.length)) toSend.push({ ...r, hash, hasReminder: urgent > 0, changed });
  }

  console.log(`対象日 ${todayISO}（${TZ}） / 送信対象 ${toSend.length}名 / メール未登録スキップ ${skippedNoEmail.length}名`);
  skippedNoEmail.forEach((s) => console.log(`  - メール未登録のため送れず: ${s.name}（${s.count}件）`));
  if (!toSend.length) { console.log('本日の送信対象はありません（締切・変更なし）。'); return; }

  const compose = (r) => {
    const base = r.hasReminder ? renderEmail({ member: r.member, dueToday: r.dueToday, overdue: r.overdue }, APP_URL, todayISO) : calendarBody(r.member, r.calTasks, APP_URL);
    if (r.hasReminder && r.calTasks.length) {
      base.text += `\n（今後の締切 ${r.calTasks.length}件をカレンダー用ファイル .ics で添付しました。「カレンダーに追加」で取り込めます）`;
      base.html += `<p style="color:#555;font-size:13px">今後の締切 ${r.calTasks.length}件をカレンダー用ファイル（.ics）で添付しました。開いて「カレンダーに追加」してください。</p>`;
    }
    return base;
  };

  if (DRY) {
    for (const r of toSend) { const m = compose(r); console.log(`\n[DRY] To: ${r.member.email}\nSubject: ${m.subject}\n添付: deadlines.ics（${r.calTasks.length}件）${r.changed ? ' / カレンダー変更あり' : ''}\n${m.text}`); }
    console.log('\nDRY_RUN のため実送信・記録していません。'); return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.log('SMTP 認証情報が未設定のためスキップします（送信なし）。'); return; }
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  const from = MAIL_FROM || SMTP_USER;

  let sent = 0;
  for (const r of toSend) {
    const m = compose(r);
    const ics = makeICS(r.calTasks, r.member, APP_URL, dtstamp);
    try {
      await transport.sendMail({
        from, to: r.member.email, subject: m.subject, text: m.text, html: m.html,
        attachments: r.calTasks.length ? [{ filename: 'deadlines.ics', content: ics, contentType: 'text/calendar; charset=UTF-8; method=PUBLISH' }] : [],
      });
      sent++;
      console.log(`送信: ${r.member.name} <${r.member.email}>（締切 ${r.calTasks.length}件${r.hasReminder ? ' / リマインドあり' : ''}）`);
      // record the synced hash so unchanged sets don't re-send tomorrow
      await fetch(`${databaseURL}/boards/${encodeURIComponent(CODE)}/_calsync/${encodeURIComponent(r.memberId)}.json?auth=${token}`,
        { method: 'PUT', body: JSON.stringify({ hash: r.hash, ts: dtstamp }) });
    } catch (err) { console.error(`送信失敗 ${r.member.email}:`, err.message); }
  }
  console.log(`完了：${sent}/${toSend.length} 通を送信しました。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
