/* =========================================================
   ヒーロー背景: 地熱・マグマ(いただいた geothermal-bg.html をヒーロー用に組み込み)
   玄武岩の黒地に、溶岩の亀裂が光り、火の粉と蒸気が立ちのぼる。
   - 描画先はウィンドウではなく .hero の大きさ
   - キー操作とヒント表示は外し、プリセットは「標準」相当を固定
   - 画面外・タブ非表示では止め、「視差効果を減らす」設定では静止画
   ========================================================= */
(function () {
  'use strict';
  var magma = document.querySelector('.hero-magma');
  var fx = document.querySelector('.hero-fx');
  if (!magma || !fx || !magma.getContext) return;
  var mctx = magma.getContext('2d'), fctx = fx.getContext('2d');
  if (!mctx || !fctx) return;

  /* ===================== 調整パラメータ ===================== */
  var mobile = window.innerWidth < 768;
  var CONFIG = {
    speed: 1.0,                      /* 流れの速さ */
    glow: 1.0,                       /* 発光の強さ(0.6〜1.6 が目安) */
    emberCount: mobile ? 40 : 80,    /* 火の粉の数 */
    steam: true,                     /* 蒸気の表示 */
    resolution: mobile ? 150 : 240,  /* マグマ層の横解像度(大きいほど精細・重い) */
    fps: 30
  };

  /* ===================== 3D Simplex Noise ===================== */
  var noise3 = (function () {
    var grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    var p = new Uint8Array(256), i; for (i = 0; i < 256; i++) p[i] = i;
    var s = 20260910;
    for (i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; var j = s % (i + 1); var t = p[i]; p[i] = p[j]; p[j] = t; }
    var perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    var F3 = 1 / 3, G3 = 1 / 6;
    return function (xin, yin, zin) {
      var s = (xin + yin + zin) * F3;
      var i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      var t = (i + j + k) * G3;
      var x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      var i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      var x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      var x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      var x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      var ii = i & 255, jj = j & 255, kk = k & 255;
      var g0 = grad3[pm12[ii + perm[jj + perm[kk]]]];
      var g1 = grad3[pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
      var g2 = grad3[pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
      var g3 = grad3[pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
      var n = 0, t0;
      t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0; if (t0 > 0) { t0 *= t0; n += t0 * t0 * (g0[0] * x0 + g0[1] * y0 + g0[2] * z0); }
      t0 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1; if (t0 > 0) { t0 *= t0; n += t0 * t0 * (g1[0] * x1 + g1[1] * y1 + g1[2] * z1); }
      t0 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2; if (t0 > 0) { t0 *= t0; n += t0 * t0 * (g2[0] * x2 + g2[1] * y2 + g2[2] * z2); }
      t0 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3; if (t0 > 0) { t0 *= t0; n += t0 * t0 * (g3[0] * x3 + g3[1] * y3 + g3[2] * z3); }
      return 32 * n;
    };
  })();

  /* ===================== パレット(玄武岩 → 熾火 → 溶岩 → 白熱) ===================== */
  var STOPS = [
    [0.00, [9, 5, 4]],
    [0.42, [24, 9, 6]],
    [0.58, [78, 18, 8]],
    [0.70, [179, 35, 15]],
    [0.82, [242, 106, 27]],
    [0.92, [255, 194, 74]],
    [1.00, [255, 241, 194]]
  ];
  var LUT = new Uint8ClampedArray(256 * 3);
  for (var li = 0; li < 256; li++) {
    var v = li / 255, a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (var si = 0; si < STOPS.length - 1; si++) if (v >= STOPS[si][0] && v <= STOPS[si + 1][0]) { a = STOPS[si]; b = STOPS[si + 1]; break; }
    var f = (v - a[0]) / (b[0] - a[0] || 1);
    for (var c = 0; c < 3; c++) LUT[li * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
  }

  /* ===================== マグマ層 ===================== */
  var low = document.createElement('canvas'), lctx = low.getContext('2d');
  var W = 0, H = 0, LW = 0, LH = 0, img = null;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = magma.clientWidth, ch = magma.clientHeight;
    if (!cw || !ch) return;
    W = magma.width = Math.floor(cw * dpr);
    H = magma.height = Math.floor(ch * dpr);
    fx.width = W; fx.height = H;
    LW = CONFIG.resolution;
    LH = Math.max(2, Math.round(LW * ch / cw));
    low.width = LW; low.height = LH;
    img = lctx.createImageData(LW, LH);
    seedEmbers(); seedSteam();
    if (!running) render(12, 0);
  }

  function drawMagma(t) {
    var d = img.data;
    var sc = 3.2 / LW;                     /* ノイズの空間スケール */
    var ts = t * 0.05 * CONFIG.speed;
    var drift = t * 0.03 * CONFIG.speed;   /* ゆっくり上へ湧く */
    var breathe = 0.92 + 0.08 * Math.sin(t * 0.35);
    var glow = CONFIG.glow * breathe;
    var idx = 0;
    for (var y = 0; y < LH; y++) {
      for (var x = 0; x < LW; x++) {
        var px = x * sc, py = y * sc + drift;
        /* ドメインワープで溶岩のうねりを作る */
        var wx = noise3(px * 0.7, py * 0.7, ts * 0.6) * 0.45;
        var wy = noise3(px * 0.7 + 4.1, py * 0.7 + 2.7, ts * 0.6) * 0.45;
        var v = 0, amp = 0.55, fq = 1.0;
        for (var o = 0; o < 3; o++) {
          var n = noise3((px + wx) * fq, (py + wy) * fq, ts * fq);
          n = 1 - Math.abs(n);               /* 稜線ノイズ = 亀裂 */
          v += n * n * amp; amp *= 0.5; fq *= 2.1;
        }
        v = v / 0.96;
        v = Math.pow(v, 2.6) * glow;         /* 暗部を締め、亀裂だけ光らせる */
        v *= 0.78 + 0.32 * (y / LH);         /* 下ほど熱い(地下深部) */
        var cc = Math.min(255, Math.max(0, v * 255)) | 0;
        d[idx++] = LUT[cc * 3]; d[idx++] = LUT[cc * 3 + 1]; d[idx++] = LUT[cc * 3 + 2]; d[idx++] = 255;
      }
    }
    lctx.putImageData(img, 0, 0);
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(low, 0, 0, W, H);
  }

  /* ===================== 火の粉・蒸気・ビネット ===================== */
  var embers = [], steam = [];

  function seedEmbers() {
    embers = []; for (var i = 0; i < CONFIG.emberCount; i++) embers.push(newEmber(true));
  }
  function newEmber(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 10,
      r: (0.6 + Math.random() * 1.8) * (W / 1400 + 0.6),
      vy: (0.25 + Math.random() * 0.6),
      sway: Math.random() * Math.PI * 2,
      life: anywhere ? Math.random() : 0,
      hot: Math.random()
    };
  }
  function seedSteam() {
    steam = []; if (!CONFIG.steam) return;
    for (var i = 0; i < 7; i++) steam.push(newSteam(true));
  }
  function newSteam(anywhere) {
    return { x: Math.random() * W, y: anywhere ? Math.random() * H : H + H * 0.3,
             r: (0.18 + Math.random() * 0.25) * Math.max(W, H), vy: 0.12 + Math.random() * 0.18,
             a: 0.035 + Math.random() * 0.04, seed: Math.random() * 100 };
  }

  function drawFx(t, dt) {
    fctx.clearRect(0, 0, W, H);
    var k = dt * 60 * CONFIG.speed;

    /* 蒸気(湯気) */
    if (CONFIG.steam) {
      fctx.globalCompositeOperation = 'screen';
      for (var i = 0; i < steam.length; i++) {
        var s = steam[i];
        s.y -= s.vy * k * (H / 900);
        s.x += Math.sin(t * 0.2 + s.seed) * 0.2 * k;
        if (s.y < -s.r) { var ns = newSteam(false); for (var key in ns) s[key] = ns[key]; }
        var g = fctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(210,200,215,' + s.a + ')');
        g.addColorStop(1, 'rgba(210,200,215,0)');
        fctx.fillStyle = g; fctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      }
    }

    /* 火の粉 */
    fctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < embers.length; j++) {
      var e = embers[j];
      e.y -= e.vy * k * (H / 900);
      e.sway += 0.02 * k;
      e.x += Math.sin(e.sway) * 0.35 * k;
      e.life += 0.0025 * k;
      if (e.y < -10 || e.life > 1) { var ne = newEmber(false); for (var kk in ne) e[kk] = ne[kk]; }
      var fade = Math.sin(Math.min(1, e.life) * Math.PI);
      var col = e.hot > 0.7 ? '255,225,150' : e.hot > 0.35 ? '255,150,60' : '230,70,25';
      fctx.fillStyle = 'rgba(' + col + ',' + (0.75 * fade) + ')';
      fctx.beginPath(); fctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); fctx.fill();
      if (e.r > 1.6) {
        var eg = fctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 5);
        eg.addColorStop(0, 'rgba(' + col + ',' + (0.25 * fade) + ')'); eg.addColorStop(1, 'rgba(' + col + ',0)');
        fctx.fillStyle = eg; fctx.beginPath(); fctx.arc(e.x, e.y, e.r * 5, 0, Math.PI * 2); fctx.fill();
      }
    }

    /* ビネット(周辺を締めて文字を載せやすく) */
    fctx.globalCompositeOperation = 'source-over';
    var vg = fctx.createRadialGradient(W * 0.5, H * 0.55, Math.min(W, H) * 0.35, W * 0.5, H * 0.55, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(7,4,3,0)'); vg.addColorStop(1, 'rgba(7,4,3,0.75)');
    fctx.fillStyle = vg; fctx.fillRect(0, 0, W, H);
  }

  function render(t, dt) { drawMagma(t); drawFx(t, dt); }

  /* ===================== ループ(画面内・表示中だけ回す) ===================== */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var running = false, raf = 0, last = 0, acc = 0, t = 0;
  function loop(now) {
    if (!running) return;
    var dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    if (acc >= 1 / CONFIG.fps) { t += acc; render(t, acc); acc = 0; }
    raf = requestAnimationFrame(loop);
  }
  function start() { if (running || reduce) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { threshold: 0 }).observe(magma);
  } else {
    start();
  }
})();
