/* OGP画像(1200×630)を生成して assets/img/ に出力。
   サイトと同じ生成風景(sceneURI)を背景に、ブランドのロゴ・見出しを載せる。 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/user/desktop-tutorial';

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8'));
const D = global.window.YUBUNE.data;
const countPref = (pref) => D.HOTELS.filter((h) => h.pref === pref).length;

const LOGO = "<svg viewBox='0 0 40 40' width='46' height='46' style='vertical-align:middle'>" +
  "<circle cx='20' cy='20' r='19' fill='#f6efe3'/>" +
  "<path d='M9 24h22v2.2a6 6 0 0 1-6 5.8H15a6 6 0 0 1-6-5.8V24z' fill='#1d4965'/>" +
  "<path d='M14 20.5c-2-2.6 2-3.6 0-6.5M20 21c-2-2.6 2-3.6 0-6.5M26 20.5c-2-2.6 2-3.6 0-6.5' stroke='#1d4965' stroke-width='2.2' stroke-linecap='round'/></svg>";

const CARDS = [
  { file: 'ogp.png',          scene: 'mountain', pal: 'dusk',  title: 'お風呂で選ぶ、日本の宿。', sub: '風呂・トイレ別の客室だけを、全国から。', tag: '貸切露天・大浴場・源泉かけ流し／全' + D.HOTELS.length + '軒' },
  { file: 'ogp-tokyo.png',    scene: 'city',     pal: 'night', title: '東京のバストイレ別ホテル', sub: 'ユニットバスなし・大浴場つきも。', tag: '厳選' + countPref('東京都') + '軒／素泊まり参考9,000円〜' },
  { file: 'ogp-osaka.png',    scene: 'city',     pal: 'dusk',  title: '大阪のバストイレ別ホテル', sub: '温泉大浴場から洗い場付き客室まで。', tag: '厳選' + countPref('大阪府') + '軒／なんば・梅田・新大阪' },
  { file: 'ogp-kyoto.png',    scene: 'town',     pal: 'dawn',  title: '京都のバストイレ別ホテル', sub: '天然温泉の大浴場・町家の宿も。', tag: '厳選' + countPref('京都府') + '軒／京都駅・嵐山・四条' },
  { file: 'ogp-okinawa.png',  scene: 'sea',      pal: 'sea',   title: '沖縄のバストイレ別ホテル', sub: '天然温泉のリゾートと那覇シティ。', tag: '厳選' + countPref('沖縄県') + '軒／那覇・恩納・美ら海' },
  { file: 'ogp-hokkaido.png', scene: 'snowtown', pal: 'snow',  title: '北海道のバストイレ別ホテル', sub: '天然温泉・大浴場つきのホテル。', tag: '厳選' + countPref('北海道') + '軒／札幌・函館・帯広' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const c of CARDS) {
    const bg = D.sceneURI({ scene: c.scene, pal: c.pal, id: 'ogp-' + c.file }, 1200, 630);
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin:0; box-sizing:border-box; }
  body { width:1200px; height:630px; font-family:"Noto Sans JP",sans-serif; }
  .card { position:relative; width:1200px; height:630px; overflow:hidden;
    background-image:url('${bg}'); background-size:cover; background-position:center; }
  .ov { position:absolute; inset:0; background:linear-gradient(105deg, rgba(20,32,46,.78) 0%, rgba(20,32,46,.5) 55%, rgba(20,32,46,.28) 100%); }
  .in { position:absolute; inset:0; padding:64px 72px; display:flex; flex-direction:column; color:#fff; }
  .brand { display:flex; align-items:center; gap:14px; font-size:30px; font-weight:700; letter-spacing:.06em; }
  .brand small { font-size:16px; font-weight:400; color:#e7d8c4; margin-left:4px; }
  .kick { display:inline-block; margin-top:auto; margin-bottom:16px; font-size:20px; font-weight:700; letter-spacing:.1em;
    background:rgba(255,255,255,.16); border:1.5px solid rgba(255,255,255,.45); border-radius:99px; padding:7px 20px; align-self:flex-start; }
  h1 { font-family:"Noto Serif JP",serif; font-weight:700; font-size:72px; line-height:1.28; letter-spacing:.04em; text-shadow:0 2px 20px rgba(8,16,26,.5); }
  .sub { margin-top:18px; font-size:30px; font-weight:500; color:#fbeede; text-shadow:0 1px 10px rgba(8,16,26,.6); }
  .foot { margin-top:26px; font-size:22px; color:#dfe7ee; letter-spacing:.02em; }
  .foot b { color:#ffd9a8; font-weight:700; }
</style></head>
<body><div class="card"><div class="ov"></div><div class="in">
  <div class="brand">${LOGO}<span>湯船トラベル<small>お風呂で選ぶ、日本の宿。</small></span></div>
  <span class="kick">♨ ユニットバスの部屋はありません</span>
  <h1>${c.title}</h1>
  <div class="sub">${c.sub}</div>
  <div class="foot"><b>${c.tag}</b></div>
</div></div></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(ROOT, 'assets/img', c.file), type: 'png' });
    console.log('generated', c.file);
  }
  await browser.close();
})();
