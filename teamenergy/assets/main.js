/* Team Energy トップページ
   - ヒーローのキャプション切り替え
   - スクロールフェードイン / ナビ開閉
   - NEWS / STORIES を data/*.json から描画
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ---------- 事業会社アコーディオン(開くのは一度に1つ) ---------- */
  var accs = document.querySelectorAll('#biz-acc .biz-acc-trigger');
  accs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      accs.forEach(function (b) {
        var body = document.getElementById(b.getAttribute('aria-controls'));
        b.setAttribute('aria-expanded', 'false');
        if (body) { body.classList.remove('is-open'); body.setAttribute('aria-hidden', 'true'); }
      });
      if (!open) {
        var target = document.getElementById(btn.getAttribute('aria-controls'));
        btn.setAttribute('aria-expanded', 'true');
        if (target) { target.classList.add('is-open'); target.setAttribute('aria-hidden', 'false'); }
      }
    });
  });

  /* ---------- ヒーロー: 読み込み後に文字を立ち上げる ---------- */
  function ready() { document.body.classList.add('is-ready'); }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(ready); setTimeout(ready, 1500); } else { setTimeout(ready, 300); }

  /* ---------- スクロール: ヘッダーの白抜き/白帯、ヒーローの視差 ---------- */
  var darkHero = document.querySelector('.hero-dark');
  var heroInner = document.querySelector('.hero-inner');
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    document.body.classList.toggle('is-scrolled', y > 40);
    if (darkHero) {
      var h = darkHero.offsetHeight;
      document.body.classList.toggle('on-dark-hero', y < h - 72);
      if (heroInner && !reduceMotion) {
        var p = Math.min(1, y / h);
        heroInner.style.transform = 'translateY(' + (y * 0.28).toFixed(1) + 'px)';
        heroInner.style.opacity = String(1 - p * 1.4 > 0 ? 1 - p * 1.4 : 0);
      }
    }
  }
  onScroll();
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ---------- 数字のカウントアップ(見えた時に一度だけ) ---------- */
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var el = e.target, to = parseFloat(el.getAttribute('data-count')), t0 = null, dur = 1500;
        if (reduceMotion) { el.textContent = String(to); return; }
        function step(now) {
          if (!t0) t0 = now;
          var k = Math.min(1, (now - t0) / dur); k = 1 - Math.pow(1 - k, 3);
          el.textContent = String(Math.round(to * k));
          if (k < 1) requestAnimationFrame(step);
        }
        el.textContent = '0';
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- ドットは順に灯る(遅延を1個ずつずらす) ---------- */
  document.querySelectorAll('.dotgrid-body i').forEach(function (d, i) { d.style.transitionDelay = (0.2 + i * 0.022).toFixed(3) + 's'; });
  document.querySelectorAll('.pmap-svg .pmap-region').forEach(function (g, i) { g.style.transitionDelay = (0.05 + i * 0.09).toFixed(2) + 's'; g.querySelector('.pmap-dot').style.transitionDelay = (0.5 + i * 0.09).toFixed(2) + 's'; });

  /* ---------- 同じ動画を別の場所でも使う(ファイルは1つ) ---------- */
  document.querySelectorAll('video[data-clone-of]').forEach(function (v) {
    var src = document.querySelector(v.getAttribute('data-clone-of'));
    if (!src) return;
    src.querySelectorAll('source').forEach(function (so) { v.appendChild(so.cloneNode(true)); });
    if (src.getAttribute('src')) v.src = src.getAttribute('src');
    v.load();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es[0].isIntersecting ? v.play().catch(function () {}) : v.pause(); }, { threshold: 0 }).observe(v);
    }
  });
  /* ヒーロー動画も画面外では止める */
  document.querySelectorAll('.hero-video video').forEach(function (v) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es[0].isIntersecting ? v.play().catch(function () {}) : v.pause(); }, { threshold: 0 }).observe(v);
    }
  });

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
