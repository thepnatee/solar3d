import { DATA_AS_OF, PROVINCES, SOURCES } from '../data/seed';
import {
  LOAD_SHAPES,
  MONTH_NAMES_TH,
  MONTH_SHORT_TH,
  DAYS_IN_MONTH,
  billBreakdown,
  estimateCapex,
  getLoadShape,
  hourlyLoadFractions,
  marginalRate,
  type DayNightSplit,
  type DayShiftRow,
  type OfferEvaluation,
  type Recommendation,
  type SimulationContext,
  type SweepOutput,
  type ValidationIssue,
} from '../engine';
import { chart } from './charts';
import { EVIDENCE, SYSTEM, VAT, badge, esc, num, pct, thb, years } from './format';
import type { AppState } from './state';

export interface Model {
  ctx: SimulationContext;
  rec: Recommendation;
  sel: OfferEvaluation | null;
  selIsCustom: boolean;
  confidence: { level: number; label: string };
  issues: ValidationIssue[];
  roofArea: number | null;
  orientation: number;
  panelCount: number;
  capacity: number;
  /** แยกผลกลางวัน/กลางคืนของแพ็กเกจที่เลือก */
  dn: DayNightSplit | null;
  /** จำลองย้ายการใช้ไฟไปกลางวัน (ขนาดแผงเดิม) */
  shift: DayShiftRow[] | null;
}

export const BEARINGS: { deg: number; label: string }[] = [
  { deg: 180, label: 'ทิศใต้ (ดีที่สุด)' },
  { deg: 135, label: 'ตะวันออกเฉียงใต้' },
  { deg: 225, label: 'ตะวันตกเฉียงใต้' },
  { deg: 90, label: 'ทิศตะวันออก' },
  { deg: 270, label: 'ทิศตะวันตก' },
  { deg: 45, label: 'ตะวันออกเฉียงเหนือ' },
  { deg: 315, label: 'ตะวันตกเฉียงเหนือ' },
  { deg: 0, label: 'ทิศเหนือ' },
];

const opt = (v: string | number, label: string, cur: string | number) =>
  `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;

const range = (path: string, min: number, max: number, step: number, unit: string, scale = 1) =>
  `<div class="range-row"><input type="range" data-path="${path}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" aria-label="${esc(unit)}"><output data-out="${path}" data-scale="${scale}" data-unit="${esc(unit)}"></output></div>`;

/* ---------------------------------------------------------------- กรอกข้อมูล (มีคำแนะนำว่าหาจากไหน) */
const help = (title: string, body: string, open = false) =>
  `<details class="help"${open ? ' open' : ''}><summary>💡 ${title}</summary><div class="help-body">${body}</div></details>`;

const appName = (s: AppState) => (s.scenario.utility === 'MEA' ? 'MEA Smart Life (การไฟฟ้านครหลวง)' : 'PEA Smart Plus (การไฟฟ้าส่วนภูมิภาค)');

/** ภาพจำลองบิล ชี้ตำแหน่งตัวเลขที่ต้องใช้ (ตัวเลขคำนวณจากสูตรค่าไฟจริงที่ 787 หน่วย) */
function billMock(): string {
  const b = billBreakdown(787);
  const row = (k: string, v: string, pin = '', hl = false) =>
    `<div class="bm-row${hl ? ' hl' : ''}"><span>${k}</span><b>${v}${pin ? ` <i class="pin">${pin}</i>` : ''}</b></div>`;
  return `<figure class="bill-mock" aria-label="ภาพจำลองบิลค่าไฟ">
    <div class="bm-head">ใบแจ้งค่าไฟฟ้า <small>ภาพจำลองเพื่ออธิบาย — ไม่ใช่บิลจริง</small></div>
    ${row('ประเภทผู้ใช้ไฟฟ้า', '1.2 บ้านอยู่อาศัย', 'D')}
    ${row('เลขอ่านครั้งนี้ / ครั้งก่อน', '45,210 / 44,423')}
    ${row('จำนวนหน่วย (kWh)', '787', 'B', true)}
    ${row('ค่าพลังงานไฟฟ้า', num(b.energy, 2))}
    ${row('ค่า Ft', num(b.ft, 2))}
    ${row('ค่าบริการรายเดือน', num(b.service, 2))}
    ${row('ภาษีมูลค่าเพิ่ม 7%', num(b.vat, 2))}
    ${row('รวมเงินที่ต้องชำระ', num(b.total, 2), 'A', true)}
  </figure>`;
}

export function renderHome(s: AppState): string {
  const months = MONTH_SHORT_TH.map(
    (n, i) => `<label class="mk"><span>${n}</span><input type="number" inputmode="numeric" min="0" step="1" data-path="scenario.monthlyKwh.${i}" data-type="nullable" placeholder="kWh"></label>`,
  ).join('');
  return `
  <details class="card onboard" ${s.meta.visited ? '' : 'open'}>
    <summary><h2>👋 เริ่มต้นใน 3 ขั้น</h2></summary>
    <ol class="steps-list">
      <li><b>หยิบบิลค่าไฟ</b> (กระดาษหรือในแอป ${esc(appName(s))}) — ใช้แค่ <b>ยอดเงิน (A)</b> กับ <b>จำนวนหน่วย (B)</b></li>
      <li><b>บอกว่าใช้ไฟกลางวันมากแค่ไหน</b> — เดาได้ หรือจดเลขมิเตอร์ให้แม่นขึ้น</li>
      <li><b>ดูผล</b> แท็บ "ผล & คำแนะนำ" และ "กลางวัน/กลางคืน" แล้วค่อยขอใบเสนอราคาจากผู้ติดตั้ง</li>
    </ol>
    ${billMock()}
    <p class="muted small">ข้อมูลที่กรอกถูกบันทึกในเบราว์เซอร์เครื่องนี้เท่านั้น (localStorage) ไม่ส่งไปที่ใด — ลบได้ที่ปุ่ม "ล้างข้อมูล" ด้านบน</p>
  </details>

  <section class="card">
    <div class="row between"><h2>ความครบของข้อมูล</h2><span data-show="completeScore"></span></div>
    <div data-show="completeness"></div>
  </section>

  <section class="card" id="sec-bill">
    <h2><span class="step">1</span>ค่าไฟของบ้าน</h2>
    <div class="grid2">
      <label>จังหวัด
        <select data-path="scenario.province">${PROVINCES.map((p) => opt(p.name, p.name, s.scenario.province)).join('')}</select>
      </label>
      <div class="field"><span>การไฟฟ้า</span><b data-show="utility"></b></div>
    </div>
    <label>ค่าไฟเฉลี่ยต่อเดือน (บาท) <i class="pin">A</i></label>
    <div class="chips">${[2000, 3000, 3500, 4000, 5000].map((v) => `<button type="button" class="chip" data-action="bill" data-value="${v}">${num(v)}</button>`).join('')}</div>
    ${range('scenario.billMonthlyThb', 300, 15000, 50, 'บาท/เดือน')}
    ${help('ยอดค่าไฟหาจากไหน?', `ดูบรรทัด <b>"รวมเงินที่ต้องชำระ"</b> ท้ายบิล (รวม VAT แล้ว) — ใช้ค่าเฉลี่ยหลายเดือนจะดีกว่าเดือนเดียว เพราะหน้าร้อนแอร์ทำงานหนักกว่า`)}
    <label>จำนวนหน่วยจากบิล (kWh/เดือน) <i class="pin">B</i> <small>— แม่นกว่าคำนวณย้อนจากยอดเงิน</small>
      <input type="number" inputmode="decimal" min="0" step="1" data-path="scenario.billedKwh" data-type="nullable" placeholder="ไม่ทราบ — ระบบจะคำนวณย้อนจากยอดเงินให้">
    </label>
    ${help('จำนวนหน่วยอยู่ตรงไหนในบิล?', `ช่อง <b>"จำนวนหน่วย"</b> หรือ "หน่วยที่ใช้" (= เลขอ่านครั้งนี้ − ครั้งก่อน) ถ้าหาไม่เจอ เว้นว่างได้ ระบบคำนวณย้อนจากยอดเงินด้วยอัตราขั้นบันได + Ft + VAT ให้`)}
    <div class="note" data-show="billCheck"></div>
    <details class="sub">
      <summary>📅 มีบิลย้อนหลัง? กรอกหน่วยรายเดือน (แม่นที่สุด) <span data-show="historyBadge"></span></summary>
      ${help('ดูย้อนหลังได้ที่ไหน?', `เปิดแอป <b>${esc(appName(s))}</b> → เมนูประวัติค่าไฟฟ้า/การใช้ไฟ จะเห็นหน่วย (kWh) ย้อนหลังรายเดือน หรือใช้บิลกระดาษที่เก็บไว้ — กรอกอย่างน้อย 3 เดือน ระบบจะใช้ค่าเฉลี่ยและรูปแบบหน้าร้อน/หน้าหนาวของบ้านคุณแทนค่าประมาณ`, true)}
      <div class="month-grid">${months}</div>
      <button type="button" class="btn sm ghost" data-action="clear-history">ล้างหน่วยรายเดือน</button>
    </details>
    <div class="field">
      <span>ระบบไฟบ้าน</span>
      <div class="seg" role="radiogroup" aria-label="ระบบไฟบ้าน">
        ${[
          [1, '1 เฟส'],
          [3, '3 เฟส'],
          [0, 'ไม่ทราบ'],
        ]
          .map(
            ([v, l]) =>
              `<label><input type="radio" name="phase" data-path="scenario.phase" data-type="int" value="${v}"${s.scenario.phase === v ? ' checked' : ''}><span>${l}</span></label>`,
          )
          .join('')}
      </div>
    </div>
    ${help('ดูยังไงว่าบ้าน 1 เฟส หรือ 3 เฟส?', `ดูที่<b>มิเตอร์หน้าบ้าน</b>: 1 เฟสมักเขียน 230V และขนาด เช่น 5(15)A, 15(45)A — 3 เฟสมักเขียน 3×230/400V หรือมีสายเข้ามิเตอร์ 4 เส้น บ้านทั่วไปส่วนใหญ่เป็น 1 เฟส ถ้าไม่แน่ใจถามช่างตอนสำรวจ`)}
  </section>

  <section class="card" id="sec-day">
    <h2><span class="step">2</span>ใช้ไฟกลางวันมากแค่ไหน</h2>
    <p class="muted">สัดส่วนไฟที่ใช้ช่วง 06:00–17:59 — สำคัญที่สุดต่อความคุ้ม เพราะแผงผลิตไฟเฉพาะตอนมีแดด</p>
    <div class="chips">${[
      [0.2, '20% ออกไปทำงานทั้งวัน'],
      [0.4, '40%'],
      [0.6, '60%'],
      [0.8, '80% อยู่บ้าน/เปิดแอร์กลางวัน'],
    ]
      .map(([v, l]) => `<button type="button" class="chip" data-action="day" data-value="${v}">${l}</button>`)
      .join('')}</div>
    ${range('scenario.dayUseFraction', 0, 100, 5, '% กลางวัน', 100)}
    <details class="sub" id="meter-calc">
      <summary>📟 วัดจริงจากเลขมิเตอร์ (แม่นกว่าการเดา)</summary>
      <p class="small">จดเลขบนมิเตอร์ 3 ครั้ง: <b>06:00</b> → <b>18:00</b> → <b>06:00 วันถัดไป</b> (ทำ 2–3 วันแล้วเฉลี่ยยิ่งดี)</p>
      <div class="grid3">
        <label>06:00 <input type="number" inputmode="decimal" data-meter="a" placeholder="เช่น 45210"></label>
        <label>18:00 <input type="number" inputmode="decimal" data-meter="b" placeholder="45228"></label>
        <label>06:00 วันถัดไป <input type="number" inputmode="decimal" data-meter="c" placeholder="45240"></label>
      </div>
      <div class="row wrap gap"><span id="meter-result" class="muted small">กรอกครบ 3 ค่าเพื่อคำนวณ</span><button type="button" class="btn sm" data-action="meter-apply" disabled>ใช้ค่านี้</button></div>
    </details>
    <div class="field"><span>รูปแบบการใช้ไฟระหว่างวัน</span></div>
    <div class="shape-list">
      ${LOAD_SHAPES.map(
        (sh) =>
          `<label class="shape"><input type="radio" name="shape" data-path="scenario.loadShape" value="${sh.id}"${s.scenario.loadShape === sh.id ? ' checked' : ''}><span><b>${esc(sh.label)}</b><small>${esc(sh.description)}</small></span></label>`,
      ).join('')}
    </div>
    <div data-show="loadSpark"></div>
  </section>

  <section class="card" id="sec-roof">
    <h2><span class="step">3</span>บ้าน & หลังคา <small class="muted">(เห็นผลในภาพ 3D)</small></h2>
    <div class="grid2">
      <label>ความยาวบ้าน (ตามสันหลังคา) ${range('house.width', 6, 18, 0.5, 'ม.')}</label>
      <label>ความลึกบ้าน ${range('house.depth', 6, 12, 0.5, 'ม.')}</label>
      <label>ความชันหลังคา ${range('house.pitchDeg', 10, 40, 1, '°')}</label>
      <label>จำนวนชั้น
        <select data-path="house.floors" data-type="int">${opt(1, '1 ชั้น', s.house.floors)}${opt(2, '2 ชั้น', s.house.floors)}</select>
      </label>
    </div>
    <label>หลังคาฝั่งที่จะติดแผงหันไปทาง
      <select data-path="house.bearingDeg" data-type="int">${BEARINGS.map((b) => opt(b.deg, b.label, s.house.bearingDeg)).join('')}</select>
    </label>
    ${help('วัดหลังคา/ดูทิศยังไง?', `เปิด <b>Google Maps โหมดดาวเทียม</b> → คลิกขวาที่หลังคา → "วัดระยะทาง" วัดความยาว-ความลึกบ้าน และดูว่าหลังคาลาดไปทางทิศไหน (ด้านบนของแผนที่ = ทิศเหนือ) — หันใต้ดีที่สุด ตะวันออก/ตะวันตกได้ ~90% เลี่ยงเงาต้นไม้/ตึกสูง`)}
    <div class="note" data-show="orientation"></div>
    <label class="check"><input type="checkbox" data-path="autoRoof" data-type="bool"> คำนวณพื้นที่หลังคาจากขนาดบ้าน (ฝั่งเดียว × 80%)</label>
    <label>พื้นที่หลังคาที่ใช้ได้ (ตร.ม.)
      <input type="number" min="0" step="1" data-path="scenario.roofAreaM2" data-type="nullable" placeholder="ไม่ทราบ">
    </label>
    <label class="check"><input type="checkbox" data-path="scenario.roofSurveyed" data-type="bool"> ช่าง/วิศวกรสำรวจหลังคาแล้ว</label>
  </section>

  <details class="card">
    <summary><h2>สมมติฐานขั้นสูง</h2></summary>
    <div class="grid2">
      <label>ผลผลิตเฉลี่ย (kWh/kWp/วัน) <input type="number" step="0.05" min="1" max="6" data-path="assumptions.yieldKwhPerKwpPerDay"></label>
      <label>ตัวคูณหลังหักเงา (0–1) <input type="number" step="0.01" min="0.3" max="1" data-path="assumptions.shadeMultiplier"></label>
      <label>แผงเสื่อมต่อปี (%) <input type="number" step="0.1" min="0" max="3" data-path="assumptions.annualDegradation" data-scale="100"></label>
      <label>อัตราคิดลด (%) <input type="number" step="0.5" min="0" max="20" data-path="assumptions.discountRate" data-scale="100"></label>
      <label>ค่าไฟขึ้นต่อปี (%) <input type="number" step="0.5" min="-5" max="10" data-path="assumptions.tariffGrowth" data-scale="100"></label>
      <label>พื้นที่ติดตั้ง (ตร.ม./kWp) <input type="number" step="0.5" min="3" max="12" data-path="assumptions.areaPerKwp"></label>
    </div>
    <label class="check"><input type="checkbox" data-path="assumptions.taxDeductionEnabled" data-type="bool"> จำลองสิทธิลดหย่อนภาษี (ลดฐานภาษีสูงสุด 200,000 — ไม่ใช่เงินคืน)</label>
    <label>อัตราภาษีเงินได้ส่วนเพิ่มของคุณ
      <select data-path="assumptions.marginalTaxRate" data-type="float">${[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35].map((r) => opt(r, `${r * 100}%`, s.assumptions.marginalTaxRate)).join('')}</select>
    </label>
    <p class="muted small">ค่าคงที่ทั้งหมดเป็นสมมติฐานที่แก้ไขได้ ไม่ใช่ข้อมูลรับประกัน ใช้ PVGIS หรือผลวัดจริงเมื่อต้องการความแม่นยำ</p>
    <button type="button" class="btn ghost" data-action="reset-all">รีเซ็ตค่าทั้งหมด</button>
  </details>
  <button type="button" class="btn block" data-action="goto" data-tab="results">ดูผล & คำแนะนำ →</button>`;
}

interface CheckItem {
  ok: boolean;
  label: string;
  hint: string;
  target: string;
}

export function completenessItems(s: AppState): CheckItem[] {
  const hist = (s.scenario.monthlyKwh ?? []).filter((v) => v != null && v > 0).length;
  return [
    { ok: s.scenario.billMonthlyThb > 0, label: 'ยอดค่าไฟเฉลี่ย', hint: 'บรรทัด "รวมเงินที่ต้องชำระ" (A)', target: 'sec-bill' },
    { ok: !!s.scenario.billedKwh || hist >= 3, label: 'จำนวนหน่วย kWh จากบิล', hint: 'ช่อง "จำนวนหน่วย" (B)', target: 'sec-bill' },
    { ok: hist >= 3, label: `หน่วยย้อนหลัง ≥ 3 เดือน (มี ${hist})`, hint: `แอป ${s.scenario.utility === 'MEA' ? 'MEA Smart Life' : 'PEA Smart Plus'}`, target: 'sec-bill' },
    { ok: s.scenario.phase !== 0, label: 'ระบบไฟ 1/3 เฟส', hint: 'ดูที่มิเตอร์หน้าบ้าน', target: 'sec-bill' },
    { ok: s.meta.dayMeasured, label: '% ใช้ไฟกลางวัน (วัดจากมิเตอร์)', hint: 'จดเลขมิเตอร์ 06:00 / 18:00', target: 'sec-day' },
    { ok: !s.autoRoof || s.scenario.roofSurveyed || s.meta.roofSet, label: 'ขนาด/ทิศหลังคาจริง', hint: 'วัดจาก Google Maps', target: 'sec-roof' },
  ];
}

export function homeDynamic(s: AppState, m: Model): Record<string, string> {
  const t = m.ctx.tariff;
  const est = m.ctx.monthlyKwh;
  const bb = billBreakdown(est, t);
  const hist = (s.scenario.monthlyKwh ?? []).filter((v) => v != null && v > 0).length;
  const source = hist >= 3 ? `(เฉลี่ยจากบิล ${hist} เดือน)` : s.scenario.billedKwh ? '(จากบิลจริง)' : '(คำนวณย้อนจากยอดเงิน)';
  let billCheck = `ใช้ไฟประมาณ <b>${num(est, 0)} kWh/เดือน</b> ${source}`;
  billCheck += `<br>ตรวจสูตร: ${num(est, 0)} หน่วย = ค่าพลังงาน ${thb(bb.energy)} + Ft ${thb(bb.ft)} + ค่าบริการ ${thb(bb.service)} + VAT ${thb(bb.vat)} = <b>${thb(bb.total)}</b>`;
  if (s.scenario.billedKwh && hist < 3) billCheck += ` <span class="muted">(ต่างจากยอดที่กรอก ${thb(s.scenario.billMonthlyThb - bb.total)})</span>`;
  billCheck += `<br>หน่วยสุดท้ายที่ลดได้มีค่า ~<b>${num(marginalRate(est, t), 2)} บาท/หน่วย</b> — นี่คือมูลค่าของไฟ 1 หน่วยที่โซลาร์ช่วยแทน`;
  const fr = hourlyLoadFractions(getLoadShape(s.scenario.loadShape).weights, s.scenario.dayUseFraction);
  const solar = m.ctx.pvPerKwp[s.view.month]!;
  const solarMax = Math.max(...solar) || 1;
  const frMax = Math.max(...fr) || 1;
  const loadSpark = chart({
    title: 'การใช้ไฟ 24 ชม. เทียบช่วงที่แผงผลิตไฟ (สัดส่วน)',
    categories: Array.from({ length: 24 }, (_, h) => `${h}`),
    series: [
      { label: 'การใช้ไฟ', values: fr.map((v) => v / frMax), color: 'var(--c-load)', type: 'bar' },
      { label: 'แดด/การผลิต', values: solar.map((v) => v / solarMax), color: 'var(--c-pv)', type: 'area' },
    ],
    height: 150,
    yFormat: () => '',
    labelEvery: 3,
  });
  const issues = m.issues.map((i) => `<div class="issue ${i.level}">${esc(i.message)}</div>`).join('');
  const items = completenessItems(s);
  const done = items.filter((i) => i.ok).length;
  const completeness = `<div class="meter-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="${done}"><i style="width:${(done / items.length) * 100}%"></i></div>
    <ul class="check-items">${items
      .map(
        (i) =>
          `<li class="${i.ok ? 'ok' : ''}"><span class="ck">${i.ok ? '✓' : '○'}</span><span><b>${esc(i.label)}</b><small>${i.ok ? 'เรียบร้อย' : esc(i.hint)}</small></span>${
            i.ok ? '' : `<button type="button" class="btn sm ghost" data-action="jump" data-target="${i.target}">กรอก</button>`
          }</li>`,
      )
      .join('')}</ul>
    <p class="muted small">ความมั่นใจของผลตอนนี้: <b>${esc(m.confidence.label)}</b> — ยิ่งกรอกครบ ตัวเลขยิ่งใกล้ความจริง</p>`;
  return {
    utility: `${s.scenario.utility === 'MEA' ? 'การไฟฟ้านครหลวง (MEA)' : 'การไฟฟ้าส่วนภูมิภาค (PEA)'}`,
    billCheck: billCheck + issues,
    loadSpark,
    completeness,
    completeScore: badge(`${done}/${items.length}`, done >= 5 ? 'good' : done >= 3 ? 'info' : 'warn'),
    historyBadge: hist ? badge(`กรอกแล้ว ${hist} เดือน${hist < 3 ? ' (ต้อง ≥3)' : ''}`, hist >= 3 ? 'good' : 'warn') : '',
    orientation: `ตัวคูณทิศ/ความเอียง ≈ <b>${num(m.orientation, 2)}</b> • พื้นที่หลังคาใช้ได้ ≈ <b>${num(m.roofArea, 0)} ตร.ม.</b> • วางแผง 590W ได้สูงสุด ~<b>${m.capacity}</b> แผง (~${num((m.capacity * 590) / 1000, 1)} kWp)`,
  };
}

/* ---------------------------------------------------------------- ผลลัพธ์ */
export function offerOptions(s: AppState, m: Model): string {
  const list = s.offers.map((o) => {
    const inst = s.installers.find((i) => i.id === o.installerId);
    return opt(o.id, `${o.id} • ${inst?.name ?? ''} ${o.packageName} (${num(o.solarDcKwp, 2)} kWp)`, s.selected);
  });
  if (m.selIsCustom) list.unshift(opt(s.selected, `ขนาดกำหนดเอง ${s.selected.split(':')[1]} kWp (ราคาตลาดประมาณ)`, s.selected));
  return list.join('');
}

export function renderResults(s: AppState, m: Model, sw: SweepOutput | null): string {
  const e = m.sel;
  if (!e) return `<section class="card"><p>เลือกแพ็กเกจเพื่อดูผลลัพธ์</p></section>`;
  const sim = e.sim;
  const head = `
  <section class="card">
    <label>แพ็กเกจที่แสดงใน 3D และคำนวณ
      <select data-action="select-offer">${offerOptions(s, m)}</select>
    </label>
    <div class="row wrap gap">
      ${badge(`ความมั่นใจ: ${m.confidence.label}`, m.confidence.level >= 2 ? 'good' : 'warn')}
      ${badge(SYSTEM[e.offer.systemType], 'info')}
      ${badge(EVIDENCE[e.offer.evidenceStatus].label, EVIDENCE[e.offer.evidenceStatus].tone)}
      ${badge(VAT[e.offer.vatMode].label, VAT[e.offer.vatMode].tone)}
    </div>
    ${[...e.reasons.map((r) => `<div class="issue error">${esc(r)}</div>`), ...e.warnings.map((w) => `<div class="issue warning">${esc(w)}</div>`)].join('')}
  </section>`;
  if (!sim) {
    return `${head}<section class="card"><h2>ยังไม่คำนวณ ROI</h2><p>${esc(e.reasons[0] ?? '')}</p><p class="muted">ระบบแบตเตอรี่ต้องจำลองการชาร์จ/คายประจุ ประสิทธิภาพ และอายุแบต จึงไม่นำผลตอบแทนแบบ On-grid มาใช้แทน</p></section>`;
  }
  const a = sim.annual;
  const monthlyBefore = a.billBefore / 12;
  const monthlyAfter = a.billAfter / 12;
  const cards = [
    ['ค่าไฟเดิม', `${thb(monthlyBefore)}<small>/เดือน</small>`, `${thb(a.billBefore)}/ปี`],
    ['ค่าไฟหลังติด', `${thb(monthlyAfter)}<small>/เดือน</small>`, `ลดลง ${pct(1 - a.billAfter / a.billBefore)}`],
    ['ประหยัดปีแรก', `${thb(e.annualNet)}<small>/ปี สุทธิ</small>`, `ขั้นต้น ${thb(e.annualGross)} − ค่าดูแล ${thb(e.offer.annualOandM)}`],
    ['เงินลงทุนรวม', e.capex.capex != null ? thb(e.capex.capex) : 'ไม่ทราบ (VAT?)', e.pricePerKwp ? `${thb(e.pricePerKwp)}/kWp` : 'ยืนยัน VAT ก่อนเทียบ'],
    ['คืนทุนแบบง่าย', years(e.payback), e.payback ? `ช่วง ${num(e.paybackRange.best, 1)}–${e.paybackRange.worst ? num(e.paybackRange.worst, 1) : '>25'} ปี (แดด 110%–80%)` : ''],
    ['NPV 25 ปี', thb(e.npv), e.breakEven != null ? `คุ้มทุนจริง (มีค่าเสื่อม) ~ปีที่ ${num(e.breakEven, 1)}` : 'ไม่คุ้มทุนใน 25 ปี'],
    ['ไฟผลิตได้', `${num(a.pvKwh)}<small> kWh/ปี</small>`, `${num(e.offer.solarDcKwp, 2)} kWp DC • อินเวอร์เตอร์ ${num(e.offer.inverterAcKw, 1)} kW`],
    ['ใช้เอง / เหลือ', `${pct(a.selfUseKwh / a.pvKwh)}<small> ใช้เอง</small>`, `${num(a.selfUseKwh)} ใช้เอง • ${num(a.exportKwh)} kWh เหลือ (รายได้ 0 ฿)`],
  ]
    .map(([k, v, sub]) => `<div class="kpi"><span>${k}</span><b>${v}</b><small>${sub}</small></div>`)
    .join('');

  const mi = s.view.month;
  const mr = sim.months[mi]!;
  const before = billBreakdown(mr.loadKwh, m.ctx.tariff);
  const after = billBreakdown(mr.importKwh, m.ctx.tariff);
  const row = (k: string, b: number, a2: number, d = 0) => `<tr><th>${k}</th><td>${num(b, d)}</td><td>${num(a2, d)}</td><td>${num(b - a2, d)}</td></tr>`;
  const billTable = `
  <table class="tbl">
    <caption>บิลเดือน${MONTH_NAMES_TH[mi]} ก่อน/หลังติด (บาท)</caption>
    <thead><tr><th></th><th>ก่อน</th><th>หลัง</th><th>ลดลง</th></tr></thead>
    <tbody>
      ${row('หน่วยที่ซื้อ (kWh)', before.kWh, after.kWh)}
      ${row('ค่าพลังงานขั้นบันได', before.energy, after.energy)}
      ${row('ค่า Ft', before.ft, after.ft)}
      ${row('ค่าบริการ', before.service, after.service)}
      ${row('VAT 7%', before.vat, after.vat)}
      ${row('รวม', before.total, after.total)}
    </tbody>
  </table>
  <p class="muted small">ค่าไฟไม่เหลือ 0 เพราะยังต้องซื้อไฟตอนเช้าตรู่ เย็น และกลางคืน + ค่าบริการรายเดือน และไฟส่วนเกินตอนกลางวันไม่ได้หักลบ</p>`;

  const monthChart = chart({
    title: 'ผลิตไฟ / ใช้เอง รายเดือน (kWh)',
    categories: MONTH_SHORT_TH,
    series: [
      { label: 'ผลิต', values: sim.months.map((x) => x.pvKwh), color: 'var(--c-pv)', type: 'bar' },
      { label: 'ใช้เอง', values: sim.months.map((x) => x.selfUseKwh), color: 'var(--c-self)', type: 'bar' },
    ],
    highlight: mi,
    height: 180,
  });
  const saveChart = chart({
    title: 'เงินประหยัดรายเดือน (บาท) — บิลก่อน − บิลหลัง แบบขั้นบันได',
    categories: MONTH_SHORT_TH,
    series: [{ label: 'ประหยัด', values: sim.months.map((x) => x.grossSaving), color: 'var(--c-money)', type: 'bar' }],
    highlight: mi,
    height: 160,
  });
  const cf = e.cashflow
    ? chart({
        title: 'กระแสเงินสดสะสม 25 ปี (บาท) — รวมค่าเสื่อมแผงและค่าดูแล',
        categories: e.cashflow.map((r) => `${r.year}`),
        series: [
          { label: 'เงินสดสะสม', values: e.cashflow.map((r) => r.cumulative), color: 'var(--c-money)', type: 'bar' },
          { label: 'มูลค่าปัจจุบันสะสม', values: e.cashflow.map((_, i) => e.cashflow!.slice(0, i + 1).reduce((x, r) => x + r.discounted, 0)), color: 'var(--c-load)', type: 'line', dashed: true },
        ],
        labelEvery: 5,
      })
    : '<p class="muted">ไม่มีราคา All-in จึงยังทำกระแสเงินสดไม่ได้</p>';

  return `${renderAdvice(s, m, sw)}${head}
  <section class="card"><div class="kpis">${cards}</div>
    <ul class="explain">${e.explain.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </section>
  <section class="card">${monthChart}${saveChart}</section>
  <section class="card">${billTable}</section>
  <section class="card">${cf}</section>
  <section class="card row wrap gap">
    <button type="button" class="btn" data-action="csv">ดาวน์โหลด CSV</button>
    <button type="button" class="btn ghost" data-action="print">พิมพ์สรุป</button>
    <button type="button" class="btn ghost" data-action="share">คัดลอกลิงก์แชร์</button>
  </section>`;
}

/** ขนาดที่คืนทุนเร็วสุด (ที่หลังคารองรับ) จาก sweep ในแถวที่ใกล้ % กลางวันปัจจุบันที่สุด */
export function bestSweepSize(s: AppState, m: Model, sw: SweepOutput | null): { kwp: number; payback: number; selfShare: number } | null {
  if (!sw) return null;
  const nS = sw.sizes.length;
  const d = sw.dayFractions.reduce((best, f, i) => (Math.abs(f - s.scenario.dayUseFraction) < Math.abs(sw.dayFractions[best]! - s.scenario.dayUseFraction) ? i : best), 0);
  let out: { kwp: number; payback: number; selfShare: number } | null = null;
  sw.sizes.forEach((kwp, si) => {
    const i = d * nS + si;
    const net = sw.grossSaving[i]! - 1500;
    if (net <= 0) return;
    if (m.roofArea != null && kwp * s.assumptions.areaPerKwp > m.roofArea) return;
    const pb = estimateCapex(m.rec.priceModel, kwp) / net;
    if (!out || pb < out.payback) out = { kwp, payback: pb, selfShare: sw.selfUseKwh[i]! / (sw.pvKwh[i]! || 1) };
  });
  return out;
}

/** การ์ดสรุป "ควรติดไหม / ติดเท่าไร / ทำอะไรต่อ" */
export function renderAdvice(s: AppState, m: Model, sw: SweepOutput | null): string {
  const top = m.rec.top;
  const best = bestSweepSize(s, m, sw);
  const sim = top?.sim;
  const pb = top?.payback ?? null;
  let verdict: string;
  let tone: string;
  if (pb == null) {
    verdict = 'ยังสรุปไม่ได้ — ยังไม่มีแพ็กเกจที่เข้าเงื่อนไข (ดูเหตุผลในแท็บผู้ติดตั้ง)';
    tone = 'warn';
  } else if (pb <= 7) {
    verdict = `คุ้มค่าที่จะติด — คืนทุนประมาณ ${num(pb, 1)} ปี จากอายุแผง 25 ปี`;
    tone = 'good';
  } else if (pb <= 10) {
    verdict = `พอคุ้ม — คืนทุนประมาณ ${num(pb, 1)} ปี ลองเพิ่มการใช้ไฟกลางวันหรือหาราคาที่ถูกลง`;
    tone = 'info';
  } else {
    verdict = `ยังไม่ค่อยคุ้ม — คืนทุน ${num(pb, 1)} ปี ส่วนใหญ่เพราะใช้ไฟกลางวันน้อยหรือค่าไฟยังไม่สูงพอ`;
    tone = 'warn';
  }
  const dayPct = s.scenario.dayUseFraction * 100;
  const steps: string[] = [];
  const hist = (s.scenario.monthlyKwh ?? []).filter((v) => v != null && v > 0).length;
  if (hist < 3 && !s.scenario.billedKwh) steps.push(`กรอก <b>จำนวนหน่วย (kWh)</b> จากบิล หรือย้อนหลัง 3–12 เดือน ให้ตัวเลขแม่นขึ้น <button type="button" class="link" data-action="jump" data-target="sec-bill">ไปกรอก</button>`);
  if (!s.meta.dayMeasured) steps.push(`วัด <b>% ใช้ไฟกลางวัน</b> จากเลขมิเตอร์ (ตอนนี้ใช้ค่า ${num(dayPct)}%) <button type="button" class="link" data-action="jump" data-target="meter-calc">วิธีวัด</button>`);
  steps.push(`ขอใบเสนอราคา <b>2–3 เจ้า</b> ที่ระบุจำนวนแผง × วัตต์ (DC kWp), ยี่ห้ออินเวอร์เตอร์ และราคารวม VAT <button type="button" class="link" data-action="goto" data-tab="installers">ดูผู้ติดตั้ง</button>`);
  steps.push('ให้ช่างสำรวจหลังคา เงา และตู้ไฟจริง แล้วนำราคามากรอกเป็น "ใบเสนอราคายืนยันแล้ว" เพื่อเทียบแบบยุติธรรม');
  return `<section class="card advice ${tone}">
    <p class="eyebrow-sm">คำแนะนำสำหรับบ้านคุณ</p>
    <h2 class="verdict">${esc(verdict)}</h2>
    ${
      top && sim
        ? `<div class="advice-grid">
        <div><span>แพ็กเกจที่เหมาะตอนนี้</span><b>${esc(top.installer?.name ?? '')} ${esc(top.offer.packageName)}</b><small>${num(top.offer.solarDcKwp, 2)} kWp • ${thb(top.capex.capex)}</small></div>
        <div><span>ค่าไฟต่อเดือน</span><b>${thb(sim.annual.billBefore / 12)} → ${thb(sim.annual.billAfter / 12)}</b><small>ประหยัดสุทธิ ${thb(top.annualNet)}/ปี</small></div>
        ${best ? `<div><span>ขนาดที่คืนทุนเร็วสุด (ราคาตลาด)</span><b>~${num(best.kwp, 1)} kWp</b><small>~${Math.ceil((best.kwp * 1000) / 590)} แผง 590W • คืนทุน ~${num(best.payback, 1)} ปี</small></div>` : ''}
      </div>
      <p class="small">☀️ กลางวันแผงช่วยจ่ายไฟได้มาก แต่ 🌙 กลางคืนยังต้องซื้อจากการไฟฟ้าทั้งหมด <button type="button" class="link" data-action="goto" data-tab="daynight">ดูแยกกลางวัน/กลางคืน →</button></p>`
        : ''
    }
    ${
      top && m.sel && m.sel.offer.id !== top.offer.id
        ? `<p class="issue warning">ตอนนี้กำลังแสดง <b>${esc(m.sel.installer?.name ?? '')} ${esc(m.sel.offer.packageName)}</b>${m.sel.payback != null ? ` (คืนทุน ${num(m.sel.payback, 1)} ปี)` : ''} ที่คุณเลือกเอง ไม่ใช่แพ็กเกจที่แนะนำ <button type="button" class="link" data-action="use-top">กลับไปใช้แพ็กเกจที่แนะนำ</button></p>`
        : ''
    }
    <h3 class="list-title">ขั้นต่อไป</h3>
    <ol class="next-steps">${steps.map((x) => `<li>${x}</li>`).join('')}</ol>
    ${top && !m.rec.topIsConfirmed ? '<p class="muted small">* อันดับนี้ใช้ "ราคาประกาศ" จากเว็บผู้ขาย ยังไม่ใช่ใบเสนอราคาจริง</p>' : ''}
  </section>`;
}

/* ---------------------------------------------------------------- กลางวัน / กลางคืน */
export function renderDayNight(s: AppState, m: Model): string {
  const e = m.sel;
  const sim = e?.sim;
  const dn = m.dn;
  if (!e || !sim || !dn) return `<section class="card"><p>เลือกแพ็กเกจ On-grid ในแท็บ "ผล & คำแนะนำ" เพื่อดูการแยกกลางวัน/กลางคืน</p></section>`;
  const total = dn.dayLoad + dn.nightLoad || 1;
  const dayCov = dn.dayLoad > 0 ? dn.daySelf / dn.dayLoad : 0;
  const bar = (solar: number, grid: number) => {
    const t = solar + grid || 1;
    return `<div class="stack" aria-hidden="true"><i class="solar" style="width:${(solar / t) * 100}%"></i><i class="grid" style="width:${(grid / t) * 100}%"></i></div>`;
  };
  const tiles = `<div class="dn-tiles">
    <div class="dn-tile day">
      <span>☀️ กลางวัน 06:00–17:59</span>
      <b>${num(dn.dayLoad)} <small>kWh/ปี</small></b>
      <small>${pct(dn.dayLoad / total)} ของไฟทั้งบ้าน</small>
      ${bar(dn.daySelf, dn.dayImport)}
      <p>แผงจ่ายแทนได้ <b>${pct(dayCov)}</b> (${num(dn.daySelf)} kWh) ยังซื้อ ${num(dn.dayImport)} kWh</p>
    </div>
    <div class="dn-tile night">
      <span>🌙 กลางคืน 18:00–05:59</span>
      <b>${num(dn.nightLoad)} <small>kWh/ปี</small></b>
      <small>${pct(dn.nightLoad / total)} ของไฟทั้งบ้าน</small>
      ${bar(0, dn.nightImport)}
      <p>แผงช่วยไม่ได้ ต้องซื้อทั้งหมด ≈ <b>${thb(dn.nightCostThb)}/ปี</b></p>
    </div>
  </div>
  <div class="legend"><span class="lg"><i style="background:var(--c-self)"></i>ไฟจากแผง</span><span class="lg"><i style="background:var(--c-grid)"></i>ซื้อจากการไฟฟ้า</span></div>
  ${dn.export > 1 ? `<p class="small muted">ไฟจากแผงที่เหลือใช้กลางวัน ${num(dn.export)} kWh/ปี ไหลออกสายส่งโดยไม่มีรายได้ (เว้นแต่ได้สัญญารับซื้อ)</p>` : ''}`;

  const mi = s.view.month;
  const hm = sim.hourly[mi]!;
  const days = DAYS_IN_MONTH[mi]!;
  const dayChart = chart({
    title: `วันเฉลี่ยของเดือน${MONTH_NAMES_TH[mi]}: ไฟบ้าน vs ไฟโซลาร์ (kW)`,
    categories: Array.from({ length: 24 }, (_, h) => `${h}:00`),
    series: [
      { label: 'บ้านใช้ไฟ', values: hm.load.map((v) => v / days), color: 'var(--c-load)', type: 'bar' },
      { label: 'โซลาร์ผลิต', values: hm.pv.map((v) => v / days), color: 'var(--c-pv)', type: 'area' },
      { label: 'ใช้ได้จริงจากแผง', values: hm.self.map((v) => v / days), color: 'var(--c-self)', type: 'line' },
    ],
    yFormat: (n) => num(n, 1),
    highlight: Math.floor(s.view.hour),
    labelEvery: 3,
  });

  let shiftHtml = '';
  if (m.shift && m.shift.length) {
    const cur = m.shift.find((r) => Math.abs(r.dayFraction - s.scenario.dayUseFraction) < 1e-9) ?? m.shift[0]!;
    const rows = m.shift
      .filter((r, i, arr) => arr.findIndex((x) => Math.abs(x.dayFraction - r.dayFraction) < 1e-9) === i)
      .sort((a, b) => a.dayFraction - b.dayFraction);
    const capex = e.capex.capex;
    const more = rows.find((r) => r.dayFraction >= Math.min(0.9, cur.dayFraction + 0.2) - 1e-9);
    const gain = more ? more.grossSaving - cur.grossSaving : 0;
    let concl: string;
    if (!more || more === cur) concl = 'คุณใช้ไฟกลางวันสูงอยู่แล้ว การย้ายเพิ่มช่วยได้ไม่มาก';
    else if (gain > 1500)
      concl = `ถ้าย้ายการใช้ไฟมากลางวันเพิ่มเป็น ${pct(more.dayFraction)} จะประหยัดเพิ่ม ~<b>${thb(gain)}/ปี</b>${
        capex && e.annualNet ? ` และคืนทุนเร็วขึ้นจาก ${num(capex / e.annualNet, 1)} → ${num(capex / (e.annualNet + gain), 1)} ปี` : ''
      } โดยไม่ต้องลงทุนเพิ่ม`;
    else concl = `ย้ายเพิ่มเป็น ${pct(more.dayFraction)} ได้เพิ่มเพียง ~${thb(gain)}/ปี เพราะแผงขนาดนี้ผลิตไม่พอรองรับโหลดกลางวันที่เพิ่ม — ถ้าจะย้ายการใช้ไฟมากลางวันมาก ๆ อาจคุ้มกับแผงที่ใหญ่ขึ้น`;
    const table = `<table class="tbl">
      <caption>แผงเดิม ${num(e.offer.solarDcKwp, 2)} kWp • ไฟทั้งเดือนเท่าเดิม เปลี่ยนแค่ช่วงเวลาที่ใช้</caption>
      <thead><tr><th>ใช้ไฟกลางวัน</th><th>ประหยัด/ปี</th><th>เทียบตอนนี้</th><th>แผงแทนไฟได้</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const isCur = r === cur || Math.abs(r.dayFraction - cur.dayFraction) < 1e-9;
          const d = r.grossSaving - cur.grossSaving;
          return `<tr class="${isCur ? 'cur' : ''}"><th>${pct(r.dayFraction)}${isCur ? ' (ตอนนี้)' : ''}</th><td>${thb(r.grossSaving)}</td><td class="${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${isCur ? '–' : `${d > 0 ? '+' : ''}${num(d)}`}</td><td>${pct(r.coverage)}</td></tr>`;
        })
        .join('')}</tbody></table>`;
    shiftHtml = `<section class="card">
      <h2>ย้ายการใช้ไฟมาตอนกลางวัน ประหยัดขึ้นไหม?</h2>
      <p class="muted small">คิดจากแพ็กเกจ ${esc(e.installer?.name ?? '')} ${esc(e.offer.packageName)} (${num(e.offer.solarDcKwp, 2)} kWp)</p>
      <p class="answer">${concl}</p>
      ${chart({
        title: 'เงินประหยัดต่อปี ตาม % การใช้ไฟกลางวัน (บาท)',
        categories: rows.map((r) => pct(r.dayFraction)),
        series: [{ label: 'ประหยัด/ปี', values: rows.map((r) => r.grossSaving), color: 'var(--c-money)', type: 'bar' }],
        highlight: rows.indexOf(cur),
        height: 170,
      })}
      <div class="tbl-wrap">${table}</div>
    </section>`;
  }

  const tips: [string, string, string][] = [
    ['🧺', 'เครื่องซักผ้า / อบผ้า', 'ตั้งเวลาให้ทำงาน 10:00–14:00 (ครั้งละ ~0.5–3 kWh)'],
    ['💧', 'ปั๊มน้ำ / เติมแท็งก์', 'ให้ทำงานช่วงสาย — แท็งก์เป็น "แบตเตอรี่น้ำ" ไว้ใช้ตอนเย็น'],
    ['❄️', 'แอร์ (Pre-cool)', 'เปิดลดอุณหภูมิห้องช่วง 15:00–17:30 ก่อนแดดหมด ตอนค่ำแอร์จะทำงานเบาลง'],
    ['🚗', 'ชาร์จรถไฟฟ้า', 'ชาร์จกลางวันวันหยุดหรือ WFH ใช้ไฟจากแผงได้เต็มที่ (ชาร์จ 7 kW ต่อชั่วโมง ≈ 7 kWh)'],
    ['🍽️', 'เครื่องล้างจาน / หม้อหุงข้าวตั้งเวลา', 'ตั้งเวลาให้ทำงานช่วงเที่ยง'],
    ['🔌', 'Smart plug / timer', 'ราคาไม่กี่ร้อยบาท ช่วยย้ายการใช้ไฟได้โดยไม่ต้องจำ'],
  ];
  return `<section class="card">
      <h2>ไฟบ้านคุณ: กลางวัน vs กลางคืน</h2>
      ${tiles}
    </section>
    ${shiftHtml}
    <section class="card">${dayChart}<p class="muted small">พื้นที่สีส้มเกินแท่งสีน้ำเงิน = ไฟเหลือ • แท่งสีน้ำเงินนอกพื้นที่สีส้ม = ต้องซื้อ — ลากแถบเวลาใต้ภาพ 3D เพื่อดูทีละชั่วโมง</p></section>
    <section class="card">
      <h2>ย้ายอะไรไปใช้ตอนกลางวันได้บ้าง</h2>
      <ul class="tips">${tips.map(([i, t, d]) => `<li><span class="ti">${i}</span><span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ul>
    </section>
    <section class="card">
      <h2>🌙 อยากลดค่าไฟกลางคืนด้วย?</h2>
      <p>ไฟกลางคืนที่ยังต้องซื้อ ~<b>${num(dn.nightImport)} kWh/ปี</b> (≈ ${thb(dn.nightCostThb)}) ลดได้ด้วย<b>แบตเตอรี่ (ระบบ Hybrid)</b> ที่เก็บไฟเหลือตอนกลางวันไว้ใช้กลางคืน แต่ปัจจุบันแบตเตอรี่ยังราคาสูง ต้องจำลองการชาร์จ/คายประจุละเอียด แอปนี้จึง<b>ไม่คำนวณความคุ้มของแบต</b> — ให้ขอผู้ขายแสดงตัวเลขการชาร์จ-ใช้จริงประกอบ</p>
    </section>`;
}

/* ---------------------------------------------------------------- ผู้ติดตั้ง */
function offerCard(e: OfferEvaluation, rank: number | null, selected: boolean): string {
  const o = e.offer;
  const w = (v: number | null) => (v == null ? '?' : `${v}`);
  const parts = e.scoreParts;
  return `
  <article class="offer${selected ? ' selected' : ''}${e.group === 'NOT_RANKED' ? ' dim' : ''}">
    <header>
      ${rank != null ? `<span class="rank">#${rank}</span>` : ''}
      <div><b>${esc(e.installer?.name ?? o.installerId)}</b> <span class="muted">${esc(o.packageName)}</span><br><small class="muted">${esc(o.id)} • ${SYSTEM[o.systemType]} • ${o.phase} เฟส</small></div>
      ${e.score != null ? `<div class="score" title="คะแนนรวม"><b>${num(e.score)}</b><small>คะแนน</small></div>` : ''}
    </header>
    <div class="row wrap gap">
      ${badge(EVIDENCE[o.evidenceStatus].label, EVIDENCE[o.evidenceStatus].tone)}
      ${badge(VAT[o.vatMode].label, VAT[o.vatMode].tone)}
      ${e.roofFits === false ? badge('หลังคาไม่พอ', 'bad') : e.roofFits ? badge('หลังคาพอ', 'good') : badge('หลังคา?', 'warn')}
    </div>
    <dl class="specs">
      <div><dt>แผง DC</dt><dd>${num(o.solarDcKwp, 2)} kWp${o.panelCount && o.panelWatt ? ` <small>(${o.panelCount}×${o.panelWatt}W)</small>` : o.dcKwpPlaceholder ? ' <small>(รอยืนยัน)</small>' : ''}</dd></div>
      <div><dt>อินเวอร์เตอร์</dt><dd>${num(o.inverterAcKw, 1)} kW ${o.inverterBrand ? `<small>${esc(o.inverterBrand)}</small>` : ''}</dd></div>
      <div><dt>ราคารวม</dt><dd>${e.capex.capex != null ? thb(e.capex.capex) : `${thb(o.publishedPrice)} <small>(VAT?)</small>`}</dd></div>
      <div><dt>บาท/kWp</dt><dd>${e.pricePerKwp ? thb(e.pricePerKwp) : '–'}</dd></div>
      <div><dt>ประหยัดสุทธิ</dt><dd>${e.annualNet != null ? `${thb(e.annualNet)}/ปี` : '–'}</dd></div>
      <div><dt>คืนทุน</dt><dd>${e.payback != null ? `${num(e.payback, 1)} ปี` : '–'}</dd></div>
      <div><dt>ประกัน อินเวอร์เตอร์/งาน/แผง</dt><dd>${w(o.inverterWarrantyYears)}/${w(o.workWarrantyYears)}/${w(o.panelWarrantyYears)} ปี</dd></div>
      <div><dt>ราคาถึง</dt><dd>${o.validTo ? esc(o.validTo) : 'ไม่ระบุ'}</dd></div>
    </dl>
    ${
      parts
        ? `<div class="bars">${(
            [
              ['การเงิน', parts.financial],
              ['ใช้เอง', parts.selfUse],
              ['ราคา/kWp', parts.pricePerKwp],
              ['ประกัน', parts.warranty],
              ['ข้อมูล', parts.dataConfidence],
            ] as const
          )
            .map(([k, v]) => `<div><span>${k}</span><i style="--v:${(v * 100).toFixed(0)}%"></i></div>`)
            .join('')}</div>`
        : ''
    }
    ${e.reasons.length ? `<ul class="reasons">${e.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${o.promotionText ? `<p class="muted small">${esc(o.promotionText)} • ตรวจล่าสุด ${esc(o.lastVerifiedAt)}</p>` : ''}
    <footer class="row wrap gap">
      <button type="button" class="btn sm" data-action="view-offer" data-id="${esc(o.id)}">ดูใน 3D</button>
      <button type="button" class="btn sm ghost" data-action="edit-offer" data-id="${esc(o.id)}">แก้ไข/ยืนยันราคา</button>
      ${o.sourceUrl ? `<a class="btn sm ghost" href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">แหล่งที่มา ↗</a>` : ''}
    </footer>
  </article>`;
}

export function renderInstallers(s: AppState, m: Model): string {
  const r = m.rec;
  const top = r.top;
  const banner = r.topIsConfirmed
    ? `<div class="banner good">มีใบเสนอราคาที่ยืนยันแล้ว ${r.confirmed.length} รายการ — จัดอันดับเพื่อตัดสินใจซื้อได้</div>`
    : `<div class="banner warn"><b>ยังไม่มีใบเสนอราคาที่ยืนยันแล้ว</b> — อันดับด้านล่างใช้ "ราคาประกาศ" เพื่อสำรวจตลาดเท่านั้น ยังไม่ใช่ผู้ชนะที่ยืนยัน ให้ขอใบเสนอราคาแล้วกด "แก้ไข/ยืนยันราคา" เปลี่ยนสถานะเป็น "ใบเสนอราคายืนยันแล้ว"</div>`;
  const topCard = top
    ? `<section class="card hero">
        <h2>แนะนำ${r.topIsConfirmed ? '' : 'เบื้องต้น'}: ${esc(top.installer?.name ?? '')} ${esc(top.offer.packageName)}</h2>
        <p>คืนทุน ~<b>${num(top.payback, 1)} ปี</b> • ประหยัดสุทธิ ~<b>${thb(top.annualNet)}/ปี</b> • ลงทุน ${thb(top.capex.capex)} • ${num(top.offer.solarDcKwp, 2)} kWp</p>
        <ul class="explain">${top.explain.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </section>`
    : `<section class="card"><p>ยังไม่มีแพ็กเกจที่เข้าเงื่อนไขจัดอันดับ — ดูเหตุผลในรายการ "ไม่จัดอันดับ"</p></section>`;
  const list = (title: string, items: OfferEvaluation[], ranked: boolean) =>
    items.length
      ? `<h3 class="list-title">${title} <small>(${items.length})</small></h3>${items.map((e, i) => offerCard(e, ranked ? i + 1 : null, e.offer.id === s.selected)).join('')}`
      : '';
  const weights = (Object.entries({ financial: 'การเงิน', selfUse: 'ใช้ไฟเองจากแผง', pricePerKwp: 'ราคาต่อ kWp', warranty: 'การรับประกัน', dataConfidence: 'ความมั่นใจข้อมูล' }) as [keyof typeof s.weights, string][])
    .map(([k, l]) => `<label>${l} ${range(`weights.${k}`, 0, 100, 5, '')}</label>`)
    .join('');
  return `
  ${banner}
  ${topCard}
  <section class="card"><h2>เหตุผลประกอบ</h2><ul class="explain">${r.insights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
  ${list('ข้อเสนอที่ยืนยันแล้ว (จัดอันดับเพื่อซื้อ)', r.confirmed, true)}
  ${list('ราคาประกาศ (สำรวจตลาด — ต้องขอใบเสนอราคา)', r.indicative, true)}
  ${list('ไม่จัดอันดับ', r.notRanked, false)}
  <section class="card row wrap gap">
    <button type="button" class="btn" data-action="new-offer">+ เพิ่มใบเสนอราคาที่ได้รับ</button>
    <button type="button" class="btn ghost" data-action="reset-offers">คืนค่าข้อมูลราคาตั้งต้น</button>
  </section>
  <details class="card"><summary><h2>น้ำหนักคะแนน (แก้ไขได้)</h2></summary><div class="grid2">${weights}</div>
    <p class="muted small">ค่าเริ่มต้น: การเงิน 40 • ใช้เอง 20 • ราคา/kWp 15 • ประกัน 15 • ความมั่นใจข้อมูล 10 — ข้อมูลประกันที่ไม่ทราบได้ 0 คะแนน</p></details>
  <section class="card"><h2>เช็กลิสต์ก่อนตัดสินใจ</h2><ul class="checklist">${r.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>
  <p class="muted small">ข้อมูลราคา ณ ${DATA_AS_OF} จากหน้าเว็บผู้ขาย เพื่อการทดสอบ/ศึกษาเท่านั้น ไม่ใช่การรับรองหรือโฆษณา ตรวจราคาล่าสุดก่อนใช้งานจริง</p>`;
}

/* ---------------------------------------------------------------- ขนาดที่เหมาะ (WGSL sweep) */
export function renderSize(s: AppState, m: Model, sw: SweepOutput | null, verify: string): string {
  if (!sw) return `<section class="card"><p>กำลังคำนวณด้วย GPU…</p></section>`;
  const pm = m.rec.priceModel;
  const om = 1500;
  const nS = sw.sizes.length;
  const curD = sw.dayFractions.reduce((best, d, i) => (Math.abs(d - s.scenario.dayUseFraction) < Math.abs(sw.dayFractions[best]! - s.scenario.dayUseFraction) ? i : best), 0);
  const roof = m.roofArea;
  const payback = (i: number, kwp: number) => {
    const net = sw.grossSaving[i]! - om;
    return net > 0 ? estimateCapex(pm, kwp) / net : null;
  };
  const color = (pb: number | null) => (pb == null ? 'var(--surface-2)' : `hsl(${(130 * (1 - Math.min(1, Math.max(0, (pb - 4) / 9)))).toFixed(0)} 65% 52% / .85)`);

  let rows = '';
  for (let d = sw.dayFractions.length - 1; d >= 0; d--) {
    let bestS = -1;
    let bestPb = Infinity;
    sw.sizes.forEach((kwp, si) => {
      const pb = payback(d * nS + si, kwp);
      const fits = roof == null || kwp * s.assumptions.areaPerKwp <= roof;
      if (pb != null && fits && pb < bestPb) {
        bestPb = pb;
        bestS = si;
      }
    });
    rows += `<tr class="${d === curD ? 'cur' : ''}"><th>${pct(sw.dayFractions[d])}</th>${sw.sizes
      .map((kwp, si) => {
        const i = d * nS + si;
        const pb = payback(i, kwp);
        const fits = roof == null || kwp * s.assumptions.areaPerKwp <= roof;
        return `<td style="background:${color(pb)}" class="${si === bestS ? 'best' : ''}${fits ? '' : ' nofit'}" data-action="custom-size" data-kwp="${kwp}" title="${num(kwp, 1)} kWp • ใช้กลางวัน ${pct(sw.dayFractions[d])} • คืนทุน ${pb ? num(pb, 1) : '–'} ปี • ใช้เอง ${pct(sw.selfUseKwh[i]! / sw.pvKwh[i]!)}">${pb ? num(pb, 1) : '–'}</td>`;
      })
      .join('')}</tr>`;
  }
  const head = `<tr><th>กลางวัน ↓ / kWp →</th>${sw.sizes.map((k) => `<th>${num(k, 1)}</th>`).join('')}</tr>`;

  const cats = sw.sizes.map((k) => num(k, 1));
  const base = curD * nS;
  const selfChart = chart({
    title: `ใช้ไฟกลางวัน ${pct(sw.dayFractions[curD])}: ยิ่งติดใหญ่ ไฟจากแผงยิ่งถูกใช้เองน้อยลง (%)`,
    categories: cats,
    series: [{ label: 'ใช้เอง % ของไฟที่ผลิต', values: sw.sizes.map((_, si) => (100 * sw.selfUseKwh[base + si]!) / (sw.pvKwh[base + si]! || 1)), color: 'var(--c-self)', type: 'bar' }],
    labelEvery: 2,
    height: 170,
  });
  const pbChart = chart({
    title: 'ระยะคืนทุนตามขนาด (ปี) — จุดต่ำสุดคือขนาดที่คุ้มที่สุด',
    categories: cats,
    series: [{ label: 'คืนทุน (ปี)', values: sw.sizes.map((k, si) => payback(base + si, k) ?? NaN), color: 'var(--c-money)', type: 'line' }],
    labelEvery: 2,
    height: 170,
    yFormat: (n) => num(n, 0),
  });

  return `
  <section class="card">
    <h2>หาขนาดที่เหมาะ: ${sw.sizes.length * sw.dayFractions.length} สถานการณ์</h2>
    <p class="muted">แต่ละช่อง = ระยะคืนทุน (ปี) ที่ราคาตลาดประมาณ <b>${thb(pm.fixed)} + ${thb(pm.perKwp)} × kWp</b> (ถดถอยจาก ${pm.points} แพ็กเกจที่รู้ราคา All-in) • ขอบหนา = ดีที่สุดในแถวที่หลังคารองรับ • ลาย = หลังคาไม่พอ • แตะช่องเพื่อดูขนาดนั้นใน 3D</p>
    <div class="heat-wrap"><table class="heat">${head}${rows}</table></div>
    <p class="gpu-note">${badge(sw.backend === 'webgpu-wgsl' ? 'คำนวณบน GPU ด้วย WGSL compute shader' : 'คำนวณบน CPU (เบราว์เซอร์นี้ไม่รองรับ WebGPU)', sw.backend === 'webgpu-wgsl' ? 'good' : 'mute')} ${num(sw.ms, 1)} ms ${verify}</p>
  </section>
  <section class="card">${pbChart}${selfChart}</section>
  <section class="card"><h2>ทำไมไม่ติดให้ใหญ่ที่สุด?</h2><ul class="explain">${m.rec.insights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
}

/* ---------------------------------------------------------------- เรียนรู้ */
export function renderLearn(): string {
  const types = [
    ['On-Grid', 'ไม่มี', 'ปกติไม่ได้ (anti-islanding)', 'บ้านใช้ไฟช่วงแดดออกมาก', 'ราคาต่ำ คืนทุนมักไว', 'ต้องขออนุญาตขนานไฟ; ไฟส่วนเกินไม่มีรายได้อัตโนมัติ'],
    ['Hybrid + Battery', 'มี', 'ได้เฉพาะระบบ Backup ที่ออกแบบรองรับ', 'ต้องการไฟสำรอง/ใช้กลางคืน', 'เก็บไฟไว้ใช้หลังพระอาทิตย์ตก', 'มี SOC รอบชาร์จ ประสิทธิภาพ ค่าเปลี่ยนแบต'],
    ['Hybrid (ยังไม่มีแบต)', 'ยังไม่มี', 'โดยทั่วไปไม่ได้', 'เตรียมขยายในอนาคต', 'เลือกอินเวอร์เตอร์รองรับแบตได้', 'ต้องยืนยัน compatibility และ backup config'],
    ['Off-Grid', 'จำเป็น', 'ได้ถ้าเก็บ/ผลิตพอ', 'พื้นที่ไม่มีไฟการไฟฟ้า', 'พึ่งพาการไฟฟ้าน้อยลง', 'แบตใหญ่ ต้อง sizing โหลดหนักและฤดูฝน'],
  ];
  const terms = [
    ['kW', 'กำลังไฟ ณ ขณะหนึ่ง เช่น แอร์ 1 kW'],
    ['kWh (หน่วย)', 'พลังงานสะสม — แอร์ 1 kW เปิด 2 ชม. = 2 kWh = 2 หน่วยในบิล'],
    ['kWp (DC)', 'กำลังรวมของแผง เช่น 590 W × 8 แผง = 4.72 kWp'],
    ['Inverter (AC kW)', 'แปลงไฟจากแผงเป็นไฟบ้าน เช่น 5 kW — ไม่ใช่ขนาดแผง'],
    ['Self-consumption', 'ไฟจากแผงที่บ้านใช้ทันที ต้องใช้ไฟ "ตรงเวลา" ที่แผงผลิต'],
    ['Gross vs Net', 'ประหยัดขั้นต้น = ค่าไฟที่ลดลง; สุทธิ = หักค่าดูแลรักษาแล้ว'],
    ['Ft', 'ค่าไฟผันแปร ปรับทุก 4 เดือน (ก.ย.–ธ.ค. 2569 = 0.1623 บาท/หน่วย)'],
    ['VAT', '7% คิดบนค่าพลังงาน + Ft + ค่าบริการ; ราคาแพ็กเกจต้องเทียบแบบรวม VAT'],
    ['e-Tax / ลดหย่อน', 'ลด "ฐานภาษี" สูงสุด 200,000 ไม่ใช่ได้เงินคืน 200,000 — ขึ้นกับอัตราภาษีของคุณ'],
  ];
  return `
  <section class="card"><h2>Solar 101 — 9 คำที่ควรรู้</h2>
    <dl class="terms">${terms.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
  <section class="card"><h2>ประเภทระบบ</h2><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ประเภท</th><th>แบต</th><th>ไฟดับใช้ได้?</th><th>เหมาะกับ</th><th>ข้อดี</th><th>ข้อควรระวัง</th></tr></thead>
    <tbody>${types.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted small">แอปนี้คำนวณ ROI อัตโนมัติเฉพาะ On-Grid; Hybrid/แบตเตอรี่ต้องจำลองเพิ่ม (Advanced simulation required)</p></section>
  <section class="card"><h2>วิธีคำนวณ (ตรงกับไฟล์ Excel)</h2><ol class="explain">
    <li>คำนวณย้อนจากยอดบิลเป็น kWh ด้วยอัตราก้าวหน้า 1.2: 1–200 หน่วย 3.0000, 201–400 หน่วย 4.1584, 401+ หน่วย 4.3583 บาท + Ft + ค่าบริการ 24.62 + VAT 7%</li>
    <li>กระจายการใช้ไฟเป็น 24 ชั่วโมงตามสัดส่วนกลางวัน/กลางคืน × 12 เดือน</li>
    <li>ไฟจากแผง = kWp × ผลผลิต/วัน × จำนวนวัน × ตัวคูณแสงรายเดือน × เงา × ทิศหลังคา × สัดส่วนแดดรายชั่วโมง</li>
    <li>ใช้เอง = min(โหลดบ้าน, ไฟจากแผง) ทีละชั่วโมง; ไฟส่วนเกินคิดรายได้ 0 บาท</li>
    <li>ประหยัด = บิล(ก่อน) − บิล(หลัง) แยกขั้นบันไดทุกเดือน — ไม่ใช่หน่วยที่ใช้เอง × ค่าไฟเฉลี่ย</li>
    <li>คืนทุน = เงินลงทุนรวม VAT + ค่าหน้างาน ÷ ประหยัดสุทธิปีแรก; กระแสเงินสด 25 ปี มีค่าเสื่อมแผง 0.5%/ปี</li>
  </ol></section>
  <section class="card"><h2>ทำไมไฟดับแล้ว On-Grid ไม่ทำงาน?</h2><p>อินเวอร์เตอร์ On-Grid ต้องหยุดจ่ายไฟเมื่อไฟการไฟฟ้าดับ (anti-islanding) เพื่อความปลอดภัยของช่างที่ซ่อมสายไฟ ถ้าต้องการไฟสำรองต้องใช้ Hybrid ที่มีวงจร Backup/EPS</p></section>
  <section class="card"><h2>แหล่งอ้างอิง</h2><ul class="explain">${SOURCES.map((x) => `<li><a href="${x.url}" target="_blank" rel="noopener">${esc(x.label)} ↗</a></li>`).join('')}</ul>
    <p class="muted small">ใช้เพื่อการศึกษาก่อนตัดสินใจ ไม่ใช่แบบทางวิศวกรรมหรือคำปรึกษาภาษีรายบุคคล ก่อนติดตั้งจริงต้องให้วิศวกรตรวจหลังคา ระบบไฟ และขออนุญาตเชื่อมต่อกับ MEA/PEA</p></section>`;
}

export function monthOptions(cur: number): string {
  return MONTH_NAMES_TH.map((n, i) => opt(i, n, cur)).join('');
}
