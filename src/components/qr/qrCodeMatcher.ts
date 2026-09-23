import type { DeviceData } from '../../services/api.ts';
import type { DeviceMatchResult } from './types.ts';

export const cleanText = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
};

export const getDeviceSerial = (device: DeviceData): string => {
  return cleanText(device.serial || device['Seri Máy']);
};

export const getDeviceModel = (device: DeviceData): string => {
  return cleanText(device.model || device['Model']);
};

export const getDeviceDepartment = (device: DeviceData): string => {
  return cleanText(device.department || device['Nơi đặt thiết bị'], 'Chưa phân bổ');
};

export const getDeviceStatus = (device: DeviceData): string => {
  return cleanText(device.displayStatus || device.status || device['Hiện trạng thực tế'], 'Chưa xác định');
};

/**
 * Extracts raw scan code / ID / serial from a decoded QR or barcode text.
 * Supports:
 * - Direct IDs/Serials: e.g. "TB-001", "8931234567890"
 * - URLs: e.g. "https://hospital.vn/devices/TB-001", "http://localhost:5173/devices/TB%20001?tab=profile"
 * - Generic URLs: extracts last non-empty path segment
 * - JSON: e.g. '{"id":"TB-001"}' or '{"deviceId":"TB-001"}'
 * - Prefixed labels: e.g. "MÃ THIẾT BỊ: TB-001", "Mã TB: TB-001", "Serial: SN123"
 */
export const extractScanCode = (rawInput: string): string => {
  if (!rawInput) return '';
  const text = rawInput.trim();
  if (!text) return '';

  // 1. Check for URL with /devices/ pattern (most specific app URL)
  if (text.includes('/devices/')) {
    const parts = text.split('/devices/');
    if (parts.length > 1) {
      const rawSegment = parts[parts.length - 1].split('?')[0].split('#')[0].replace(/\/+$/, '');
      try {
        const decoded = decodeURIComponent(rawSegment).trim();
        if (decoded) return decoded;
      } catch {
        if (rawSegment.trim()) return rawSegment.trim();
      }
    }
  }

  // 2. Generic absolute/relative URL parsing
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const last = segments[segments.length - 1].replace(/\/+$/, '');
        const decoded = decodeURIComponent(last).trim();
        if (decoded) return decoded;
      }
    } catch {
      // Not a standard URL, continue
    }
  }

  // 3. JSON format
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('{"') && text.endsWith('"}'))) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed.id ?? parsed.deviceId ?? parsed.code ?? parsed.maThietBi ?? parsed.serial;
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // 4. Labelled text prefixes (Vietnamese / English)
  const prefixMatch = text.match(/^(?:mã(?:\s*thiết\s*bị|\s*tb)?|device\s*id|mã\s*quản\s*lý|serial|seri)\s*:\s*(.+)$/i);
  if (prefixMatch && prefixMatch[1]?.trim()) {
    return prefixMatch[1].trim();
  }

  return text;
};

/**
 * Matches a scanned code against devices catalog.
 * Performs exact matching against device.id, semicolon-separated aliases in id, and serial numbers.
 * Disallows substring matches (e.g. 'TB-01' will NOT match 'TB-010').
 * Accurately detects and reports ambiguous codes (multiple matching devices) without guessing.
 */
export const matchDeviceByCode = (devices: DeviceData[], rawCode: string): DeviceMatchResult => {
  const extracted = extractScanCode(rawCode);
  const normalized = extracted.toLowerCase();

  if (!normalized) {
    return {
      status: 'empty',
      message: 'Vui lòng quét hoặc nhập mã thiết bị.',
    };
  }

  const matches: Array<{ device: DeviceData; matchedBy: 'id' | 'alias' | 'serial' }> = [];

  for (const device of devices) {
    const rawId = cleanText(device.id);
    const id = rawId.toLowerCase();
    const aliases = id.split(';').map(part => part.trim()).filter(Boolean);
    const serial = getDeviceSerial(device).toLowerCase();

    if (id === normalized) {
      matches.push({ device, matchedBy: 'id' });
    } else if (aliases.includes(normalized)) {
      matches.push({ device, matchedBy: 'alias' });
    } else if (serial !== '' && serial === normalized) {
      matches.push({ device, matchedBy: 'serial' });
    }
  }

  if (matches.length === 1) {
    return {
      status: 'found',
      device: matches[0].device,
      matchedBy: matches[0].matchedBy,
      code: extracted,
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      devices: matches.map(item => item.device),
      code: extracted,
      message: `Mã "${extracted}" khớp với ${matches.length} thiết bị khác nhau. Vui lòng kiểm tra mã quản lý đầy đủ.`,
    };
  }

  return {
    status: 'not_found',
    code: extracted,
    message: `Không tìm thấy thiết bị nào khớp với mã "${extracted}".`,
  };
};
