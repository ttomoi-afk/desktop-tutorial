// slots.js — 候補日（空き時間）の算出ロジック。
// カレンダーAPIにもDOMにも依存しない純粋関数だけを置く（`node schedule/test-slots.mjs` で検証）。
// 時刻の計算はすべてブラウザ（実行環境）のローカルタイムで行う。

export const MIN = 60000;
export const HOUR = 3600000;

/** 既定の抽出条件。UI・localStorage 側はこの形をそのまま保存する。 */
export const DEFAULT_SETTINGS = {
  fromDays: 1,          // 何日後から探すか（1=明日から）
  spanDays: 14,         // そこから何日先まで見るか
  workStart: '10:00',   // 営業時間（開始）
  workEnd: '18:00',     // 営業時間（終了）
  lunchStart: '12:00',  // 昼休み（除外）。lunchStart===lunchEnd なら除外しない
  lunchEnd: '13:00',
  durationMin: 60,      // 打合せの所要時間
  bufferMin: 15,        // 既存予定の前後に確保する余白（移動時間など）
  stepMin: 30,          // 候補の開始時刻の刻み
  gapMin: 30,           // 同じ日に複数出すときの候補どうしの間隔
  weekdays: [1, 2, 3, 4, 5], // 対象曜日（0=日 … 6=土）
  leadHours: 24,        // 「今から◯時間後」以降だけを候補にする
  maxPerDay: 2,         // 1日あたりの最大候補数
  maxTotal: 6,          // 提示する候補の最大数
  skipDates: [],        // 個別に除外する日（'YYYY-MM-DD'）
};

// ── 日付ヘルパー ───────────────────────────────────────────────
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d, n) { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; }
export function pad2(n) { return String(n).padStart(2, '0'); }
export function isoDate(d) { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; }
export function atTime(day, hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const x = startOfDay(day); x.setHours(h || 0, m || 0, 0, 0); return x;
}

/** 重なり合う予定をひとつにまとめ、開始時刻順の [{start,end}]（ミリ秒）にする。 */
export function mergeIntervals(list) {
  const arr = (list || [])
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const it of arr) {
    const last = out[out.length - 1];
    if (last && it.start <= last.end) last.end = Math.max(last.end, it.end);
    else out.push({ ...it });
  }
  return out;
}

function overlaps(busy, start, end) {
  for (const b of busy) {
    if (b.start >= end) break;   // busy は開始順。ここから先は必ず後ろ
    if (b.end > start) return true;
  }
  return false;
}

/** その日の「探索してよい時間帯」（営業時間から昼休みを抜いたもの）。 */
export function workWindows(day, s) {
  const ws = atTime(day, s.workStart).getTime();
  const we = atTime(day, s.workEnd).getTime();
  if (we <= ws) return [];
  const ls = atTime(day, s.lunchStart).getTime();
  const le = atTime(day, s.lunchEnd).getTime();
  if (!(le > ls) || le <= ws || ls >= we) return [{ start: ws, end: we }];
  const out = [];
  if (ls > ws) out.push({ start: ws, end: Math.min(ls, we) });
  if (le < we) out.push({ start: Math.max(le, ws), end: we });
  return out;
}

/**
 * 空き時間から候補日を組み立てる。
 * @param {{busy:Array<{start:*,end:*}>, settings:object, now?:*}} opts
 * @returns {Array<{start:Date,end:Date}>} 早い順の候補
 */
export function generateCandidates(opts = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const now = opts.now ? new Date(opts.now) : new Date();
  const dur = s.durationMin * MIN;
  const buf = s.bufferMin * MIN;
  const busy = mergeIntervals(opts.busy).map((b) => ({ start: b.start - buf, end: b.end + buf }));
  const earliest = now.getTime() + s.leadHours * HOUR;
  const skip = new Set(s.skipDates || []);
  const weekdays = new Set(s.weekdays || []);
  const out = [];

  for (let i = s.fromDays; i < s.fromDays + s.spanDays; i++) {
    if (out.length >= s.maxTotal) break;
    const day = addDays(now, i);
    if (!weekdays.has(day.getDay())) continue;
    if (skip.has(isoDate(day))) continue;

    let perDay = 0;
    let nextFree = 0; // 同じ日の候補どうしが重ならないようにする境界
    for (const w of workWindows(day, s)) {
      for (let t = w.start; t + dur <= w.end; t += s.stepMin * MIN) {
        if (perDay >= s.maxPerDay || out.length >= s.maxTotal) break;
        if (t < earliest || t < nextFree) continue;
        if (overlaps(busy, t, t + dur)) continue;
        out.push({ start: new Date(t), end: new Date(t + dur) });
        perDay++;
        nextFree = t + dur + s.gapMin * MIN;
      }
    }
  }
  return out;
}

// ── 表示・メール文面用の整形 ───────────────────────────────────
const WD = '日月火水木金土';
export function jpTime(d) { const x = new Date(d); return `${x.getHours()}:${pad2(x.getMinutes())}`; }
export function jpDay(d) { const x = new Date(d); return `${x.getMonth() + 1}月${x.getDate()}日（${WD[x.getDay()]}）`; }
export function jpSlot(sl) { return `${jpDay(sl.start)} ${jpTime(sl.start)}〜${jpTime(sl.end)}`; }

/**
 * 候補をメール本文用の箇条書きにする。
 * 同じ日の候補は1行にまとめる（例: 9月2日（火） 10:00〜11:00 / 14:00〜15:00）。
 */
export function formatSlots(slots, { bullet = '・', groupByDay = true } = {}) {
  if (!slots || !slots.length) return '';
  if (!groupByDay) return slots.map((sl) => `${bullet}${jpSlot(sl)}`).join('\n');
  const days = new Map();
  for (const sl of slots) {
    const key = isoDate(sl.start);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(sl);
  }
  return [...days.values()]
    .map((list) => `${bullet}${jpDay(list[0].start)} ${list.map((sl) => `${jpTime(sl.start)}〜${jpTime(sl.end)}`).join(' / ')}`)
    .join('\n');
}

/** 回答期限の目安（今日から n 営業日後、土日は飛ばす）。 */
export function replyDeadline(now = new Date(), businessDays = 2) {
  let d = startOfDay(now);
  let left = businessDays;
  while (left > 0) {
    d = addDays(d, 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** テンプレートの {{...}} を差し込む。未知のキーは空文字にせずそのまま残す。 */
export function renderTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '') : m
  ));
}
