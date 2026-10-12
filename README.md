# Solar Advisor 3D ☀️🏠

เว็บแอปภาษาไทยสำหรับเจ้าของบ้าน: **บ้าน 3 มิติบนเกาะจำลองที่ "ติด" โซลาร์เซลล์บนหลังคา** ปรับข้อมูลบ้าน/ค่าไฟได้ทันที คำนวณค่าไฟก่อน-หลังติด เงินประหยัด ระยะคืนทุน และ **แนะนำผู้ติดตั้ง** จากราคาแพ็กเกจที่เปรียบเทียบแบบ apples-to-apples

- **3D: Three.js `WebGPURenderer`** (WebGPU, fallback เป็น WebGL2 อัตโนมัติ) — บ้าน low-poly โทนพาสเทลบนเกาะลอยกลางทะเล (หน้าต่างมีกรอบ กระเบื้องหลังคา สวน รถ แท็งก์น้ำ คอยล์ร้อนแอร์ เสาไฟ), เงาจริงตามตำแหน่งดวงอาทิตย์ (ละติจูด/เดือน/ชั่วโมง), เส้นพลังงานเคลื่อนไหว, กลางคืนมีดาว/ดวงจันทร์/ไฟในบ้าน
- **สภาพอากาศ** ☀️🌤️☁️🌧️⛈️ — เมฆ ฝน ฟ้าแลบในฉาก และปรับกำลังผลิต "ขณะนั้น" (ผลรายปียังใช้ค่าเฉลี่ยรายเดือนตาม Excel), แถบ 12 เดือนแบบพยากรณ์อากาศแสดง kWh ที่ผลิตแต่ละเดือน
- **WGSL**: (1) ลายเซลล์แผงโซลาร์เขียนเป็น WGSL ผ่าน `wgslFn` (มี GLSL คู่กันสำหรับ WebGL2) (2) **compute shader** `src/gpu/sweep.wgsl` จำลองการจับคู่ไฟรายชั่วโมง + บิลขั้นบันไดของ 152 สถานการณ์ (ขนาด 1–10 kWp × การใช้ไฟกลางวัน 20–90%) บน GPU แล้วตรวจเทียบกับ CPU ทุกครั้ง
- **ไม่เก็บข้อมูลใด ๆ** — ไม่มี backend, ฐานข้อมูล, localStorage, cookie หรือ analytics; ค่าที่กรอกอยู่ในแท็บเบราว์เซอร์เท่านั้น (ปิดแท็บ = หาย) ยกเว้นลิงก์แชร์ที่ผู้ใช้กดคัดลอกเองซึ่งใส่ค่าไว้ใน URL
- build เป็นไฟล์ static — deploy บน Vercel ได้ทันที

> ⚠️ ประมาณการเพื่อการศึกษา ไม่ใช่แบบทางวิศวกรรมหรือการรับประกันเงินประหยัด ราคาบริษัทเป็นข้อมูลจากหน้าเว็บ ณ 12 ต.ค. 2569 เพื่อทดสอบ — ตรวจราคาล่าสุดก่อนใช้จริง

## ใช้งาน (5 แท็บ)

| แท็บ | ทำอะไร |
|---|---|
| **บ้าน & ค่าไฟ** | จังหวัด (MEA/PEA), 1/3 เฟส, ค่าไฟ/เดือน หรือหน่วย kWh จริง, % ใช้ไฟกลางวัน, รูปแบบการใช้ไฟ, ขนาดบ้าน/ความชัน/ทิศหลังคา (เห็นใน 3D), สมมติฐานขั้นสูง |
| **ผลคำนวณ** | ค่าไฟก่อน/หลัง, ประหยัด, ลงทุน, คืนทุน (ช่วงแดดดี–แย่), NPV, กราฟ 24 ชม. / รายเดือน / กระแสเงินสด 25 ปี, แยกบิล (ค่าพลังงาน Ft ค่าบริการ VAT), CSV, พิมพ์, ลิงก์แชร์ |
| **ผู้ติดตั้ง** | จัดอันดับแยก "ใบเสนอราคายืนยันแล้ว" กับ "ราคาประกาศ", เหตุผลที่ไม่จัดอันดับ (VAT ไม่ทราบ, โปรหมดอายุ, หลังคาไม่พอ, เฟสไม่ตรง, แบตเตอรี่), คะแนน 5 ด้าน (แก้น้ำหนักได้), เพิ่ม/แก้ใบเสนอราคาเอง, เช็กลิสต์ก่อนซื้อ |
| **ขนาดที่เหมาะ** | Heatmap ระยะคืนทุนจาก WGSL compute shader, ทำไมไม่ควรติด 8/10 kW, แตะช่องเพื่อดูขนาดนั้นใน 3D |
| **เรียนรู้** | Solar 101: kW vs kWh, DC vs AC, On-grid vs Hybrid, Ft, VAT, e-Tax, ทำไมไฟดับแล้ว On-grid ไม่ทำงาน |

ใต้ภาพ 3D มีแถบเวลา ▶ (เล่นทั้งวัน) และแถบ 12 เดือน — ตัวเลข kW ใหญ่มุมซ้ายบนมาจาก engine ชั่วโมงนั้นจริง × ตัวคูณสภาพอากาศ

## Deploy บน Vercel

มี `vercel.json` ตั้งค่าไว้แล้ว (Vite → `dist/`, cache ไฟล์ assets 1 ปี) — ไม่ต้องตั้ง environment variable ใด ๆ เพราะแอปไม่มี backend/ฐานข้อมูล

**ทางที่ 1 — ผ่านหน้าเว็บ (แนะนำ, deploy อัตโนมัติทุกครั้งที่ push)**
1. เข้า https://vercel.com/new → Import Git Repository → เลือก `thepnatee/solar3d`
2. Framework Preset จะขึ้น **Vite** เอง → กด **Deploy**
3. ได้ลิงก์ `https://solar3d-xxxx.vercel.app` — push เข้า `main` = production, push branch อื่น = preview

**ทางที่ 2 — Vercel CLI**
```bash
npm i -g vercel
vercel          # ครั้งแรกจะถามให้ login และผูกโปรเจกต์
vercel --prod   # deploy production
```

ใช้ host static อื่นก็ได้: `npm ci && npm run build` แล้วอัปโหลดโฟลเดอร์ `dist/` (path เป็นแบบ relative) — GitHub Actions (`.github/workflows/ci.yml`) รัน test + build ทุก push

## พัฒนาบนเครื่อง
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest) — ค่าไฟ, invert bill, invariants, Excel parity, การเงิน, การจัดอันดับ, ดวงอาทิตย์, หลังคา
npm run build      # typecheck + production build
```
WebGPU ใช้ได้บน Chrome/Edge 113+, Safari 26+, Firefox 141+ (Windows); เบราว์เซอร์อื่นใช้ WebGL2 อัตโนมัติ — ผลคำนวณเหมือนกันทุกกรณี

## โครงสร้าง
```text
src/
  engine/            # pure functions ไม่มี network/DOM — ทดสอบได้ทั้งหมด
    tariff.ts        # อัตราก้าวหน้า 1.2 (ก.ย. 2569) + Ft 0.1623 + ค่าบริการ 24.62 + VAT 7%, invertBill แบบ piecewise
    profiles.ts      # โหลด 24 ชม., รูปทรงแดด, ตัวคูณรายเดือน, ตัวคูณทิศหลังคา
    simulate.ts      # จับคู่โหลด-แผงทีละชั่วโมง × 12 เดือน, บิลก่อน/หลัง
    financial.ts     # capex (VAT), คืนทุน, กระแสเงินสด 25 ปี, NPV, break-even, ภาษี (ปิดเป็นค่าเริ่มต้น), price model
    recommend.ts     # ตรวจเงื่อนไข, แยกกลุ่ม confirmed/indicative, คะแนน, คำอธิบาย, เช็กลิสต์
    sweep.ts         # CPU reference ของ WGSL sweep
    validate.ts      # ตรวจ input + ระดับความมั่นใจ
  gpu/sweep.wgsl     # WGSL compute shader
  gpu/gpu-sweep.ts   # WebGPU compute (ใช้ GPUDevice เดียวกับ renderer) + fallback CPU
  scene/             # Three.js WebGPU: เกาะ+ทะเล (island), บ้าน (house), สวน/รถ/เสาไฟ (props), แผง (wgslFn),
                     # เมฆ/ฝน/ดาว (weather), ท้องฟ้าตามเวลา+อากาศ, เส้นพลังงาน
  data/seed.ts       # ผู้ติดตั้ง/แพ็กเกจ/แหล่งอ้างอิง (จาก solar_recommendation_calculator_2569.xlsx)
  ui/                # หน้าจอ (vanilla TS), กราฟ SVG, ฟอร์มแก้ใบเสนอราคา, state ในหน่วยความจำ + ลิงก์แชร์
tests/               # Vitest
```

### Mapping จากไฟล์ Excel
| ชีต | โค้ด |
|---|---|
| Inputs / Tariff | `data/seed.ts` (DEFAULT_SCENARIO/ASSUMPTIONS), `engine/tariff.ts` |
| Load_Profile / Months | `engine/profiles.ts` |
| Hourly_Model / Offer_Monthly | `engine/simulate.ts` (+ `gpu/sweep.wgsl` สำหรับ sweep) |
| Offers / Dashboard | `data/seed.ts` (SEED_OFFERS), `engine/recommend.ts` |
| Cashflow_25Y | `engine/financial.ts` |
| System_Types / Sources | แท็บ "เรียนรู้" |

ผลตรวจเทียบ Excel (ค่าไฟ 3,500 บาท, กลางวัน 80%, GR5-SG 4.72 kWp): ผลิต ~6,055 kWh/ปี, ใช้เอง ~5,797 kWh, ประหยัดขั้นต้น ~27,792 บาท/ปี, คืนทุน ~5.5 ปี — อยู่ใน `tests/engine.test.ts`

## กติกาการคำนวณที่สำคัญ
- ประหยัด = `bill(ก่อน) − bill(หลัง)` แยกขั้นบันไดทุกเดือน (ไม่ใช่หน่วยใช้เอง × ค่าไฟเฉลี่ย); ไฟส่วนเกินมีรายได้ 0 บาท
- ใช้ไฟกลางวัน 80% ≠ ใช้ไฟจากแผง 80% — คำนวณแบบ time-matched
- ใช้ **DC kWp จริง** (เช่น 8 × 590 W = 4.72 kWp ไม่ใช่ 5.0) แยกจากอินเวอร์เตอร์ AC kW
- ราคา VAT ไม่ทราบ → ไม่แสดงเป็นราคา All-in และไม่จัดอันดับ; โปรหมดอายุ → ไม่จัดอันดับ
- จัดอันดับเพื่อซื้อเฉพาะ `CONFIRMED_QUOTE`; ราคาประกาศแยกเป็นกลุ่มสำรวจตลาด
- Hybrid/แบตเตอรี่ → ไม่คำนวณ ROI ด้วยสูตร On-grid (Advanced simulation required)
- สิทธิลดหย่อนภาษีปิดเป็นค่าเริ่มต้น และเป็นการลดฐานภาษี ไม่ใช่เงินคืน
- ใบเสนอราคาที่เพิ่ม/แก้ในแอปอยู่ในแท็บนั้นเท่านั้น ไม่ถูกบันทึกหรือส่งออกไปที่ใด (ใช้ "ดาวน์โหลด CSV" ถ้าต้องการเก็บ)

## ข้อจำกัด & แผนต่อไป
- ผลผลิต 3.7 kWh/kWp/วัน, ตัวคูณแสงรายเดือน, ตัวคูณทิศหลังคา เป็นค่าประมาณ (แก้ได้) — ยังไม่ใช้ PVGIS/8760 ชม., ไม่ทำ AC clipping ระดับ 15 นาที, ไม่คำนวณเงาจากรูปทรงจริง
- รองรับอัตรา 1.2 ก.ย.–ธ.ค. 2569 เท่านั้น (ไม่รองรับ TOU)
- ไม่มีฐานข้อมูลกลาง — ราคาผู้ติดตั้งแก้ที่ `src/data/seed.ts` แล้ว push (Vercel deploy ให้อัตโนมัติ)
- Phase 2: PVGIS, import CSV มิเตอร์รายชั่วโมง, OCR บิล (ตรวจด้วยคน), TOU, จำลองแบตเตอรี่ Hybrid, ฐานข้อมูลราคากลาง + admin

## แหล่งอ้างอิง
- โครงสร้างค่าไฟบ้านใหม่ ก.ย. 2569: https://www.pea.co.th/news/corporate-news/2412
- ค่า Ft: https://www.erc.or.th/th/document-ft
- สิทธิภาษี Solar Rooftop: https://www.energy.go.th/th/minister-news/30414
- ราคาแพ็กเกจ: GRoof, MASTEC, We Serve Solar, SOLAR X (ลิงก์ใน `src/data/seed.ts`)
