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
