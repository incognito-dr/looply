/* Arbaje Tours & MICE — interacciones mínimas */

// menú móvil
const burger = document.getElementById('burger');
const mobileNav = document.getElementById('mobileNav');
if (burger && mobileNav) {
  burger.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// marcar página actual en la navegación
const here = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.main-nav a').forEach(a => {
  if (a.getAttribute('href') === here) a.classList.add('current');
});

// reveal al hacer scroll
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.rv').forEach(el => io.observe(el));

/* ------------------------------------------------------------
   Burbujas de avión: flotan, rebotan entre sí y contra los bordes.
   Solo transform:translate3d en rAF (mantequilla).
------------------------------------------------------------ */
(function () {
  const box = document.getElementById('bubbles');
  if (!box) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SPRITES = [
    'assets/brand/planebubble.svg',
    'assets/brand/stamp-round-azure.svg',
    'assets/brand/planebubble.svg',
    'assets/brand/stamp-round-sun.svg',
    'assets/brand/planebubble.svg',
    'assets/brand/stamp-round-azure.svg'
  ];

  let W = box.clientWidth, H = box.clientHeight;
  const bubbles = SPRITES.map((src, i) => {
    const r = 26 + (i % 3) * 14 + (i * 7) % 11;           // radios variados 26–60
    const img = document.createElement('img');
    img.src = src;
    img.className = 'bubble';
    img.style.width = (r * 2) + 'px';
    img.style.height = (r * 2) + 'px';
    img.style.opacity = '.9';
    box.appendChild(img);
    const ang = (i / SPRITES.length) * Math.PI * 2 + 0.7;
    return {
      el: img, r,
      x: (W / (SPRITES.length + 1)) * (i + 1) - r,
      y: (i % 2 ? H * 0.22 : H * 0.62) + (i * 13) % 40,
      vx: Math.cos(ang) * (28 + (i * 9) % 22),            // px/seg
      vy: Math.sin(ang) * (28 + (i * 11) % 22),
      rot: 0,
      vr: ((i % 2) ? 1 : -1) * (6 + (i * 5) % 8)          // giro suave, grados/seg
    };
  });

  const place = b => {
    b.el.style.transform = 'translate3d(' + b.x + 'px,' + b.y + 'px,0) rotate(' + b.rot + 'deg)';
  };

  if (reduced) { bubbles.forEach(place); return; }

  addEventListener('resize', () => { W = box.clientWidth; H = box.clientHeight; });

  let last = performance.now();
  function tick(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;                             // pestaña dormida: sin saltos

    for (const b of bubbles) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      // rebote contra los bordes
      if (b.x < 0)            { b.x = 0;            b.vx =  Math.abs(b.vx); }
      if (b.x > W - b.r * 2)  { b.x = W - b.r * 2;  b.vx = -Math.abs(b.vx); }
      if (b.y < 0)            { b.y = 0;            b.vy =  Math.abs(b.vy); }
      if (b.y > H - b.r * 2)  { b.y = H - b.r * 2;  b.vy = -Math.abs(b.vy); }
    }

    // choques elásticos entre burbujas (misma masa)
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], c = bubbles[j];
        const dx = (c.x + c.r) - (a.x + a.r);
        const dy = (c.y + c.r) - (a.y + a.r);
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = a.r + c.r;
        if (dist < min) {
          const nx = dx / dist, ny = dy / dist;
          // separar el solape
          const push = (min - dist) / 2;
          a.x -= nx * push; a.y -= ny * push;
          c.x += nx * push; c.y += ny * push;
          // intercambiar componentes normales de velocidad
          const va = a.vx * nx + a.vy * ny;
          const vc = c.vx * nx + c.vy * ny;
          const d = vc - va;
          a.vx += d * nx; a.vy += d * ny;
          c.vx -= d * nx; c.vy -= d * ny;
        }
      }
    }

    bubbles.forEach(place);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
