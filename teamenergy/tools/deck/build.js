// Team Energy 会社紹介資料 — pptxgenjs generator
const pptxgen = require('pptxgenjs');
const path = require('path');
const { applyTheme } = require('/root/.claude/skills/synced/de0fa2cb-3dbe-4b9b-ac4d-75d0c40b3f17_1fc1adc8-bef7-4b79-97ef-b60b257e4081/pptx/scripts/apply_theme.js');

const IMG = (f) => path.join(__dirname, 'img', f);
const THEME = {
  name: 'Team Energy',
  headFontFace: 'Yu Mincho',
  bodyFontFace: 'Yu Gothic',
  colors: {
    dk1: '1A1412', lt1: 'FFFFFF', dk2: '5C4F48', lt2: 'F5EFE8',
    accent1: 'D2461C', accent2: '9E2F10', accent3: 'F0A35C', accent4: '9C8C82', accent5: 'E6DBD0', accent6: '070403',
    hlink: 'D2461C', folHlink: '9E2F10',
  },
};
const HEX = THEME.colors;
const OUT = path.join(__dirname, 'TeamEnergy_会社紹介資料.pptx');

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.author = 'Team Energy株式会社';
  pres.title = 'Team Energy 会社紹介資料';
  const C = pres.SchemeColor;
  const W = 13.333, H = 7.5, M = 0.6;

  // ---------- layouts ----------
  pres.defineSlideMaster({
    title: 'LIGHT',
    background: { color: 'FFFFFF' },
    objects: [
      { placeholder: { options: { name: 'label', type: 'body', x: M, y: 0.4, w: 8, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.7, w: W - 2 * M, h: 0.9, fontSize: 28, color: C.text1, margin: 0, valign: 'top', align: 'left' }, text: '' } },
      { text: { text: 'Team Energy株式会社｜会社紹介資料', options: { x: M, y: 7.02, w: 6, h: 0.3, fontSize: 9, color: C.accent4, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.02, w: 0.55, h: 0.3, fontSize: 9, color: '9C8C82', align: 'right' },
  });
  pres.defineSlideMaster({
    title: 'DARK',
    background: { path: IMG('magma-poster.jpg') },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '070403', transparency: 38 } } },
    ],
  });

  // ---------- helpers ----------
  const text = (slide, t, o) => slide.addText(t, Object.assign({ isTextBox: true, margin: 0, fontSize: 14, color: C.text1 }, o));
  const rule = (slide, x, y, w, color) => slide.addShape(pres.ShapeType.line, { x, y, w, h: 0, line: { color: color || HEX.accent5, width: 0.75 } });
  const card = (slide, x, y, w, h, o) => slide.addShape(pres.ShapeType.rect, Object.assign({ x, y, w, h, fill: { color: C.background2 }, line: { color: HEX.accent5, width: 0.5 } }, o || {}));
  let n = 0;
  const newSlide = (master, section, name) => { n += 1; const s = pres.addSlide({ masterName: master, sectionTitle: section }); s._name = name; return s; };

  // ================= 1. 表紙 =================
  pres.addSection({ title: 'はじめに' });
  {
    const s = newSlide('DARK', 'はじめに', 'cover');
    s.addImage({ path: IMG('te-logo-white.png'), x: M, y: 0.55, w: 1.76, h: 1.0, objectName: 'Team Energy ロゴ' });
    text(s, [
      { text: '社会に必要な会社をつくる。', options: { breakLine: true } },
      { text: 'その未来を託せる経営者とともに。' },
    ], { x: M, y: 2.25, w: 12, h: 2.0, fontSize: 38, fontFace: THEME.headFontFace, color: C.background1, lineSpacingMultiple: 1.3, objectName: 'キャッチコピー' });
    text(s, '事業を生み、資本を投じ、経営者とともに100億企業へ育てる。', { x: M, y: 4.35, w: 12, h: 0.45, fontSize: 16, color: C.background1, objectName: 'サブコピー' });
    text(s, 'Team Energy株式会社　会社紹介資料　2026年10月', { x: M, y: 4.95, w: 12, h: 0.35, fontSize: 12, color: C.accent3, charSpacing: 1, objectName: '資料名' });
    // 数字の帯
    rule(s, M, 5.85, W - 2 * M, 'FFFFFF');
    const stats = [['4', '社', '100億円企業'], ['2', '社', '上場・売却によるEXIT'], ['18', '社', 'グループの事業会社'], ['6', '領域', '事業領域']];
    stats.forEach((st, i) => {
      const x = M + i * 3.03;
      text(s, [{ text: st[0], options: { fontSize: 30 } }, { text: ' ' + st[1], options: { fontSize: 12 } }], { x, y: 6.0, w: 2.8, h: 0.5, color: C.background1, objectName: '数字 ' + st[2] });
      text(s, st[2], { x, y: 6.5, w: 2.8, h: 0.3, fontSize: 11, color: C.background1, transparency: 25, objectName: 'ラベル ' + st[2] });
    });
    s.addNotes('表紙。HPのヒーローと同じキャッチコピーと、ポートフォリオの数字を抜粋。');
  }

  // ================= 2. Concept =================
  {
    const s = newSlide('LIGHT', 'はじめに', 'concept');
    s.addText('CONCEPT', { placeholder: 'label' });
    s.addText('産業の主役になる会社を、つくる', { placeholder: 'title' });
    text(s, [
      { text: '私たちは、会社の数を増やすために会社をつくるのではない。', options: { breakLine: true } },
      { text: 'これからの社会に本当に必要とされる事業を見つけ、', options: { breakLine: true } },
      { text: 'その可能性に人生を懸ける経営者とともに、', options: { breakLine: true } },
      { text: '100億、そしてユニコーンへと育てていく。' },
    ], { x: M, y: 1.95, w: 7.5, h: 2.9, fontSize: 18, fontFace: THEME.headFontFace, lineSpacingMultiple: 1.6, objectName: '宣言文' });
    text(s, 'Team Energyは、社会を変える企業を、経営者とともに生み出し続ける事業創造グループです。', { x: M, y: 5.05, w: 7.3, h: 0.9, fontSize: 14, color: C.text2, lineSpacingMultiple: 1.4, objectName: '説明文' });
    // 右: 目標のカード
    s.addShape(pres.ShapeType.rect, { x: 8.45, y: 1.95, w: 4.28, h: 4.0, fill: { color: C.accent6 }, line: { color: HEX.accent6, width: 0 }, objectName: '目標カード' });
    text(s, '目標', { x: 8.85, y: 2.3, w: 3.5, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent3, objectName: '目標ラベル' });
    text(s, '100億企業を10社。', { x: 8.85, y: 2.75, w: 3.6, h: 0.7, fontSize: 26, fontFace: THEME.headFontFace, color: C.background1, objectName: '目標1' });
    text(s, 'その先に、\nユニコーン3社を。', { x: 8.85, y: 3.5, w: 3.6, h: 1.3, fontSize: 26, fontFace: THEME.headFontFace, color: C.accent3, lineSpacingMultiple: 1.25, objectName: '目標2' });
    text(s, '出資と経営を切り離さない、事業投資会社。', { x: 8.85, y: 5.1, w: 3.6, h: 0.5, fontSize: 12, color: C.background1, objectName: '一言' });
    s.addNotes('HPのConceptセクション。宣言文と、100億企業10社・ユニコーン3社の目標。');
  }

  // ================= 3. 数字で見る =================
  {
    const s = newSlide('LIGHT', 'はじめに', 'numbers');
    s.addText('AT A GLANCE', { placeholder: 'label' });
    s.addText('数字で見る Team Energy', { placeholder: 'title' });
    const stats = [
      ['4', '社', '100億円企業', '企業価値100億円を超える企業を創出'],
      ['2', '社', '上場・売却によるEXIT', 'レジル（上場・TOB）、ふるさと熱電（売却）'],
      ['18', '社', 'グループの事業会社', '6つの事業領域に展開'],
      ['10', '社', '100億企業の目標', 'その先に、ユニコーン3社'],
    ];
    stats.forEach((st, i) => {
      const x = M + i * 3.09, w = 2.9;
      card(s, x, 1.95, w, 2.9, { objectName: 'カード ' + st[2] });
      text(s, [{ text: st[0], options: { fontSize: 60, color: C.accent1 } }, { text: ' ' + st[1], options: { fontSize: 16, color: C.text1 } }], { x: x + 0.3, y: 2.25, w: w - 0.5, h: 1.2, objectName: '数字 ' + st[2] });
      text(s, st[2], { x: x + 0.3, y: 3.55, w: w - 0.5, h: 0.4, fontSize: 15, bold: true, objectName: 'ラベル ' + st[2] });
      text(s, st[3], { x: x + 0.3, y: 3.95, w: w - 0.5, h: 0.7, fontSize: 11, color: C.text2, lineSpacingMultiple: 1.3, objectName: '補足 ' + st[2] });
    });
    text(s, 'ユニコーン企業を3社創出するために、100億円企業を創り続ける。', { x: M, y: 5.3, w: 12.1, h: 0.6, fontSize: 22, fontFace: THEME.headFontFace, objectName: '見出し' });
    text(s, 'EXIT実績：レジル（旧 中央電力）は2024年4月に東証グロース市場へ上場、その後ベインキャピタルへ売却。ふるさと熱電は2025年8月にベースロードキャピタルへ売却。', { x: M, y: 6.0, w: 12.1, h: 0.7, fontSize: 12, color: C.text2, lineSpacingMultiple: 1.3, objectName: '注記' });
    s.addNotes('ヒーローの数字の帯とPortfolioの数字。金額は非公表のため記載しない。');
  }

  // ================= 4. Group =================
  pres.addSection({ title: 'グループと実績' });
  {
    const s = newSlide('LIGHT', 'グループと実績', 'group');
    s.addText('GROUP', { placeholder: 'label' });
    s.addText('6つの事業領域、18社の事業会社', { placeholder: 'title' });
    const areas = [
      ['te-gi.png', 320 / 35, '㈱バイウィル'],
      ['te-geo.png', 365 / 35, '㈱GeoDreams'],
      ['te-ai.png', 376 / 34, '㈱キャナルAI　／　㈱スケールエーアイ　／　MIRACRE AI㈱'],
      ['te-gli.png', 337 / 35, 'Team Glocal㈱'],
      ['te-growth.png', 429 / 35, '㈱AILE　／　㈱ANY　／　弟子屈チャレンジ㈱'],
      ['te-am.png', 338 / 34, 'アセットマネジメント'],
    ];
    areas.forEach((a, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = M + col * 6.2, y = 1.95 + row * 1.6, w = 5.95, h = 1.42;
      card(s, x, y, w, h, { objectName: 'カード ' + a[0] });
      const lh = 0.34;
      s.addImage({ path: IMG(a[0]), x: x + 0.3, y: y + 0.28, w: lh * a[1], h: lh, objectName: 'ロゴ ' + a[0] });
      text(s, a[2], { x: x + 0.3, y: y + 0.82, w: w - 0.6, h: 0.4, fontSize: 12, color: C.text2, objectName: '傘下 ' + a[0] });
    });
    text(s, 'Team Energy株式会社を中心に、6つの中間持株会社（事業領域）の下で各事業会社を運営しています。', { x: M, y: 6.75, w: 12, h: 0.3, fontSize: 11, color: C.accent4, objectName: '注記' });
    s.addNotes('HPのGroupセクション。各領域のロゴと傘下各社。');
  }

  // ================= 5. Portfolio =================
  {
    const s = newSlide('LIGHT', 'グループと実績', 'portfolio');
    s.addText('PORTFOLIO', { placeholder: 'label' });
    s.addText('100億円企業を創り続ける', { placeholder: 'title' });
    text(s, '各社の企業価値の規模', { x: M, y: 1.9, w: 6, h: 0.35, fontSize: 14, bold: true, objectName: 'グラフ見出し' });
    const labels = ['ふるさと熱電', 'レジル', 'バイウィル', 'GeoDreams'];
    s.addChart(pres.ChartType.bar, [
      { name: 'EXIT済', labels, values: [52.5, 182, 0, 0] },
      { name: '未上場', labels, values: [0, 0, 40.2, 91] },
    ], {
      x: M, y: 2.3, w: 6.3, h: 3.6, objectName: '企業価値の規模',
      barDir: 'col', barGrouping: 'stacked', barGapWidthPct: 110,
      chartColors: ['D2461C', 'F0C4B1'],
      valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      catAxisLabelColor: HEX.dk1, catAxisLabelFontFace: '+mn-lt', catAxisLabelFontSize: 12,
      catAxisLineColor: HEX.accent5,
      showLegend: true, legendPos: 'b', legendFontFace: '+mn-lt', legendFontSize: 11, legendColor: HEX.dk2,
      showValue: false, showTitle: false,
    });
    text(s, '棒の長さは企業価値の相対的な規模。金額は非公表。左から歴史の順。', { x: M, y: 6.0, w: 6.3, h: 0.3, fontSize: 10, color: C.accent4, objectName: 'グラフ注記' });
    const cos = [
      ['EXIT', 'ふるさと熱電', 'ベースロードキャピタルへ売却。地域と共生する地熱発電所の運営', true],
      ['EXIT', 'REZIL（レジル）', '2024年 東証グロース上場。その後、ベインキャピタルへ売却。マンション一括受電のパイオニア', true],
      ['未上場', 'BY WILL（バイウィル）', '累計約30億円を調達。地銀45行・自治体60超と連携する環境クレジット創出事業', false],
      ['未上場', 'GeoDreams', 'クローズドループ地熱の開発。次世代型地熱発電の掘削・探査・運営を一貫して担う', false],
    ];
    cos.forEach((c, i) => {
      const x = 7.35, y = 1.95 + i * 1.12, w = 5.38, h = 1.0;
      card(s, x, y, w, h, { fill: { color: C.background1 }, objectName: 'カード ' + c[1] });
      text(s, c[0], { x: x + 0.25, y: y + 0.14, w: 1.2, h: 0.25, fontSize: 10, bold: true, charSpacing: 2, color: c[3] ? C.accent1 : C.accent4, objectName: '区分 ' + c[1] });
      text(s, c[1], { x: x + 1.3, y: y + 0.1, w: w - 1.5, h: 0.35, fontSize: 15, fontFace: THEME.headFontFace, bold: true, objectName: '社名 ' + c[1] });
      text(s, c[2], { x: x + 0.25, y: y + 0.5, w: w - 0.5, h: 0.45, fontSize: 10.5, color: C.text2, lineSpacingMultiple: 1.25, objectName: '説明 ' + c[1] });
    });
    s.addNotes('HPのPortfolioセクション。グラフは相対的な規模のみ（金額は非表示）。');
  }

  // ================= 6. 事例: 弟子屈 =================
  {
    const s = newSlide('LIGHT', 'グループと実績', 'case');
    s.addImage({ path: IMG('teshikaga-mashu.jpg'), x: 0, y: 0, w: 6.0, h: H, sizing: { type: 'cover', w: 6.0, h: H }, objectName: '摩周湖の写真' });
    const X = 6.5, Wd = W - X - M;
    text(s, 'CASE ｜ 弟子屈チャレンジ株式会社', { x: X, y: 0.4, w: Wd, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, objectName: 'ラベル' });
    text(s, '摩周湖に最も近いホテルを、\n地域の環境文化拠点へ。', { x: X, y: 0.72, w: Wd, h: 1.3, fontSize: 24, fontFace: THEME.headFontFace, lineSpacingMultiple: 1.25, objectName: 'タイトル' });
    text(s, 'Nature Base Hotel NUPPUKOTTE（旧 レラ摩周）／北海道川上郡弟子屈町', { x: X, y: 2.05, w: Wd, h: 0.35, fontSize: 12, color: C.text2, objectName: '施設名' });
    const tl = [['2022', '弟子屈チャレンジを設立し、「レラ摩周」として再開'], ['2023', '通年営業へ。運営体制をゼロから作り直す'], ['2025.05', '全面改装に着手'], ['2025.07', 'Nature Base Hotel NUPPUKOTTE として再出発']];
    tl.forEach((t, i) => {
      const y = 2.6 + i * 0.5;
      rule(s, X, y, Wd);
      text(s, t[0], { x: X, y: y + 0.1, w: 1.1, h: 0.35, fontSize: 12, bold: true, color: C.accent1, objectName: '年 ' + t[0] });
      text(s, t[1], { x: X + 1.15, y: y + 0.1, w: Wd - 1.15, h: 0.35, fontSize: 12, objectName: '出来事 ' + t[0] });
    });
    rule(s, X, 4.6, Wd);
    text(s, '取り組み', { x: X, y: 4.8, w: Wd, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, objectName: '取り組みラベル' });
    text(s, [
      { text: '経営人材を送り込む', options: { bullet: true, breakLine: true } },
      { text: 'コンセプトを立て直す', options: { bullet: true, breakLine: true } },
      { text: '食で差をつける（摩周鹿の料理）', options: { bullet: true, breakLine: true } },
      { text: '法人・団体需要を開拓する', options: { bullet: true, breakLine: true } },
      { text: '地域と組み、ホテルの先に地域開発を見る', options: { bullet: true } },
    ], { x: X, y: 5.1, w: 3.9, h: 1.7, fontSize: 12, paraSpaceAfter: 4, objectName: '取り組み一覧' });
    text(s, [
      { text: '全7室スイート', options: { fontSize: 16, bold: true, breakLine: true } },
      { text: '46〜99㎡／最大23名', options: { fontSize: 11, color: C.text2, breakLine: true } },
      { text: 'レストラン24席・ラウンジ', options: { fontSize: 11, color: C.text2 } },
    ], { x: X + 4.1, y: 5.1, w: Wd - 4.1, h: 1.2, lineSpacingMultiple: 1.3, objectName: '施設概要' });
    s.addNotes('事例ページ（cases/teshikaga.html）の要約。');
  }

  // ================= 7. 代表 =================
  pres.addSection({ title: '経営体制' });
  {
    const s = newSlide('LIGHT', '経営体制', 'ceo');
    s.addText('PEOPLE', { placeholder: 'label' });
    s.addText('代表取締役 グループCEO　中村 誠司', { placeholder: 'title' });
    s.addImage({ path: IMG('ceo-nakamura.jpg'), x: M, y: 1.95, w: 4.1, h: 2.7, objectName: '中村 誠司の写真' });
    text(s, '主な実績', { x: M, y: 4.85, w: 4.6, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, objectName: '実績ラベル' });
    const ach = [['レジル（旧 中央電力）', '2024年上場。その後、ベインキャピタルへ売却'], ['ふるさと熱電', '2025年8月、ベースロードキャピタルへ売却'], ['GeoDreams', '2022年設立。北海道八雲町で地熱発電事業を推進'], ['BY WILL', '2023年設立。CO₂排出権創出事業を展開、約30億円を調達']];
    ach.forEach((a, i) => {
      text(s, [{ text: a[0], options: { bold: true, breakLine: true } }, { text: a[1], options: { color: C.text2, fontSize: 10 } }], { x: M, y: 5.15 + i * 0.45, w: 4.7, h: 0.44, fontSize: 11, lineSpacingMultiple: 1.15, objectName: '実績 ' + a[0] });
    });
    const X = 5.6, Wd = W - X - M;
    text(s, '省エネ事業で株式会社メリックスを創業後、2004年に中央電力株式会社を設立。2012年にTeam Energy株式会社を設立。経営歴34年で58社を設立し、その多くを統合・廃止。失敗した会社の数は経営者仲間の中でも「自称トップ」。その一方で、企業価値100億円を超える企業を4社創出し、レジル（旧 中央電力）を上場・売却まで導く。', { x: X, y: 1.95, w: Wd, h: 1.75, fontSize: 13, lineSpacingMultiple: 1.45, objectName: '略歴' });
    const tl = [['1993', '省エネに関わる事業を開始'], ['1994', '省エネ事業で株式会社メリックスを創業'], ['2004', '中央電力株式会社を設立'], ['2012', 'Team Energy株式会社を設立'], ['2012', 'ふるさと熱電株式会社を設立'], ['2024.04', 'レジル株式会社（旧 中央電力）がグロース市場に上場']];
    tl.forEach((t, i) => {
      const y = 3.85 + i * 0.47;
      rule(s, X, y, Wd);
      text(s, t[0], { x: X, y: y + 0.09, w: 1.1, h: 0.32, fontSize: 12, bold: true, color: C.accent1, objectName: '年 ' + i });
      text(s, t[1], { x: X + 1.15, y: y + 0.09, w: Wd - 1.15, h: 0.32, fontSize: 12.5, objectName: '出来事 ' + i });
    });
    rule(s, X, 3.85 + 6 * 0.47, Wd);
    s.addNotes('HPのメンバー紹介（代表）。略歴・年表・主な実績。');
  }

  // ================= 8. 経営陣 =================
  {
    const s = newSlide('LIGHT', '経営体制', 'officers');
    s.addText('PEOPLE', { placeholder: 'label' });
    s.addText('経営陣', { placeholder: 'title' });
    const people = [
      { photo: 'coo-hattori.jpg', role: 'グループ最高執行責任者（COO）', name: '服部 浩久', edu: '京都大学卒', career: ['元 USEN 常務取締役', '元 住信SBIネット銀行 執行役員', '元 日本航空との合弁会社 代表取締役'], now: '現在　Team Energy グループ最高執行責任者（COO）' },
      { photo: null, role: 'グループ最高財務責任者（CFO）', name: '杉野 輝也', edu: '東京大学卒', career: ['元 住友銀行', '元 大和証券SMBC', '元 SMBC日興証券 執行役員', '元 三井住友フィナンシャルグループ 執行役員 グループ副CRO'], now: '現在　Team Energy グループ最高財務責任者（CFO）' },
    ];
    people.forEach((p, i) => {
      const x = M + i * 6.2, y = 1.95, w = 5.95, h = 4.7;
      card(s, x, y, w, h, { fill: { color: C.background1 }, objectName: 'カード ' + p.name });
      if (p.photo) {
        s.addImage({ path: IMG(p.photo), x: x + 0.3, y: y + 0.3, w: 2.1, h: 2.1, objectName: p.name + 'の写真' });
      } else {
        s.addShape(pres.ShapeType.rect, { x: x + 0.3, y: y + 0.3, w: 2.1, h: 2.1, fill: { color: C.background2 }, line: { color: HEX.accent5, width: 0.5 }, objectName: p.name + 'の写真枠' });
        text(s, '写真準備中', { x: x + 0.3, y: y + 1.2, w: 2.1, h: 0.3, fontSize: 10, align: 'center', color: C.accent4, objectName: '写真準備中' });
      }
      text(s, p.role, { x: x + 2.65, y: y + 0.35, w: w - 2.95, h: 0.3, fontSize: 11, color: C.text2, objectName: '役職 ' + p.name });
      text(s, p.name, { x: x + 2.65, y: y + 0.7, w: w - 2.95, h: 0.55, fontSize: 24, fontFace: THEME.headFontFace, bold: true, objectName: '氏名 ' + p.name });
      text(s, p.edu, { x: x + 2.65, y: y + 1.3, w: w - 2.95, h: 0.3, fontSize: 11, color: C.accent4, objectName: '出身 ' + p.name });
      text(s, 'これまでの経歴', { x: x + 0.3, y: y + 2.65, w: w - 0.6, h: 0.3, fontSize: 10, bold: true, charSpacing: 2, color: C.accent4, objectName: '経歴ラベル ' + p.name });
      const rows = p.career.concat([p.now]);
      rows.forEach((r, j) => {
        const yy = y + 2.95 + j * 0.34;
        rule(s, x + 0.3, yy, w - 0.6);
        const isNow = j === rows.length - 1;
        text(s, r, { x: x + 0.3, y: yy + 0.05, w: w - 0.6, h: 0.3, fontSize: 11.5, color: isNow ? C.accent1 : C.text1, bold: isNow, objectName: '経歴 ' + p.name + ' ' + j });
      });
    });
    s.addNotes('HPのメンバー紹介（役員）。');
  }

  // ================= 9. M&A =================
  pres.addSection({ title: 'M&A・会社概要' });
  {
    const s = newSlide('LIGHT', 'M&A・会社概要', 'ma');
    s.addText('M&A', { placeholder: 'label' });
    s.addText('Team Energy Groupに参加する企業を、お待ちしています', { placeholder: 'title' });
    const pts = [
      ['01', '業種・エリアを問わず、ご提案をお受けします', 'エネルギー、シニア、地域サービスなど、これまでの投資領域に限らず検討します。'],
      ['02', '承継後に誰が経営するかを、先に示します', 'グループで育てた経営人材と、上場・売却・再生を実務で経験した役員が経営に入ります。'],
      ['03', '雇用と取引先との関係を大切にします', '従業員の雇用と取引先との関係は維持を基本とし、現場の理解を得ながら段階的に事業を伸ばします。'],
    ];
    pts.forEach((p, i) => {
      const x = M + i * 4.1, y = 1.95, w = 3.92, h = 1.95;
      card(s, x, y, w, h, { objectName: 'ポイント ' + p[0] });
      text(s, p[0], { x: x + 0.3, y: y + 0.25, w: 1, h: 0.4, fontSize: 18, bold: true, color: C.accent1, objectName: '番号 ' + p[0] });
      text(s, p[1], { x: x + 0.3, y: y + 0.65, w: w - 0.6, h: 0.5, fontSize: 13, bold: true, lineSpacingMultiple: 1.2, objectName: '見出し ' + p[0] });
      text(s, p[2], { x: x + 0.3, y: y + 1.2, w: w - 0.6, h: 0.7, fontSize: 10.5, color: C.text2, lineSpacingMultiple: 1.25, objectName: '本文 ' + p[0] });
    });
    // 事例
    card(s, M, 4.15, 7.95, 2.55, { fill: { color: C.background1 }, objectName: '承継事例' });
    text(s, '承継事例 ｜ 障害福祉・介護予防サービス事業', { x: M + 0.3, y: 4.4, w: 7.4, h: 0.35, fontSize: 13, bold: true, objectName: '事例見出し' });
    const facts = [['約3.4', '億円', '年商'], ['7', '拠点', '事業所数'], ['約50', '名', '従業員数']];
    facts.forEach((f, i) => {
      const x = M + 0.3 + i * 1.75;
      text(s, [{ text: f[0], options: { fontSize: 22, color: C.accent1 } }, { text: ' ' + f[1], options: { fontSize: 11 } }], { x, y: 4.85, w: 1.7, h: 0.5, objectName: '事例数字 ' + f[2] });
      text(s, f[2], { x, y: 5.35, w: 1.7, h: 0.25, fontSize: 10, color: C.accent4, objectName: '事例ラベル ' + f[2] });
    });
    text(s, [
      { text: '売り手の「事業の選択と集中」により、当該事業のみを事業譲渡で承継', options: { bullet: true, breakLine: true } },
      { text: '従業員の雇用と処遇の維持を最重視。許認可の新規取得と契約の承継を完了し、地域の福祉サービスを継続', options: { bullet: true } },
    ], { x: M + 0.3, y: 5.75, w: 7.4, h: 0.9, fontSize: 10.5, color: C.text2, paraSpaceAfter: 3, lineSpacingMultiple: 1.2, objectName: '事例本文' });
    // 窓口
    s.addShape(pres.ShapeType.rect, { x: 8.8, y: 4.15, w: 3.93, h: 2.55, fill: { color: C.accent6 }, line: { color: HEX.accent6, width: 0 }, objectName: '窓口カード' });
    text(s, 'CONTACT', { x: 9.1, y: 4.4, w: 3.4, h: 0.3, fontSize: 10, bold: true, charSpacing: 3, color: C.accent3, objectName: '窓口ラベル' });
    text(s, '案件のご提案・ご相談', { x: 9.1, y: 4.7, w: 3.4, h: 0.4, fontSize: 15, fontFace: THEME.headFontFace, color: C.background1, objectName: '窓口見出し' });
    text(s, 'sourcing@teamenergy.co.jp', { x: 9.1, y: 5.2, w: 3.5, h: 0.35, fontSize: 13, color: C.background1, objectName: 'メール' });
    text(s, '案件窓口：友井 大勢\n仲介会社・金融機関・オーナー経営者の皆さまからお受けしています。', { x: 9.1, y: 5.65, w: 3.45, h: 0.95, fontSize: 10.5, color: C.background1, lineSpacingMultiple: 1.3, objectName: '窓口説明' });
    s.addNotes('M&Aページの要約。投資条件などの詳細は記載しない（MTG方針）。');
  }

  // ================= 10. 会社概要 =================
  {
    const s = newSlide('LIGHT', 'M&A・会社概要', 'company');
    s.addText('COMPANY', { placeholder: 'label' });
    s.addText('会社概要', { placeholder: 'title' });
    const rows = [
      ['会社名', 'Team Energy株式会社（総称：Team Energy Group）'],
      ['設立', '2012年5月'],
      ['代表者', '中村 誠司（グループCEO）'],
      ['本社', '〒530-0011 大阪府大阪市北区大深町6 グラングリーン大阪北館 JAM BASE 9階 916号室'],
      ['東京オフィス', '〒160-0014 東京都新宿区内藤町1-82 プルニエ'],
      ['事業内容', '事業育成・新規事業創出を軸に、複数事業をグループ各社にて展開'],
      ['グループ', '6つの事業領域（GI／Geo／AI総研／GLI／Growth／AM）、18社の事業会社'],
    ];
    const X = M, Wd = 8.0;
    rows.forEach((r, i) => {
      const y = 2.0 + i * 0.62;
      rule(s, X, y, Wd);
      text(s, r[0], { x: X, y: y + 0.14, w: 1.6, h: 0.4, fontSize: 12, color: C.accent4, objectName: '項目 ' + r[0] });
      text(s, r[1], { x: X + 1.7, y: y + 0.14, w: Wd - 1.7, h: 0.45, fontSize: 12.5, lineSpacingMultiple: 1.2, objectName: '内容 ' + r[0] });
    });
    rule(s, X, 2.0 + rows.length * 0.62, Wd);
    s.addImage({ path: IMG('te-logo.png'), x: 9.55, y: 2.3, w: 2.9, h: 2.9 * 1367 / 2410, objectName: 'Team Energy ロゴ' });
    s.addNotes('HPフッターの会社情報。');
  }

  // ================= 11. 締め =================
  {
    const s = newSlide('DARK', 'M&A・会社概要', 'closing');
    s.addImage({ path: IMG('te-logo-white.png'), x: M, y: 0.55, w: 1.76, h: 1.0, objectName: 'Team Energy ロゴ' });
    text(s, '100億企業を10社。\nその先に、ユニコーン3社を。', { x: M, y: 2.5, w: 12, h: 2.0, fontSize: 36, fontFace: THEME.headFontFace, color: C.background1, lineSpacingMultiple: 1.3, objectName: '締めのコピー' });
    text(s, 'Team Energy株式会社', { x: M, y: 5.3, w: 6, h: 0.4, fontSize: 16, color: C.background1, objectName: '社名' });
    text(s, '〒530-0011 大阪府大阪市北区大深町6 グラングリーン大阪北館 JAM BASE 9階 916号室\nM&A・事業承継に関するお問い合わせ：sourcing@teamenergy.co.jp', { x: M, y: 5.75, w: 12, h: 0.8, fontSize: 11, color: C.background1, transparency: 20, lineSpacingMultiple: 1.4, objectName: '連絡先' });
    s.addNotes('締め。');
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT, 'slides', n);
})().catch((e) => { console.error(e); process.exit(1); });
