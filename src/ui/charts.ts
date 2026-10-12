/** Tiny dependency-free SVG charts (bars / lines / areas over shared categories). */
export interface Series {
  label: string;
  values: number[];
  color: string;
  type: 'bar' | 'line' | 'area';
  dashed?: boolean;
}

export interface ChartOptions {
  categories: string[];
  series: Series[];
  height?: number;
  yFormat?: (n: number) => string;
  title: string;
  highlight?: number;
  /** แสดงป้ายแกน X ทุก n หมวด */
  labelEvery?: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v / step) * step);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

export function chart(o: ChartOptions): string {
  const W = 440;
  const H = o.height ?? 220;
  const padL = 46;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const fmt = o.yFormat ?? ((n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 }));
  const all = o.series.flatMap((s) => s.values).filter(Number.isFinite);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const n = o.categories.length;
  const bw = (W - padL - padR) / n;
  const x = (i: number) => padL + bw * (i + 0.5);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin || 1));
  const every = o.labelEvery ?? Math.ceil(n / 12);

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}">`;
  for (const t of ticks) {
    svg += `<line class="grid${t === 0 ? ' zero' : ''}" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="ytick" x="${padL - 5}" y="${y(t) + 3.5}" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  if (o.highlight != null && o.highlight >= 0 && o.highlight < n) {
    svg += `<rect class="hl" x="${x(o.highlight) - bw / 2}" y="${padT}" width="${bw}" height="${H - padT - padB}"/>`;
  }
  o.categories.forEach((c, i) => {
    if (i % every === 0) svg += `<text class="xtick" x="${x(i)}" y="${H - 7}" text-anchor="middle">${esc(c)}</text>`;
  });
  const bars = o.series.filter((s) => s.type === 'bar');
  const gw = (bw * 0.78) / Math.max(1, bars.length);
  bars.forEach((s, k) => {
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const bx = x(i) - (bw * 0.78) / 2 + k * gw;
      const y0 = y(0);
      const y1 = y(v);
      svg += `<rect x="${bx.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${Math.max(1, gw - 1).toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" rx="1.5" fill="${s.color}"><title>${esc(`${o.categories[i]} • ${s.label}: ${fmt(v)}`)}</title></rect>`;
    });
  });
  for (const s of o.series.filter((s) => s.type !== 'bar')) {
    const idx = s.values.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const pts = idx.map((i) => `${x(i).toFixed(1)},${y(s.values[i]!).toFixed(1)}`);
    if (s.type === 'area') {
      svg += `<path d="M${x(idx[0]!)},${y(0)} L${pts.join(' L')} L${x(idx[idx.length - 1]!)},${y(0)} Z" fill="${s.color}" fill-opacity="0.28" stroke="none"/>`;
    }
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      svg += `<circle cx="${x(i)}" cy="${y(v)}" r="6" fill="transparent"><title>${esc(`${o.categories[i]} • ${s.label}: ${fmt(v)}`)}</title></circle>`;
    });
  }
  svg += `</svg>`;
  const legend = o.series
    .map((s) => `<span class="lg"><i style="background:${s.color}${s.type === 'area' ? ';opacity:.5' : ''}"></i>${esc(s.label)}</span>`)
    .join('');
  return `<figure class="chart-wrap"><figcaption>${esc(o.title)}</figcaption>${svg}<div class="legend">${legend}</div></figure>`;
}
