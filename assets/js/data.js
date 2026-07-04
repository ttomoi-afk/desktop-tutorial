/* =========================================================
   湯船トラベル — データ層
   架空の宿データ + 風景SVGジェネレータ
   すべての客室は「風呂・トイレ別」。ユニットバスの部屋は
   データとしても存在させないのがこのサイトの掲載基準。
   ========================================================= */

(function () {
  'use strict';

  /* ---------- シード付き乱数(風景を毎回同じ絵にするため) ---------- */
  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- カラーパレット(時間帯・空気感) ---------- */
  const PAL = {
    dusk:    { sky: ['#f2c79c', '#e08a68'], sun: '#fff3d6', far: '#c07d63', mid: '#8e5548', near: '#5d3a38', water: '#e8a077', steam: '#fff6ea' },
    night:   { sky: ['#1c2c49', '#3c5178'], sun: '#f2e8d0', far: '#31446b', mid: '#24344f', near: '#16233a', water: '#3d5478', steam: '#e8ecf4' },
    dawn:    { sky: ['#f7ddb0', '#efa96e'], sun: '#fff8e4', far: '#d99a6d', mid: '#a86a55', near: '#6d4644', water: '#f0b57e', steam: '#fffaf0' },
    mist:    { sky: ['#dfe7e2', '#c3d2c9'], sun: '#f7f7ef', far: '#a8bfae', mid: '#7fa08c', near: '#54755f', water: '#bccfc2', steam: '#ffffff' },
    snow:    { sky: ['#25355c', '#4a5f8e'], sun: '#f5eedb', far: '#8d9cbd', mid: '#67789e', near: '#3e4c6e', water: '#7688ab', steam: '#f2f4f9' },
    forest:  { sky: ['#dce8d5', '#b9d0ac'], sun: '#fbfbe8', far: '#93b184', mid: '#6a8f60', near: '#42623f', water: '#a9c49b', steam: '#ffffff' },
    sea:     { sky: ['#fbe3b5', '#f2a662'], sun: '#fff6df', far: '#d68d5e', mid: '#a05f4b', near: '#64413e', water: '#eba25f', steam: '#fff7e8' },
    indigo:  { sky: ['#2a3d63', '#5a6f9a'], sun: '#efe6cc', far: '#46587f', mid: '#334361', near: '#212f4a', water: '#516a95', steam: '#e9edf5' },
  };

  /* ---------- 風景SVGジェネレータ ---------- */
  function ridgePath(rng, w, baseY, amp, points) {
    const step = w / points;
    let d = 'M0 ' + (baseY + (rng() - 0.5) * amp).toFixed(1);
    let px = 0, py = baseY;
    for (let i = 1; i <= points; i++) {
      const x = i * step;
      const y = baseY + (rng() - 0.5) * 2 * amp;
      const cx = px + step / 2;
      d += ' Q' + cx.toFixed(1) + ' ' + (py + (rng() - 0.5) * amp).toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
      px = x; py = y;
    }
    return d;
  }
  function closeDown(d, w, h) { return d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z'; }

  function steamPaths(rng, w, h, color) {
    let s = '';
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = w * (0.18 + 0.3 * i + rng() * 0.08);
      const y0 = h * (0.92 - rng() * 0.06);
      const k = 14 + rng() * 10;
      const d = 'M' + x.toFixed(0) + ' ' + y0.toFixed(0) +
        ' c ' + (-k) + ' ' + (-h * 0.09) + ', ' + k + ' ' + (-h * 0.13) + ', 0 ' + (-h * 0.22) +
        ' c ' + (-k) + ' ' + (-h * 0.09) + ', ' + k + ' ' + (-h * 0.13) + ', 0 ' + (-h * 0.22);
      s += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-opacity="' + (0.28 + rng() * 0.12).toFixed(2) +
        '" stroke-width="' + (5 + rng() * 4).toFixed(1) + '" stroke-linecap="round"/>';
    }
    return s;
  }

  function trees(rng, w, yBase, color, count, hMin, hMax) {
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = rng() * w;
      const th = hMin + rng() * (hMax - hMin);
      const tw = th * (0.55 + rng() * 0.2);
      s += '<path d="M' + x.toFixed(0) + ' ' + (yBase - th).toFixed(0) +
        ' L' + (x + tw / 2).toFixed(0) + ' ' + yBase.toFixed(0) +
        ' L' + (x - tw / 2).toFixed(0) + ' ' + yBase.toFixed(0) + ' Z" fill="' + color + '"/>';
    }
    return s;
  }

  function roofline(rng, w, yBase, color, warm) {
    // 温泉街の屋根のシルエット + 灯りの点
    let s = '<path d="M0 ' + yBase;
    let x = 0;
    let lights = '';
    while (x < w) {
      const bw = 40 + rng() * 70;
      const bh = 26 + rng() * 44;
      const y = yBase - bh;
      s += ' L' + x.toFixed(0) + ' ' + y.toFixed(0);
      // 切妻屋根
      s += ' L' + (x + bw * 0.5).toFixed(0) + ' ' + (y - 12 - rng() * 10).toFixed(0);
      s += ' L' + (x + bw).toFixed(0) + ' ' + y.toFixed(0);
      if (rng() > 0.35) {
        lights += '<circle cx="' + (x + bw * (0.3 + rng() * 0.4)).toFixed(0) + '" cy="' + (yBase - bh * 0.45).toFixed(0) +
          '" r="' + (2 + rng() * 1.5).toFixed(1) + '" fill="' + warm + '" fill-opacity="0.9"/>';
      }
      x += bw;
    }
    s += ' L' + w + ' ' + yBase + ' Z" fill="' + color + '"/>';
    return s + lights;
  }

  function snowDots(rng, w, h, color) {
    let s = '';
    for (let i = 0; i < 60; i++) {
      s += '<circle cx="' + (rng() * w).toFixed(0) + '" cy="' + (rng() * h).toFixed(0) +
        '" r="' + (0.8 + rng() * 1.6).toFixed(1) + '" fill="' + color + '" fill-opacity="' + (0.35 + rng() * 0.5).toFixed(2) + '"/>';
    }
    return s;
  }

  /**
   * 宿ごとの風景SVGを生成する
   * scene: mountain | sea | river | town | forest | snowtown | lake
   */
  function sceneSVG(prop, w, h) {
    const pal = PAL[prop.pal] || PAL.dusk;
    const rng = mulberry32(hashStr(prop.id));
    const gid = 'g' + hashStr(prop.id).toString(36);
    let body = '';
    const sunX = w * (0.22 + rng() * 0.56);
    const sunY = h * (0.22 + rng() * 0.12);
    const sunR = Math.min(w, h) * (0.10 + rng() * 0.05);
    const sun = '<circle cx="' + sunX.toFixed(0) + '" cy="' + sunY.toFixed(0) + '" r="' + sunR.toFixed(0) + '" fill="' + pal.sun + '" fill-opacity="0.92"/>';

    switch (prop.scene) {
      case 'sea': {
        const horizon = h * 0.62;
        body += sun;
        body += '<rect x="0" y="' + horizon + '" width="' + w + '" height="' + (h - horizon) + '" fill="' + pal.water + '"/>';
        // 太陽の映り込み
        for (let i = 0; i < 7; i++) {
          const ly = horizon + 8 + i * ((h - horizon) / 8);
          const lw = sunR * (1.6 - i * 0.16) * (0.7 + rng() * 0.5);
          body += '<rect x="' + (sunX - lw / 2).toFixed(0) + '" y="' + ly.toFixed(0) + '" width="' + lw.toFixed(0) + '" height="3" rx="1.5" fill="' + pal.sun + '" fill-opacity="' + (0.5 - i * 0.055).toFixed(2) + '"/>';
        }
        body += closeDownWrap(ridgePath(rng, w, horizon - h * 0.06, h * 0.05, 6), w, h, pal.far, 0.5, horizon);
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.82, h * 0.05, 5), w, h) + '" fill="' + pal.near + '"/>';
        break;
      }
      case 'river': {
        body += sun;
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.46, h * 0.10, 5), w, h) + '" fill="' + pal.far + '"/>';
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.60, h * 0.11, 6), w, h) + '" fill="' + pal.mid + '"/>';
        // 谷を流れる川
        body += '<path d="M' + (w * 0.42) + ' ' + (h * 0.66) + ' C ' + (w * 0.3) + ' ' + (h * 0.78) + ', ' + (w * 0.62) + ' ' + (h * 0.84) + ', ' + (w * 0.5) + ' ' + h +
          ' L' + (w * 0.72) + ' ' + h + ' C ' + (w * 0.78) + ' ' + (h * 0.84) + ', ' + (w * 0.52) + ' ' + (h * 0.76) + ', ' + (w * 0.58) + ' ' + (h * 0.66) + ' Z" fill="' + pal.water + '" fill-opacity="0.9"/>';
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.8, h * 0.08, 5), w, h) + '" fill="' + pal.near + '"/>';
        body += trees(rng, w, h * 0.86, pal.near, 10, h * 0.06, h * 0.12);
        break;
      }
      case 'town': {
        body += sun;
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.5, h * 0.09, 5), w, h) + '" fill="' + pal.far + '"/>';
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.62, h * 0.07, 6), w, h) + '" fill="' + pal.mid + '"/>';
        body += roofline(rng, w, h * 0.94, pal.near, pal.sun);
        break;
      }
      case 'snowtown': {
        body += sun;
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.5, h * 0.1, 5), w, h) + '" fill="' + pal.far + '"/>';
        body += roofline(rng, w, h * 0.93, pal.near, '#f7c873');
        body += snowDots(rng, w, h, pal.steam);
        break;
      }
      case 'forest': {
        body += sun;
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.52, h * 0.08, 5), w, h) + '" fill="' + pal.far + '"/>';
        body += trees(rng, w, h * 0.72, pal.mid, 16, h * 0.12, h * 0.2);
        body += '<rect x="0" y="' + h * 0.72 + '" width="' + w + '" height="' + h * 0.28 + '" fill="' + pal.water + '" fill-opacity="0.85"/>';
        body += trees(rng, w, h * 0.99, pal.near, 12, h * 0.14, h * 0.24);
        break;
      }
      case 'lake': {
        const horizon = h * 0.66;
        body += sun;
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.44, h * 0.12, 5), w, horizon) + '" fill="' + pal.far + '"/>';
        body += '<rect x="0" y="' + horizon + '" width="' + w + '" height="' + (h - horizon) + '" fill="' + pal.water + '"/>';
        // 湖面のさざなみ
        for (let i = 0; i < 8; i++) {
          body += '<rect x="' + (rng() * w * 0.8).toFixed(0) + '" y="' + (horizon + 10 + rng() * (h - horizon - 16)).toFixed(0) +
            '" width="' + (30 + rng() * 60).toFixed(0) + '" height="2.5" rx="1.2" fill="' + pal.steam + '" fill-opacity="0.3"/>';
        }
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.88, h * 0.05, 5), w, h) + '" fill="' + pal.near + '"/>';
        break;
      }
      default: { // mountain
        body += sun;
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.42, h * 0.12, 5), w, h) + '" fill="' + pal.far + '"/>';
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.58, h * 0.12, 6), w, h) + '" fill="' + pal.mid + '"/>';
        body += '<path d="' + closeDown(ridgePath(rng, w, h * 0.76, h * 0.1, 5), w, h) + '" fill="' + pal.near + '"/>';
        body += trees(rng, w, h * 0.9, pal.near, 8, h * 0.07, h * 0.14);
        break;
      }
    }
    body += steamPaths(rng, w, h, pal.steam);

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + pal.sky[0] + '"/><stop offset="1" stop-color="' + pal.sky[1] + '"/></linearGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#' + gid + ')"/>' + body + '</svg>';
  }

  // 海用: 稜線を水平線の位置で閉じるヘルパー
  function closeDownWrap(d, w, h, fill, opacity, bottom) {
    return '<path d="' + d + ' L' + w + ' ' + bottom + ' L0 ' + bottom + ' Z" fill="' + fill + '" fill-opacity="' + opacity + '"/>';
  }

  function sceneURI(prop, w, h) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sceneSVG(prop, w, h));
  }

  /* ---------- 客室のお風呂タイル(部屋カード用の抽象画像) ---------- */
  function bathTileSVG(prop, room, w, h) {
    const pal = PAL[prop.pal] || PAL.dusk;
    const rng = mulberry32(hashStr(prop.id + room.id));
    const gid = 't' + hashStr(prop.id + room.id).toString(36);
    const cx = w / 2, tubY = h * 0.62, tubW = w * 0.52, tubH = h * 0.2;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">';
    s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + pal.sky[0] + '"/><stop offset="1" stop-color="' + pal.sky[1] + '"/></linearGradient></defs>';
    s += '<rect width="' + w + '" height="' + h + '" fill="url(#' + gid + ')"/>';
    s += '<circle cx="' + w * 0.78 + '" cy="' + h * 0.24 + '" r="' + h * 0.13 + '" fill="' + pal.sun + '" fill-opacity="0.9"/>';
    s += '<path d="' + closeDown(ridgePath(rng, w, h * 0.5, h * 0.08, 4), w, h) + '" fill="' + pal.mid + '" fill-opacity="0.55"/>';
    // 浴槽(木の湯船)
    s += '<rect x="' + (cx - tubW / 2) + '" y="' + tubY + '" width="' + tubW + '" height="' + tubH + '" rx="' + tubH * 0.35 + '" fill="' + pal.near + '"/>';
    s += '<rect x="' + (cx - tubW / 2 + 5) + '" y="' + (tubY + 4) + '" width="' + (tubW - 10) + '" height="' + (tubH * 0.42) + '" rx="' + tubH * 0.2 + '" fill="' + pal.water + '"/>';
    // 湯気
    const k = 10;
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * tubW * 0.26;
      s += '<path d="M' + x + ' ' + (tubY - 6) + ' c ' + (-k) + ' -14, ' + k + ' -20, 0 -34 c ' + (-k) + ' -14, ' + k + ' -20, 0 -34" fill="none" stroke="' + pal.steam + '" stroke-opacity="0.55" stroke-width="5" stroke-linecap="round"/>';
    }
    s += '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  /* =========================================================
     タグ定義(検索フィルターと表示バッジの正)
     ========================================================= */
  const TAGS = {
    // お風呂タイプ
    kashikiri_roten: { label: '貸切露天風呂', group: 'bath' },
    kashikiri_uchi:  { label: '貸切内風呂', group: 'bath' },
    room_roten:      { label: '客室露天風呂', group: 'bath' },
    room_hanroten:   { label: '客室半露天', group: 'bath' },
    daiyokujo:       { label: '大浴場', group: 'bath' },
    roten:           { label: '露天風呂', group: 'bath' },
    sauna:           { label: 'サウナ', group: 'bath' },
    // こだわり
    gensen:          { label: '源泉かけ流し', group: 'komori' },
    nigori:          { label: 'にごり湯', group: 'komori' },
    view_bath:       { label: '眺望風呂', group: 'komori' },
    hinoki:          { label: '檜風呂', group: 'komori' },
    iwaburo:         { label: '岩風呂', group: 'komori' },
    yumeguri:        { label: '湯めぐり', group: 'komori' },
    free_kashikiri:  { label: '貸切風呂 無料', group: 'komori' },
  };

  const SPRING_TYPES = ['単純温泉', '塩化物泉', '炭酸水素塩泉', '硫酸塩泉', '硫黄泉', '酸性泉', '含鉄泉', '放射能泉'];

  const REGIONS = ['北海道・東北', '関東', '中部・北陸', '関西', '中国・四国', '九州'];

  /* =========================================================
     宿データ(すべて架空)
     room.bath.separate は全室 true — ユニットバスは掲載しない
     price は「1泊2食・2名1室利用時の1名料金(円)」
     ========================================================= */
  const HOTELS = [
    {
      id: 'gora-yamaboushi',
      name: '霧生の宿 やまぼうし',
      kana: 'きりゅうのやど やまぼうし',
      area: '箱根・強羅', pref: '神奈川県', region: '関東',
      onsen: '強羅温泉', spring: '硫黄泉',
      springDetail: '酸性・含硫黄-カルシウム-硫酸塩・塩化物泉(大涌谷造成泉)',
      efficacy: ['神経痛', '冷え性', '皮膚病', '疲労回復'],
      gensenNote: '大涌谷からの引湯・かけ流し(加水あり)',
      scene: 'mountain', pal: 'mist',
      rating: 4.7, reviews: 412,
      tags: ['room_roten', 'kashikiri_roten', 'daiyokujo', 'roten', 'gensen', 'nigori', 'hinoki', 'view_bath'],
      catch: '乳白色のにごり湯を、客室の露天で独り占め。',
      description: '外輪山を望む高台に建つ全12室の小宿。大涌谷から引く白濁の湯を、大浴場・貸切露天・客室露天のすべてで愉しめます。客室はすべて浴室・トイレ完全セパレート。',
      kashikiri: [
        { name: '貸切露天「霧の湯」', type: '露天(岩)', capacity: '〜4名', fee: '45分 3,300円', how: '当日フロントにて先着予約' },
        { name: '貸切露天「木漏れ日」', type: '露天(檜)', capacity: '〜2名', fee: '45分 3,300円', how: '当日フロントにて先着予約' },
      ],
      access: '箱根登山ケーブルカー「中強羅」駅より徒歩6分/送迎あり(要予約)',
      rooms: [
        {
          id: 'r1', name: '露天風呂付き和洋室「霞」', capacity: '2〜3名', size: '48㎡', price: 36800,
          bath: { type: '客室露天風呂(檜)', tub: '檜', wash: true, view: '外輪山', onsenBath: true, note: '客室露天もにごり湯(温泉)' },
          features: ['ツイン+6畳和室', '床暖房', '禁煙'],
        },
        {
          id: 'r2', name: '半露天風呂付き和室「谷戸」', capacity: '2〜4名', size: '42㎡', price: 29800,
          bath: { type: '客室半露天(信楽焼)', tub: '信楽焼陶器', wash: true, view: '中庭', onsenBath: true, note: '' },
          features: ['10畳和室', '広縁', '禁煙'],
        },
        {
          id: 'r3', name: 'スタンダード和室(檜内風呂)', capacity: '2名', size: '34㎡', price: 22800,
          bath: { type: '内風呂(檜)・洗い場付き', tub: '檜', wash: true, view: null, onsenBath: false, note: '大浴場・貸切露天は温泉' },
          features: ['8畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'kusatsu-shirakiri',
      name: '湯畑テラス 白霧',
      kana: 'ゆばたけてらす しらぎり',
      area: '草津', pref: '群馬県', region: '関東',
      onsen: '草津温泉', spring: '酸性泉',
      springDetail: '酸性・含硫黄-アルミニウム-硫酸塩・塩化物泉(pH2.0)',
      efficacy: ['皮膚病', '神経痛', '糖尿病', '疲労回復'],
      gensenNote: '湯畑源泉・完全かけ流し(加水なし・湯もみによる温度調整)',
      scene: 'town', pal: 'night',
      rating: 4.8, reviews: 655,
      tags: ['daiyokujo', 'roten', 'kashikiri_uchi', 'gensen', 'yumeguri', 'view_bath'],
      catch: '湯畑の灯りを眺めながら、pH2.0の名湯をかけ流しで。',
      description: '湯畑まで徒歩2分。最上階の展望大浴場から湯けむりの温泉街を一望できます。全室セパレート浴室、うち5室は湯畑側。外湯めぐりの拠点にも。',
      kashikiri: [
        { name: '貸切内湯「白旗」', type: '内湯(檜)', capacity: '〜3名', fee: '40分 2,750円', how: '公式予約時に事前予約可' },
      ],
      access: 'JR長野原草津口駅よりバス25分「草津温泉」下車 徒歩7分',
      rooms: [
        {
          id: 'r1', name: '湯畑ビュー和洋室(展望檜風呂)', capacity: '2〜3名', size: '45㎡', price: 33800,
          bath: { type: 'ビューバス(檜)・洗い場付き', tub: '檜', wash: true, view: '湯畑', onsenBath: true, note: '客室風呂も源泉かけ流し' },
          features: ['湯畑側', 'ツイン+4.5畳', '禁煙'],
        },
        {
          id: 'r2', name: 'モダン和室(内風呂・洗い場付き)', capacity: '2〜4名', size: '38㎡', price: 24800,
          bath: { type: '内風呂(十和田石)・洗い場付き', tub: '十和田石', wash: true, view: null, onsenBath: false, note: '大浴場は源泉かけ流し' },
          features: ['10畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'yufuin-hotoriya',
      name: '金鱗湖畔 ほとりや',
      kana: 'きんりんこはん ほとりや',
      area: '由布院', pref: '大分県', region: '九州',
      onsen: '由布院温泉', spring: '単純温泉',
      springDetail: 'アルカリ性単純温泉(pH8.8・低張性高温泉)',
      efficacy: ['疲労回復', '美肌', '筋肉痛', '不眠症'],
      gensenNote: '自家源泉2本・全浴槽かけ流し',
      scene: 'lake', pal: 'dawn',
      rating: 4.9, reviews: 389,
      tags: ['room_roten', 'room_hanroten', 'kashikiri_roten', 'gensen', 'view_bath', 'free_kashikiri', 'iwaburo'],
      catch: '朝霧の金鱗湖。全室に由布岳を望む露天か半露天を。',
      description: '金鱗湖のほとり、離れ形式の全8室。すべての客室に露天または半露天風呂を備え、貸切露天2つは宿泊者無料。朝霧の湖畔散歩とセットでどうぞ。',
      kashikiri: [
        { name: '貸切露天「朝霧」', type: '露天(岩)', capacity: '〜4名', fee: '無料(50分)', how: 'チェックイン時に予約' },
        { name: '貸切露天「湖月」', type: '露天(檜)', capacity: '〜2名', fee: '無料(50分)', how: 'チェックイン時に予約' },
      ],
      access: 'JR由布院駅より徒歩18分/タクシー5分(駅送迎あり)',
      rooms: [
        {
          id: 'r1', name: '離れ「由布」露天風呂付き', capacity: '2〜4名', size: '58㎡+庭', price: 45800,
          bath: { type: '客室露天風呂(岩)', tub: '岩', wash: true, view: '由布岳', onsenBath: true, note: '源泉かけ流し' },
          features: ['離れ', '専用庭', '掘りごたつ', '禁煙'],
        },
        {
          id: 'r2', name: '離れ「鱗」半露天風呂付き', capacity: '2名', size: '46㎡', price: 38800,
          bath: { type: '客室半露天(信楽焼)', tub: '信楽焼陶器', wash: true, view: '雑木林', onsenBath: true, note: '源泉かけ流し' },
          features: ['離れ', 'デイベッド', '禁煙'],
        },
      ],
    },
    {
      id: 'kinosaki-ryutoan',
      name: '柳灯庵',
      kana: 'りゅうとうあん',
      area: '城崎', pref: '兵庫県', region: '関西',
      onsen: '城崎温泉', spring: '塩化物泉',
      springDetail: 'ナトリウム・カルシウム-塩化物・高温泉',
      efficacy: ['神経痛', '筋肉痛', '冷え性', '切り傷'],
      gensenNote: '共同配湯・加水あり/外湯7湯めぐり券付き',
      scene: 'town', pal: 'dusk',
      rating: 4.6, reviews: 298,
      tags: ['kashikiri_uchi', 'daiyokujo', 'yumeguri', 'hinoki'],
      catch: '浴衣と下駄で、柳並木と七つの外湯へ。',
      description: '大谿川沿いの柳並木に面した木造三階の湯宿。名物の外湯めぐりに加え、館内には檜の貸切内湯を二つ用意。全室、洗い場付きの内風呂とトイレを完全に分けた造りです。',
      kashikiri: [
        { name: '貸切内湯「柳の一」', type: '内湯(檜)', capacity: '〜3名', fee: '40分 2,200円', how: '当日フロントにて先着予約' },
        { name: '貸切内湯「柳の二」', type: '内湯(高野槇)', capacity: '〜3名', fee: '40分 2,200円', how: '当日フロントにて先着予約' },
      ],
      access: 'JR城崎温泉駅より徒歩7分',
      rooms: [
        {
          id: 'r1', name: '川側和室(檜内風呂・洗い場付き)', capacity: '2〜4名', size: '40㎡', price: 26800,
          bath: { type: '内風呂(檜)・洗い場付き', tub: '檜', wash: true, view: '大谿川', onsenBath: false, note: '外湯めぐり券付き' },
          features: ['10畳和室', '川側', '禁煙'],
        },
        {
          id: 'r2', name: '街側和室(内風呂・洗い場付き)', capacity: '2〜3名', size: '34㎡', price: 21800,
          bath: { type: '内風呂(人工大理石)・洗い場付き', tub: '人工大理石', wash: true, view: null, onsenBath: false, note: '外湯めぐり券付き' },
          features: ['8畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'noboribetsu-suminoyu',
      name: '硫黄香の宿 澄乃湯',
      kana: 'いおうかのやど すみのゆ',
      area: '登別', pref: '北海道', region: '北海道・東北',
      onsen: '登別温泉', spring: '硫黄泉',
      springDetail: '含硫黄-ナトリウム-硫酸塩泉ほか2種の引湯',
      efficacy: ['皮膚病', '神経痛', '慢性気管支炎', '冷え性'],
      gensenNote: '地獄谷源泉・かけ流し(湯量調整のため加水あり)',
      scene: 'mountain', pal: 'indigo',
      rating: 4.5, reviews: 521,
      tags: ['daiyokujo', 'roten', 'sauna', 'kashikiri_uchi', 'gensen', 'nigori', 'yumeguri'],
      catch: '地獄谷の湯けむりを望む、三種の源泉めぐり。',
      description: '硫黄泉・芒硝泉・鉄泉の三種を引く湯めぐりの宿。名物は地獄谷を見下ろす露天岩風呂。客室はすべて洗い場付き浴室+独立トイレで、湯上がりの休憩も快適です。',
      kashikiri: [
        { name: '貸切内湯「白澄」', type: '内湯(岩)', capacity: '〜4名', fee: '45分 2,750円', how: '当日フロントにて先着予約' },
      ],
      access: 'JR登別駅よりバス15分「登別温泉」下車 徒歩5分',
      rooms: [
        {
          id: 'r1', name: '地獄谷側 和洋室(ビューバス)', capacity: '2〜3名', size: '44㎡', price: 27800,
          bath: { type: 'ビューバス(十和田石)・洗い場付き', tub: '十和田石', wash: true, view: '地獄谷方面', onsenBath: true, note: '客室風呂も硫黄泉' },
          features: ['ツイン+4.5畳', '禁煙'],
        },
        {
          id: 'r2', name: 'スタンダード和室(内風呂・洗い場付き)', capacity: '2〜5名', size: '36㎡', price: 19800,
          bath: { type: '内風呂(ハイバック浴槽)・洗い場付き', tub: 'ハイバック浴槽', wash: true, view: null, onsenBath: false, note: '大浴場で三種の湯めぐり' },
          features: ['10畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'ginzan-gasutou',
      name: '大正浪漫の宿 ガス燈',
      kana: 'たいしょうろまんのやど がすとう',
      area: '銀山温泉', pref: '山形県', region: '北海道・東北',
      onsen: '銀山温泉', spring: '硫黄泉',
      springDetail: '含硫黄-ナトリウム-塩化物泉(微白濁)',
      efficacy: ['切り傷', '皮膚病', '婦人病', '疲労回復'],
      gensenNote: '共同源泉・かけ流し',
      scene: 'snowtown', pal: 'snow',
      rating: 4.8, reviews: 344,
      tags: ['kashikiri_roten', 'daiyokujo', 'gensen', 'nigori', 'view_bath', 'hinoki'],
      catch: '雪あかりの温泉街。ガス燈の下、貸切露天で粉雪を。',
      description: '銀山川沿いの木造四階、大正建築の面影を残す全9室。屋上の貸切露天からは雪化粧の温泉街を見下ろせます。客室の檜内風呂はすべて洗い場付き・トイレ別。',
      kashikiri: [
        { name: '屋上貸切露天「雪見の湯」', type: '露天(檜)', capacity: '〜2名', fee: '45分 3,300円', how: '公式予約時に事前予約可' },
      ],
      access: 'JR大石田駅よりバス40分「銀山温泉」下車 徒歩3分',
      rooms: [
        {
          id: 'r1', name: '川側 大正和室(檜内風呂)', capacity: '2〜3名', size: '36㎡', price: 31800,
          bath: { type: '内風呂(檜)・洗い場付き', tub: '檜', wash: true, view: '銀山川・温泉街', onsenBath: true, note: '客室風呂も温泉' },
          features: ['8畳+踏込', '雪見障子', '禁煙'],
        },
        {
          id: 'r2', name: '山側 和室(内風呂・洗い場付き)', capacity: '2名', size: '30㎡', price: 25800,
          bath: { type: '内風呂(十和田石)・洗い場付き', tub: '十和田石', wash: true, view: null, onsenBath: true, note: '' },
          features: ['6畳+広縁', '禁煙'],
        },
      ],
    },
    {
      id: 'dogo-yuzukian',
      name: '湯築庵',
      kana: 'ゆづきあん',
      area: '道後', pref: '愛媛県', region: '中国・四国',
      onsen: '道後温泉', spring: '単純温泉',
      springDetail: 'アルカリ性単純温泉(pH9.1)',
      efficacy: ['美肌', '神経痛', '疲労回復', 'リウマチ'],
      gensenNote: '道後温泉引湯・放流循環併用',
      scene: 'town', pal: 'dawn',
      rating: 4.5, reviews: 467,
      tags: ['daiyokujo', 'roten', 'kashikiri_uchi', 'sauna', 'yumeguri', 'view_bath'],
      catch: '本館の湯上がりに、屋上露天でもうひと風呂。',
      description: '道後温泉本館まで徒歩3分。砥部焼の湯船を備えた貸切内湯と、松山城方面を望む屋上露天が自慢です。全室セパレート浴室・独立洗面。',
      kashikiri: [
        { name: '貸切内湯「砥部」', type: '内湯(砥部焼陶器)', capacity: '〜3名', fee: '40分 2,530円', how: '当日フロントにて先着予約' },
      ],
      access: '伊予鉄道後温泉駅より徒歩5分',
      rooms: [
        {
          id: 'r1', name: '和洋室(砥部焼ビューバス)', capacity: '2〜3名', size: '42㎡', price: 25800,
          bath: { type: 'ビューバス(砥部焼陶器)・洗い場付き', tub: '砥部焼陶器', wash: true, view: '松山市街', onsenBath: false, note: '大浴場は道後の湯' },
          features: ['ツイン+3畳', '禁煙'],
        },
        {
          id: 'r2', name: '和室(内風呂・洗い場付き)', capacity: '2〜4名', size: '34㎡', price: 18800,
          bath: { type: '内風呂(人工大理石)・洗い場付き', tub: '人工大理石', wash: true, view: null, onsenBath: false, note: '' },
          features: ['10畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'kurokawa-hotarubi',
      name: 'ほたる火山荘',
      kana: 'ほたるびさんそう',
      area: '黒川', pref: '熊本県', region: '九州',
      onsen: '黒川温泉', spring: '硫酸塩泉',
      springDetail: 'ナトリウム・カルシウム-硫酸塩・塩化物泉',
      efficacy: ['切り傷', '動脈硬化', '冷え性', '神経痛'],
      gensenNote: '自家源泉・全浴槽かけ流し',
      scene: 'river', pal: 'forest',
      rating: 4.9, reviews: 276,
      tags: ['kashikiri_roten', 'roten', 'daiyokujo', 'gensen', 'iwaburo', 'free_kashikiri', 'yumeguri'],
      catch: '渓流沿いの貸切露天三つ、すべて無料・かけ流し。',
      description: '田の原川の上流、雑木林に囲まれた全10室。渓流沿いに点在する三つの貸切露天は空いていればいつでも無料。初夏は蛍、秋は紅葉が湯面に映ります。',
      kashikiri: [
        { name: '貸切露天「せせらぎ」', type: '露天(岩)', capacity: '〜4名', fee: '無料', how: '空室札方式(空いていれば随時)' },
        { name: '貸切露天「ほたる」', type: '露天(岩)', capacity: '〜3名', fee: '無料', how: '空室札方式(空いていれば随時)' },
        { name: '貸切露天「こもれび」', type: '露天(檜)', capacity: '〜2名', fee: '無料', how: '空室札方式(空いていれば随時)' },
      ],
      access: '南小国町・黒川温泉バス停より車5分(送迎あり・要予約)',
      rooms: [
        {
          id: 'r1', name: '渓流側 露天風呂付き和室', capacity: '2〜3名', size: '44㎡', price: 34800,
          bath: { type: '客室露天風呂(岩)', tub: '岩', wash: true, view: '渓流', onsenBath: true, note: '源泉かけ流し' },
          features: ['8畳+広縁', '囲炉裏ラウンジ利用可', '禁煙'],
        },
        {
          id: 'r2', name: '林側 和室(内風呂・洗い場付き)', capacity: '2〜4名', size: '36㎡', price: 24800,
          bath: { type: '内風呂(十和田石)・洗い場付き', tub: '十和田石', wash: true, view: '雑木林', onsenBath: true, note: '源泉かけ流し' },
          features: ['10畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'wakura-shiosai',
      name: '七尾湾 汐さゐ',
      kana: 'ななおわん しおさい',
      area: '和倉', pref: '石川県', region: '中部・北陸',
      onsen: '和倉温泉', spring: '塩化物泉',
      springDetail: 'ナトリウム・カルシウム-塩化物泉(高張性・弱アルカリ性)',
      efficacy: ['冷え性', '筋肉痛', '皮膚病', '婦人病'],
      gensenNote: '海辺の高温泉・かけ流し(加水あり)',
      scene: 'sea', pal: 'sea',
      rating: 4.7, reviews: 503,
      tags: ['room_roten', 'daiyokujo', 'roten', 'sauna', 'view_bath', 'gensen'],
      catch: '能登の海に浮かぶような、水平線の客室露天。',
      description: '七尾湾に面した全室オーシャンビューの宿。上層階の客室露天からは海と一体になるような眺め。大浴場には海側サウナと外気浴テラスも。',
      kashikiri: [
        { name: '貸切展望風呂「汐見」', type: '内湯(大観窓)', capacity: '〜4名', fee: '45分 3,300円', how: '公式予約時に事前予約可' },
      ],
      access: 'JR和倉温泉駅より車5分(送迎あり)',
      rooms: [
        {
          id: 'r1', name: '最上階 海側露天風呂付き和洋室', capacity: '2〜3名', size: '52㎡', price: 42800,
          bath: { type: '客室露天風呂(信楽焼)', tub: '信楽焼陶器', wash: true, view: '七尾湾', onsenBath: true, note: '塩の湯・かけ流し' },
          features: ['最上階', 'ツイン+6畳', '禁煙'],
        },
        {
          id: 'r2', name: '海側和室(ビューバス・洗い場付き)', capacity: '2〜5名', size: '40㎡', price: 27800,
          bath: { type: 'ビューバス(人工大理石)・洗い場付き', tub: '人工大理石', wash: true, view: '七尾湾', onsenBath: false, note: '大浴場は温泉' },
          features: ['12.5畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'gero-tsubakino',
      name: '川霧の宿 つばき野',
      kana: 'かわぎりのやど つばきの',
      area: '下呂', pref: '岐阜県', region: '中部・北陸',
      onsen: '下呂温泉', spring: '単純温泉',
      springDetail: 'アルカリ性単純温泉(pH9.2・美人の湯)',
      efficacy: ['美肌', '疲労回復', '神経痛', 'リウマチ'],
      gensenNote: '集中管理配湯・放流循環併用',
      scene: 'river', pal: 'mist',
      rating: 4.4, reviews: 388,
      tags: ['daiyokujo', 'roten', 'kashikiri_uchi', 'hinoki', 'view_bath'],
      catch: 'とろりと肌をつつむ美人の湯。飛騨川の川霧とともに。',
      description: '飛騨川を見下ろす崖線に建つ全14室。全客室に檜の内風呂(洗い場付き)を備え、トイレと洗面は完全に独立。川側の大浴場は朝の川霧が名物です。',
      kashikiri: [
        { name: '貸切内湯「つばき」', type: '内湯(檜)', capacity: '〜3名', fee: '40分 2,200円', how: '当日フロントにて先着予約' },
      ],
      access: 'JR下呂駅より徒歩12分(送迎あり)',
      rooms: [
        {
          id: 'r1', name: '川側和室(檜内風呂・洗い場付き)', capacity: '2〜4名', size: '38㎡', price: 23800,
          bath: { type: '内風呂(檜)・洗い場付き', tub: '檜', wash: true, view: '飛騨川', onsenBath: true, note: '客室風呂も美人の湯' },
          features: ['10畳和室', '川側', '禁煙'],
        },
        {
          id: 'r2', name: '山側和室(檜内風呂・洗い場付き)', capacity: '2名', size: '30㎡', price: 18800,
          bath: { type: '内風呂(檜)・洗い場付き', tub: '檜', wash: true, view: null, onsenBath: true, note: '' },
          features: ['8畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'atami-akatsuki',
      name: '相模灘一望 暁の湯',
      kana: 'さがみなだいちぼう あかつきのゆ',
      area: '熱海', pref: '静岡県', region: '中部・北陸',
      onsen: '熱海温泉', spring: '塩化物泉',
      springDetail: 'カルシウム・ナトリウム-塩化物・硫酸塩泉',
      efficacy: ['冷え性', '切り傷', '疲労回復', '筋肉痛'],
      gensenNote: '自家源泉・かけ流し(加水あり)',
      scene: 'sea', pal: 'dawn',
      rating: 4.6, reviews: 592,
      tags: ['room_roten', 'kashikiri_roten', 'daiyokujo', 'roten', 'view_bath', 'gensen', 'sauna'],
      catch: '水平線から昇る朝日を、インフィニティ露天の一番湯で。',
      description: '相模灘を見下ろす高台のリゾート旅館。海と溶け合うインフィニティ大浴場露天のほか、日の出時間に合わせて予約できる貸切露天「暁」が名物。',
      kashikiri: [
        { name: '貸切露天「暁」(日の出枠あり)', type: '露天(岩)', capacity: '〜4名', fee: '50分 4,400円', how: '公式予約時に事前予約可(日の出枠は先着)' },
      ],
      access: 'JR熱海駅より車7分(送迎シャトルあり)',
      rooms: [
        {
          id: 'r1', name: 'オーシャンフロント露天風呂付きツイン', capacity: '2名', size: '46㎡', price: 39800,
          bath: { type: '客室露天風呂(信楽焼)', tub: '信楽焼陶器', wash: true, view: '相模灘', onsenBath: true, note: '朝日側・かけ流し' },
          features: ['海側バルコニー', '禁煙'],
        },
        {
          id: 'r2', name: '海側和洋室(ビューバス・洗い場付き)', capacity: '2〜4名', size: '44㎡', price: 28800,
          bath: { type: 'ビューバス(十和田石)・洗い場付き', tub: '十和田石', wash: true, view: '相模灘', onsenBath: true, note: '' },
          features: ['ツイン+4.5畳', '禁煙'],
        },
        {
          id: 'r3', name: '街側ツイン(内風呂・洗い場付き)', capacity: '2名', size: '32㎡', price: 19800,
          bath: { type: '内風呂(人工大理石)・洗い場付き', tub: '人工大理石', wash: true, view: null, onsenBath: false, note: '大浴場は源泉かけ流し' },
          features: ['禁煙'],
        },
      ],
    },
    {
      id: 'nyuto-komakusa',
      name: 'ぶな森の湯 こまくさ',
      kana: 'ぶなもりのゆ こまくさ',
      area: '乳頭温泉郷', pref: '秋田県', region: '北海道・東北',
      onsen: '乳頭温泉郷', spring: '硫黄泉',
      springDetail: '含硫黄-ナトリウム-炭酸水素塩・塩化物泉(乳白色)',
      efficacy: ['皮膚病', '高血圧', '動脈硬化', '神経痛'],
      gensenNote: '自家源泉・完全かけ流し(加水・加温なし)',
      scene: 'forest', pal: 'mist',
      rating: 4.8, reviews: 231,
      tags: ['kashikiri_roten', 'roten', 'daiyokujo', 'gensen', 'nigori', 'iwaburo', 'free_kashikiri'],
      catch: 'ぶなの原生林にひらいた、乳白色の秘湯。',
      description: 'ぶなの森に囲まれた山の一軒宿。乳白色の硫黄泉を、森を望む混浴なしの男女別露天と、無料の貸切露天二つで。客室は簡素ながら、全室洗い場付き内風呂とトイレを別に備えます。',
      kashikiri: [
        { name: '貸切露天「ぶなの一」', type: '露天(岩)', capacity: '〜3名', fee: '無料', how: '空室札方式(空いていれば随時)' },
        { name: '貸切露天「ぶなの二」', type: '露天(岩)', capacity: '〜3名', fee: '無料', how: '空室札方式(空いていれば随時)' },
      ],
      access: 'JR田沢湖駅よりバス45分「乳頭温泉郷」下車 送迎3分',
      rooms: [
        {
          id: 'r1', name: '森側和室(内風呂・洗い場付き)', capacity: '2〜3名', size: '30㎡', price: 21800,
          bath: { type: '内風呂(木曽五木)・洗い場付き', tub: 'さわら', wash: true, view: 'ぶな林', onsenBath: false, note: '露天・貸切は乳白色の温泉' },
          features: ['8畳和室', '囲炉裏の間あり', '禁煙'],
        },
        {
          id: 'r2', name: '山側和室(内風呂・洗い場付き)', capacity: '2名', size: '26㎡', price: 17800,
          bath: { type: '内風呂(さわら)・洗い場付き', tub: 'さわら', wash: true, view: null, onsenBath: false, note: '' },
          features: ['6畳和室', '禁煙'],
        },
      ],
    },
    {
      id: 'beppu-yukemuri',
      name: '鉄輪 湯けむり小路',
      kana: 'かんなわ ゆけむりこうじ',
      area: '別府・鉄輪', pref: '大分県', region: '九州',
      onsen: '別府温泉郷(鉄輪)', spring: '塩化物泉',
      springDetail: 'ナトリウム-塩化物泉(高温泉)+蒸し湯',
      efficacy: ['冷え性', '腰痛', '疲労回復', '皮膚病'],
      gensenNote: '自家源泉・かけ流し/地獄蒸し体験あり',
      scene: 'town', pal: 'indigo',
      rating: 4.6, reviews: 359,
      tags: ['kashikiri_uchi', 'kashikiri_roten', 'daiyokujo', 'gensen', 'sauna', 'yumeguri'],
      catch: '湯けむりの路地に、貸切湯と地獄蒸しのある宿。',
      description: '湯けむり立ちのぼる鉄輪の路地に佇む全7室。石菖の蒸し湯、貸切露天、貸切内湯と湯処が充実。夕食は源泉の蒸気で仕上げる地獄蒸し会席を。',
      kashikiri: [
        { name: '貸切露天「湯の路」', type: '露天(岩)', capacity: '〜3名', fee: '45分 2,750円', how: '当日フロントにて先着予約' },
        { name: '貸切内湯「石菖」', type: '内湯(石)+蒸し湯', capacity: '〜2名', fee: '45分 2,750円', how: '当日フロントにて先着予約' },
      ],
      access: 'JR別府駅よりバス20分「鉄輪」下車 徒歩4分',
      rooms: [
        {
          id: 'r1', name: '路地側和室(石張り内風呂)', capacity: '2〜3名', size: '34㎡', price: 22800,
          bath: { type: '内風呂(伊豆石)・洗い場付き', tub: '伊豆石', wash: true, view: '湯けむりの路地', onsenBath: true, note: '客室風呂も源泉' },
          features: ['8畳和室', '地獄蒸し体験付きプランあり', '禁煙'],
        },
        {
          id: 'r2', name: '中庭側和室(内風呂・洗い場付き)', capacity: '2名', size: '28㎡', price: 18800,
          bath: { type: '内風呂(十和田石)・洗い場付き', tub: '十和田石', wash: true, view: '坪庭', onsenBath: true, note: '' },
          features: ['6畳+踏込', '禁煙'],
        },
      ],
    },
  ];

  /* ---------- 派生データ ---------- */
  HOTELS.forEach(function (h) {
    h.minPrice = Math.min.apply(null, h.rooms.map(function (r) { return r.price; }));
    h.hasFreeKashikiri = h.tags.indexOf('free_kashikiri') !== -1;
  });

  /* ---------- 公開API ---------- */
  window.YUBUNE = window.YUBUNE || {};
  window.YUBUNE.data = {
    HOTELS: HOTELS,
    TAGS: TAGS,
    SPRING_TYPES: SPRING_TYPES,
    REGIONS: REGIONS,
    sceneSVG: sceneSVG,
    sceneURI: sceneURI,
    bathTileSVG: bathTileSVG,
    findHotel: function (id) {
      return HOTELS.filter(function (h) { return h.id === id; })[0] || null;
    },
  };
})();
