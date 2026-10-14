// Team Energy 会社紹介資料 v3 — 2026-10-14 修正（順番変更・表紙の画像削除・写真比率・余白を詰める）
const pptxgen = require('pptxgenjs');
const path = require('path');
const { applyTheme } = require('/root/.claude/skills/synced/de0fa2cb-3dbe-4b9b-ac4d-75d0c40b3f17_1fc1adc8-bef7-4b79-97ef-b60b257e4081/pptx/scripts/apply_theme.js');

const IMG = (f) => path.join(__dirname, 'img', f);
const THEME = {
  name: 'Team Energy',
  headFontFace: 'Yu Gothic',
  bodyFontFace: 'Yu Gothic',
  colors: {
    dk1: '222222', lt1: 'FFFFFF', dk2: '666666', lt2: 'F2F2F2',
    accent1: 'C8431C', accent2: '9E2F10', accent3: 'E8E2DA', accent4: '999999', accent5: 'D9D9D9', accent6: '1A1412',
    hlink: 'C8431C', folHlink: '9E2F10',
  },
};
const HEX = THEME.colors;
const OUT = path.join(__dirname, 'TeamEnergy_会社紹介資料.pptx');
// 画像の縦横比（横に伸びないよう、配置サイズは必ずこの比で決める）
const RATIO = { 'te-logo.png': 1367 / 2410, 'ceo-nakamura.jpg': 890 / 1350, 'coo-hattori.jpg': 1, 'teshikaga-mashu.jpg': 706 / 1200, 'teshikaga-room1.jpg': 802 / 1200 };

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.author = 'Team Energy株式会社';
  pres.title = 'Team Energy 会社紹介資料';
  const C = pres.SchemeColor;
  const W = 13.333, H = 7.5, M = 0.5;

  // ---------- レイアウト ----------
  pres.defineSlideMaster({
    title: 'BASE',
    background: { color: 'FFFFFF' },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.3, w: 9.0, h: 0.55, fontSize: 22, bold: true, color: C.text1, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
      { line: { x: M, y: 0.95, w: W - 2 * M, h: 0, line: { color: HEX.accent5, width: 0.75 } } },
      { image: { path: IMG('te-logo-h.png'), x: 9.77, y: 0.4, w: 3.06, h: 0.36 } },
      { line: { x: M, y: 6.95, w: W - 2 * M, h: 0, line: { color: HEX.accent5, width: 0.5 } } },
      { text: { text: 'Team Energy株式会社', options: { x: M, y: 7.02, w: 5, h: 0.3, fontSize: 9, color: C.text2, margin: 0 } } },
      { text: { text: 'Copyright © Team Energy Co., Ltd. All rights reserved.', options: { x: 4.5, y: 7.02, w: 6, h: 0.3, fontSize: 8, color: C.accent4, margin: 0, align: 'center' } } },
    ],
    slideNumber: { x: 12.2, y: 7.02, w: 0.63, h: 0.3, fontSize: 9, color: '666666', align: 'right' },
  });
  pres.defineSlideMaster({ title: 'PLAIN', background: { color: 'FFFFFF' } });

  // ---------- 部品 ----------
  const text = (slide, t, o) => slide.addText(t, Object.assign({ isTextBox: true, margin: 0, fontSize: 12, color: C.text1 }, o));
  const hline = (slide, x, y, w, color, width) => slide.addShape(pres.ShapeType.line, { x, y, w, h: 0, line: { color: color || HEX.accent5, width: width || 0.75 } });
  const vline = (slide, x, y, h, color, width) => slide.addShape(pres.ShapeType.line, { x, y, w: 0, h, line: { color: color || HEX.accent5, width: width || 0.75 } });
  const th = (t) => ({ text: t, options: { fill: { color: HEX.lt2 }, bold: true, color: HEX.dk1 } });
  const td = (t, o) => ({ text: t, options: Object.assign({ color: HEX.dk1 }, o || {}) });
  const table = (slide, rows, o) => slide.addTable(rows, Object.assign({ fontSize: 11, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: 'solid', pt: 0.5, color: HEX.accent5 }, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1], autoPage: false }, o));
  const sub = (slide, t, x, y, w) => text(slide, t, { x, y, w, h: 0.35, fontSize: 14, bold: true, objectName: '小見出し ' + t });
  // 画像は元の縦横比で配置（幅を指定、高さは比率から計算）
  const photo = (slide, f, x, y, w, name) => { const h = w * RATIO[f]; slide.addImage({ path: IMG(f), x, y, w, h, objectName: name }); return h; };
  let n = 0;
  const newSlide = (master, section) => { n += 1; return pres.addSlide({ masterName: master, sectionTitle: section }); };

  // 目次の項目（スライドの順番に合わせる）
  const TOC = ['会社概要', '経営体制', '私たちについて', '数字で見る Team Energy', 'グループ構成', '主な投資先・実績', '事例紹介：弟子屈チャレンジ', 'M&A・事業承継について'];

  // ================= 表紙 =================
  const slideCover = (sec) => {
    const s = newSlide('PLAIN', sec);
    // 右側: 薄いグレーの面にロゴ（写真は使わない）
    const PX = 7.9;
    s.addShape(pres.ShapeType.rect, { x: PX, y: 0, w: W - PX, h: H, fill: { color: C.background2 }, line: { color: HEX.lt2, width: 0 }, objectName: '背景面' });
    const lw = 3.4, lh = lw * RATIO['te-logo.png'];
    s.addImage({ path: IMG('te-logo.png'), x: PX + (W - PX - lw) / 2, y: (H - lh) / 2, w: lw, h: lh, objectName: 'ロゴ（大）' });
    // 左側: タイトル
    const lw2 = 2.0, lh2 = lw2 * RATIO['te-logo.png'];
    s.addImage({ path: IMG('te-logo.png'), x: M + 0.3, y: 0.8, w: lw2, h: lh2, objectName: 'ロゴ' });
    text(s, '会社紹介資料', { x: M + 0.3, y: 2.95, w: 6.8, h: 1.0, fontSize: 40, bold: true, objectName: 'タイトル' });
    text(s, 'Company Profile', { x: M + 0.3, y: 3.95, w: 6.8, h: 0.4, fontSize: 14, color: C.text2, objectName: '英題' });
    hline(s, M + 0.3, 4.6, 1.2, HEX.accent1, 1.5);
    text(s, 'Team Energy株式会社', { x: M + 0.3, y: 4.8, w: 6.8, h: 0.5, fontSize: 20, bold: true, objectName: '社名' });
    text(s, '2026年10月', { x: M + 0.3, y: 5.35, w: 6.8, h: 0.4, fontSize: 12, color: C.text2, objectName: '日付' });
    text(s, '〒530-0011 大阪府大阪市北区大深町6 グラングリーン大阪北館 JAM BASE 9階 916号室', { x: M + 0.3, y: 6.6, w: 7.0, h: 0.3, fontSize: 9.5, color: C.text2, objectName: '住所' });
    s.addNotes('表紙');
  };

  // ================= 目次 =================
  const slideToc = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('目次', { placeholder: 'title' });
    TOC.forEach((t, i) => {
      const col = i < 4 ? 0 : 1, row = i % 4;
      const x = M + 0.5 + col * 6.3, y = 1.5 + row * 1.25;
      text(s, String(i + 1).padStart(2, '0'), { x, y, w: 0.8, h: 0.55, fontSize: 22, bold: true, color: C.accent1, objectName: '番号 ' + (i + 1) });
      text(s, t, { x: x + 0.9, y: y + 0.03, w: 4.8, h: 0.55, fontSize: 18, objectName: '項目 ' + (i + 1) });
      hline(s, x, y + 0.75, 5.6);
    });
    s.addNotes('目次');
  };

  // ================= 会社概要 =================
  const slideProfile = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('会社概要', { placeholder: 'title' });
    const TW = 8.2;
    table(s, [
      [th('会社名'), td('Team Energy株式会社（総称：Team Energy Group）')],
      [th('設立'), td('2012年5月')],
      [th('代表者'), td('代表取締役 グループCEO　中村 誠司')],
      [th('本社'), td('〒530-0011 大阪府大阪市北区大深町6 グラングリーン大阪北館 JAM BASE 9階 916号室')],
      [th('東京オフィス'), td('〒160-0014 東京都新宿区内藤町1-82 プルニエ')],
      [th('事業内容'), td('事業育成・新規事業創出を軸に、複数事業をグループ各社にて展開')],
      [th('グループ'), td('6つの事業領域（GI／Geo／AI総研／GLI／Growth／AM）、18社の事業会社')],
    ], { x: M, y: 1.25, w: TW, colW: [1.7, TW - 1.7], rowH: 0.74, fontSize: 11.5 });
    // 右: ロゴと沿革
    const X = M + TW + 0.45, Wd = W - X - M;
    const lw = 2.0, lh = lw * RATIO['te-logo.png'];
    s.addImage({ path: IMG('te-logo.png'), x: X + (Wd - lw) / 2, y: 1.2, w: lw, h: lh, objectName: 'ロゴ' });
    sub(s, '沿革', X, 2.6, Wd);
    table(s, [
      [td('2012年5月', { bold: true }), td('Team Energy株式会社を設立')],
      [td('2012年', { bold: true }), td('ふるさと熱電株式会社を設立')],
      [td('2022年', { bold: true }), td('株式会社GeoDreamsを設立')],
      [td('2022年', { bold: true }), td('弟子屈チャレンジ株式会社を設立')],
      [td('2023年', { bold: true }), td('株式会社バイウィルを設立')],
      [td('2024年4月', { bold: true }), td('レジル株式会社が東証グロース上場')],
      [td('2025年7月', { bold: true }), td('NUPPUKOTTE として再出発')],
      [td('2025年8月', { bold: true }), td('ふるさと熱電株式会社を売却')],
    ], { x: X, y: 3.0, w: Wd, colW: [1.1, Wd - 1.1], rowH: 0.44, fontSize: 10 });
    s.addNotes('HPフッターの会社情報と、本資料内の出来事をまとめた沿革。');
  };

  // ================= 代表 =================
  const slideCeo = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('経営体制：代表', { placeholder: 'title' });
    const ph = photo(s, 'ceo-nakamura.jpg', M, 1.2, 4.0, '中村 誠司の写真');
    let y = 1.2 + ph + 0.12;
    text(s, '代表取締役 グループCEO', { x: M, y, w: 4.0, h: 0.3, fontSize: 10.5, color: C.text2, objectName: '役職' });
    text(s, '中村 誠司', { x: M, y: y + 0.3, w: 4.0, h: 0.5, fontSize: 20, bold: true, objectName: '氏名' });
    sub(s, '主な実績', M, y + 0.95, 4.0);
    text(s, [
      { text: 'レジル：2024年上場、ベインキャピタルへ売却', options: { bullet: true, breakLine: true } },
      { text: 'ふるさと熱電：2025年8月、ベースロードキャピタルへ売却', options: { bullet: true, breakLine: true } },
      { text: 'GeoDreams：2022年設立、八雲町で地熱開発を推進', options: { bullet: true, breakLine: true } },
      { text: 'BY WILL：2023年設立、約30億円を調達', options: { bullet: true } },
    ], { x: M, y: y + 1.32, w: 4.6, h: 1.5, fontSize: 10, color: C.text1, paraSpaceAfter: 4, lineSpacingMultiple: 1.2, objectName: '実績' });
    const X = 5.3, Wd = W - X - M;
    sub(s, 'プロフィール', X, 1.2, 4);
    text(s, '省エネ事業で株式会社メリックスを創業後、2004年に中央電力株式会社を設立。2012年にTeam Energy株式会社を設立。経営歴34年で58社を設立し、その多くを統合・廃止。失敗した会社の数は経営者仲間の中でも「自称トップ」。その一方で、企業価値100億円を超える企業を4社創出し、レジル（旧 中央電力）を上場・売却まで導く。', { x: X, y: 1.6, w: Wd, h: 1.5, fontSize: 12, lineSpacingMultiple: 1.45, objectName: '略歴' });
    sub(s, '経歴', X, 3.3, 4);
    table(s, [
      [td('1993年', { bold: true }), td('省エネに関わる事業を開始')],
      [td('1994年', { bold: true }), td('省エネ事業で株式会社メリックスを創業')],
      [td('2004年', { bold: true }), td('中央電力株式会社を設立')],
      [td('2012年', { bold: true }), td('Team Energy株式会社を設立')],
      [td('2012年', { bold: true }), td('ふるさと熱電株式会社を設立')],
      [td('2024年4月', { bold: true }), td('レジル株式会社（旧 中央電力）が東証グロース市場に上場')],
    ], { x: X, y: 3.7, w: Wd, colW: [1.4, Wd - 1.4], rowH: 0.5, fontSize: 11.5 });
    s.addNotes('HPのメンバー紹介（代表）。');
  };

  // ================= 役員 =================
  const slideOfficers = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('経営体制：役員', { placeholder: 'title' });
    const people = [
      { photo: 'coo-hattori.jpg', role: 'グループ最高執行責任者（COO）', name: '服部 浩久', edu: '京都大学卒', career: ['元 USEN 常務取締役', '元 住信SBIネット銀行 執行役員', '元 日本航空との合弁会社 代表取締役'] },
      { photo: null, role: 'グループ最高財務責任者（CFO）', name: '杉野 輝也', edu: '東京大学卒', career: ['元 住友銀行', '元 大和証券SMBC', '元 SMBC日興証券 執行役員', '元 三井住友フィナンシャルグループ 執行役員 グループ副CRO'] },
    ];
    vline(s, W / 2, 1.2, 5.5);
    people.forEach((p, i) => {
      const x = M + i * 6.4, y = 1.2, pw = 2.1;
      if (p.photo) {
        photo(s, p.photo, x, y, pw, p.name + 'の写真');
      } else {
        // 写真が届くまでの枠（文字は入れない）
        s.addShape(pres.ShapeType.rect, { x, y, w: pw, h: pw, fill: { color: C.background2 }, line: { color: HEX.accent5, width: 0.5 }, objectName: p.name + 'の写真枠' });
      }
      text(s, p.role, { x: x + pw + 0.25, y: y + 0.2, w: 3.7, h: 0.3, fontSize: 11, color: C.text2, objectName: '役職 ' + p.name });
      text(s, p.name, { x: x + pw + 0.25, y: y + 0.55, w: 3.7, h: 0.55, fontSize: 22, bold: true, objectName: '氏名 ' + p.name });
      text(s, p.edu, { x: x + pw + 0.25, y: y + 1.15, w: 3.7, h: 0.3, fontSize: 11, color: C.text2, objectName: '出身 ' + p.name });
      sub(s, '経歴', x, 3.6, 3);
      const rows = p.career.map((c) => [td(c)]);
      rows.push([td('現在　Team Energy ' + p.role, { bold: true, color: HEX.accent1 })]);
      table(s, rows, { x, y: 4.0, w: 5.9, colW: [5.9], rowH: 0.48, fontSize: 11.5 });
    });
    s.addNotes('HPのメンバー紹介（役員）。');
  };

  // ================= 私たちについて =================
  const slideAbout = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('私たちについて', { placeholder: 'title' });
    sub(s, '事業創造グループとしての考え方', M, 1.2, 7);
    text(s, [
      { text: '私たちは、会社の数を増やすために会社をつくるのではない。', options: { breakLine: true } },
      { text: 'これからの社会に本当に必要とされる事業を見つけ、', options: { breakLine: true } },
      { text: 'その可能性に人生を懸ける経営者とともに、', options: { breakLine: true } },
      { text: '100億、そしてユニコーンへと育てていく。' },
    ], { x: M, y: 1.65, w: 6.9, h: 1.9, fontSize: 14.5, lineSpacingMultiple: 1.5, objectName: '宣言文' });
    text(s, 'Team Energyは、社会を変える企業を、経営者とともに生み出し続ける事業創造グループです。出資と経営を切り離さず、投資先の経営に自ら入り、意思決定から実行までを自社で完結させます。', { x: M, y: 3.7, w: 6.9, h: 1.2, fontSize: 12, color: C.text2, lineSpacingMultiple: 1.45, objectName: '説明' });
    const X = 8.0, Wd = W - X - M;
    sub(s, '私たちのやり方', X, 1.2, Wd);
    const steps = [['事業を生む', 'これからの社会に必要とされる事業を見つける'], ['資本を投じる', '出資と経営を切り離さず、投資先の経営に自ら入る'], ['経営者とともに育てる', '100億企業へ、そしてユニコーンへ']];
    steps.forEach((st, i) => {
      const y = 1.65 + i * 1.15;
      s.addShape(pres.ShapeType.rect, { x: X, y, w: Wd, h: 0.86, fill: { color: C.background2 }, line: { color: HEX.accent5, width: 0.5 }, objectName: 'ステップ ' + (i + 1) });
      text(s, String(i + 1), { x: X + 0.2, y: y + 0.18, w: 0.5, h: 0.5, fontSize: 20, bold: true, color: C.accent1, objectName: 'ステップ番号 ' + (i + 1) });
      text(s, st[0], { x: X + 0.75, y: y + 0.13, w: Wd - 0.9, h: 0.3, fontSize: 13, bold: true, objectName: 'ステップ名 ' + (i + 1) });
      text(s, st[1], { x: X + 0.75, y: y + 0.46, w: Wd - 0.9, h: 0.3, fontSize: 10.5, color: C.text2, objectName: 'ステップ説明 ' + (i + 1) });
      if (i < 2) s.addShape(pres.ShapeType.downArrow, { x: X + Wd / 2 - 0.12, y: y + 0.9, w: 0.24, h: 0.22, fill: { color: C.accent5 }, line: { color: HEX.accent5, width: 0 }, objectName: '矢印 ' + (i + 1) });
    });
    s.addShape(pres.ShapeType.rect, { x: M, y: 5.3, w: W - 2 * M, h: 1.25, fill: { color: C.background1 }, line: { color: HEX.accent1, width: 1 }, objectName: '目標枠' });
    text(s, '目標', { x: M + 0.3, y: 5.45, w: 1.2, h: 0.35, fontSize: 12, bold: true, color: C.accent1, objectName: '目標ラベル' });
    text(s, '100億企業を10社。その先に、ユニコーン3社を。', { x: M + 0.3, y: 5.82, w: 11.5, h: 0.55, fontSize: 20, bold: true, objectName: '目標本文' });
    s.addNotes('HPのConceptセクションをもとにした会社の考え方と目標。');
  };

  // ================= 数字で見る =================
  const slideNumbers = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('数字で見る Team Energy', { placeholder: 'title' });
    const stats = [['4', '社', '100億円企業', '企業価値100億円を超える企業を創出'], ['2', '社', '上場・売却によるEXIT', 'レジル、ふるさと熱電'], ['18', '社', 'グループの事業会社', '6つの事業領域に展開'], ['10', '社', '100億企業の目標', 'その先に、ユニコーン3社']];
    stats.forEach((st, i) => {
      const x = M + i * 3.08, w = 2.9;
      if (i > 0) vline(s, x - 0.12, 1.35, 2.0);
      text(s, [{ text: st[0], options: { fontSize: 44, bold: true, color: C.accent1 } }, { text: ' ' + st[1], options: { fontSize: 15 } }], { x, y: 1.35, w, h: 0.9, objectName: '数字 ' + st[2] });
      text(s, st[2], { x, y: 2.35, w, h: 0.35, fontSize: 14, bold: true, objectName: 'ラベル ' + st[2] });
      text(s, st[3], { x, y: 2.75, w, h: 0.5, fontSize: 10.5, color: C.text2, lineSpacingMultiple: 1.3, objectName: '補足 ' + st[2] });
    });
    sub(s, 'EXIT実績', M, 3.7, 6);
    table(s, [
      [th('会社名'), th('内容'), th('時期')],
      [td('レジル株式会社（旧 中央電力）'), td('東証グロース市場に上場。その後、ベインキャピタルへ売却'), td('2024年4月 上場')],
      [td('ふるさと熱電株式会社'), td('ベースロードキャピタルへ売却。現在はベースロードジャパンが運営'), td('2025年8月')],
    ], { x: M, y: 4.1, w: W - 2 * M, colW: [3.4, 6.5, 2.43], rowH: 0.5, fontSize: 11.5 });
    s.addShape(pres.ShapeType.rect, { x: M, y: 5.9, w: W - 2 * M, h: 0.75, fill: { color: C.background2 }, line: { color: HEX.lt2, width: 0 }, objectName: '一言枠' });
    text(s, 'ユニコーン企業を3社創出するために、100億円企業を創り続けます。', { x: M + 0.3, y: 5.9, w: 11.8, h: 0.75, fontSize: 15, bold: true, valign: 'middle', objectName: '一言' });
    s.addNotes('HPのヒーローとPortfolioの数字。金額は非公表のため記載しない。');
  };

  // ================= グループ構成(組織図) =================
  const slideGroup = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('グループ構成', { placeholder: 'title' });
    text(s, 'Team Energy株式会社を中心に、6つの事業領域（中間持株会社）の下で18社の事業会社を運営しています。', { x: M, y: 1.15, w: 12.3, h: 0.35, fontSize: 12, color: C.text2, objectName: '説明' });
    s.addShape(pres.ShapeType.rect, { x: M, y: 1.65, w: 4.3, h: 0.58, fill: { color: C.accent6 }, line: { color: HEX.accent6, width: 0 }, objectName: '親会社' });
    text(s, 'Team Energy株式会社', { x: M + 0.2, y: 1.65, w: 4.0, h: 0.58, fontSize: 13, bold: true, color: C.background1, valign: 'middle', objectName: '親会社名' });
    text(s, '事業領域（中間持株会社）', { x: 1.3, y: 2.35, w: 4, h: 0.3, fontSize: 10, color: C.accent4, objectName: '列見出し1' });
    text(s, '傘下の事業会社', { x: 5.7, y: 2.35, w: 4, h: 0.3, fontSize: 10, color: C.accent4, objectName: '列見出し2' });
    const areas = [
      ['te-gi.png', 320 / 35, '株式会社バイウィル'],
      ['te-geo.png', 365 / 35, '株式会社GeoDreams'],
      ['te-ai.png', 376 / 34, '株式会社キャナルAI、株式会社スケールエーアイ、MIRACRE AI株式会社'],
      ['te-gli.png', 337 / 35, 'Team Glocal株式会社'],
      ['te-growth.png', 429 / 35, '株式会社AILE、株式会社ANY、弟子屈チャレンジ株式会社'],
      ['te-am.png', 338 / 34, 'アセットマネジメント事業'],
    ];
    const spineX = M + 0.4, rowH = 0.7, y0 = 2.7, bh = 0.6;
    vline(s, spineX, 2.23, (y0 + (areas.length - 1) * rowH + bh / 2) - 2.23, HEX.accent4, 1);
    areas.forEach((a, i) => {
      const y = y0 + i * rowH;
      hline(s, spineX, y + bh / 2, 0.5, HEX.accent4, 1);
      s.addShape(pres.ShapeType.rect, { x: 1.4, y, w: 4.1, h: bh, fill: { color: C.background1 }, line: { color: HEX.accent5, width: 0.75 }, objectName: '領域 ' + a[0] });
      const lh = 0.28;
      s.addImage({ path: IMG(a[0]), x: 1.6, y: y + (bh - lh) / 2, w: lh * a[1], h: lh, objectName: 'ロゴ ' + a[0] });
      text(s, a[2], { x: 5.7, y, w: 7.1, h: bh, fontSize: 12.5, valign: 'middle', objectName: '傘下 ' + a[0] });
      if (i < areas.length - 1) hline(s, 5.7, y + rowH - 0.05, 7.1);
    });
    s.addNotes('HPのGroupセクション。');
  };

  // ================= 主な投資先・実績 =================
  const slidePortfolio = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('主な投資先・実績', { placeholder: 'title' });
    text(s, 'これまでに企業価値100億円を超える企業を4社創出し、うち2社は上場・売却によるEXITに至っています。', { x: M, y: 1.15, w: 12.3, h: 0.35, fontSize: 12, color: C.text2, objectName: '説明' });
    table(s, [
      [th('会社名'), th('設立'), th('事業内容'), th('状況')],
      [td('ふるさと熱電株式会社'), td('2012年'), td('地域と共生する地熱発電所の運営。日本初のSPCモデルでの地熱発電所を開設'), td('EXIT　2025年8月、ベースロードキャピタルへ売却', { color: HEX.accent1, bold: true })],
      [td('レジル株式会社（旧 中央電力）'), td('2004年'), td('マンション一括受電のパイオニア。電力コスト削減と快適な住環境を提供し、エネルギーDX事業も展開'), td('EXIT　2024年4月 東証グロース上場。その後、ベインキャピタルへ売却', { color: HEX.accent1, bold: true })],
      [td('株式会社バイウィル'), td('2023年'), td('第一地銀45行・基礎自治体60以上と連携した環境クレジット創出事業'), td('未上場　シリーズA・Bラウンドで累計約30億円を調達')],
      [td('株式会社GeoDreams'), td('2022年'), td('次世代型地熱発電「クローズドループ」の開発。掘削・探査・メンテナンスを一貫して担う'), td('未上場　JOGMEC 次世代地熱発電のFS調査に採択')],
    ], { x: M, y: 1.65, w: W - 2 * M, colW: [2.9, 1.0, 4.9, 3.53], rowH: 0.86, fontSize: 11.5 });
    text(s, '※ 各社の企業価値・売却金額は非公表です。', { x: M, y: 6.15, w: 12, h: 0.3, fontSize: 10, color: C.text2, objectName: '注記' });
    s.addNotes('HPのPortfolioセクション。');
  };

  // ================= 事例 =================
  const slideCase = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('事例紹介：弟子屈チャレンジ株式会社', { placeholder: 'title' });
    const pw = 4.0;
    const h1 = photo(s, 'teshikaga-mashu.jpg', M, 1.2, pw, '摩周湖の写真');
    text(s, '摩周湖（北海道弟子屈町）', { x: M, y: 1.2 + h1 + 0.04, w: pw, h: 0.22, fontSize: 9, color: C.accent4, objectName: '写真キャプション1' });
    const y2 = 1.2 + h1 + 0.32;
    const h2 = photo(s, 'teshikaga-room1.jpg', M, y2, pw, '客室の写真');
    text(s, 'Nature Base Hotel NUPPUKOTTE 客室', { x: M, y: y2 + h2 + 0.04, w: pw, h: 0.22, fontSize: 9, color: C.accent4, objectName: '写真キャプション2' });
    const X = M + pw + 0.45, Wd = W - X - M;
    text(s, '摩周湖に最も近いホテルを、地域の環境文化拠点へ。', { x: X, y: 1.2, w: Wd, h: 0.4, fontSize: 15, bold: true, objectName: 'リード' });
    text(s, 'Nature Base Hotel NUPPUKOTTE（旧 レラ摩周）。2022年に取得したホテルを、2025年7月に全室スイートの環境文化拠点としてリニューアルしました。', { x: X, y: 1.65, w: Wd, h: 0.6, fontSize: 11.5, color: C.text2, lineSpacingMultiple: 1.35, objectName: '概要' });
    sub(s, '経緯', X, 2.35, 3);
    table(s, [
      [td('2022年', { bold: true }), td('ホテルを取得。弟子屈チャレンジ株式会社を設立し、「レラ摩周」として再開')],
      [td('2023年', { bold: true }), td('通年営業へ。運営体制をゼロから作り直す')],
      [td('2025年5月', { bold: true }), td('全面改装に着手')],
      [td('2025年7月', { bold: true }), td('Nature Base Hotel NUPPUKOTTE として再出発')],
    ], { x: X, y: 2.75, w: Wd, colW: [1.3, Wd - 1.3], rowH: 0.4, fontSize: 11 });
    sub(s, '取り組み', X, 4.55, 3);
    text(s, [
      { text: '経営人材を送り込み、コンセプトを立て直す', options: { bullet: true, breakLine: true } },
      { text: '摩周鹿の料理など、食で差をつける', options: { bullet: true, breakLine: true } },
      { text: '法人合宿・団体ツアー・インバウンドなど法人・団体需要を開拓する', options: { bullet: true, breakLine: true } },
      { text: '地域と組み、ホテルの先に地域開発を見る', options: { bullet: true } },
    ], { x: X, y: 4.95, w: Wd, h: 1.3, fontSize: 11.5, paraSpaceAfter: 3, lineSpacingMultiple: 1.2, objectName: '取り組み' });
    text(s, '施設：全7室スイート（46〜99㎡）／最大23名／レストラン24席／ラウンジ', { x: X, y: 6.35, w: Wd, h: 0.3, fontSize: 10.5, color: C.text2, objectName: '施設' });
    s.addNotes('事例ページ（cases/teshikaga.html）の要約。');
  };

  // ================= M&A =================
  const slideMa = (sec) => {
    const s = newSlide('BASE', sec);
    s.addText('M&A・事業承継について', { placeholder: 'title' });
    text(s, 'Team Energy Groupに参加する企業を、お待ちしています。', { x: M, y: 1.2, w: 12.3, h: 0.45, fontSize: 16, bold: true, objectName: 'リード' });
    text(s, '事業承継や資本提携のご提案を、仲介会社・金融機関・オーナー経営者の皆さまからお受けしています。グループの資金と経営人材で、承継後の事業を次の成長へ導きます。', { x: M, y: 1.7, w: 7.2, h: 0.7, fontSize: 11.5, color: C.text2, lineSpacingMultiple: 1.4, objectName: '説明' });
    sub(s, 'グループへの参加について', M, 2.6, 7);
    const pts = [
      ['業種・エリアを問わず、ご提案をお受けします', 'エネルギー、シニア、地域サービスなど、これまでの投資領域に限らず検討します。'],
      ['承継後に誰が経営するかを、先に示します', 'グループで育てた経営人材と、上場・売却・再生を実務で経験した役員が経営に入ります。'],
      ['雇用と取引先との関係を大切にします', '従業員の雇用と取引先との関係は維持を基本とし、現場の理解を得ながら段階的に事業を伸ばします。'],
    ];
    pts.forEach((p, i) => {
      const y = 3.05 + i * 1.2;
      text(s, String(i + 1), { x: M, y, w: 0.5, h: 0.4, fontSize: 18, bold: true, color: C.accent1, objectName: '番号 ' + (i + 1) });
      text(s, p[0], { x: M + 0.55, y: y + 0.02, w: 6.6, h: 0.35, fontSize: 13, bold: true, objectName: '見出し ' + (i + 1) });
      text(s, p[1], { x: M + 0.55, y: y + 0.4, w: 6.6, h: 0.6, fontSize: 11, color: C.text2, lineSpacingMultiple: 1.35, objectName: '本文 ' + (i + 1) });
      if (i < 2) hline(s, M, y + 1.07, 7.2);
    });
    const X = 8.3, Wd = W - X - M;
    sub(s, '承継事例', X, 2.6, Wd);
    table(s, [
      [th('業種'), td('障害福祉・介護予防サービス')],
      [th('規模'), td('年商 約3.4億円／7拠点／従業員 約50名')],
      [th('形態'), td('売り手の「事業の選択と集中」により、当該事業のみを事業譲渡で承継')],
      [th('ポイント'), td('従業員の雇用と処遇の維持を最重視。許認可の新規取得と契約の承継を完了し、地域の福祉サービスを継続')],
    ], { x: X, y: 3.0, w: Wd, colW: [1.1, Wd - 1.1], rowH: 0.52, fontSize: 10.5 });
    s.addShape(pres.ShapeType.rect, { x: X, y: 5.55, w: Wd, h: 1.1, fill: { color: C.background2 }, line: { color: HEX.accent5, width: 0.5 }, objectName: '窓口枠' });
    text(s, 'お問い合わせ窓口', { x: X + 0.2, y: 5.65, w: Wd - 0.4, h: 0.3, fontSize: 10.5, bold: true, objectName: '窓口ラベル' });
    text(s, 'sourcing@teamenergy.co.jp（担当：友井 大勢）', { x: X + 0.2, y: 5.95, w: Wd - 0.4, h: 0.3, fontSize: 11, objectName: '窓口メール' });
    text(s, '仲介会社・金融機関・オーナー経営者の皆さまからお受けしています。', { x: X + 0.2, y: 6.25, w: Wd - 0.4, h: 0.3, fontSize: 9.5, color: C.text2, objectName: '窓口説明' });
    s.addNotes('M&Aページの要約。投資条件などの詳細は記載しない。');
  };

  // ================= 締め =================
  const slideEnd = (sec) => {
    const s = newSlide('PLAIN', sec);
    const lw = 2.6, lh = lw * RATIO['te-logo.png'];
    s.addImage({ path: IMG('te-logo.png'), x: (W - lw) / 2, y: 1.7, w: lw, h: lh, objectName: 'ロゴ' });
    text(s, 'Team Energy株式会社', { x: 0, y: 3.55, w: W, h: 0.5, fontSize: 18, bold: true, align: 'center', objectName: '社名' });
    text(s, [
      { text: '本社　〒530-0011 大阪府大阪市北区大深町6 グラングリーン大阪北館 JAM BASE 9階 916号室', options: { breakLine: true } },
      { text: '東京オフィス　〒160-0014 東京都新宿区内藤町1-82 プルニエ', options: { breakLine: true } },
      { text: 'M&A・事業承継に関するお問い合わせ　sourcing@teamenergy.co.jp' },
    ], { x: 0, y: 4.2, w: W, h: 1.2, fontSize: 11, color: C.text2, align: 'center', lineSpacingMultiple: 1.6, objectName: '連絡先' });
    s.addNotes('締め');
  };

  // ================= 順番（2026-10-14 指示） =================
  pres.addSection({ title: '会社紹介' });
  slideCover('会社紹介');
  slideToc('会社紹介');
  slideProfile('会社紹介');
  pres.addSection({ title: '経営体制' });
  slideCeo('経営体制');
  slideOfficers('経営体制');
  pres.addSection({ title: '事業と実績' });
  slideAbout('事業と実績');
  slideNumbers('事業と実績');
  slideGroup('事業と実績');
  slidePortfolio('事業と実績');
  slideCase('事業と実績');
  pres.addSection({ title: 'M&A' });
  slideMa('M&A');
  slideEnd('M&A');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT, 'slides', n);
})().catch((e) => { console.error(e); process.exit(1); });
