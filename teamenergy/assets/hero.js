/* =========================================================
   ヒーロー背景: マグマ色の球体が浮遊するアニメーション(Canvas 描画)
   動画ではなくプログラムで描くため、Retina/4K でも輪郭が滲まず、ファイルは数KB。
   薄いグレー地(--hero-bg)に、球体と暖色の落ち影。動きは遅く、装飾は最小限。
   球体は1個ずつ事前に描いておき(スプライト)、毎フレームは貼るだけにして軽くする。
   ========================================================= */
(function () {
  'use strict';
  var canvas = document.querySelector('.hero-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var BG = '#eaeaea';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, DPR = 1, spheres = [], noiseTile = null;
  var running = false, raf = 0, t0 = 0, offset = 0, builtW = 0, builtH = 0;

  /* 乱数は固定シード。読み込みのたびに同じ構図になる */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* 粒子感のためのノイズ(球体の中だけに乗せる) */
  function makeNoise() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), img = x.createImageData(128, 128), d = img.data, r = rng(7);
    for (var i = 0; i < d.length; i += 4) { var v = 96 + (r() * 160) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  }

  /* 球体1個を、影・粒子・奥行きのぼかし込みで1枚の画像に描いておく */
  function makeSprite(R, z) {
    var blur = z * z * 5;                 /* 奥ほど柔らかく */
    var half = R * 2.3 + blur * 3 + 4;    /* 影(右下に 2.2R まで)とぼかしの余白 */
    var c = document.createElement('canvas');
    c.width = c.height = Math.ceil(half * 2 * DPR);
    var x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, half, half);
    if ('filter' in x && blur > 0.3) x.filter = 'blur(' + blur.toFixed(1) + 'px)';

    /* 落ち影: 右下に暖色のぼかし */
    var sx = R * 0.55, sy = R * 0.85, sr = R * 1.35, sa = 0.26 * (1 - 0.45 * z);
    var sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(210,70,28,' + sa.toFixed(3) + ')');
    sg.addColorStop(0.45, 'rgba(210,70,28,' + (sa * 0.45).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(210,70,28,0)');
    x.fillStyle = sg;
    x.beginPath(); x.ellipse(sx, sy, sr, sr * 0.82, 0, 0, 6.283); x.fill();

    /* 球体: 左上に弱い光、縁に向かって深いマグマ色。艶は出さない */
    var g = x.createRadialGradient(-R * 0.35, -R * 0.38, R * 0.05, 0, 0, R);
    g.addColorStop(0, '#e2643a');
    g.addColorStop(0.5, '#d2461c');
    g.addColorStop(1, '#a8300e');
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, R, 0, 6.283); x.fill();

    /* 粒子感 */
    if (R > 6) {
      x.save();
      x.beginPath(); x.arc(0, 0, R, 0, 6.283); x.clip();
      x.globalCompositeOperation = 'multiply';
      x.globalAlpha = 0.16;
      x.fillStyle = x.createPattern(noiseTile, 'repeat');
      x.fillRect(-R, -R, R * 2, R * 2);
      x.restore();
    }
    return { img: c, half: half };
  }

  /* 球体の配置。半径と位置は画面に対する比率で持つ。
     文字は左下に置くので、群れは右寄り。大きい球ほど右に寄せて文字と重ねない */
  function build() {
    var r = rng(2026), mobile = W < 768, n = mobile ? 9 : 15;
    var S = mobile ? W * 2.1 : Math.max(W, H * 1.2); /* 半径の基準 */
    spheres = [];
    for (var i = 0; i < n; i++) {
      var big = r() < 0.3, z = r();
      var rad = big ? 0.028 + r() * 0.022 : 0.006 + r() * 0.016;
      var R = rad * S * (1 - 0.4 * z);
      spheres.push({
        z: z, R: R,
        ox: mobile ? (r() - 0.5) * 0.64 : (big ? 0.02 + r() * 0.13 : (r() - 0.5) * 0.30),
        oy: mobile ? (r() - 0.5) * 0.22 : (r() - 0.5) * 0.68,
        ax: 0.015 + r() * 0.025, ay: mobile ? 0.01 + r() * 0.015 : 0.02 + r() * 0.04, /* ゆらぎの振幅(画面比) */
        w1: 0.05 + r() * 0.08, w2: 0.04 + r() * 0.07,     /* ゆらぎの角速度(rad/s) */
        p1: r() * 6.283, p2: r() * 6.283,
        delay: r() * 1.6,                                 /* 出現の遅れ(秒) */
        sprite: makeSprite(R, z)
      });
    }
    spheres.sort(function (a, b) { return b.z - a.z; }); /* 奥から描く */
    builtW = W; builtH = H;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!noiseTile) noiseTile = makeNoise();
    /* スマホのアドレスバー開閉(高さだけ少し変わる)では作り直さない */
    if (W !== builtW || Math.abs(H - builtH) > builtH * 0.25) build();
    if (!running) draw(8); /* 静止画としても成立する時刻を描く */
  }

  function draw(t) {
    var mobile = W < 768;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    /* 群れの中心。ゆっくり漂う */
    var cx = W * (mobile ? 0.55 : 0.65) + W * 0.04 * Math.sin(t * 0.045);
    var cy = H * (mobile ? 0.17 : 0.47) + H * (mobile ? 0.015 : 0.04) * Math.cos(t * 0.032);
    for (var i = 0; i < spheres.length; i++) {
      var s = spheres[i];
      var life = Math.min(1, (t - s.delay) / 1.4);
      if (life <= 0) continue;
      var ease = 1 - Math.pow(1 - life, 3);
      var x = cx + s.ox * W + Math.sin(t * s.w1 + s.p1) * s.ax * W;
      var y = cy + s.oy * H + Math.cos(t * s.w2 + s.p2) * s.ay * H;
      var h = s.sprite.half * ease;
      ctx.globalAlpha = ease;
      ctx.drawImage(s.sprite.img, x - h, y - h, h * 2, h * 2);
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    draw(offset + (now - t0) / 1000);
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduce) return;
    running = true; t0 = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!running) return;
    offset += (performance.now() - t0) / 1000; /* 再開時は続きから */
    running = false; cancelAnimationFrame(raf);
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { threshold: 0 }).observe(canvas);
  } else {
    start();
  }
})();
