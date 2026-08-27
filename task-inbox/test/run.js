/**
 * task-inbox のロジック検証（Apps Script をモックして Node で実行）
 *
 *   node task-inbox/test/run.js
 *
 * ネットワークにも実際のスプレッドシートにも触らないので、いつでも安全に流せる。
 * 既定エンジン（ルール解析）と、構造化入力まわりの経路を検証する。
 */
require('./gasmock.js');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..');
for (const f of ['Config', 'Parse', 'SheetIO', 'WebApp', 'Chatbots']) {
  eval(fs.readFileSync(path.join(SRC, f + '.gs'), 'utf8'));
}

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) fail++; };
const E = '';

// 「今日」を 2026-08-27(木) に固定して日付まわりを決定的にする
const RealDate = Date;
const FIXED = new RealDate(2026, 7, 27, 10, 0, 0);
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED.getTime()])); }
  static now() { return FIXED.getTime(); }
};

console.log('\n[1] メンバー名の表記ゆれ');
[['友井さん', '友井'], ['トモイ', '友井'], ['友井大勢', '友井'], ['滝川共香', '共香'],
 ['ともか', '共香'], ['岡野百合乃', '岡野'], ['たけだ', '竹田'], ['山田', '']].forEach(([q, exp]) => {
  const m = findMember_(q);
  ok((m ? m.key : '') === exp, `"${q}" → ${m ? m.key : '(なし)'}　期待:${exp || '(なし)'}`);
});

console.log('\n[2] 日本語の期限表現 → 実日付');
[['今月中までに', '2026-08-31'], ['月末まで', '2026-08-31'], ['明日中', '2026-08-28'],
 ['来週', '2026-09-04'], ['9/4まで', '2026-09-04'], ['9月末', '2026-09-30'],
 ['3日後', '2026-08-30'], ['来月末', '2026-09-30'], ['特になし', '']].forEach(([q, exp]) => {
  const r = ruleDue_(q);
  ok(r.date === exp, `"${q}" → ${r.date || '(なし)'}　期待:${exp || '(なし)'}`);
});

console.log('\n[3] タスク名の整形（依頼の言い回しを落とす）');
[['洗い出して欲しい', '洗い出し'], ['探してください', '探し'], ['進めておいて', '進め'],
 ['作ってほしい', '作って'], ['確認をお願いします', '確認'],
 ['新車の助成金を探して 急ぎ', '新車の助成金を探し'],
 ['棚卸しのシステム化', '棚卸しのシステム化']].forEach(([a, b]) => {
  const r = cleanTitle_(a);
  ok(r === b, `"${a}" → "${r}"　期待:"${b}"`);
});

const EXAMPLE = '友井さんへ。今月中までに、弟子屈で使えそうな補助金を全部洗い出して欲しい。' +
                '特に新しい車を買うための助成金や補助金は急いで探して欲しい。';

console.log('\n[4] ルール解析（1行に2文）');
{
  const t = ruleParse_(EXAMPLE, '智春').tasks[0];
  ok(t.assignee === '友井', '担当者 = 友井');
  ok(t.due === '2026-08-31', '期限 = 2026-08-31（今月中までに）');
  ok(t.priority === '高', '優先度 = 高');
  ok(t.requester === '智春', '依頼者 = 智春');
  ok(t.title === '弟子屈で使えそうな補助金を全部洗い出し', `タスク名 = "${t.title}"`);
  ok(t.detail.indexOf('新しい車') >= 0, `2文目は詳細へ = "${t.detail}"`);
}

console.log('\n[5] 決め書式と複数行（宛先の引き継ぎ）');
{
  const t = ruleParse_('@友井 8/31 補助金の洗い出し', '智春').tasks[0];
  ok(t.assignee === '友井' && t.due === '2026-08-31' && t.title === '補助金の洗い出し',
     `"@友井 8/31 補助金の洗い出し" → ${t.assignee} / ${t.due} / ${t.title}`);

  const ts = ruleParse_('友井さんへ\n・補助金の洗い出し 今月中\n・新車の助成金を探して 急ぎ', '智春').tasks;
  ok(ts.length === 2, `箇条書き2行 → ${ts.length}件`);
  ok(ts.every(x => x.assignee === '友井'), '宛先だけの行が以降の行へ引き継がれる');
  ok(ts[1].priority === '高' && ts[1].title === '新車の助成金を探し',
     `2件目: 優先度=${ts[1].priority} / タスク名="${ts[1].title}"`);
}

console.log('\n[6] 宛先を推測しない');
{
  const t = ruleParse_('来週までに名刺のデザイン案を用意する', '').tasks[0];
  ok(t.assignee === '' && t.confidence === 0, `担当は空のまま（confidence=${t.confidence}）`);
}

/* ---- 実シートのレイアウトを再現して、列検出と追記位置を確かめる ---- */
const header = ['プロジェクト', 'タスク', 'タスク詳細', '期限', '状況'];
const tomo = __mkSheet('智春', [
  ['滝川智春さん タスク一覧（プロジェクト別）'],
  ['※プロジェクト分類は…', E, E, E, E, '竹田', '岡野', '智春', '共香', '友井'],
  [], header,
  ['予算・経営管理', '予算最終計画完成', E, '8月末'],
  ['', 'システム・財務関連の整備', E, '8月末'],
  ['冬季対策', '冬対策', E, '9月中旬'],
], [{ r: 5, c: 1, nr: 2, nc: 1 }]);            // A5:A6 が結合セル
const tomoka = __mkSheet('共香', [             // 表が B 列から始まる（1列ずれ）
  [E, '滝川共香さん タスク一覧（プロジェクト別）'],
  [E, '※…', E, E, E, E, '竹田', '岡野', '智春', '共香', '友井'],
  [], [E].concat(header),
  ['弟子屈', '施設・設備整備', '・トビラフォンの開通'],
  [E, '広報・PR', '・veryの更新', E, '9/4'],
  [], [],
  ['不動産', '開田高原', '母屋　建築確認台帳取得', E, '9/4'],   // 下部の別ブロック
  ['BASE', 'BASE施設', 'リロの会議室への掲載'],
]);
const tomoi = __mkSheet('友井 ', [             // タブ名の末尾に空白（実物どおり）
  ['友井大勢さん タスク一覧（プロジェクト別）'],
  ['※…', E, E, E, E, '竹田', '岡野', '智春', '共香', '友井'],
  [], header,
  ['nuppukotte', 'nuppukotte棚卸と統計情報システム', E, new Date(2026, 8, 4)],
]);
const okano = __mkSheet('岡野', [['岡野百合乃 タスク一覧'], ['※…'], [], header]);
const genpon = __mkSheet('原本', [['　さん タスク一覧（プロジェクト別）'], ['※…'], [], header]);
__setSS([tomo, tomoka, tomoi, okano, genpon]);

console.log('\n[7] 見出し行と列の自動検出');
[[tomo, 4, 1, '智春（A列start）'], [tomoka, 4, 2, '共香（B列start＝1列ずれ）'], [tomoi, 4, 1, '友井']]
  .forEach(([sh, hr, pc, label]) => {
    const m = mapColumns_(sh);
    ok(!!m && m.headerRow === hr && m.cols.project === pc,
       `${label}: 見出し行=${m && m.headerRow} プロジェクト列=${m && m.cols.project} 期限列=${m && m.cols.due}`);
  });

console.log('\n[8] 末尾に空白のあるタブ名を引ける');
ok(matchSheetName_('友井') === tomoi, '"友井" → 実タブ "友井 " に解決');

console.log('\n[9] 既存の案件名との辞書マッチ（AIを使わずに案件を埋める）');
ok(matchProject_('nuppukotteの月次資料をまとめる') === 'nuppukotte',
   `"nuppukotteの月次資料…" → ${matchProject_('nuppukotteの月次資料をまとめる') || '(なし)'}`);
ok(matchProject_('まったく関係のない用事') === '', '該当が無ければ空のまま');

console.log('\n[10] 追記先の行（結合セル・下部ブロックを避ける）');
ok(findAppendRow_(tomo, mapColumns_(tomo)) === 8, `智春: ${findAppendRow_(tomo, mapColumns_(tomo))}行目（データ末尾7の次）`);
ok(findAppendRow_(tomoka, mapColumns_(tomoka)) === 11, `共香: ${findAppendRow_(tomoka, mapColumns_(tomoka))}行目（下部ブロック10の次）`);

console.log('\n[11] 個人タブへの転記内容');
{
  const r = appendToPersonSheet_(findMember_('友井'), {
    assignee: '友井', requester: '智春', project: '補助金', title: '弟子屈で使える補助金の洗い出し',
    detail: '新車購入向けの助成金を優先', due: '2026-08-31', dueText: '今月中', priority: '高'
  });
  ok(r.ok && r.sheet === '友井', `転記先: ${r.sheet} ${r.row}行目`);
  ok(tomoi.getRange(r.row, 1).getValue() === '補助金', 'A列 = プロジェクト');
  ok(tomoi.getRange(r.row, 2).getValue() === '弟子屈で使える補助金の洗い出し', 'B列 = タスク名');
  const det = tomoi.getRange(r.row, 3).getValue();
  ok(det.includes('【急ぎ】') && det.includes('智春さん依頼'), `C列 = 詳細 → "${det}"`);
  const due = tomoi.getRange(r.row, 4).getValue();
  ok(due instanceof RealDate && due.getMonth() === 7 && due.getDate() === 31, `D列 = 期限（日付型） → ${due}`);
  ok(tomoi.getRange(r.row, 5).getValue() === '', 'E列 = 状況は空のまま（＝未着手）');
}

console.log('\n[12] タブが無いメンバーは「原本」から自動生成');
{
  const before = SpreadsheetApp.getActive().getSheets().length;
  const r = appendToPersonSheet_(findMember_('竹田'),
    { assignee: '竹田', title: 'テスト', project: '', detail: '', due: '', dueText: '', priority: '中' });
  ok(r.ok && SpreadsheetApp.getActive().getSheets().length === before + 1, `新タブ作成: ${r.sheet} ${r.row}行目`);
}

console.log('\n[13] 投稿 → 解析 → 転記 のエンドツーエンド');
const r13 = ingestOrAsk_(EXAMPLE, '智春', 'LINE', 'pending:LINE:U001');
ok(r13.kind === 'done', '宛先が揃っているので、聞き返さずその場で書き込む');
ok(r13.results.length === 1 && r13.results[0].wrote, `${r13.results.length}件を ${r13.results[0].sheet} タブへ転記`);
const inbox = SpreadsheetApp.getActive().getSheetByName('受信箱');
ok(!!inbox, '「受信箱」タブが自動生成された');
{
  const hdr = inbox.getRange(1, 1, 1, INBOX_HEADERS.length).getDisplayValues()[0];
  ok(hdr[0] === 'ID' && hdr[14] === '元メッセージ', '受信箱の見出し: ' + hdr.slice(0, 8).join(' / ') + ' …');
  const row = inbox.getRange(2, 1, 1, INBOX_HEADERS.length).getDisplayValues()[0];
  ok(row[2] === 'LINE' && row[3] === '智春' && row[4] === '友井', `経路=${row[2]} 依頼者=${row[3]} 担当=${row[4]}`);
  ok(row[11] === '転記済' && row[12].startsWith('友井'), `状況=${row[11]} 転記先=${row[12]}`);
  ok(row[14] === EXAMPLE, '元メッセージが原文のまま保存されている');
  ok(row[13] === 'rule', `解析エンジン=${row[13]}（無料のルール解析）`);
}

console.log('\n[14] チャットに返る文面');
console.log('  ----------------------------------------');
console.log(formatResultText_(r13).split('\n').map(l => '  ' + l).join('\n'));
console.log('  ----------------------------------------');

console.log('\n[15] 宛先が無い投稿 → 聞き返す → ボタンで確定');
{
  const key = 'pending:LINE:U123';
  const rowsBefore = inbox.getLastRow();
  const asked = ingestOrAsk_('来週までに名刺のデザイン案を用意する', '', 'LINE', key);
  ok(asked.kind === 'ask', '書き込まずに保留し、宛先を尋ねる');
  ok(inbox.getLastRow() === rowsBefore, '保留中は受信箱にもまだ書かない');

  const qr = assigneeQuickReply_();
  ok(qr.items.length === getMembers_().length + 1,
     `クイックリプライ ${qr.items.length}個（メンバー${getMembers_().length}人＋宛先なし）`);
  ok(qr.items[0].action.type === 'postback' && /^a=/.test(qr.items[0].action.data),
     `ボタンは postback: ${qr.items[0].action.data}`);

  const done = resolvePending_(key, '岡野');
  ok(done && done.results[0].wrote && done.results[0].assignee === '岡野',
     `確定 → ${done.results[0].sheet} タブ ${done.results[0].row}行目`);
  ok(resolvePending_(key, '岡野') === null, '同じ保留を二重登録しない');
}

console.log('\n[16] 「宛先なし」を選ぶと受信箱だけに残る');
{
  const key = 'pending:LINE:U999';
  ingestOrAsk_('備品の棚卸しをやる', '', 'LINE', key);
  const done = resolvePending_(key, '');
  ok(done && !done.results[0].wrote, '個人タブには書かない: ' + done.results[0].reason);
  ok(inbox.getRange(inbox.getLastRow(), 12).getDisplayValue() === '要確認', '受信箱の状況 = 要確認');
}

console.log('\n[17] 名前だけの返信でも確定できる（Google Chat 用）');
[['友井', '友井'], ['共香さん', '共香'], ['なし', ''], ['宛先なし', '']].forEach(([q, exp]) => {
  const r = asAssigneeReply_(q);
  ok(r && r.key === exp, `"${q}" → ${r ? (r.key || '宛先なし') : '(コマンドではない)'}`);
});
ok(asAssigneeReply_('補助金を調べておいてください') === null, '長い文はコマンドとして扱わない');

console.log('\n[18] 画面で選んだ担当・期限が本文の解析より優先される');
{
  const p = buildTasks_('弟子屈の補助金を洗い出して', '智春', '共香', '2026-09-30');
  ok(p.tasks[0].assignee === '共香', '担当 = 画面で選んだ共香');
  ok(p.tasks[0].due === '2026-09-30', '期限 = 画面で選んだ 2026-09-30');

  const q = buildTasks_('友井さんへ 今月中に棚卸し', '智春', '岡野', '');
  ok(q.tasks[0].assignee === '岡野', '本文に「友井さんへ」とあっても選択が優先される');
  ok(q.tasks[0].due === '2026-08-31', '期限は未選択なので本文から拾う');
}

console.log('\n[19] 依頼が無い投稿');
ok(formatResultText_({ results: [], note: '' }).indexOf('読み取れませんでした') > 0, '案内文を返す');

global.Date = RealDate;
console.log(fail ? `\n${fail} 件が失敗しました` : '\nすべて成功しました');
process.exitCode = fail ? 1 : 0;
