/**
 * Centralized date utilities for the Equipment Management app.
 * Handles Vietnamese date format (dd/MM/yyyy) parsing, formatting, and strict validation.
 */

/**
 * Check if a given year is a leap year.
 */
export const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

/**
 * Get the maximum number of days in a given month (1-12) of a year.
 */
export const getDaysInMonth = (year: number, month: number): number => {
  if (month < 1 || month > 12) return 0;
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
};

/**
 * Validate that day is strictly valid for the given year and month.
 */
export const isValidDayInMonth = (year: number, month: number, day: number): boolean => {
  const maxDays = getDaysInMonth(year, month);
  return [year, month, day].every(Number.isInteger) && maxDays > 0 && day >= 1 && day <= maxDays;
};

/**
 * Check if a string is a strictly valid Vietnamese date (dd/MM/yyyy).
 */
export const isValidVietnameseDate = (dateStr: string): boolean => {
  return parseVietnameseDate(dateStr) !== null;
};

/**
 * Parse a Vietnamese date string (dd/MM/yyyy) into a Date object.
 * Returns null if the string is invalid, out of range, or does not exist (e.g. 31/02, 31/04).
 */
export const parseVietnameseDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return null;
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (year < 1900) return null;
  if (!isValidDayInMonth(year, month, day)) return null;

  // Month is 0-indexed in JS Date
  const date = new Date(year, month - 1, day);

  // Validate the date didn't overflow
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

/**
 * Check if a date string is valid under either Vietnamese or ISO format.
 */
export const isValidFlexibleDate = (dateStr: string): boolean => {
  return parseFlexibleDate(dateStr) !== null;
};

/**
 * Parse common date strings returned by Google Sheets / Apps Script.
 * Supports dd/MM/yyyy, dd/MM/yyyy HH:mm:ss, ISO strings (YYYY-MM-DD...), and Date-compatible strings.
 * Strictly forbids rollover (e.g. 2026-02-31 will return null).
 */
export const parseFlexibleDate = (dateStr: string): Date | null => {
  if (typeof dateStr !== 'string') return null;
  const value = dateStr.trim();
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value);
  if (!vn && !iso) {
    // Date.toString() values from older Sheets exports have a fixed, explicit offset.
    const legacy = /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{4}) (\d{2}:\d{2}:\d{2}) GMT([+-]\d{4})(?: \([^\r\n]*\))?$/.exec(value);
    if (!legacy) return null;
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(legacy[1]) + 1;
    return parseFlexibleDate(`${legacy[3]}-${String(month).padStart(2, '0')}-${legacy[2].padStart(2, '0')}T${legacy[4]}${legacy[5]}`);
  }
  const match = vn || iso!;
  const year = Number(match[vn ? 3 : 1]);
  const month = Number(match[2]);
  const day = Number(match[vn ? 1 : 3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  const millisecond = iso ? Number((iso[7] || '').padEnd(3, '0')) : 0;
  if (year < 1900 || !isValidDayInMonth(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  const zone = iso?.[8];
  if (zone) {
    let offset = 0;
    if (zone !== 'Z') {
      const digits = zone.slice(1).replace(':', '');
      const offsetHour = Number(digits.slice(0, 2));
      const offsetMinute = Number(digits.slice(2));
      if (offsetHour > 23 || offsetMinute > 59) return null;
      offset = (offsetHour * 60 + offsetMinute) * (zone[0] === '+' ? 1 : -1);
    }
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset * 60000);
  }
  // Date-only strings represent a calendar day, never UTC midnight.
  return new Date(year, month - 1, day, hour, minute, second, millisecond);
};

/**
 * Format a Date object to Vietnamese locale date string (dd/MM/yyyy).
 */
export const formatDateVN = (date: Date): string => {
  return date.toLocaleDateString('vi-VN');
};

/**
 * Format a Date object to Vietnamese datetime string.
 * Output: "HH:mm:ss, dd/MM/yyyy"
 */
export const formatDateTimeVN = (date: Date): string => {
  return `${date.toLocaleTimeString('vi-VN')}, ${date.toLocaleDateString('vi-VN')}`;
};

/**
 * Calculate the number of whole days remaining from baseDate/today (start of day)
 * to the target date (start of day).
 * Positive = future, Negative = past, 0 = today.
 */
export const daysUntil = (target: Date, baseDate?: Date): number => {
  const now = baseDate || new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  const diffMs = targetStart.getTime() - todayStart.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Check if a date string (dd/MM/yyyy) falls within a date range (inclusive).
 * Both `from` and `to` must also be in dd/MM/yyyy format.
 * Returns false if any date string is invalid.
 */
export const isDateInRange = (dateStr: string, from: string, to: string): boolean => {
  const date = parseVietnameseDate(dateStr);
  const fromDate = parseVietnameseDate(from);
  const toDate = parseVietnameseDate(to);

  if (!date || !fromDate || !toDate) return false;

  // Normalize to start of day for comparison
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const f = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const t = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();

  return d >= f && d <= t;
};
