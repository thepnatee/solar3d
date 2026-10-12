import { monthlyHistory } from './simulate';
import type { Assumptions, Scenario } from './types';

export interface ValidationIssue {
  field: string;
  level: 'error' | 'warning';
  message: string;
}

/** ตรวจค่าที่ผู้ใช้กรอก — error = คำนวณไม่ได้, warning = คำนวณได้แต่ความมั่นใจต่ำ */
export function validateInputs(s: Scenario, a: Assumptions): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const err = (field: string, message: string) => out.push({ field, level: 'error', message });
  const warn = (field: string, message: string) => out.push({ field, level: 'warning', message });

  if (!(s.billMonthlyThb > 0) && !(s.billedKwh != null && s.billedKwh > 0)) err('billMonthlyThb', 'ค่าไฟต่อเดือนต้องมากกว่า 0');
  if (s.billedKwh != null && s.billedKwh < 0) err('billedKwh', 'จำนวนหน่วยต้องไม่ติดลบ');
  if (!(s.dayUseFraction >= 0 && s.dayUseFraction <= 1)) err('dayUseFraction', 'สัดส่วนใช้ไฟกลางวันต้องอยู่ระหว่าง 0–100%');
  if (s.roofAreaM2 != null && s.roofAreaM2 < 0) err('roofAreaM2', 'พื้นที่หลังคาต้องไม่ติดลบ');
  if (!(a.shadeMultiplier > 0 && a.shadeMultiplier <= 1)) err('shadeMultiplier', 'ตัวคูณเงาต้องอยู่ระหว่าง 0–1');
  if (!(a.yieldKwhPerKwpPerDay > 0)) err('yield', 'ผลผลิตต่อ kWp ต้องมากกว่า 0');
  else if (a.yieldKwhPerKwpPerDay < 2.5 || a.yieldKwhPerKwpPerDay > 5) warn('yield', 'ผลผลิต kWh/kWp/วัน ผิดปกติสำหรับประเทศไทย (ปกติ ~3.3–4.3)');
  if (a.discountRate < 0 || a.annualDegradation < 0) err('assumptions', 'อัตราคิดลด/การเสื่อมต้องไม่ติดลบ');

  if (s.phase === 0) warn('phase', 'ยังไม่ทราบจำนวนเฟส — ระบบจะไม่จัดอันดับแพ็กเกจจนกว่าจะยืนยัน');
  if (s.roofAreaM2 == null) warn('roofAreaM2', 'ยังไม่ทราบพื้นที่หลังคา — ผลลัพธ์ความมั่นใจต่ำ');
  const kwh = monthlyHistory(s)?.average ?? (s.billedKwh || null);
  if (kwh != null && kwh < 150) warn('tariff', 'ใช้ไฟไม่ถึง 150 หน่วย/เดือน — บิลอาจเป็นประเภท 1.1 ซึ่งอัตราต่างจากที่แอปใช้ (1.2) ตรวจช่อง "ประเภท" ในบิล');
  if (s.billedKwh != null && s.billedKwh > 0 && s.billMonthlyThb > 0) {
    // ตรวจความสอดคล้องเบื้องต้นระหว่างยอดเงินกับหน่วย (ค่าไฟเฉลี่ยบ้านไทย ~3–5.5 บาท/หน่วย)
    const avg = s.billMonthlyThb / s.billedKwh;
    if (avg < 2.5 || avg > 6.5) warn('billedKwh', `ยอดเงิน/หน่วย = ${avg.toFixed(2)} บาท ดูผิดปกติ — ตรวจตัวเลขในบิลอีกครั้ง`);
  }
  return out;
}

export function confidenceLabel(s: Scenario): { level: number; label: string } {
  const hist = monthlyHistory(s);
  const hasBill = !!hist || !!s.billedKwh;
  if (s.roofSurveyed && hist) return { level: 4, label: 'ตรวจหลังคาแล้ว + บิลย้อนหลัง' };
  if (s.roofSurveyed && hasBill) return { level: 3, label: 'ตรวจหลังคาแล้ว + มีบิลจริง' };
  if (hist) return { level: 3, label: `มีบิลย้อนหลัง ${hist.months} เดือน` };
  if (s.roofSurveyed) return { level: 2, label: 'ตรวจหลังคาแล้ว' };
  if (s.billedKwh) return { level: 2, label: 'มีหน่วยจากบิลจริง' };
  return { level: 1, label: 'ประมาณการเบื้องต้น' };
}
