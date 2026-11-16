// node tools/rs-check/test/core.test.js
const C = require('../core.js');
let fail = 0;
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: got ${got.toFixed(3)} want ${want} (tol ${tol})`);
}

// 点滅：縞の画像（読み出しは縦）、周辺減光とノイズつき
function stripes(w, h, period, axis, { duty = 0.5, square = false, noise = 4, contrast = 0.3, seed = 1 } = {}) {
  const r = rng(seed), luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = axis === 'v' ? y : x;
    const ph = ((t / period) % 1 + 1) % 1;
    const s = square ? (ph < duty ? 1 : -1) : Math.cos(2 * Math.PI * t / period);
    const vx = (x - w / 2) / w, vy = (y - h / 2) / h;
    const vig = 1 - 0.8 * (vx * vx + vy * vy);
    luma[y * w + x] = 140 * vig * (1 + contrast * s) + noise * gauss(r);
  }
  return luma;
}

for (const [P, axis] of [[37.3, 'v'], [12.7, 'v'], [91.4, 'h'], [5.6, 'v']]) {
  const w = 320, h = 1080;
  const W = axis === 'v' ? w : h, H = axis === 'v' ? h : w;
  const l = stripes(W, H, P, axis);
  const d = C.detectAxis(l, W, H);
  if (d.axis !== axis) { fail++; console.log('FAIL axis', P, d); } else console.log('OK   axis', axis, 'sure', d.sure);
  const res = C.analyzeSignal(C.profile(l, W, H, axis));
  check(`flicker P=${P} FFT`, res.pFft, P, P * 0.005);
  check(`flicker P=${P} ACF`, res.pAcf, P, P * 0.02);
}

// PWM（デューティ 0.2）
{
  const P = 48.2, l = stripes(200, 1080, P, 'v', { square: true, duty: 0.2, contrast: 0.5 });
  const res = C.analyzeSignal(C.profile(l, 200, 1080, 'v'));
  check('PWM period', res.pFft, P, P * 0.005);
  check('PWM duty', res.duty, 0.2, 0.04);
}

// 周期が3個しか入らない場合（下限付近）
{
  const P = 330, l = stripes(100, 1080, P, 'v');
  const res = C.analyzeSignal(C.profile(l, 100, 1080, 'v'));
  check('few cycles FFT', res.pFft, P, P * 0.03);
  check('few cycles ACF', res.pAcf, P, P * 0.05);
}

// 縞なし（直流点灯）：判定できないこと
{
  const r = rng(3), w = 200, h = 1080, l = new Float32Array(w * h);
  for (let i = 0; i < l.length; i++) l[i] = 140 + 4 * gauss(r);
  const d = C.detectAxis(l, w, h);
  const res = C.analyzeSignal(C.profile(l, w, h, 'v'));
  console.log(`${!d.sure ? 'OK  ' : 'FAIL'} no-stripes sure=${d.sure} contrast=${res.contrast.toFixed(4)}`);
  if (d.sure) fail++;
}

// 振動：明るい背景に暗い棒。読み出しは縦、棒は縦向き、横に振れる
{
  const w = 240, h = 1080, P = 63.5, A = 6, r = rng(5), l = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const c = 100 + 0.02 * y + A * Math.sin(2 * Math.PI * y / P);
    for (let x = 0; x < w; x++) {
      const inside = x > c && x < c + 30;
      l[y * w + x] = (inside ? 30 : 220) + 5 * gauss(r);
    }
  }
  const e = C.edgeTrace(l, w, h, 'v');
  const res = C.analyzeSignal(e.trace);
  check('vibration period', res.pFft, P, P * 0.01);
  check('vibration amp(px)', res.amp, A, 1.0);
}

console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
