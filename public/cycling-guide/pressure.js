// Illustrative plantar pressure map of the right foot (sole view, big toe on the left).
// Load under each anatomical region falls off with distance from the pedal spindle,
// spread by the stiff cycling-shoe sole, and scales with the current pedal force.

// Foot outline in unit coordinates: u 0→1 medial→lateral, v 0→1 toe tip→heel.
const OUTLINE = [[.30, .02], [.42, .03], [.52, .06], [.62, .09], [.72, .14], [.80, .20], [.84, .28], [.80, .40], [.75, .55], [.73, .70],
  [.73, .84], [.68, .95], [.50, .995], [.33, .96], [.26, .86], [.27, .72], [.28, .60], [.22, .48], [.16, .34], [.16, .22], [.20, .10]];
const TOE_LINE = .19;
export const BALL_V = .27; // metatarsal heads

const REGIONS = [
  { name: '大脚趾', u: .30, v: .08, w: .55, r: .07 },
  { name: '其余脚趾', u: .58, v: .13, w: .32, r: .09 },
  { name: '第一跖骨头', u: .26, v: .27, w: 1, r: .075 },
  { name: '第二、三跖骨头', u: .46, v: .26, w: .95, r: .08 },
  { name: '第四、五跖骨头', u: .68, v: .31, w: .6, r: .08 },
  { name: '足弓外侧', u: .68, v: .55, w: .45, r: .1 },
  { name: '足弓内侧（鞋垫支撑）', u: .36, v: .55, w: .3, r: .09 },
  { name: '足跟', u: .50, v: .87, w: .22, r: .1 },
];

const RAMP = [[0, [12, 30, 48]], [.2, [20, 70, 140]], [.4, [40, 170, 190]], [.6, [150, 220, 70]], [.8, [250, 200, 60]], [1, [255, 90, 60]]];
function ramp(t) {
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
      const k = (t - t0) / (t1 - t0);
      return c0.map((c, j) => c + (c1[j] - c) * k);
    }
  }
  return RAMP[RAMP.length - 1][1];
}

const GW = 60, GH = 120;
const anatomy = (u, v) => REGIONS.reduce((sum, r) => sum + r.w * Math.exp(-((u - r.u) ** 2 + (v - r.v) ** 2) / (2 * r.r ** 2)), 0);
const BASE = new Float32Array(GW * GH), ROW = new Float32Array(GH);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  const a = anatomy((x + .5) / GW, (y + .5) / GH);
  BASE[y * GW + x] = a;
  ROW[y] += a;
}

// The pedal carries the load across the rows of the sole above it (spread by the stiff
// shoe); each row shares its load by how much tissue bears weight there. The total is
// normalised, so the same force on a narrow patch (toes) gives a higher local pressure.
function computeField(spindleV) {
  const out = new Float32Array(GW * GH);
  let total = 0;
  for (let y = 0; y < GH; y++) {
    const v = (y + .5) / GH;
    const row = Math.exp(-((v - spindleV) ** 2) / (2 * .07 ** 2));
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      out[i] = .9 * BASE[i] / ROW[y] * row + .1 * BASE[i] / 40;
      total += out[i];
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
const sample = (field, u, v) => field[Math.min(GH - 1, Math.floor(v * GH)) * GW + Math.min(GW - 1, Math.floor(u * GW))];
const REFERENCE = computeField(BALL_V);
const REFERENCE_PEAK = Math.max(...REFERENCE);
const METRICS = [['跖骨头', .26, .27], ['脚趾', .30, .08], ['足弓', .68, .55]];

export class PressureMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.grid = document.createElement('canvas');
    this.grid.width = GW; this.grid.height = GH;
    this.path = null;
  }

  outline(w, h, pad) {
    const path = new Path2D();
    const pts = OUTLINE.map(([u, v]) => [pad + u * (w - 2 * pad), pad + v * (h - 2 * pad)]);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    path.moveTo(...mid(pts[pts.length - 1], pts[0]));
    pts.forEach((p, i) => path.quadraticCurveTo(...p, ...mid(p, pts[(i + 1) % pts.length])));
    path.closePath();
    return path;
  }

  /** ballAhead: metres the ball of the foot sits ahead of the spindle; force: 0–1. */
  draw({ ballAhead, footLength = .26, force = 1 }) {
    const canvas = this.canvas, dpr = Math.min(devicePixelRatio, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 10, fw = Math.min(w - 96, h * .44), fx = 48 + (w - 96 - fw) / 2;
    const spindleV = BALL_V + ballAhead / footLength;
    const field = computeField(spindleV);

    // Low-res field, then scaled up smoothly and clipped to the foot.
    const g = this.grid.getContext('2d');
    const image = g.createImageData(GW, GH);
    let cu = 0, cv = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const p = field[y * GW + x];
      cu += (x + .5) / GW * p; cv += (y + .5) / GH * p;
      const [r, gg, b] = ramp(Math.min(1, p / REFERENCE_PEAK * force));
      image.data.set([r, gg, b, 255], (y * GW + x) * 4);
    }
    g.putImageData(image, 0, 0);
    const path = this.outline(fw, h, pad);
    ctx.save();
    ctx.translate(fx, 0);
    ctx.save();
    ctx.clip(path);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.grid, pad, pad, fw - 2 * pad, h - 2 * pad);
    ctx.restore();
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1.2;
    ctx.stroke(path);
    const X = u => pad + u * (fw - 2 * pad), Y = v => pad + v * (h - 2 * pad);
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(X(.2), Y(TOE_LINE)); ctx.lineTo(X(.8), Y(TOE_LINE)); ctx.stroke();

    // Pedal spindle and metatarsal-head line.
    ctx.setLineDash([]);
    ctx.strokeStyle = '#e6ebef'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(-.06), Y(spindleV)); ctx.lineTo(X(1.06), Y(spindleV)); ctx.stroke();
    ctx.strokeStyle = '#ffa96a'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(.12), Y(BALL_V)); ctx.lineTo(X(.86), Y(BALL_V)); ctx.stroke();
    ctx.setLineDash([]);
    // Centre of pressure.
    {
      const px = X(cu), py = Y(cv);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py); ctx.moveTo(px, py - 10); ctx.lineTo(px, py + 10); ctx.stroke();
    }
    ctx.font = '11px Inter, "PingFang SC", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const close = Math.abs(spindleV - BALL_V) < .06;
    ctx.fillStyle = '#e6ebef'; ctx.fillText('踏板轴', X(-.1), Y(spindleV) + (close && spindleV >= BALL_V ? 7 : close ? -7 : 0));
    ctx.fillStyle = '#ffa96a'; ctx.fillText('跖骨头', X(-.1), Y(BALL_V) + (close && spindleV >= BALL_V ? -7 : close ? 7 : 0));
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fa6b5'; ctx.fillText('内侧', X(0) - 6, Y(.97)); ctx.fillText('外侧', X(.86), Y(.97));
    ctx.restore();

    // Legend.
    const lx = w - 16, ly = 24, lh = h - 60;
    const grad = ctx.createLinearGradient(0, ly + lh, 0, ly);
    RAMP.forEach(([t, c]) => grad.addColorStop(t, `rgb(${c.join(',')})`));
    ctx.fillStyle = grad; ctx.fillRect(lx - 6, ly, 6, lh);
    ctx.fillStyle = '#8fa6b5'; ctx.textAlign = 'right';
    ctx.fillText('高', lx - 10, ly + 4); ctx.fillText('低', lx - 10, ly + lh - 4);
    ctx.textAlign = 'left';

    // Pressure in each region relative to the ball-over-spindle position.
    return { regions: METRICS.map(([name, u, v]) => ({ name, ratio: sample(field, u, v) / sample(REFERENCE, u, v) })), spindleV };
  }
}
