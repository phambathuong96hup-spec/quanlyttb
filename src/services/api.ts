import { getAuthPayload } from '../authSession';

import { parseVietnameseDate } from '../utils/dateUtils';
import devicesSnapshot from '../data/devices.snapshot.json';

// WARNING: Hardcoding the GAS URL/key here is a security risk. In production, always use env variables.
const DEFAULT_GOOGLE_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwk_NI8tmQlxTcMLC0J6D8SN63sI7rEgj726h6GSTKqvYOTCtMhNb7gkqkkEOlZu-AU5g/exec';

export const GOOGLE_SHEETS_API_URL = import.meta.env.VITE_THIET_BI_API_URL || DEFAULT_GOOGLE_SHEETS_API_URL;
const USE_LOCAL_SNAPSHOT = import.meta.env.VITE_USE_LOCAL_SNAPSHOT === 'true';

type ApiRow = Record<string, unknown>;

const asText = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const getText = (row: ApiRow, keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = asText(row[key]).trim();
    if (value) return value;
  }
  return fallback;
};
export interface DeviceDocument {
  docType: string;
  licenseNo: string;
  frequency: string;
  issuedDate: string;
  expiryDate: string;
  prepTime: string;
  status: string;
  daysUntilExpiry: number | null;
  responsible?: string;
  collaborator?: string;
  deptManager?: string;
  fileUrl?: string;
}

export interface DeviceData {
  id: string;
  name: string;
  department: string;
  status: string;
  operationalStatus?: string;
  displayStatus?: string;
  registrationStatus?: string;
  dateAdded: string;
  documents?: DeviceDocument[];
  alertLevel?: 'ok' | 'warning' | 'danger';
  minDaysUntil?: number;
  [key: string]: unknown;
}

export interface UserData {
  username: string;
  role: string;
  name: string;
  email?: string;
  department?: string;
  token?: string;
  expiresAt?: number;
}

export interface RepairData {
  rowId: string;
  deviceId: string;
  userName: string;
  userEmail: string;
  description: string;
  status: string;
}

export interface TransferData {
  transferId: string;
  createdAt: string;
  deviceId: string;
  deviceName: string;
  fromDepartment: string;
  toDepartment: string;
  quantity: string;
  status: 'PENDING_RECEIVE' | 'COMPLETED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED' | string;
  requestedBy: string;
  requestedByName: string;
  requestedByEmail: string;
  requestedNote: string;
  requestedAt: string;
  receivedBy: string;
  receivedByName: string;
  receivedByEmail: string;
  receivedNote: string;
  receivedAt: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectReason: string;
  updatedAt: string;
}

// Hàm helper xử lý lỗi fetch chung
const safeFetch = async (input: RequestInfo, init?: RequestInit) => {
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      const text = await response.text();
      console.error(`HTTP Error ${response.status}:`, text);
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object' && data.success === false) {
        console.warn('API returned success=false:', data);
      }
      return data;
    } catch {
      console.error('Failed to parse JSON response. Response text was:', text);
      throw new Error('Invalid JSON response');
    }
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

const postAction = async (action: string, payload: Record<string, unknown> = {}) => {
  try {
    const data = await safeFetch(GOOGLE_SHEETS_API_URL, {
      method: 'POST',
      // Note: text/plain is used as a workaround to avoid CORS preflight options requests with Google Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action,
        payload: {
          ...payload,
          ...getAuthPayload(),
        },
      }),
    });
    return data || { success: false, message: 'Lỗi không xác định.' };
  } catch (err) {
    return { success: false, message: 'Lỗi kết nối mạng: ' + (err instanceof Error ? err.message : String(err)) };
  }
};

const postReadAction = async (action: string) => safeFetch(GOOGLE_SHEETS_API_URL, {
  method: 'POST',
  // Note: text/plain is used as a workaround to avoid CORS preflight options requests with Google Apps Script
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action, payload: getAuthPayload() }),
});

const parseDocuments = (rawDocs: unknown[]): DeviceDocument[] => {
  if (!Array.isArray(rawDocs)) return [];
  return rawDocs.map((doc) => {
    const d = doc as ApiRow;
    const expiryStr = getText(d, ['Hạn đăng kiểm / Hạn hiệu lực', 'expiryDate']);
    let daysUntilExpiry: number | null = null;
    if (expiryStr && expiryStr !== 'N/A') {
      const expDate = parseVietnameseDate(expiryStr);
      if (expDate && !isNaN(expDate.getTime())) {
        const now = new Date(); now.setHours(0, 0, 0, 0);
        daysUntilExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      }
    }
    return {
      docType: getText(d, ['Loại tài liệu', 'docType']),
      licenseNo: getText(d, ['Số văn bản / Số Đăng kiểm', 'licenseNo']),
      frequency: '',
      issuedDate: getText(d, ['Ngày cấp / Ngày Đăng kiểm', 'issuedDate']),
      expiryDate: expiryStr,
      prepTime: getText(d, ['Thời gian chuẩn bị hồ sơ (ngày)', 'prepTime']),
      status: getText(d, ['Trạng thái Hồ sơ', 'status'], 'Chưa gửi'),
      daysUntilExpiry,
      responsible: getText(d, ['Người chịu trách nhiệm', 'responsible', 'responsiblePerson']),
      collaborator: getText(d, ['Phối hợp thực hiện', 'collaborator', 'cooperator']),
      deptManager: getText(d, ['Giao quản lý tại khoa', 'deptManager', 'departmentManager']),
      fileUrl: getText(d, ['Link tài liệu', 'fileUrl']),
    };
  });
};

export const fetchDevices = async (): Promise<DeviceData[]> => {
  const data = USE_LOCAL_SNAPSHOT
    ? devicesSnapshot
    : await safeFetch(`${GOOGLE_SHEETS_API_URL}?action=getDevices`);
  if (!data || !Array.isArray(data)) return [];

  const rows = data as ApiRow[];
  const validData = rows.filter(item => getText(item, ['Tên Thiết bị', 'name']) !== '');

  return validData.map((item, index: number) => {
    const isOldFormat = 'Tên Thiết bị' in item;
    const documents = parseDocuments(item.documents as unknown[] || []);
    const operationalStatus = isOldFormat
      ? getText(item, ['Hiện trạng thực tế'], 'Đang sử dụng')
      : getText(item, ['operationalStatus', 'status'], 'Đang sử dụng');

    // Tìm tài liệu khẩn cấp nhất
    let alertLevel: DeviceData['alertLevel'] = 'ok';
    let minDaysUntil: number | undefined;
    documents.forEach(doc => {
      if (doc.daysUntilExpiry !== null) {
        if (minDaysUntil === undefined || doc.daysUntilExpiry < minDaysUntil) {
          minDaysUntil = doc.daysUntilExpiry;
        }
      }
    });
    if (minDaysUntil !== undefined) {
      if (minDaysUntil <= 7) alertLevel = 'danger';
      else if (minDaysUntil <= 30) alertLevel = 'warning';
    }

    return {
      ...item,
      id: isOldFormat ? getText(item, ['id', 'Seri Máy'], `TB-${String(index + 1).padStart(3, '0')}`) : getText(item, ['serial'], `TB-${String(index + 1).padStart(3, '0')}`),
      name: isOldFormat ? getText(item, ['Tên Thiết bị']) : getText(item, ['name']),
      department: isOldFormat ? getText(item, ['Nơi đặt thiết bị'], 'Chưa phân bổ') : getText(item, ['department', 'location'], 'Chưa phân bổ'),
      status: operationalStatus,
      operationalStatus,
      displayStatus: getText(item, ['Trạng thái tổng hợp', 'displayStatus', 'derivedStatus']),
      registrationStatus: getText(item, ['Cảnh báo đăng kiểm', 'registrationStatus', 'complianceStatus']),
      dateAdded: isOldFormat ? getText(item, ['Ngày cấp/ Ngày Đăng kiểm'], 'N/A') : (documents[0]?.issuedDate || 'N/A'),
      documents,
      alertLevel,
      minDaysUntil,
    };
  });
};

export const fetchUsers = async (): Promise<UserData[]> => {
  if (USE_LOCAL_SNAPSHOT) return [];

  const data = await postReadAction('getUsers');
  if (!data || !Array.isArray(data)) return [];

  const rows = data as ApiRow[];
  const validData = rows.filter(item => getText(item, ['Tên đăng nhập', 'Username', 'username']) !== '');

  return validData.map(item => ({
    username: getText(item, ['Tên đăng nhập', 'Username', 'username']),
    role: getText(item, ['Quyền hạn', 'Quyền', 'Role'], 'User'),
    name: getText(item, ['Họ và Tên', 'Họ và tên', 'Name'], 'Người dùng'),
    email: getText(item, ['Email', 'email']),
    department: getText(item, ['Khoa/Phòng', 'Khoa/Phong']),
  }));
};

export const loginUser = async (payload: { username: string; pin: string }) => {
  const data = await safeFetch(GOOGLE_SHEETS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'login', payload }),
  });
  
  if (!data?.success) return data || { success: false, message: 'Lỗi kết nối mạng.' };
  const item = (data.user || {}) as ApiRow;
  return {
    success: true,
    user: {
      username: getText(item, ['Tên đăng nhập', 'Username', 'username']),
      role: getText(item, ['Quyền hạn', 'Quyền', 'Role'], 'User'),
      name: getText(item, ['Họ và Tên', 'Họ và tên', 'Name'], 'Người dùng'),
      email: getText(item, ['Email', 'email']),
      department: getText(item, ['Khoa/Phòng', 'Khoa/Phong', 'Khoa/ Phòng', 'Khoa', 'Department', 'department', 'Nơi công tác', 'Noi cong tac']),
      token: asText(data.token || item.token || item.sessionToken),
      expiresAt: Number(data.expiresAt || item.expiresAt || 0) || undefined,
    } as UserData,
  };
};

export const fetchRepairs = async (): Promise<RepairData[]> => {
  if (USE_LOCAL_SNAPSHOT) return [];

  const data = await postReadAction('getRepairs');
  if (!data || !Array.isArray(data)) return [];

  return (data as ApiRow[]).map(item => ({
    rowId: getText(item, ['Thời gian']),
    deviceId: getText(item, ['Mã Máy/Thiết bị']),
    userName: getText(item, ['Người báo lỗi']),
    userEmail: getText(item, ['Email người báo']),
    description: getText(item, ['Mô tả lỗi']),
    status: getText(item, ['Trạng Thái'], 'Chờ duyệt'),
  }));
};

export const reportRepair = async (payload: Record<string, unknown>) => {
  return postAction('reportRepair', payload);
};

export const approveRepair = async (payload: { rowId: string; deviceId: string; newStatus: string; approver?: string; note?: string; imageContent?: string; imageName?: string; imageMimeType?: string }) => {
  return postAction('approveRepair', payload);
};

export const addDevice = async (payload: {
  name: string;
  serial: string;
  department: string;
  dateAdded: string;
  notes?: string;
}) => {
  return postAction('addDevice', payload);
};

export const editDevice = async (payload: {
  serial: string;
  name: string;
  department: string;
  dateAdded: string;
  notes?: string;
}) => {
  return postAction('editDevice', payload);
};

export const updateDocumentStatus = async (serial: string, status: string, docType?: string) => {
  return postAction('updateDocStatus', { serial, status, docType: docType || '' });
};

const mapTransfer = (item: ApiRow): TransferData => ({
  transferId: getText(item, ['TransferId', 'Thời gian']),
  createdAt: getText(item, ['CreatedAt', 'Thời gian']),
  deviceId: getText(item, ['DeviceId', 'Mã Máy/Thiết bị']),
  deviceName: getText(item, ['DeviceName', 'Tên Thiết bị']),
  fromDepartment: getText(item, ['FromDepartment', 'Từ khoa/phòng']),
  toDepartment: getText(item, ['ToDepartment', 'Đến khoa/phòng']),
  quantity: getText(item, ['Quantity', 'Số lượng']),
  status: getText(item, ['Status', 'Trạng thái']),
  requestedBy: getText(item, ['RequestedBy']),
  requestedByName: getText(item, ['RequestedByName', 'Người thực hiện']),
  requestedByEmail: getText(item, ['RequestedByEmail']),
  requestedNote: getText(item, ['RequestedNote', 'Lý do', 'Ghi chú']),
  requestedAt: getText(item, ['RequestedAt']),
  receivedBy: getText(item, ['ReceivedBy']),
  receivedByName: getText(item, ['ReceivedByName', 'Người nhận']),
  receivedByEmail: getText(item, ['ReceivedByEmail']),
  receivedNote: getText(item, ['ReceivedNote']),
  receivedAt: getText(item, ['ReceivedAt']),
  rejectedBy: getText(item, ['RejectedBy']),
  rejectedAt: getText(item, ['RejectedAt']),
  rejectReason: getText(item, ['RejectReason']),
  updatedAt: getText(item, ['UpdatedAt']),
});

export const fetchTransfers = async (): Promise<TransferData[]> => {
  if (USE_LOCAL_SNAPSHOT) return [];

  const data = await postReadAction('getTransfers');
  if (!Array.isArray(data)) return [];
  return (data as ApiRow[]).map(mapTransfer);
};

export const createTransfer = async (payload: {
  deviceId: string;
  toDepartment: string;
  quantity?: string;
  reason?: string;
  actorUsername: string;
  imageContent?: string;
  imageName?: string;
  imageMimeType?: string;
}) => {
  return postAction('createTransfer', payload);
};

export const receiveTransfer = async (payload: { transferId: string; actorUsername: string; note?: string; imageContent?: string; imageName?: string; imageMimeType?: string }) => {
  return postAction('receiveTransfer', payload);
};

export const rejectTransfer = async (payload: { transferId: string; actorUsername: string; reason?: string }) => {
  return postAction('rejectTransfer', payload);
};

export const cancelTransfer = async (payload: { transferId: string; actorUsername: string; reason?: string }) => {
  return postAction('cancelTransfer', payload);
};

// ===== GSP (nhiệt độ/độ ẩm kho) =====

export interface GspRecord {
  date: string;
  shift: string;
  tempKho: number;
  tempTuLanh: number;
  humidity: number;
  note: string;
  recorder: string;
}

export const fetchGspRecords = async (): Promise<GspRecord[]> => {
  if (USE_LOCAL_SNAPSHOT) return [];

  const data = await postReadAction('getGSP');
  if (!Array.isArray(data)) return [];
  return (data as ApiRow[]).map(item => ({
    date: getText(item, ['Ngày', 'date']),
    shift: getText(item, ['Ca', 'shift']),
    tempKho: parseFloat(getText(item, ['Nhiệt độ Kho', 'tempKho'], '0')),
    tempTuLanh: parseFloat(getText(item, ['Nhiệt độ Tủ lạnh', 'tempTuLanh'], '0')),
    humidity: parseFloat(getText(item, ['Độ ẩm', 'humidity'], '0')),
    note: getText(item, ['Ghi chú', 'note']),
    recorder: getText(item, ['Người ghi', 'recorder']),
  }));
};

export const addGspRecord = async (payload: Omit<GspRecord, 'date'>) => {
  return postAction('addGSP', payload);
};

export const addDocument = async (payload: {
  serial: string;
  docType: string;
  licenseNo?: string;
  issuedDate?: string;
  expiryDate?: string;
  prepTime?: string;
  status?: string;
  responsible?: string;
  collaborator?: string;
  deptManager?: string;
  fileName?: string;
  fileContent?: string;
  mimeType?: string;
}) => {
  return postAction('addDocument', payload);
};

export const fetchDepartments = async (): Promise<string[]> => {
  if (USE_LOCAL_SNAPSHOT) {
    return Array.from(new Set((devicesSnapshot as ApiRow[])
      .map(item => getText(item, ['department', 'location']))
      .filter(Boolean)))
      .sort();
  }

  const data = await safeFetch(`${GOOGLE_SHEETS_API_URL}?action=getDepartments`);
  if (!data || !Array.isArray(data)) return [];
  return data as string[];
};

export const editUser = async (payload: {
  username?: string;
  fullName?: string;
  email?: string;
  department?: string;
  currentPin?: string;
  newPin?: string;
  role?: string;
  status?: string;
}): Promise<{ success: boolean; message: string; user?: UserData }> => {
  const data = await postAction('editUser', payload);
  if (data && data.success && data.user) {
    const item = data.user as ApiRow;
    data.user = {
      username: getText(item, ['Tên đăng nhập', 'Username', 'username']),
      role: getText(item, ['Quyền hạn', 'Quyền', 'Role'], 'User'),
      name: getText(item, ['Họ và Tên', 'Họ và tên', 'Name'], 'Người dùng'),
      email: getText(item, ['Email', 'email']),
      department: getText(item, ['Khoa/Phòng', 'Khoa/Phong', 'Khoa/ Phòng', 'Khoa', 'Department', 'department']),
    } as UserData;
  }
  return data;
};
