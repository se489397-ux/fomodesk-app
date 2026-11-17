// Hand-drawn canvas charts (STEP 10): balance line with marks, 1-min candles with exit line. No libraries.
const Charts = (() => {
  const C = {green: '#00d35a', red: '#ff453a', blue: '#0a84ff', orange: '#ff9f0a', t2: 'rgba(235,235,245,0.6)',
             t3: 'rgba(235,235,245,0.3)', card: '#1c1c1e'};
  function setup(cv) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    return [g, r.width, r.height];
  }
  function line(cv, d) {
    const [g, W, H] = setup(cv);
    const pts = (d.points || []).slice();
    if (d.now) pts.push(d.now);
    if (pts.length < 2) {
      g.strokeStyle = C.t3; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(16, H * .55); g.lineTo(W - 16, H * .55); g.stroke();
      return;
    }
    const top = 44, bot = 14, l = 16, r = 16;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
    let lo = Math.min(d.start, ...pts.map(p => p[1])), hi = Math.max(d.start, ...pts.map(p => p[1]));
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * .12; lo -= pad; hi += pad;
    const X = t => l + (W - l - r) * (t - t0) / Math.max(1, t1 - t0), Y = v => top + (H - top - bot) * (1 - (v - lo) / (hi - lo));
    // dashed start line
    g.strokeStyle = C.t3; g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(l, Y(d.start)); g.lineTo(W - r, Y(d.start)); g.stroke(); g.setLineDash([]);
    // gradient under line
    const grad = g.createLinearGradient(0, top, 0, H);
    grad.addColorStop(0, 'rgba(0,211,90,0.28)'); grad.addColorStop(1, 'rgba(0,211,90,0)');
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.lineTo(X(pts[pts.length - 1][0]), H); g.lineTo(X(pts[0][0]), H); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.strokeStyle = C.green; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    const last = pts[pts.length - 1]; g.fillStyle = C.green; g.beginPath(); g.arc(X(last[0]), Y(last[1]), 4, 0, 7); g.fill();
    // marks: stacked rows, never overlapping
    g.font = '600 11px -apple-system,BlinkMacSystemFont,sans-serif';
    const rows = [];
    (d.marks || []).forEach(m => {
      if (m.ts < t0) return;
      const x = X(Math.min(m.ts, t1)), w = g.measureText(m.text).width + 12;
      let x0 = Math.min(Math.max(l, x - w / 2), W - r - w), row = 0;
      while ((rows[row] || []).some(([a, b]) => x0 < b + 4 && x0 + w > a - 4)) row++;
      (rows[row] = rows[row] || []).push([x0, x0 + w]);
      const y = 4 + row * 20, col = C[m.color] || C.blue;
      g.fillStyle = col + '33'; round(g, x0, y, w, 17, 8); g.fill();
      g.fillStyle = col; g.fillText(m.text, x0 + 6, y + 12.5);
      let v = null; for (const p of pts) if (p[0] <= m.ts) v = p[1];
      if (v != null) { g.strokeStyle = col + '88'; g.beginPath(); g.moveTo(x, y + 17); g.lineTo(x, Y(v)); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(x, Y(v), 3, 0, 7); g.fill(); }
    });
  }
  function candles(cv, cs, exitLine, entry) {
    const [g, W, H] = setup(cv);
    if (!cs.length) { g.fillStyle = C.t3; g.font = '13px -apple-system,sans-serif'; g.textAlign = 'center'; g.fillText('No prices yet', W / 2, H / 2); return; }
    const l = 8, r = 78, top = 10, bot = 10;
    let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= .99; }
    const Y = v => top + (H - top - bot) * (1 - (v - lo) / (hi - lo));
    const n = Math.max(cs.length, 20), cw = (W - l - r) / n;
    cs.forEach((c, i) => {
      const x = l + cw * (i + n - cs.length) + cw / 2, up = c[4] >= c[1], col = up ? C.green : C.red;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(c[2])); g.lineTo(x, Y(c[3])); g.stroke();
      const y0 = Y(Math.max(c[1], c[4])), y1 = Y(Math.min(c[1], c[4]));
      g.fillRect(x - cw * .35, y0, cw * .7, Math.max(1, y1 - y0));
    });
    g.font = '11px -apple-system,sans-serif'; g.fillStyle = C.t2;
    [hi, lo].forEach(v => { if (!exitLine || Math.abs(Y(v) - Y(exitLine)) > 14) g.fillText(fmtP(v), W - r + 6, Y(v) + 4); });
    if (exitLine) {
      g.strokeStyle = C.orange; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(l, Y(exitLine)); g.lineTo(W - r, Y(exitLine)); g.stroke(); g.setLineDash([]);
      g.fillStyle = C.orange; g.fillText('exit ' + fmtP(exitLine), W - r + 6, Y(exitLine) + 4);
    }
  }
  function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fmtP(v) { return v >= 1 ? v.toFixed(4) : v >= 0.001 ? v.toPrecision(3) : v.toExponential(2); }
  function ring(cv, score, min) {
    const [g, W, H] = setup(cv), r = Math.min(W, H) / 2 - 4;
    g.lineWidth = 5; g.strokeStyle = '#2c2c2e'; g.beginPath(); g.arc(W / 2, H / 2, r, 0, 7); g.stroke();
    if (score != null) {
      g.strokeStyle = score >= min ? C.green : score >= 50 ? C.orange : C.red;
      g.beginPath(); g.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * score / 100); g.stroke();
    }
    g.fillStyle = '#fff'; g.font = '700 15px -apple-system,sans-serif'; g.textAlign = 'center'; g.fillText(score == null ? '–' : score, W / 2, H / 2 + 5);
  }
  return {line, candles, ring};
})();
