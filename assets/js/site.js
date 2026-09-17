/* Sam Hesketh Creative — shared behaviour (no dependencies) */
(function () {
  'use strict';
  var d = document, b = d.body;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };

  /* ---- header: mobile toggle + active link ---- */
  var header = $('.site-header');
  var toggle = $('.nav-toggle');
  if (toggle && header) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  var page = b.getAttribute('data-page');
  if (page) {
    $$('.main-nav__links a').forEach(function (a) {
      if (a.getAttribute('data-nav') === page) { a.classList.add('is-active'); a.setAttribute('aria-current', 'page'); }
    });
  }

  /* ---- overlays (welcome modal, contact drawer) ---- */
  var lastFocus = null;
  function openOverlay(id) {
    var o = d.getElementById(id); if (!o) return;
    lastFocus = d.activeElement;
    o.classList.add('is-open'); o.setAttribute('aria-hidden', 'false'); b.classList.add('no-scroll');
    var f = $('input,textarea,button.modal__close,[href]', o); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeOverlay(o) {
    if (!o) return;
    o.classList.remove('is-open'); o.setAttribute('aria-hidden', 'true');
    if (!$('.overlay.is-open') && !$('.lightbox.is-open')) b.classList.remove('no-scroll');
    var iframe = $('iframe', o); if (iframe) iframe.remove();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('[data-open]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); openOverlay(el.getAttribute('data-open')); });
  });
  $$('.overlay, .lightbox').forEach(function (o) {
    o.addEventListener('click', function (e) { if (e.target === o) closeOverlay(o); });
    $$('[data-close]', o).forEach(function (c) { c.addEventListener('click', function () { closeOverlay(o); }); });
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $$('.overlay.is-open, .lightbox.is-open').forEach(closeOverlay); }
  });

  /* welcome message: once per browser session, home page only */
  var welcome = d.getElementById('welcome');
  if (welcome && welcome.hasAttribute('data-auto')) {
    var seen = false;
    try { seen = sessionStorage.getItem('sh_welcome') === '1'; } catch (err) { seen = false; }
    if (!seen) {
      setTimeout(function () { openOverlay('welcome'); }, 900);
      try { sessionStorage.setItem('sh_welcome', '1'); } catch (err) { /* private mode */ }
    }
  }

  /* ---- lightbox for photos and films ---- */
  var lb = d.getElementById('lightbox');
  if (lb) {
    var lbContent = $('.lightbox__content', lb), lbNote = $('.lightbox__note', lb);
    function embedUrl(u) {
      var m;
      if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/))) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&rel=0';
      if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1';
      return null;
    }
    $$('[data-lightbox]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        lbContent.innerHTML = ''; lbNote.textContent = '';
        var video = el.getAttribute('data-video');
        if (video && embedUrl(video)) {
          var f = d.createElement('iframe'); f.src = embedUrl(video); f.allow = 'autoplay; fullscreen; picture-in-picture'; f.setAttribute('allowfullscreen', '');
          lbContent.appendChild(f);
        } else {
          var src = el.getAttribute('data-lightbox') || el.getAttribute('href') || (el.querySelector('img') || {}).currentSrc;
          var img = d.createElement('img'); img.src = src; img.alt = el.getAttribute('data-alt') || ((el.querySelector('img') || {}).alt || '');
          lbContent.appendChild(img);
          var cap = el.getAttribute('data-caption'); if (cap) { var c = d.createElement('p'); c.className = 'caption lightbox__cap'; c.textContent = cap; lbContent.appendChild(c); }
          if (video === '') lbNote.textContent = 'Film link coming soon';
        }
        lastFocus = el; lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); b.classList.add('no-scroll');
      });
    });
  }

  /* ---- category filters ---- */
  $$('[data-filter-group]').forEach(function (group) {
    var target = group.getAttribute('data-filter-group');
    var items = $$('[data-cat]', d.getElementById(target) || d);
    $$('[data-filter]', group).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var cat = btn.getAttribute('data-filter');
        $$('[data-filter]', group).forEach(function (x) { x.classList.remove('is-active'); });
        btn.classList.add('is-active');
        items.forEach(function (it) {
          var cats = (it.getAttribute('data-cat') || '').split(/\s+/);
          it.hidden = !(cat === 'all' || cats.indexOf(cat) > -1);
        });
      });
    });
  });

  /* ---- forms: progressive enhancement (fetch to form action, mailto fallback) ---- */
  $$('form[data-enhance]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var action = form.getAttribute('action') || '';
      if (!/^https?:/.test(action) || !window.fetch) return; /* let the browser submit normally */
      e.preventDefault();
      var btn = $('[type=submit]', form), label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      fetch(action, { method: 'POST', headers: { 'Accept': 'application/json' }, body: new FormData(form) })
        .then(function (r) { if (!r.ok) throw new Error('bad'); form.innerHTML = '<p class="mono mono--upper">Thanks. Your message is on its way, Sam will be in touch.</p>'; })
        .catch(function () { if (btn) { btn.disabled = false; btn.textContent = label; } form.submit(); });
    });
  });

  /* ---- quantity steppers ---- */
  $$('.qty').forEach(function (q) {
    var input = $('input', q);
    $$('button', q).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = parseInt(input.value, 10) || 1; v += btn.getAttribute('data-step') === '-' ? -1 : 1; input.value = Math.max(1, v);
      });
    });
  });

  /* ---- reveal on scroll ---- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else { $$('.reveal').forEach(function (el) { el.classList.add('in-view'); }); }

  /* ---- footer year ---- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
