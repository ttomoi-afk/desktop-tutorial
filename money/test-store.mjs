// test-store.mjs — 集計ロジックの自己テスト。`node money/test-store.mjs` で実行。
// 依存なし。失敗があれば終了コード1。
import {
  normalizeEntry, deriveMonth, deriveGamble, deriveTrend, listMonths, monthAdd,
  toBook, fromBook, sampleState, fmtYen, fmtSigned, createStore,
} from './store.js';

let ok = 0, ng = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) ok++; else { ng++; console.error(`✗ ${name}\n   got : ${a}\n   want: ${b}`); }
};
const yes = (name, cond) => { if (cond) ok++; else { ng++; console.error(`✗ ${name}`); } };

// ── normalizeEntry
const g = normalizeEntry({ id: 'a', date: '2026-10-07', group: 'gamble', category: 'ボートレース', stake: '5000', payout: '3400' });
eq('ギャンブルは払戻−投入が amount', g.amount, -1600);
eq('通常支出は amount を整数化', normalizeEntry({ id: 'b', date: '2026-10-01', group: 'life', amount: '123.6' }).amount, 124);
eq('不明グループは生活に寄せる', normalizeEntry({ id: 'c', date: '2026-10-01', group: 'zzz', amount: 1 }).group, 'life');
eq('マイナス金額は 0', normalizeEntry({ id: 'd', date: '2026-10-01', group: 'play', amount: -500 }).amount, 0);

// ── deriveMonth
const E = (o) => normalizeEntry({ id: Math.random().toString(36).slice(2), ...o });
const state = {
  meta: {}, settings: { budgets: { life: 100000, play: 20000, gamble: 10000 }, allowGambleRebet: true },
  entries: [
    E({ date: '2026-10-25', group: 'income', category: '給料', amount: 300000 }),
    E({ date: '2026-10-26', group: 'income', category: '副収入', amount: 20000 }),
    E({ date: '2026-10-01', group: 'life', category: '家賃', amount: 70000 }),
    E({ date: '2026-10-05', group: 'life', category: '食費', amount: 30000 }),
    E({ date: '2026-10-06', group: 'play', category: '趣味', amount: 25000 }),
    E({ date: '2026-10-07', group: 'gamble', category: 'ボートレース', stake: 8000, payout: 2000 }),
    E({ date: '2026-10-08', group: 'gamble', category: '競馬', stake: 4000, payout: 7000 }),
    E({ date: '2026-09-25', group: 'income', category: '給料', amount: 300000 }),
    E({ date: '2026-09-03', group: 'life', category: '食費', amount: 50000 }),
  ],
};
const m = deriveMonth(state, '2026-10');
eq('件数は当月のみ', m.count, 7);
eq('給料', m.salary, 300000);
eq('収入（払戻含まず）', m.income, 320000);
eq('支出 = 生活+遊び+投入', m.expense, 70000 + 30000 + 25000 + 12000);
eq('収支 = 収入+払戻−支出', m.balance, 320000 + 9000 - 137000);
eq('ギャンブル純損益', m.gamble.net, -3000);
eq('ギャンブル純損失', m.gamble.loss, 3000);
eq('ギャンブル勝ち回数', m.gamble.wins, 1);
eq('配分の母数は給料', m.allocation.base, 300000);
eq('生活の割合', m.allocation.rows[0].pct, 33);
eq('遊びの割合', m.allocation.rows[1].pct, 8);
eq('ギャンブルは純損失で配分', m.allocation.rows[2].amount, 3000);
eq('残り = 給料−生活−遊び−純損失', m.allocation.left, 300000 - 100000 - 25000 - 3000);
eq('遊び予算オーバー', m.budgets.find((b) => b.key === 'play').over, true);
eq('生活予算は範囲内', m.budgets.find((b) => b.key === 'life').over, false);
eq('ギャンブル予算の使用は純損失（払戻を再投入可）', m.budgets.find((b) => b.key === 'gamble').used, 3000);
eq('カテゴリ別は降順', m.categories.life.map((c) => c.category), ['家賃', '食費']);
eq('新しい日付が先頭', m.entries[0].date, '2026-10-26');

// 給料がない月は総収入が母数
const noSal = deriveMonth({ ...state, entries: state.entries.filter((e) => e.category !== '給料') }, '2026-10');
eq('給料なし→収入が母数', [noSal.allocation.base, noSal.allocation.baseLabel], [20000, '収入']);
eq('母数を超えると over', noSal.allocation.over, true);
eq('空の月は 0', deriveMonth(state, '2025-01').allocation.base, 0);

// 勝ち越し月
const winM = deriveMonth({ ...state, entries: [E({ date: '2026-11-01', group: 'gamble', category: '競馬', stake: 1000, payout: 9000 })] }, '2026-11');
eq('勝ち越しの純損失は 0', winM.gamble.loss, 0);
eq('勝ち額が win に出る', winM.allocation.rows[2].win, 8000);

// 払戻の再投入を認めない設定
const strict = deriveMonth({ ...state, settings: { ...state.settings, allowGambleRebet: false } }, '2026-10');
eq('再投入不可なら投入総額が使用額', strict.budgets.find((b) => b.key === 'gamble').used, 12000);

// ── deriveGamble
const gm = deriveGamble(state, '2026-10');
eq('残り資金 = 枠 − 純損失', gm.remaining, 7000);
eq('回収率', gm.roi, 75);
eq('勝率', gm.winRate, 50);
eq('種目別は投入順', gm.byKind.map((k) => k.category), ['ボートレース', '競馬']);
eq('種目別の損益', gm.byKind.map((k) => k.net), [-6000, 3000]);
eq('累積曲線', gm.curve.map((c) => c.acc), [-6000, -3000]);
eq('枠オーバー判定', deriveGamble({ ...state, settings: { budgets: { gamble: 1000 } } }, '2026-10').over, true);

// ── deriveTrend / listMonths / monthAdd
eq('monthAdd 年またぎ', [monthAdd('2026-01', -1), monthAdd('2026-12', 1)], ['2025-12', '2027-01']);
const tr = deriveTrend(state, '2026-10', 3);
eq('推移は古い順 n ヶ月', tr.map((t) => t.ym), ['2026-08', '2026-09', '2026-10']);
eq('推移の収支', tr.map((t) => t.balance), [0, 250000, 192000]);
eq('月一覧は新しい順＋今月', listMonths(state, '2026-11-02'), ['2026-11', '2026-10', '2026-09']);

// ── toBook / fromBook
const book = toBook(state);
yes('book.entries は id キー', !Array.isArray(book.entries) && Object.keys(book.entries).length === 9);
const back = fromBook(book);
eq('往復で件数が保たれる', back.entries.length, 9);
eq('設定の既定値が補われる', back.settings.salaryDay, 25);
eq('null からは空', fromBook(null).entries.length, 0);
yes('サンプルには給料とギャンブルがある', sampleState('2026-10-20').entries.some((e) => e.category === '給料') && sampleState('2026-10-20').entries.some((e) => e.group === 'gamble'));

// ── 表示
eq('fmtYen', [fmtYen(1234567), fmtYen(-500), fmtYen(0)], ['¥1,234,567', '−¥500', '¥0']);
eq('fmtSigned', [fmtSigned(300), fmtSigned(-300)], ['+¥300', '−¥300']);

// ── store パッチ
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
const st = createStore();
const p1 = st.upsertEntry({ date: '2026-10-01', group: 'life', category: '食費', amount: 500 });
yes('追加パッチは entries/<id>', p1.path.startsWith('entries/') && p1.value.amount === 500);
eq('store に入る', st.state.entries.length, 1);
const p2 = st.deleteEntry(p1.value.id);
eq('削除パッチは null', [p2.path, p2.value], [p1.path, null]);
eq('削除後は空', st.state.entries.length, 0);
const p3 = st.setSettings({ budgets: { play: 5 } });
eq('設定パッチは budgets をマージ', [p3.path, p3.value.budgets.play, p3.value.budgets.life], ['settings', 5, 120000]);
st.useCache('t1'); st.upsertEntry({ date: '2026-10-02', group: 'play', amount: 1 });
const st2 = createStore(); yes('キャッシュから復元', st2.useCache('t1') && st2.state.entries.length === 1);

console.log(`${ok} passed, ${ng} failed`);
process.exit(ng ? 1 : 0);
