// app.js — 画面の組み立て。カレンダー(gcal.js)と候補算出(slots.js)をつなぐ。
import {
  DEFAULT_SETTINGS, generateCandidates, formatSlots, jpDay, jpTime, isoDate,
  addDays, startOfDay, replyDeadline, renderTemplate,
} from './slots.js';
import * as gcal from './gcal.js';
import { GOOGLE_CLIENT_ID, isConfigured } from './config.js';

const STORE_KEY = 'candidate-dates.v1';
const $ = (id) => document.getElementById(id);

const DEFAULT_SUBJECT = '【日程のご相談】{{用件}}の候補日について';
const DEFAULT_TEMPLATE = `{{会社名}}
{{宛名}} 様

いつもお世話になっております。
{{差出人}}です。

{{用件}}の件、下記のとおり候補日をご用意いたしました。
ご都合のよい日時をお知らせいただけますでしょうか。

■ 候補日時（所要 {{所要時間}}）
{{候補日}}

■ 場所・方法
{{場所}}

上記でご都合が合わない場合は、あらためて調整いたしますので
お気軽にお知らせください。
お手数ですが、{{回答期限}}までにご返信いただけますと幸いです。

何卒よろしくお願いいたします。

--
{{差出人}}`;

// ── 画面の状態 ─────────────────────────────────────────────
const state = {
  mode: 'idle',      // 'idle' | 'live' | 'demo'
  calendars: [],     // [{id,name,primary,color,canWrite}]
  selected: new Set(),
  slots: [],         // [{start,end}]
  off: new Set(),    // チェックを外した候補のキー
  extra: 0,          // 「もっと出す」で上乗せする件数
};

// ── 保存・復元 ─────────────────────────────────────────────
const SETTING_IDS = ['durationMin', 'workStart', 'workEnd', 'lunchStart', 'lunchEnd', 'fromDays', 'spanDays', 'leadHours', 'bufferMin', 'maxTotal', 'maxPerDay', 'stepMin'];
const MAIL_IDS = ['toEmail', 'company', 'person', 'topic', 'place', 'me', 'subject', 'template', 'holdTitle'];

function save() {
  const data = { fields: {}, weekdays: readWeekdays(), skipHolidays: $('skipHolidays').checked, clientId: $('clientId').value.trim(), calendars: [...state.selected] };
  for (const id of [...SETTING_IDS, ...MAIL_IDS]) data.fields[id] = $(id).value;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* プライベートモード等は保存しないだけ */ }
}

function load() {
  $('subject').value = DEFAULT_SUBJECT;
  $('template').value = DEFAULT_TEMPLATE;
  if (isConfigured()) $('clientId').value = GOOGLE_CLIENT_ID;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* 壊れていたら初期値 */ }
  if (!data) return;
  for (const [id, v] of Object.entries(data.fields || {})) if ($(id) && v != null) $(id).value = v;
  if (Array.isArray(data.weekdays)) {
    for (const el of $('weekdays').querySelectorAll('input')) el.checked = data.weekdays.includes(Number(el.value));
  }
  if (typeof data.skipHolidays === 'boolean') $('skipHolidays').checked = data.skipHolidays;
  if (data.clientId) $('clientId').value = data.clientId;
  if (Array.isArray(data.calendars)) state.selected = new Set(data.calendars);
}

function readWeekdays() {
  return [...$('weekdays').querySelectorAll('input')].filter((el) => el.checked).map((el) => Number(el.value));
}

function readSettings() {
  const s = { ...DEFAULT_SETTINGS };
  for (const id of SETTING_IDS) {
    const v = $(id).value;
    s[id] = /^\d+$/.test(v) ? Number(v) : v;
  }
  s.weekdays = readWeekdays();
  s.gapMin = s.bufferMin || 30;
  s.maxTotal = Number($('maxTotal').value) + state.extra;
  return s;
}

// ── 小道具 ────────────────────────────────────────────────
let toastTimer;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isError);
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), isError ? 5200 : 2600);
}

function setConn(mode) {
  state.mode = mode;
  const badge = $('connBadge');
  const label = { idle: '未接続', live: 'カレンダー接続中', demo: 'デモデータ' }[mode];
  badge.className = `conn ${{ idle: 'c-local', live: 'c-live', demo: 'c-demo' }[mode]}`;
  $('connText').textContent = label;
  $('btnDisconnect').hidden = mode === 'idle';
  $('btnConnect').textContent = mode === 'live' ? 'カレンダーを再読み込み' : 'Googleカレンダーに接続';
  updateHoldUi();
}

function jpDuration(min) {
  const h = Math.floor(min / 60); const m = min % 60;
  return `${h ? `${h}時間` : ''}${m ? `${m}分` : ''}` || '0分';
}

function slotKey(sl) { return `${isoDate(sl.start)}T${jpTime(sl.start)}`; }
function activeSlots() { return state.slots.filter((sl) => !state.off.has(slotKey(sl))); }

// ── ① 接続 ───────────────────────────────────────────────
async function connect() {
  const clientId = $('clientId').value.trim();
  if (!clientId) {
    $('detClient').open = true;
    return toast('先に OAuth クライアントID を設定してください', true);
  }
  try {
    $('btnConnect').disabled = true;
    await gcal.signIn(clientId, gcal.SCOPE_READ);
    state.calendars = await gcal.listCalendars();
    if (!state.selected.size) {
      const primary = state.calendars.find((c) => c.primary);
      if (primary) state.selected.add(primary.id);
    }
    renderCalendars();
    setConn('live');
    save();
    toast(`${state.calendars.length}件のカレンダーを読み込みました`);
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    $('btnConnect').disabled = false;
  }
}

function renderCalendars() {
  const box = $('calList');
  box.hidden = !state.calendars.length;
  box.innerHTML = '';
  for (const c of state.calendars) {
    const label = document.createElement('label');
    label.className = 'cal';
    label.innerHTML = `<input type="checkbox" value="${escapeAttr(c.id)}"${state.selected.has(c.id) ? ' checked' : ''}>`
      + `<span class="swatch" style="background:${escapeAttr(c.color)}"></span>`
      + `<span class="nm"></span>${c.primary ? '<span class="me">自分</span>' : ''}`;
    label.querySelector('.nm').textContent = c.name || c.id;
    label.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) state.selected.add(c.id); else state.selected.delete(c.id);
      save();
    });
    box.appendChild(label);
  }
  const holdSel = $('holdCal');
  holdSel.innerHTML = '';
  for (const c of state.calendars.filter((x) => x.canWrite)) {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name || c.id;
    if (c.primary) opt.selected = true;
    holdSel.appendChild(opt);
  }
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function disconnect() {
  gcal.signOut();
  state.calendars = [];
  state.selected = new Set();
  $('calList').hidden = true;
  $('calList').innerHTML = '';
  setConn('idle');
  toast('接続を解除しました');
}

// ── ② 候補の算出 ─────────────────────────────────────────
/** デモ用のダミー予定（打合せが点在する2週間）。接続なしで動きを確かめる用。 */
function demoBusy(from, to) {
  const out = [];
  for (let d = new Date(from); d < to; d = addDays(d, 1)) {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    const plan = [[9, 30, 60], [11, 0, 90], [13, 0, 60], [15, 30, 60], [16, 0, 120]];
    // 日によって埋まり方を変える（曜日で決まるので再実行しても同じ結果）
    for (let i = 0; i < plan.length; i++) {
      if ((d.getDate() + i * 3 + wd) % 4 === 0) continue;
      const [h, m, len] = plan[i];
      const s = new Date(d); s.setHours(h, m, 0, 0);
      out.push({ start: s, end: new Date(s.getTime() + len * 60000) });
    }
  }
  return out;
}

async function generate() {
  const s = readSettings();
  if (!s.weekdays.length) return toast('対象の曜日を1つ以上選んでください', true);
  const from = addDays(new Date(), s.fromDays);
  const to = addDays(from, s.spanDays);
  let busy = [];
  let skipDates = [];

  if (state.mode === 'demo') {
    busy = demoBusy(from, to);
  } else {
    if (!gcal.isSignedIn()) return toast('先にカレンダーへ接続してください（またはデモデータで試す）', true);
    if (!state.selected.size) return toast('対象のカレンダーを1つ以上選んでください', true);
    try {
      $('btnGenerate').disabled = true;
      const res = await gcal.freeBusy([...state.selected], from, to);
      busy = res.busy;
      for (const err of res.errors) toast(`読み取れないカレンダーがあります（${err.id}: ${err.reason}）`, true);
      if ($('skipHolidays').checked) {
        try { skipDates = [...await gcal.listHolidays(from, to)]; }
        catch { toast('祝日カレンダーを読めませんでした（祝日の除外なしで続行します）', true); }
      }
    } catch (e) {
      return toast(e.message || String(e), true);
    } finally {
      $('btnGenerate').disabled = false;
    }
  }

  state.slots = generateCandidates({ busy, settings: { ...s, skipDates } });
  renderSlots();
  updatePreview();
  if (!state.slots.length) toast('条件に合う空きが見つかりませんでした。期間や時間帯をゆるめてみてください', true);
  else $('cardSlots').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSlots() {
  const ul = $('slotList');
  ul.innerHTML = '';
  const has = state.slots.length > 0;
  $('slotActions').hidden = !has;
  $('slotsLead').textContent = has
    ? `${state.slots.length}件の候補が見つかりました。チェックを外した候補はメールに載りません。`
    : '「空きから候補日をつくる」を押すと、ここに候補が並びます。チェックを外した候補はメールに載りません。';
  for (const sl of state.slots) {
    const key = slotKey(sl);
    const li = document.createElement('li');
    const on = !state.off.has(key);
    li.className = on ? '' : 'off';
    li.innerHTML = '<input type="checkbox"><span class="d"></span><span class="t"></span>';
    const cb = li.querySelector('input');
    cb.checked = on;
    li.querySelector('.d').textContent = jpDay(sl.start);
    li.querySelector('.t').textContent = `${jpTime(sl.start)}〜${jpTime(sl.end)}`;
    cb.addEventListener('change', () => {
      if (cb.checked) state.off.delete(key); else state.off.add(key);
      li.classList.toggle('off', !cb.checked);
      updatePreview();
    });
    ul.appendChild(li);
  }
  updateHoldUi();
}

// ── ③ 文面 ───────────────────────────────────────────────
function mailVars() {
  const slots = activeSlots();
  return {
    会社名: $('company').value.trim(),
    宛名: $('person').value.trim(),
    用件: $('topic').value.trim() || 'お打ち合わせ',
    場所: $('place').value.trim() || 'オンライン',
    所要時間: jpDuration(Number($('durationMin').value)),
    候補日: slots.length ? formatSlots(slots) : '（候補日が未選択です）',
    回答期限: jpDay(replyDeadline(new Date(), 2)),
    差出人: $('me').value.trim(),
  };
}

function mailBody() { return renderTemplate($('template').value, mailVars()); }
function mailSubject() { return renderTemplate($('subject').value, mailVars()); }

function updatePreview() {
  $('preview').textContent = `件名: ${mailSubject()}\n\n${mailBody()}`;
  updateHoldUi();
}

// ── ④ 送信 ───────────────────────────────────────────────
function openGmail() {
  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  url.searchParams.set('to', $('toEmail').value.trim());
  url.searchParams.set('su', mailSubject());
  url.searchParams.set('body', mailBody());
  window.open(url.toString(), '_blank', 'noopener');
}

function openMailto() {
  const to = encodeURIComponent($('toEmail').value.trim());
  const q = `subject=${encodeURIComponent(mailSubject())}&body=${encodeURIComponent(mailBody())}`;
  window.location.href = `mailto:${to}?${q}`;
}

async function copyBody() {
  const text = mailBody();
  try {
    await navigator.clipboard.writeText(text);
    toast('本文をコピーしました');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? '本文をコピーしました' : 'コピーできませんでした。本文を選択してコピーしてください', !ok);
  }
}

// ── ⑤ 仮押さえ ───────────────────────────────────────────
function updateHoldUi() {
  const on = $('holdOn').checked;
  $('holdOpts').hidden = !on;
  $('btnHold').disabled = !on || state.mode !== 'live' || !activeSlots().length;
}

async function createHolds() {
  const slots = activeSlots();
  if (!slots.length) return toast('候補が選ばれていません', true);
  const calId = $('holdCal').value;
  if (!calId) return toast('登録先カレンダーがありません（書き込み権限のあるカレンダーが必要です）', true);
  if (!window.confirm(`${slots.length}件の仮予定を「${$('holdCal').selectedOptions[0].textContent}」に登録します。よろしいですか？`)) return;
  const vars = mailVars();
  const summary = renderTemplate($('holdTitle').value, vars);
  try {
    $('btnHold').disabled = true;
    await gcal.signIn($('clientId').value.trim(), gcal.SCOPE_WRITE);
    let done = 0;
    for (const sl of slots) {
      await gcal.createHold(calId, {
        start: sl.start, end: sl.end, summary,
        description: `候補日メーカーで登録した仮押さえです。\n宛先: ${vars.会社名} ${vars.宛名} 様\n用件: ${vars.用件}\n場所: ${vars.場所}`,
        transparent: $('holdFree').checked,
      });
      done++;
    }
    toast(`${done}件を仮押さえしました`);
  } catch (e) {
    toast(`仮押さえに失敗しました: ${e.message || e}`, true);
  } finally {
    updateHoldUi();
  }
}

// ── 起動 ─────────────────────────────────────────────────
function bind() {
  $('btnConnect').addEventListener('click', connect);
  $('btnDisconnect').addEventListener('click', disconnect);
  $('connBadge').addEventListener('click', () => { $('detClient').open = true; $('cardConnect').scrollIntoView({ behavior: 'smooth' }); });
  $('btnDemo').addEventListener('click', () => {
    setConn('demo');
    state.calendars = []; $('calList').hidden = true;
    toast('デモデータで動かします（実際の予定は読みません）');
    generate();
  });
  $('btnGenerate').addEventListener('click', () => { state.extra = 0; state.off.clear(); generate(); });
  $('btnMore').addEventListener('click', () => { state.extra += 3; generate(); });
  $('btnAllOn').addEventListener('click', () => { state.off.clear(); renderSlots(); updatePreview(); });
  $('btnAllOff').addEventListener('click', () => { state.slots.forEach((sl) => state.off.add(slotKey(sl))); renderSlots(); updatePreview(); });
  $('btnResetTpl').addEventListener('click', () => { $('template').value = DEFAULT_TEMPLATE; $('subject').value = DEFAULT_SUBJECT; updatePreview(); save(); });
  $('btnGmail').addEventListener('click', openGmail);
  $('btnMailto').addEventListener('click', openMailto);
  $('btnCopy').addEventListener('click', copyBody);
  $('holdOn').addEventListener('change', updateHoldUi);
  $('btnHold').addEventListener('click', createHolds);

  for (const id of [...SETTING_IDS, ...MAIL_IDS, 'skipHolidays', 'clientId']) {
    $(id).addEventListener('input', () => { updatePreview(); save(); });
    $(id).addEventListener('change', () => { updatePreview(); save(); });
  }
  for (const el of $('weekdays').querySelectorAll('input')) el.addEventListener('change', save);
}

load();
bind();
setConn('idle');
updatePreview();
if (new URLSearchParams(location.search).has('demo')) $('btnDemo').click();
