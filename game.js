'use strict';
/* dream-raft — a drift through sleeping seas. vanilla js, no dependencies. */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const hud = {
  score: el('score'), frags: el('frags'), combo: el('combo'),
  glow: el('glowBar'), glowWrap: el('glowWrap'),
  dreamline: el('dreamline'), overlay: el('overlay')
};

let W = 0, H = 0;
function resize() {
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const DREAM_WORDS = [
  'a staircase made of rain',
  'the sound of a color',
  'a key that opens only mornings',
  'somewhere, a lighthouse dreams of ships',
  'an ocean of warm static',
  'the moon, misplacing its shadows',
  'a letter from a city you never visited',
  'honey dripping upward',
  'a train whose stops are all feelings',
  'the exact weight of a secret',
  'a garden growing inside a bell',
  'someone is flying a kite made of Tuesday',
  'the sea remembers every name',
  'a door that opens sideways into tea',
  'stars, unpicking the dark',
  'a whale humming in a minor key',
  'the smell of a word you forgot',
  'glass birds, mending the sky',
  'a clock that only ticks when you blink',
  'the first snow of a summer that never was',
  'a bridge woven from goodbyes',
  'an apple, dreaming of its tree',
  'the soft machinery of dawn',
  'a hatful of captured eclipses',
  'someone waters the silence',
  'a postcard from the bottom of a dream',
  'the tide is made of slow music',
  'a candle, learning to be a moth'
];

/* ---------------- sound (all synthesized, zero audio files) ---------------- */
const Sound = {
  ctx: null, master: null, muted: false, noiseBuf: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.34;
    this.master.connect(this.ctx.destination);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.05;
    [[55, 'triangle', 0.5], [110, 'sine', 0.5], [164.81, 'sine', 0.22], [220, 'sine', 0.18]].forEach(cfg => {
      const o = this.ctx.createOscillator();
      o.type = cfg[1]; o.frequency.value = cfg[0]; o.detune.value = rand(-4, 4);
      const g = this.ctx.createGain(); g.gain.value = cfg[2];
      o.connect(g); g.connect(lp); o.start();
    });
    lp.connect(padGain); padGain.connect(this.master);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lg = this.ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  },
  env(node, t0, peak, decay) {
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.01 + decay);
  },
  note(freq, dur, vol, type, when) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator();
    o.type = type || 'sine'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t0, vol, dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  },
  chime(combo) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const n = scale[combo % scale.length];
    this.note(n, 0.9, 0.15);
    this.note(n * 2, 0.45, 0.045);
  },
  thud() {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
    const g = this.ctx.createGain(); this.env(g, t0, 0.5, 0.35);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.45);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const g2 = this.ctx.createGain(); this.env(g2, t0, 0.25, 0.25);
    src.connect(g2); g2.connect(this.master); src.start(t0);
  },
  fade() {
    this.note(392, 0.5, 0.14);
    this.note(311.1, 0.6, 0.12, 'sine', 0.18);
    this.note(233.1, 1.2, 0.12, 'sine', 0.38);
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.34;
  }
};

/* ---------------- state ---------------- */
let state = 'title';
let t = 0, distance = 0, speed = 60, score = 0;
let fragments = 0, combo = 0, comboT = 0, best = 0;
try { best = +(localStorage.getItem('dreamraft.best') || 0); } catch (e) {}

const raft = { x: W / 2, y: 0, vx: 0, tilt: 0, glow: 3, inv: 0, r: 24 };
let fragsArr = [], nights = [], parts = [], floats = [], islands = [];
let fragTimer = 0, nightTimer = 0, islandTimer = 4, emberTimer = 0, rippleTimer = 0;
let shake = 0, hitFlash = 0;

const stars = [];
for (let i = 0; i < 130; i++) {
  stars.push({ x: Math.random(), y: Math.random() * 0.6, s: rand(0.5, 1.8), tw: rand(0, TAU), par: rand(0.05, 0.3) });
}

/* ---------------- input ---------------- */
const keys = { left: false, right: false, boost: false };
let pointerActive = false, pointerX = null;

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown' || k === ' ') e.preventDefault();
  if (state === 'title') { start(); return; }
  if (state === 'over') { if (k === 'r' || k === 'enter' || k === ' ') start(); return; }
  if (k === 'm') { Sound.toggleMute(); return; }
  if (k === 'p' || k === 'escape') { togglePause(); return; }
  if (state !== 'play') return;
  if (k === 'arrowleft' || k === 'a') keys.left = true;
  if (k === 'arrowright' || k === 'd') keys.right = true;
  if (k === ' ') keys.boost = true;
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') keys.left = false;
  if (k === 'arrowright' || k === 'd') keys.right = false;
  if (k === ' ') keys.boost = false;
});

hud.overlay.addEventListener('pointerdown', () => {
  if (state === 'title' || state === 'over') start();
  else if (state === 'pause') togglePause();
});
canvas.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  pointerActive = true; pointerX = e.clientX;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener('pointermove', e => { if (pointerActive) pointerX = e.clientX; });
canvas.addEventListener('pointerup', () => { pointerActive = false; pointerX = null; });
canvas.addEventListener('pointercancel', () => { pointerActive = false; pointerX = null; });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') togglePause();
});

/* ---------------- world ---------------- */
function waveY(x) {
  return H * 0.66
    + Math.sin(x * 0.006 + t * 1.1) * 9
    + Math.sin(x * 0.017 - t * 0.6) * 5
    + Math.sin(x * 0.031 + t * 0.35) * 3;
}

function spawnFrag() {
  fragsArr.push({
    x: W + 40, y: rand(H * 0.68, H - 46), ph: rand(0, TAU),
    hue: (distance * 0.01 + rand(0, 360)) % 360
  });
}
function spawnNight() {
  nights.push({
    x: W + 60, y: rand(H * 0.7, H - 60), ph: rand(0, TAU),
    chase: rand(15, 60), homing: rand(0.35, 0.95), r: rand(13, 19)
  });
}
function spawnIsland() {
  islands.push({
    x: W + rand(80, 300), w: rand(90, 260), h: rand(26, 90),
    bumps: 3 + (rand(0, 3) | 0), tower: Math.random() < 0.5, hueOff: rand(-20, 20)
  });
}
function burst(x, y, n, hue, spd, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3,
      life: rand(life * 0.5, life), max: life, size: rand(1, 3), hue });
  }
}

function collect(f) {
  fragments++;
  combo++; comboT = 2.2;
  const mult = 1 + Math.min(combo, 16) * 0.25;
  const gain = Math.round(10 * mult);
  score += gain;
  raft.glow = clamp(raft.glow + 0.35, 0, 5);
  burst(f.x, f.y, 14, f.hue, 130, 0.9);
  floats.push({ x: f.x, y: f.y - 14, txt: '+' + gain, life: 1.1, hue: f.hue });
  Sound.chime(combo);
  if (Math.random() < 0.45) {
    hud.dreamline.textContent = DREAM_WORDS[(Math.random() * DREAM_WORDS.length) | 0];
    hud.dreamline.classList.remove('pulse');
    void hud.dreamline.offsetWidth;
    hud.dreamline.classList.add('pulse');
  }
}

function hit(n) {
  raft.glow -= 1.1;
  raft.inv = 1.4;
  combo = 0; comboT = 0;
  shake = reducedMotion ? 0 : 11;
  hitFlash = 0.9;
  burst(n.x, n.y, 22, 285, 170, 1.1);
  Sound.thud();
  if (raft.glow <= 0) gameOver();
}

/* ---------------- update ---------------- */
function update(dt) {
  const boost = keys.boost;
  speed = 60 + Math.min(170, distance * 0.004);
  const eff = speed * (boost ? 1.7 : 1);
  distance += eff * dt;
  score += eff * dt * 0.02;

  if (keys.left) raft.vx -= 900 * dt;
  if (keys.right) raft.vx += 900 * dt;
  if (pointerActive && pointerX != null) raft.vx = clamp((pointerX - raft.x) * 6, -430, 430);
  raft.vx *= Math.pow(0.0015, dt);
  raft.vx = clamp(raft.vx, -430, 430);
  raft.x = clamp(raft.x + raft.vx * dt, 34, W - 34);
  raft.tilt = lerp(raft.tilt, clamp(raft.vx * 0.0009, -0.3, 0.3), Math.min(1, dt * 8));
  raft.y = waveY(raft.x) - 9;
  raft.inv = Math.max(0, raft.inv - dt);

  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

  raft.glow -= dt * (boost ? 0.05 : 0.02);
  if (raft.glow <= 0) { raft.glow = 0; gameOver(); return; }

  fragTimer -= dt;
  if (fragTimer <= 0) { spawnFrag(); fragTimer = rand(0.55, 1.05) * clamp(1 - distance * 0.00004, 0.45, 1); }
  nightTimer -= dt;
  if (nightTimer <= 0) { spawnNight(); nightTimer = rand(1.7, 2.8) * clamp(1 - distance * 0.000055, 0.38, 1); }
  islandTimer -= dt;
  if (islandTimer <= 0) { spawnIsland(); islandTimer = rand(7, 15); }
  emberTimer -= dt;
  if (emberTimer <= 0) {
    emberTimer = 0.14;
    parts.push({ x: raft.x + 10, y: raft.y - 38, vx: rand(-6, 6), vy: rand(-26, -12),
      life: rand(0.8, 1.6), max: 1.6, size: rand(0.8, 1.8), hue: 45 });
  }
  rippleTimer -= dt;
  if (rippleTimer <= 0) {
    rippleTimer = 0.5;
    parts.push({ x: raft.x + rand(-14, 14), y: raft.y + 6, vx: 0, vy: 0,
      life: 0.9, max: 0.9, size: rand(6, 12), hue: (distance * 0.01) % 360, ring: true });
  }

  for (let i = fragsArr.length - 1; i >= 0; i--) {
    const f = fragsArr[i];
    f.x -= eff * dt;
    f.y += Math.sin(t * 2 + f.ph) * 9 * dt;
    const dx = raft.x - f.x, dy = raft.y - f.y, d2 = dx * dx + dy * dy;
    if (d2 < 120 * 120) {
      const d = Math.sqrt(d2) || 1;
      f.x += dx / d * 170 * dt; f.y += dy / d * 170 * dt;
    }
    if (d2 < (raft.r + 11) * (raft.r + 11)) { collect(f); fragsArr.splice(i, 1); continue; }
    if (f.x < -50) fragsArr.splice(i, 1);
  }

  for (let i = nights.length - 1; i >= 0; i--) {
    const n = nights[i];
    n.x -= (eff * 0.9 + n.chase) * dt;
    n.y += clamp(raft.y - n.y, -70, 70) * dt * n.homing * 2 + Math.sin(t * 2.3 + n.ph) * 16 * dt;
    const dx = raft.x - n.x, dy = raft.y - n.y, d2 = dx * dx + dy * dy;
    const rr = raft.r + n.r;
    if (d2 < rr * rr) { if (raft.inv <= 0) hit(n); nights.splice(i, 1); continue; }
    if (n.x < -70) nights.splice(i, 1);
  }

  for (let i = islands.length - 1; i >= 0; i--) {
    islands[i].x -= eff * 0.35 * dt;
    if (islands[i].x < -islands[i].w - 120) islands.splice(i, 1);
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (!p.ring) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt;
      p.vx *= Math.pow(0.2, dt);
    }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt; f.y -= 26 * dt;
    if (f.life <= 0) floats.splice(i, 1);
  }

  shake = Math.max(0, shake - dt * 26);
  hitFlash = Math.max(0, hitFlash - dt * 1.6);

  hud.score.textContent = Math.floor(score);
  hud.frags.textContent = fragments;
  hud.glow.style.width = (raft.glow / 5 * 100) + '%';
  hud.glowWrap.classList.toggle('low', raft.glow < 1.3);
  hud.combo.textContent = combo >= 4 ? 'x' + (1 + Math.min(combo, 16) * 0.25).toFixed(1).replace(/\.0$/, '') : '';
}

/* ---------------- draw ---------------- */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

  const hue = (distance * 0.01 + t * 1.5) % 360;
  const horizon = H * 0.66;
  let g;

  // sky
  g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, `hsl(${hue}, 55%, 6%)`);
  g.addColorStop(0.55, `hsl(${(hue + 32) % 360}, 58%, 15%)`);
  g.addColorStop(1, `hsl(${(hue + 58) % 360}, 62%, 25%)`);
  ctx.fillStyle = g;
  ctx.fillRect(-30, -30, W + 60, horizon + 30);

  // moon
  const mx = W * 0.76 + Math.sin(t * 0.05) * 24, my = H * 0.17, mr = Math.min(H * 0.05, 42);
  g = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 5);
  g.addColorStop(0, 'hsla(48, 60%, 88%, 0.5)');
  g.addColorStop(1, 'hsla(48, 60%, 88%, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
  ctx.fillStyle = 'hsl(48, 32%, 90%)';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.fillStyle = 'hsla(48, 20%, 70%, 0.5)';
  ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, TAU); ctx.fill();

  // stars (parallax + twinkle)
  for (const s of stars) {
    const sx = (((s.x * W - distance * s.par) % W) + W) % W;
    const a = 0.25 + 0.6 * Math.abs(Math.sin(t * 1.4 + s.tw));
    ctx.fillStyle = `hsla(${hue}, 60%, 88%, ${a})`;
    ctx.fillRect(sx, s.y * horizon, s.s, s.s);
  }

  // aurora bands
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const yb = H * (0.08 + i * 0.075);
    const ah = (hue + 150 + i * 40) % 360;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 26) {
      const y = yb + Math.sin(x * 0.004 + t * (0.35 + i * 0.12) + i * 2.1) * 30
              + Math.sin(x * 0.011 - t * 0.28) * 13;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 26) {
      ctx.lineTo(x, yb + 70 + Math.sin(x * 0.005 - t * 0.45 + i) * 24);
    }
    ctx.closePath();
    g = ctx.createLinearGradient(0, yb - 30, 0, yb + 110);
    g.addColorStop(0, `hsla(${ah}, 85%, 62%, 0)`);
    g.addColorStop(0.5, `hsla(${ah}, 85%, 62%, 0.13)`);
    g.addColorStop(1, `hsla(${ah}, 85%, 62%, 0)`);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // islands (silhouettes, slow parallax)
  for (const isl of islands) {
    const ih = (hue + isl.hueOff + 360) % 360;
    ctx.fillStyle = `hsl(${ih}, 42%, 7%)`;
    ctx.beginPath();
    ctx.moveTo(isl.x - isl.w / 2, horizon + 2);
    for (let b = 0; b <= isl.bumps; b++) {
      const bx = isl.x - isl.w / 2 + (isl.w / isl.bumps) * b;
      ctx.quadraticCurveTo(bx - isl.w / isl.bumps / 2,
        horizon - isl.h * (0.5 + 0.5 * Math.sin(b * 2.3 + isl.w)), bx, horizon - isl.h * 0.35);
    }
    ctx.lineTo(isl.x + isl.w / 2, horizon + 2);
    ctx.closePath();
    ctx.fill();
    if (isl.tower) {
      ctx.fillRect(isl.x + isl.w * 0.18, horizon - isl.h - 34, 10, 40);
      ctx.beginPath();
      ctx.moveTo(isl.x + isl.w * 0.18 - 3, horizon - isl.h - 34);
      ctx.lineTo(isl.x + isl.w * 0.18 + 13, horizon - isl.h - 34);
      ctx.lineTo(isl.x + isl.w * 0.18 + 5, horizon - isl.h - 52);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'hsla(46, 95%, 72%, 0.9)';
      ctx.fillRect(isl.x + isl.w * 0.18 + 3, horizon - isl.h - 26, 3, 4);
      ctx.fillRect(isl.x + isl.w * 0.18 + 4.5, horizon - isl.h - 14, 3, 4);
    }
  }

  // sea
  g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, `hsl(${(hue + 52) % 360}, 55%, 17%)`);
  g.addColorStop(1, `hsl(${(hue + 75) % 360}, 70%, 5%)`);
  ctx.fillStyle = g;
  ctx.fillRect(-30, horizon, W + 60, H - horizon + 30);

  // wave surface
  ctx.beginPath();
  for (let x = -30; x <= W + 30; x += 7) {
    const y = waveY(x);
    x === -30 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `hsla(${(hue + 60) % 360}, 80%, 72%, 0.16)`;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = `hsla(${(hue + 60) % 360}, 85%, 80%, 0.5)`;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // water streaks
  ctx.strokeStyle = `hsla(${(hue + 70) % 360}, 80%, 75%, 0.12)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const sx = (((i * 347 + 101 - distance * (0.5 + i * 0.07)) % (W + 120)) + W + 120) % (W + 120) - 60;
    const sy = horizon + 24 + i * ((H - horizon - 40) / 6);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 26, sy + Math.sin(t * 1.5 + i) * 3, sx + 54, sy);
    ctx.stroke();
  }

  // lantern reflection on water
  ctx.globalCompositeOperation = 'lighter';
  g = ctx.createRadialGradient(raft.x, raft.y + 16, 2, raft.x, raft.y + 16, 60);
  g.addColorStop(0, `hsla(${hue}, 85%, 70%, 0.2)`);
  g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(raft.x, raft.y + 18, 46, 12, 0, 0, TAU); ctx.fill();

  // fragments
  for (const f of fragsArr) {
    const pulse = 1 + 0.16 * Math.sin(t * 4 + f.ph);
    const r = 10 * pulse;
    g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2.6);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, `hsla(${f.hue}, 95%, 72%, 0.9)`);
    g.addColorStop(1, `hsla(${f.hue}, 95%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = `hsla(${f.hue}, 100%, 85%, 0.8)`;
    ctx.lineWidth = 1;
    const rot = t * 1.5 + f.ph;
    for (let k = 0; k < 4; k++) {
      const a = rot + k * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(a) * r * 0.6, f.y + Math.sin(a) * r * 0.6);
      ctx.lineTo(f.x + Math.cos(a) * r * 1.5, f.y + Math.sin(a) * r * 1.5);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // nightmares
  for (const n of nights) {
    ctx.save();
    ctx.translate(n.x, n.y);
    g = ctx.createRadialGradient(0, 0, n.r * 0.2, 0, 0, n.r * 2.2);
    g.addColorStop(0, 'rgba(12, 4, 24, 0.95)');
    g.addColorStop(0.6, 'rgba(30, 8, 52, 0.75)');
    g.addColorStop(1, 'rgba(60, 20, 90, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, n.r * 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'hsla(275, 70%, 45%, 0.55)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.55 + Math.sin(t * 3 + n.ph + k) * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * n.r * 1.2, Math.sin(a) * n.r * 1.2,
        Math.cos(a + Math.sin(t * 2 + k) * 0.4) * n.r * 2.1,
        Math.sin(a + Math.cos(t * 1.7 + k) * 0.4) * n.r * 2.1);
      ctx.stroke();
    }
    ctx.fillStyle = 'hsla(310, 100%, 82%, 0.85)';
    ctx.beginPath(); ctx.arc(-n.r * 0.35, -n.r * 0.2, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(n.r * 0.35, -n.r * 0.2, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // raft + dreamer + lantern
  const blink = raft.inv > 0 && Math.floor(t * 12) % 2 === 0;
  ctx.save();
  ctx.translate(raft.x, raft.y);
  ctx.rotate(raft.tilt);
  if (blink) ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'lighter';
  g = ctx.createRadialGradient(10, -34, 1, 10, -34, 46);
  g.addColorStop(0, 'hsla(45, 100%, 70%, 0.55)');
  g.addColorStop(1, 'hsla(45, 100%, 60%, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-40, -84, 100, 100);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'hsl(26, 40%, 30%)';
  rr(-27, -4, 54, 8, 3); ctx.fill();
  ctx.fillStyle = 'hsl(30, 45%, 40%)';
  rr(-24, 3, 48, 7, 3); ctx.fill();
  ctx.fillStyle = 'hsl(34, 50%, 48%)';
  rr(-21, 10, 42, 6, 3); ctx.fill();
  ctx.fillStyle = 'hsl(255, 25%, 14%)';
  ctx.beginPath(); ctx.arc(-7, -9, 4.2, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-13, -4); ctx.quadraticCurveTo(-4, -14, 6, -5); ctx.quadraticCurveTo(2, -3, -13, -4);
  ctx.fill();
  ctx.strokeStyle = 'hsl(28, 35%, 26%)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(10, -30); ctx.stroke();
  ctx.fillStyle = 'hsl(38, 30%, 25%)';
  ctx.fillRect(7, -38, 6, 9);
  ctx.fillStyle = 'hsl(48, 100%, 72%)';
  ctx.fillRect(8.5, -36.5, 3, 6);
  ctx.restore();

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.ring) {
      ctx.strokeStyle = `hsla(${p.hue}, 80%, 75%, ${a * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (1 - a) * 16, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 0.4, 0, TAU); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // floating score text
  ctx.font = 'italic 14px Georgia, serif';
  ctx.textAlign = 'center';
  for (const f of floats) {
    ctx.fillStyle = `hsla(${f.hue}, 95%, 80%, ${clamp(f.life, 0, 1)})`;
    ctx.fillText(f.txt, f.x, f.y);
  }

  ctx.restore();

  // vignette
  g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(3, 1, 10, 0)');
  g.addColorStop(1, 'rgba(3, 1, 10, 0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (hitFlash > 0) {
    ctx.fillStyle = `hsla(300, 85%, 65%, ${hitFlash * 0.22})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------- state transitions ---------------- */
function showOverlay(html) { hud.overlay.innerHTML = html; hud.overlay.classList.add('show'); }
function hideOverlay() { hud.overlay.classList.remove('show'); }

function start() {
  Sound.init();
  state = 'play';
  distance = 0; score = 0; fragments = 0; combo = 0; comboT = 0;
  speed = 60; shake = 0; hitFlash = 0;
  fragsArr.length = nights.length = parts.length = floats.length = islands.length = 0;
  raft.x = W / 2; raft.vx = 0; raft.glow = 3; raft.inv = 0; raft.tilt = 0;
  fragTimer = 0.7; nightTimer = 3.2; islandTimer = 2.5; emberTimer = 0; rippleTimer = 0.2;
  hideOverlay();
}

function gameOver() {
  if (state !== 'play') return;
  state = 'over';
  const sc = Math.floor(score);
  if (sc > best) {
    best = sc;
    try { localStorage.setItem('dreamraft.best', String(best)); } catch (e) {}
  }
  Sound.fade();
  showOverlay(`<div class="card">
    <h1>the raft fades&hellip;</h1>
    <p class="big">${sc}</p>
    <p>best ${best} &middot; ${fragments} fragments &middot; ${Math.floor(distance / 50)}m drifted</p>
    <p class="hint">press R or tap to drift again</p>
  </div>`);
}

function togglePause() {
  if (state === 'play') {
    state = 'pause';
    showOverlay('<div class="card"><h1>drifting&hellip;</h1><p class="hint">press P to continue</p></div>');
  } else if (state === 'pause') {
    state = 'play';
    hideOverlay();
  }
}

/* ---------------- main loop ---------------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  t += dt;
  if (state === 'play') update(dt);
  draw();
}
requestAnimationFrame(frame);
