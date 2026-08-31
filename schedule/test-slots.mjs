// test-slots.mjs — 候補日ロジックの自己テスト。`node schedule/test-slots.mjs` で実行。
// 依存なし。失敗があれば終了コード1。
import {
  generateCandidates, mergeIntervals, workWindows, formatSlots, jpSlot,
  replyDeadline, renderTemplate, isoDate, DEFAULT_SETTINGS,
} from './slots.js';

let ok = 0, ng = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { ok++; } else { ng++; console.error(`✗ ${name}\n   got : ${a}\n   want: ${b}`); }
};
const yes = (name, cond) => { if (cond) ok++; else { ng++; console.error(`✗ ${name}`); } };

// 2026-09-01（火）09:00 を「いま」とする
const NOW = new Date(2026, 8, 1, 9, 0, 0);
const base = { ...DEFAULT_SETTINGS, leadHours: 0, fromDays: 0, spanDays: 3, maxTotal: 20, maxPerDay: 20 };

// ── mergeIntervals
eq('重なる予定はまとめる',
  mergeIntervals([
    { start: '2026-09-01T01:00:00Z', end: '2026-09-01T02:00:00Z' },
    { start: '2026-09-01T01:30:00Z', end: '2026-09-01T03:00:00Z' },
  ]).length, 1);
eq('離れた予定は別々', mergeIntervals([
  { start: '2026-09-01T01:00:00Z', end: '2026-09-01T02:00:00Z' },
  { start: '2026-09-01T04:00:00Z', end: '2026-09-01T05:00:00Z' },
]).length, 2);
eq('終了<=開始の予定は捨てる', mergeIntervals([{ start: 1000, end: 1000 }]).length, 0);

// ── workWindows（昼休みで2分割）
const w = workWindows(NOW, base);
eq('営業時間は昼休みで2分割', w.length, 2);
eq('午前の枠は10:00始まり', new Date(w[0].start).getHours(), 10);
eq('午後の枠は13:00始まり', new Date(w[1].start).getHours(), 13);

// ── 予定なしの日
const free = generateCandidates({ busy: [], settings: { ...base, spanDays: 1, maxPerDay: 3, stepMin: 60 }, now: NOW });
eq('空きの日は先頭が10:00〜11:00', jpSlot(free[0]), '9月1日（火） 10:00〜11:00');
yes('候補どうしは重ならない', free.every((s, i) => i === 0 || s.start >= free[i - 1].end));
yes('昼休みには候補を出さない', free.every((s) => !(s.start.getHours() === 12)));

// ── 既存予定＋バッファを避ける
const busy = [{ start: new Date(2026, 8, 1, 10, 30), end: new Date(2026, 8, 1, 11, 30) }];
const around = generateCandidates({ busy, settings: { ...base, spanDays: 1, maxPerDay: 5, bufferMin: 15, stepMin: 15 }, now: NOW });
yes('予定と重なる候補は出ない', around.every((s) => s.end <= busy[0].start || s.start >= busy[0].end));
yes('前後15分のバッファも空ける', around.every((s) => s.end <= new Date(2026, 8, 1, 10, 15) || s.start >= new Date(2026, 8, 1, 11, 45)));

// ── リードタイム / 曜日 / 上限
const lead = generateCandidates({ busy: [], settings: { ...base, spanDays: 7, leadHours: 48 }, now: NOW });
yes('48時間以内は候補にしない', lead.every((s) => s.start.getTime() >= NOW.getTime() + 48 * 3600000));
const weekdaysOnly = generateCandidates({ busy: [], settings: { ...base, spanDays: 14, maxTotal: 50 }, now: NOW });
yes('土日は候補にしない', weekdaysOnly.every((s) => ![0, 6].includes(s.start.getDay())));
eq('maxTotal を超えない', generateCandidates({ busy: [], settings: { ...base, spanDays: 14, maxTotal: 4 }, now: NOW }).length, 4);
const perDay = generateCandidates({ busy: [], settings: { ...base, spanDays: 14, maxPerDay: 1, maxTotal: 3 }, now: NOW });
eq('1日1件なら日付は重複しない', new Set(perDay.map((s) => isoDate(s.start))).size, perDay.length);
eq('skipDates の日は飛ばす',
  generateCandidates({ busy: [], settings: { ...base, spanDays: 1, skipDates: ['2026-09-01'] }, now: NOW }).length, 0);

// ── 終日予定（祝日カレンダーのfreeBusy）は丸一日つぶれる
const holiday = generateCandidates({
  busy: [{ start: new Date(2026, 8, 1, 0, 0), end: new Date(2026, 8, 2, 0, 0) }],
  settings: { ...base, spanDays: 1 }, now: NOW,
});
eq('終日予定の日は候補ゼロ', holiday.length, 0);

// ── 文面まわり
eq('同じ日の候補は1行にまとめる',
  formatSlots([
    { start: new Date(2026, 8, 1, 10, 0), end: new Date(2026, 8, 1, 11, 0) },
    { start: new Date(2026, 8, 1, 14, 0), end: new Date(2026, 8, 1, 15, 0) },
    { start: new Date(2026, 8, 2, 10, 0), end: new Date(2026, 8, 2, 11, 0) },
  ]),
  '・9月1日（火） 10:00〜11:00 / 14:00〜15:00\n・9月2日（水） 10:00〜11:00');
eq('回答期限は土日を飛ばす', isoDate(replyDeadline(new Date(2026, 8, 4), 2)), '2026-09-08'); // 金→火
eq('テンプレートの差し込み', renderTemplate('{{会社名}} {{宛名}} 様\n{{候補日}}', { 会社名: 'A社', 宛名: '山田', 候補日: '・9月1日' }), 'A社 山田 様\n・9月1日');
eq('未知のキーはそのまま残す', renderTemplate('{{未定義}}', {}), '{{未定義}}');

console.log(`${ng ? '✗' : '✓'} ${ok} passed, ${ng} failed`);
process.exit(ng ? 1 : 0);
