// ローリングシャッター・オシロ 検証ツール：解析コア
// DOM に依存しない純粋な関数だけを置く（node でテストできるように）。
// 座標の約束：axis = 'v' は「読み出しが画像の縦（行）方向」、'h' は「横（列）方向」。

(function (root) {
  'use strict';

  // RGBA の画素列から輝度を取り出す（ガンマ補正は戻さない。周期の測定には影響しない）
  function lumaOf(data, count) {
    const out = new Float32Array(count);
    for (let i = 0, j = 0; i < count; i++, j += 4) {
      out[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    }
    return out;
  }

  // 読み出し方向に沿った明るさの分布（直交する向きに平均）
  function profile(luma, w, h, axis) {
    if (axis === 'v') {
      const p = new Float64Array(h);
      for (let y = 0; y < h; y++) {
        let s = 0;
        const o = y * w;
        for (let x = 0; x < w; x++) s += luma[o + x];
        p[y] = s / w;
      }
      return p;
    }
    const p = new Float64Array(w);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) p[x] += luma[o + x];
    }
    for (let x = 0; x < w; x++) p[x] /= h;
    return p;
  }

  function mean(a) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  function quantiles(a, qs) {
    const step = Math.max(1, Math.floor(a.length / 20000));
    const s = [];
    for (let i = 0; i < a.length; i += step) if (Number.isFinite(a[i])) s.push(a[i]);
    s.sort((x, y) => x - y);
    return qs.map(q => s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN);
  }

  // 2次式の最小二乗でゆるやかな明るさむら（周辺減光など）を除く
  function polyDetrend(sig) {
    const n = sig.length;
    if (n < 4) return Float64Array.from(sig, v => v - mean(sig));
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    for (let i = 0; i < n; i++) {
      const t = (2 * i) / (n - 1) - 1, t2 = t * t, v = sig[i];
      S0 += 1; S1 += t; S2 += t2; S3 += t2 * t; S4 += t2 * t2;
      T0 += v; T1 += v * t; T2 += v * t2;
    }
    const c = solve3([[S0, S1, S2], [S1, S2, S3], [S2, S3, S4]], [T0, T1, T2]);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = (2 * i) / (n - 1) - 1;
      out[i] = sig[i] - (c[0] + c[1] * t + c[2] * t * t);
    }
    return out;
  }

  function solve3(A, b) {
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }

  // 1周期ぶんの移動平均を引く。端の半周期ぶんは使えないので切り落とす。
  // 戻り値の offset は、元の配列での開始位置。
  function periodDetrend(sig, period) {
    const n = sig.length, win = Math.max(2, Math.round(period));
    const half = Math.floor(win / 2);
    const start = half, end = n - (win - half);
    if (end - start < 2 * win) return null;
    const out = new Float64Array(end - start);
    let s = 0;
    for (let i = 0; i < win; i++) s += sig[i];
    // 窓 [i-half, i-half+win) の平均
    for (let i = start; i < end; i++) {
      out[i - start] = sig[i] - s / win;
      s += sig[i - half + win] - sig[i - half];
    }
    return { sig: out, offset: start };
  }

  // 自己相関（偏りのある推定。ラグとともに減衰するので最初の山が最大になりやすい）
  function autocorr(x, maxLag) {
    const n = x.length;
    maxLag = Math.min(maxLag, n - 1);
    let e = 0;
    for (let i = 0; i < n; i++) e += x[i] * x[i];
    const r = new Float64Array(maxLag + 1);
    if (e === 0) return r;
    for (let k = 0; k <= maxLag; k++) {
      let s = 0;
      for (let i = 0; i + k < n; i++) s += x[i] * x[i + k];
      r[k] = s / e;
    }
    return r;
  }

  function parabolic(y0, y1, y2) {
    const d = y0 - 2 * y1 + y2;
    if (d === 0) return 0;
    const delta = 0.5 * (y0 - y2) / d;
    return Math.max(-0.5, Math.min(0.5, delta));
  }

  // 自己相関の最初の山：最初に負になった後の極大のうち、最大値の8割以上ある最初のもの
  // （周期が数行しかないと、整数ラグの都合で2周期目以降の山が高く出ることがあるため）
  function acfPeak(r) {
    let z = -1;
    for (let k = 1; k < r.length; k++) if (r[k] < 0) { z = k; break; }
    if (z < 0) return null;
    let gmax = -Infinity;
    for (let k = z; k < r.length - 1; k++) if (r[k] > gmax) gmax = r[k];
    if (gmax <= 0) return null;
    let best = -1;
    for (let k = Math.max(1, z); k < r.length - 1; k++) {
      if (r[k] >= r[k - 1] && r[k] >= r[k + 1] && r[k] >= 0.8 * gmax) { best = k; break; }
    }
    if (best < 1) return null;
    const bv = r[best];
    const d = parabolic(r[best - 1], r[best], r[best + 1]);
    return { period: best + d, strength: bv };
  }

  // 複素 FFT（基数2・その場で計算）
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // ハン窓＋ゼロ詰めのパワースペクトルから周期を求める
  function fftPeak(x, minPeriod, maxPeriod) {
    const n = x.length;
    let M = 1;
    while (M < n) M <<= 1;
    M = Math.min(M * 8, 1 << 17);
    const re = new Float64Array(M), im = new Float64Array(M);
    for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    fft(re, im);
    const half = M / 2;
    const mag = new Float64Array(half);
    for (let k = 0; k < half; k++) mag[k] = re[k] * re[k] + im[k] * im[k];
    const kLo = Math.max(1, Math.floor(M / maxPeriod)), kHi = Math.min(half - 2, Math.ceil(M / minPeriod));
    let best = -1, bv = -Infinity;
    for (let k = kLo; k <= kHi; k++) if (mag[k] > bv) { bv = mag[k]; best = k; }
    if (best < 1) return null;
    const L = v => Math.log(v + 1e-30);
    const d = parabolic(L(mag[best - 1]), L(mag[best]), L(mag[best + 1]));
    const kk = best + d;
    // ピークの鋭さの目安：ピークのパワー ÷ 探索範囲のパワーの中央値
    const band = Array.from(mag.subarray(kLo, kHi + 1)).sort((a, b) => a - b);
    const med = band[Math.floor(band.length / 2)] || 1e-30;
    return { period: M / kk, snr: bv / med, M, mag, kLo, kHi };
  }

  // 1本の信号（明るさの分布、または輪郭の変位）を解析する
  function analyzeSignal(raw, opts = {}) {
    const n = raw.length;
    const minPeriod = opts.minPeriod || 2.5;
    const maxPeriod = opts.maxPeriod || n / 1.5;
    const m = mean(raw);
    let det = polyDetrend(raw);
    let offset = 0;
    let first = fftPeak(det, minPeriod, maxPeriod);
    // 周期の見当がついたら、1周期ぶんの移動平均で明るさむらを除き直す
    if (first && n / first.period >= 4) {
      const pd = periodDetrend(raw, first.period);
      if (pd) {
        det = polyDetrend(pd.sig);
        offset = pd.offset;
      }
    }
    const fp = fftPeak(det, minPeriod, Math.min(maxPeriod, det.length / 1.5));
    const acf = autocorr(det, Math.floor(det.length / 2));
    const ap = acfPeak(acf);
    const [q05, q50, q95] = quantiles(det, [0.05, 0.5, 0.95]);
    const amp = (q95 - q05) / 2;
    const mid = (q95 + q05) / 2;
    let above = 0;
    for (let i = 0; i < det.length; i++) if (det[i] > mid) above++;
    const pFft = fp ? fp.period : NaN, pAcf = ap ? ap.period : NaN;
    const agree = Number.isFinite(pFft) && Number.isFinite(pAcf) ? Math.abs(pFft - pAcf) / pFft : NaN;
    return {
      n, offset, mean: m, detrended: det, acf,
      spectrum: fp,
      pFft, pAcf,
      period: Number.isFinite(pFft) ? pFft : pAcf,
      agree,
      acfStrength: ap ? ap.strength : 0,
      snr: fp ? fp.snr : 0,
      amp,
      contrast: m > 0 ? amp / m : NaN,
      duty: det.length ? above / det.length : NaN,
      median: q50,
    };
  }

  // 方向の自動判定：両方向の分布を作り、周期性の強いほうを読み出し方向とする
  function detectAxis(luma, w, h) {
    const res = {};
    for (const axis of ['v', 'h']) {
      const p = profile(luma, w, h, axis);
      if (p.length < 16) { res[axis] = { strength: 0, contrast: 0 }; continue; }
      const det = polyDetrend(p);
      const ap = acfPeak(autocorr(det, Math.floor(det.length / 2)));
      const [a, b] = quantiles(det, [0.05, 0.95]);
      const m = mean(p);
      res[axis] = { strength: ap ? ap.strength : 0, contrast: m > 0 ? (b - a) / 2 / m : 0 };
    }
    const score = a => res[a].strength * Math.min(1, res[a].contrast * 20);
    const axis = score('v') >= score('h') ? 'v' : 'h';
    const sure = Math.max(res.v.strength, res.h.strength) >= 0.2 && Math.abs(score('v') - score('h')) > 0.05;
    return { axis, sure, v: res.v, h: res.h };
  }

  // 振動モード：読み出し方向の各行（列）で、明暗の境目の位置を求める
  function edgeTrace(luma, w, h, axis) {
    const n = axis === 'v' ? h : w;
    const L = axis === 'v' ? w : h;
    const [lo, hi] = quantiles(luma, [0.05, 0.95]);
    const thr = (lo + hi) / 2;
    const line = new Float64Array(L);
    const trace = new Float64Array(n).fill(NaN);
    let prev = null, missing = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < L; j++) line[j] = axis === 'v' ? luma[i * w + j] : luma[j * w + i];
      // 3点平均でノイズを抑える
      let a0 = line[0], a1 = line[0];
      for (let j = 0; j < L; j++) {
        const a2 = line[Math.min(L - 1, j + 1)];
        const v = (a0 + a1 + a2) / 3;
        a0 = a1; a1 = a2; line[j] = v;
      }
      let pick = NaN, bestD = Infinity;
      for (let j = 0; j + 1 < L; j++) {
        const u = line[j] - thr, v = line[j + 1] - thr;
        if (u === 0 || u * v < 0) {
          const pos = j + (u === 0 ? 0 : u / (u - v));
          if (prev === null) { pick = pos; break; }
          const d = Math.abs(pos - prev);
          if (d < bestD) { bestD = d; pick = pos; }
        }
      }
      if (Number.isFinite(pick)) { trace[i] = pick; prev = pick; } else missing++;
    }
    // 見つからなかった行は前後から直線で補う
    let lastI = -1;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(trace[i])) continue;
      if (lastI >= 0 && i - lastI > 1) {
        for (let k = lastI + 1; k < i; k++) trace[k] = trace[lastI] + (trace[i] - trace[lastI]) * (k - lastI) / (i - lastI);
      } else if (lastI < 0) {
        for (let k = 0; k < i; k++) trace[k] = trace[i];
      }
      lastI = i;
    }
    if (lastI >= 0) for (let k = lastI + 1; k < n; k++) trace[k] = trace[lastI];
    return { trace, missing, thr, edgeContrast: hi + lo > 0 ? (hi - lo) / (hi + lo) : 0, found: lastI >= 0 };
  }

  const api = { lumaOf, profile, polyDetrend, periodDetrend, autocorr, acfPeak, fft, fftPeak, analyzeSignal, detectAxis, edgeTrace, quantiles, mean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RSCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
