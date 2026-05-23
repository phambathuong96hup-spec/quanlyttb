/**
 * Centralized date utilities for the Equipment Management app.
 * Handles Vietnamese date format (dd/MM/yyyy) parsing, formatting, and calculations.
 */

/**
 * Parse a Vietnamese date string (dd/MM/yyyy) into a Date object.
 * Returns null if the string is invalid or cannot be parsed.
 */
export const parseVietnameseDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;

  // Month is 0-indexed in JS Date
  const date = new Date(year, month - 1, day);

  // Validate the date didn't overflow (e.g. Feb 31 → Mar 3)
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
 * Parse common date strings returned by Google Sheets / Apps Script.
 * Supports dd/MM/yyyy, dd/MM/yyyy HH:mm:ss, ISO strings, and Date-compatible strings.
 */
export const parseFlexibleDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  const vnMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (vnMatch) {
    const [, dayText, monthText, yearText, hourText = '0', minuteText = '0', secondText = '0'] = vnMatch;
    const day = parseInt(dayText, 10);
    const month = parseInt(monthText, 10);
    const year = parseInt(yearText, 10);
    const hour = parseInt(hourText, 10);
    const minute = parseInt(minuteText, 10);
    const second = parseInt(secondText, 10);
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
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
 * Calculate the number of whole days remaining from today (start of day)
 * to the target date (start of day).
 * Positive = future, Negative = past, 0 = today.
 */
export const daysUntil = (target: Date): number => {
  const now = new Date();
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
