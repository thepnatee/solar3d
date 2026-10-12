# Solar Advisor 3D ☀️🏠

เว็บแอปภาษาไทยสำหรับเจ้าของบ้าน: **บ้าน 3 มิติบนเกาะจำลองที่ "ติด" โซลาร์เซลล์บนหลังคา** ปรับข้อมูลบ้าน/ค่าไฟได้ทันที คำนวณค่าไฟก่อน-หลังติด เงินประหยัด ระยะคืนทุน และ **แนะนำผู้ติดตั้ง** จากราคาแพ็กเกจที่เปรียบเทียบแบบ apples-to-apples

- **คำนวณค่าไฟจริงแบบขั้นบันได** (ประเภท 1.2 + Ft + VAT) จากยอดเงิน, จำนวนหน่วยในบิล หรือ**หน่วยย้อนหลังรายเดือน** (≥3 เดือนจะใช้รูปแบบหน้าร้อน/หน้าหนาวของบ้านคุณ)
- **แนะนำว่าต้องกรอกอะไร หาจากไหน** — ภาพจำลองบิลชี้ช่อง (A) ยอดเงิน (B) จำนวนหน่วย, แอป MEA Smart Life / PEA Smart Plus สำหรับบิลย้อนหลัง, ดูเฟสจากมิเตอร์, วัดหลังคาจาก Google Maps, เครื่องคำนวณ % ใช้ไฟกลางวันจาก**เลขมิเตอร์ 06:00 / 18:00**, แถบ "ความครบของข้อมูล" พร้อมปุ่มพาไปช่องที่ยังขาด
- **ผล & คำแนะนำ** — สรุป "ควรติดไหม / ติดเท่าไร / ทำอะไรต่อ" + ตัวเลขค่าไฟก่อน-หลัง คืนทุน NPV กราฟ และเหตุผล
- **แยกกลางวัน / กลางคืน** — ไฟแต่ละช่วงใช้เท่าไร แผงช่วยได้กี่ % กลางคืนยังจ่ายเท่าไร และจำลอง "ถ้าย้ายการใช้ไฟมากลางวันจะประหยัดเพิ่มเท่าไร" พร้อมไอเดียย้ายโหลด
- **3D: Three.js `WebGPURenderer`** (WebGPU, fallback WebGL2) — บ้าน low-poly บนเกาะจำลอง แผงตามแพ็กเกจจริง เงาตามตำแหน่งดวงอาทิตย์ เส้นพลังงาน และการ์ดสถานะสดแยกกลางวัน/กลางคืน
- **WGSL**: ลายเซลล์แผง (`wgslFn`) + compute shader `src/gpu/sweep.wgsl` จำลอง 152 สถานการณ์ขนาดแผง × % กลางวัน แล้วตรวจเทียบ CPU
- **บันทึกอัตโนมัติในเครื่องนี้ (localStorage)** — ไม่มีเซิร์ฟเวอร์/ฐานข้อมูล/analytics ไม่มีคำขอไปเว็บภายนอก ลบได้ด้วยปุ่ม "ล้างข้อมูล"; ลิงก์แชร์ใส่ค่าไว้ใน URL

> ⚠️ ประมาณการเพื่อการศึกษา ไม่ใช่แบบทางวิศวกรรมหรือการรับประกันเงินประหยัด ราคาบริษัทเป็นข้อมูลจากหน้าเว็บ ณ 12 ต.ค. 2569 เพื่อทดสอบ — ตรวจราคาล่าสุดก่อนใช้จริง

## ใช้งาน (6 แท็บ)

| แท็บ | ทำอะไร |
|---|---|
| **① กรอกข้อมูล** | คู่มือเริ่มต้น + ภาพจำลองบิล, ความครบของข้อมูล, ค่าไฟ/หน่วย/บิลย้อนหลัง/เฟส (มี 💡 "หาจากไหน?" ทุกช่อง), % กลางวัน + เครื่องคำนวณจากเลขมิเตอร์, ขนาด/ทิศหลังคา |
| **② ผล & คำแนะนำ** | คำตัดสิน + แพ็กเกจที่เหมาะ + ขนาดที่คืนทุนเร็วสุด + ขั้นต่อไป, KPI, กราฟรายเดือน, แยกบิล, กระแสเงินสด 25 ปี, CSV/พิมพ์/แชร์ |
| **③ กลางวัน/คืน** | สัดส่วนไฟกลางวัน vs กลางคืน, แผงแทนได้กี่ %, ค่าไฟกลางคืนที่เหลือ, ตารางจำลองย้ายการใช้ไฟ, กราฟ 24 ชม., ไอเดียย้ายโหลด, เรื่องแบตเตอรี่ |
| **ผู้ติดตั้ง** | จัดอันดับแยก "ใบเสนอราคายืนยันแล้ว" กับ "ราคาประกาศ", เหตุผลที่ไม่จัดอันดับ, เพิ่ม/แก้ใบเสนอราคา, เช็กลิสต์ก่อนซื้อ |
| **ขนาดที่เหมาะ** | Heatmap ระยะคืนทุนจาก WGSL compute shader, ทำไมไม่ควรติด 8/10 kW |
| **เรียนรู้** | Solar 101, ประเภทระบบ, วิธีคำนวณ, แหล่งอ้างอิง |

ภาพ 3D อยู่ด้านขวา (มือถืออยู่ด้านบน) — ปุ่ม 09:00 / 12:00 / 17:00 / 21:00 หรือแถบเวลา ▶ แสดงว่าแต่ละช่วงแผงผลิตเท่าไร บ้านใช้เท่าไร ซื้อจากการไฟฟ้าเท่าไร (ค่าจาก engine ชั่วโมงนั้นจริง) แถบ 12 เดือนแสดง kWh ที่แผงผลิตแต่ละเดือน

## Deploy บน Vercel

มี `vercel.json` ตั้งค่าไว้แล้ว (Vite → `dist/`, cache ไฟล์ assets 1 ปี) — ไม่ต้องตั้ง environment variable ใด ๆ เพราะแอปไม่มี backend/ฐานข้อมูล

**ตรวจการตั้งค่า (ถ้า push แล้วเว็บไม่เปลี่ยน)**
- Settings → Git → Connected Git Repository = `thepnatee/solar3d`
- Settings → Environments → Production → Branch Tracking = `main`
- Settings → Git → Deploy Hooks: สร้าง hook ของ branch `main` ไว้สั่ง deploy เองได้ด้วย `curl -X POST <hook-url>` (เก็บ URL เป็นความลับ อย่า commit ลง repo)
- Vercel deploy เฉพาะ commit ที่ push **หลัง** ผูก repo — commit ก่อนหน้านั้นต้องกด Redeploy หรือยิง hook

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
    daynight.ts      # แยกกลางวัน/กลางคืน, จำลองย้ายการใช้ไฟ, % กลางวันจากเลขมิเตอร์
    sweep.ts         # CPU reference ของ WGSL sweep
    validate.ts      # ตรวจ input + ระดับความมั่นใจ
  gpu/sweep.wgsl     # WGSL compute shader
  gpu/gpu-sweep.ts   # WebGPU compute (ใช้ GPUDevice เดียวกับ renderer) + fallback CPU
  scene/             # Three.js WebGPU: เกาะ+ทะเล (island), บ้าน (house), สวน/รถ/เสาไฟ (props), แผง (wgslFn),
                     # ท้องฟ้า/ดาวตามเวลา, เส้นพลังงาน
  data/seed.ts       # ผู้ติดตั้ง/แพ็กเกจ/แหล่งอ้างอิง (จาก solar_recommendation_calculator_2569.xlsx)
  ui/                # หน้าจอ (vanilla TS), กราฟ SVG, ฟอร์มแก้ใบเสนอราคา, state + localStorage + ลิงก์แชร์
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
- ค่าที่กรอกและใบเสนอราคาที่เพิ่ม/แก้ บันทึกใน localStorage ของเบราว์เซอร์เครื่องนั้นเท่านั้น (key `solar-advisor-3d:v2`)

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
