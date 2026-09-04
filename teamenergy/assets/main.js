/* Team Energy トップページ
   - ヒーローのキャンバス描画(地中から立ち上るマグマ)
   - キャプションの切り替え
   - スクロールフェードイン / ナビ開閉
   - NEWS / STORIES を data/*.json から描画
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ヒーロー: マグマ ---------- */
  var canvas = document.getElementById('hero-canvas');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var bubbles = [];
    var strata = [];
    var MAGMA = getComputedStyle(document.documentElement).getPropertyValue('--magma').trim() || '#c9411f';
    var GLOW = getComputedStyle(document.documentElement).getPropertyValue('--magma-glow').trim() || 'rgba(233,96,40,.28)';

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function rand(a, b) { return a + Math.random() * (b - a); }

    function makeBubble(initial) {
      var mobile = W < 768;
      var r = rand(mobile ? 5 : 6, mobile ? 30 : 64);
      // 右側に寄せて、左下のコピーと重ならないようにする
      var xMin = mobile ? W * 0.3 : W * 0.46;
      return {
        x: rand(xMin, W * 0.92),
        y: initial ? rand(-r, H + r) : H + r + rand(0, H * 0.4),
        r: r,
        vy: rand(0.06, 0.22) * (90 / r + 0.6),   // 小さい泡ほど速く上る
        sway: rand(0, Math.PI * 2),
        swayAmp: rand(0.15, 0.6),
        alpha: rand(0.75, 1)
      };
    }

    function seed() {
      bubbles = [];
      var n = W < 768 ? 7 : 12;
      for (var i = 0; i < n; i++) bubbles.push(makeBubble(true));
      strata = [];
      for (var j = 0; j < 6; j++) {
        strata.push({ y: H * (0.62 + j * 0.065), amp: rand(6, 18), phase: rand(0, Math.PI * 2), speed: rand(0.0004, 0.0009) });
      }
    }

    function drawStrata(t) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(27,22,20,0.09)';
      for (var i = 0; i < strata.length; i++) {
        var s = strata[i];
        ctx.beginPath();
        for (var x = 0; x <= W; x += 24) {
          var y = s.y + Math.sin(x * 0.004 + s.phase + t * s.speed) * s.amp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawBubble(b) {
      // 上端(ヘッダー)に近づくほど薄く消える
      var fadeZone = H * 0.22;
      var k = b.y < fadeZone ? Math.max(0, b.y / fadeZone) : 1;
      ctx.save();
      ctx.globalAlpha = b.alpha * k;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = b.r * 0.9;
      ctx.shadowOffsetY = b.r * 0.35;
      ctx.fillStyle = MAGMA;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var last = 0;
    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      drawStrata(t);
      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        b.y -= b.vy;
        b.x += Math.sin(t * 0.0006 + b.sway) * b.swayAmp * 0.2;
        if (b.y < -b.r * 1.5) bubbles[i] = makeBubble(false);
        drawBubble(b);
      }
      last = t;
      if (!reduceMotion) requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  }

  /* ---------- ヒーロー: キャプション切り替え ---------- */
  var caps = document.querySelectorAll('.hero-caption span');
  if (caps.length) {
    var ci = 0;
    caps[0].classList.add('is-on');
    if (!reduceMotion) {
      setInterval(function () {
        caps[ci].classList.remove('is-on');
        ci = (ci + 1) % caps.length;
        caps[ci].classList.add('is-on');
      }, 7000);
    }
  }

  /* ---------- フェードイン ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fadein').forEach(function (el) { io.observe(el); });

  /* ---------- ナビ ---------- */
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    document.querySelectorAll('.gnav a').forEach(function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    });
  }

  /* ---------- データ描画 ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function loadJSON(path, cb) {
    fetch(path).then(function (r) { return r.json(); }).then(cb).catch(function () { cb([]); });
  }

  var newsList = document.getElementById('news-list');
  if (newsList) {
    loadJSON('data/news.json', function (items) {
      if (!items.length) { newsList.closest('section').hidden = true; return; }
      newsList.innerHTML = items.slice(0, 5).map(function (n) {
        return '<li><a href="' + esc(n.url) + '">' +
          '<p class="news-date">' + esc(n.date) + '</p>' +
          '<p class="news-cat"><span>' + esc(n.category) + '</span></p>' +
          '<p class="news-title">' + esc(n.title) + '</p></a></li>';
      }).join('');
    });
  }

  var storiesTrack = document.getElementById('stories-track');
  if (storiesTrack) {
    loadJSON('data/stories.json', function (items) {
      if (!items.length) { storiesTrack.closest('section').hidden = true; return; }
      storiesTrack.innerHTML = items.map(function (s) {
        var img = s.image ? '<img src="' + esc(s.image) + '" alt="" loading="lazy">' : '';
        return '<a class="story" href="' + esc(s.url) + '">' +
          '<div class="story-img">' + img + '</div>' +
          '<p class="story-title">' + esc(s.title) + '</p>' +
          '<p class="story-cat en upper">' + esc(s.category) + '</p></a>';
      }).join('');
    });
  }
})();
