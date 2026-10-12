export type WeatherId = 'sunny' | 'partly' | 'cloudy' | 'rain' | 'storm';

export interface WeatherInfo {
  id: WeatherId;
  label: string;
  icon: string;
  /** ตัวคูณกำลังผลิต "ขณะนั้น" เทียบวันเฉลี่ยของเดือน (ใช้กับภาพสดเท่านั้น ไม่กระทบผลรายปี) */
  pv: number;
  /** ความแรงแสงแดดตรงในฉาก */
  sun: number;
  clouds: number;
  rain: number;
  desc: string;
}

export const WEATHER: Record<WeatherId, WeatherInfo> = {
  sunny: { id: 'sunny', label: 'แดดจัด', icon: '☀️', pv: 1.15, sun: 1, clouds: 3, rain: 0, desc: 'ฟ้าใส แผงรับแดดเต็มที่ ผลิตไฟสูงกว่าวันเฉลี่ย' },
  partly: { id: 'partly', label: 'มีเมฆบางส่วน', icon: '🌤️', pv: 1, sun: 0.85, clouds: 8, rain: 0, desc: 'วันทั่วไปของไทย — ตรงกับค่าเฉลี่ยที่ใช้คำนวณรายปี' },
  cloudy: { id: 'cloudy', label: 'เมฆมาก', icon: '☁️', pv: 0.5, sun: 0.3, clouds: 16, rain: 0, desc: 'แสงกระจายผ่านเมฆ แผงยังผลิตได้ราวครึ่งหนึ่ง' },
  rain: { id: 'rain', label: 'ฝนตก', icon: '🌧️', pv: 0.28, sun: 0.12, clouds: 18, rain: 1, desc: 'ฝนช่วยล้างฝุ่นบนแผง แต่ผลิตไฟได้น้อย' },
  storm: { id: 'storm', label: 'พายุฝนฟ้าคะนอง', icon: '⛈️', pv: 0.15, sun: 0.06, clouds: 20, rain: 1.7, desc: 'เมฆหนา ผลิตไฟน้อยมาก บ้านใช้ไฟจากการไฟฟ้าเป็นหลัก' },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];

/** สภาพอากาศตัวแทนของแต่ละเดือนในไทย (ใช้ตั้งค่าเริ่มต้นเมื่อเลือกเดือน) */
export const MONTH_WEATHER: WeatherId[] = ['sunny', 'sunny', 'sunny', 'partly', 'partly', 'cloudy', 'rain', 'rain', 'rain', 'cloudy', 'partly', 'sunny'];
