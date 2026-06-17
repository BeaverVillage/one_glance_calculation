export function getDayType(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'weekday';
  const day = date.getDay();
  if (day === 0) return 'holiday';
  if (day === 6) return 'saturday';
  return 'weekday';
}
export function getOperatingWindow(lot, dateString) {
  const dayType = getDayType(dateString);
  if (dayType === 'holiday') return { open: lot.holidayOpen, close: lot.holidayClose, dayType };
  if (dayType === 'saturday') return { open: lot.saturdayOpen, close: lot.saturdayClose, dayType };
  return { open: lot.weekdayOpen, close: lot.weekdayClose, dayType };
}
function minutesOfDay(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function isOpenDuring(lot, arrivalAt, departureAt) {
  const window = getOperatingWindow(lot, arrivalAt);
  const open = minutesOfDay(window.open);
  const close = minutesOfDay(window.close);
  if (open == null || close == null) return { isOpen: false, reason: '운영시간 정보 없음', ...window };
  if (open === 0 && close >= 1439) return { isOpen: true, reason: '24시간 운영으로 표시', ...window };
  const arrival = new Date(arrivalAt);
  const departure = new Date(departureAt);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) return { isOpen: false, reason: '일정 오류', ...window };
  const start = arrival.getHours() * 60 + arrival.getMinutes();
  const end = departure.getHours() * 60 + departure.getMinutes();
  const overnight = close < open;
  const fits = overnight ? (start >= open || end <= close) : (start >= open && end <= close);
  return { isOpen: fits, reason: fits ? '선택 시간 기준 운영 가능' : '선택 시간 일부가 운영시간 밖일 수 있음', ...window };
}
