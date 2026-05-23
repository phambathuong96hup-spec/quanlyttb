const SHEETS = {
  devices: 'Devices',
  users: 'Users',
  repairs: 'Repairs',
  transfers: 'Transfers',
  gsp: 'GSP',
  documents: 'Documents',
  logs: 'ActivityLogs'
};

const LOG_HEADERS = [
  'Thời gian',
  'Hành động',
  'Người thực hiện',
  'ID Thiết bị',
  'Tên Thiết bị',
  'Chi tiết thay đổi'
];

const DEVICE_SPREADSHEET_ID = '1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0';
const USERS_SPREADSHEET_ID = '10yRv_RD5ersJzD9xd-UDkZ8-hoiHxRBW6bz71qtMqoQ';
const USERS_SHEET_GID = 1113591284;

const DEVICE_HEADERS = [
  'id',
  'Tên Thiết bị',
  'Đơn vị tính',
  'Số lượng',
  'Model',
  'Seri Máy',
  'Nơi đặt thiết bị',
  'Hiện trạng thực tế',
  'Hãng SX',
  'Nước SX',
  'Năm SX',
  'Năm SD',
  'Giá',
  'Nguồn',
  'Phân loại',
  'Công ty cung ứng',
  'Nhóm',
  'Ghi chú',
  'Ngày tạo',
  'Ngày cập nhật',
  'Trạng thái tổng hợp',
  'Cảnh báo đăng kiểm',
  'Ngày cập nhật trạng thái'
];

const DOCUMENT_HEADERS = [
  'DeviceId',
  'Tên Thiết bị',
  'Loại tài liệu',
  'Số văn bản / Số Đăng kiểm',
  'Ngày cấp / Ngày Đăng kiểm',
  'Hạn đăng kiểm / Hạn hiệu lực',
  'Thời gian chuẩn bị hồ sơ (ngày)',
  'Trạng thái Hồ sơ',
  'Người chịu trách nhiệm',
  'Phối hợp thực hiện',
  'Giao quản lý tại khoa',
  'Ngày tạo',
  'Ngày cập nhật',
  'Link tài liệu'
];

const USER_HEADERS = ['Tên đăng nhập', 'Mã PIN', 'Quyền hạn', 'Họ và Tên', 'Email', 'Khoa/Phòng', 'Trạng thái'];
const REPAIR_HEADERS = ['Thời gian', 'Mã Máy/Thiết bị', 'Người báo lỗi', 'Email người báo', 'Mô tả lỗi', 'Trạng Thái', 'Người duyệt', 'Ghi chú xử lý'];
const TRANSFER_HEADERS = [
  'TransferId',
  'CreatedAt',
  'DeviceId',
  'DeviceName',
  'FromDepartment',
  'ToDepartment',
  'Quantity',
  'Status',
  'RequestedBy',
  'RequestedByName',
  'RequestedByEmail',
  'RequestedNote',
  'RequestedAt',
  'ReceivedBy',
  'ReceivedByName',
  'ReceivedByEmail',
  'ReceivedNote',
  'ReceivedAt',
  'RejectedBy',
  'RejectedAt',
  'RejectReason',
  'UpdatedAt'
];
const GSP_HEADERS = ['date', 'shift', 'tempKho', 'tempTuLanh', 'humidity', 'note', 'recorder'];
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function doGet(e) {
  if (e.parameter.action === 'login') {
    return json_({ success: false, message: 'Đăng nhập phải dùng POST để không lộ mã PIN trên URL.' });
  }
  return json_(route_(e.parameter.action, e.parameter));
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    return json_(route_(body.action, body.payload || {}));
  } catch (err) {
    return json_({ success: false, message: 'Lỗi parse payload: ' + err.toString() });
  }
}

function route_(action, payload) {
  setupSheets();
  let actor;
  switch (action) {
    case 'getDevices':
      return getDevicesJoinedFiltered_(payload);
    case 'getDepartments':
      return getDepartments_();
    case 'login':
      return login_(payload);
    case 'getUsers':
      actor = requireAdmin_(payload);
      if (!actor) return authError_();
      return getUserRows_()
        .filter(row => userStatus_(row) !== 'inactive')
        .map(row => {
           const safeRow = { ...row };
           delete safeRow['Mã PIN']; // BẢO MẬT: Không trả về mã PIN
           delete safeRow['Mật khẩu']; // Tương thích dữ liệu cũ, nếu còn
           return safeRow;
        });
    case 'getRepairs':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      return getRows_(SHEETS.repairs);
    case 'getTransfers':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      return getRows_(SHEETS.transfers);
    case 'getGSP':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      return getRows_(SHEETS.gsp);
    case 'addDevice':
      actor = requireAdmin_(payload);
      if (!actor) return authError_('Chỉ Admin được thêm thiết bị.');
      return addDevice_(payload);
    case 'editDevice':
      actor = requireAdmin_(payload);
      if (!actor) return authError_('Chỉ Admin được sửa thiết bị.');
      return editDevice_(payload);
    case 'importSnapshotDevices':
      actor = requireAdmin_(payload);
      if (!actor) return authError_('Chỉ Admin được import snapshot thiết bị.');
      return importSnapshotDevices_(payload, actor);
    case 'reportRepair':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.userName = userDisplayName_(actor);
      payload.userEmail = userEmail_(actor);
      return reportRepair_(payload);
    case 'approveRepair':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      if (!isAdmin_(actor) && !canConfirmRepairCompletion_(payload, actor)) {
        return authError_('Chỉ Admin được duyệt/cập nhật sửa chữa; khoa báo hỏng chỉ được xác nhận nhận lại máy.');
      }
      payload.approver = userDisplayName_(actor);
      return approveRepair_(payload);
    case 'updateDocStatus':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      return updateDocStatus_(payload, actor);
    case 'addDocument':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      return addDocument_(payload, actor);
    case 'createTransfer':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.actorUsername = userUsername_(actor);
      return createTransfer_(payload);
    case 'receiveTransfer':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.actorUsername = userUsername_(actor);
      return receiveTransfer_(payload);
    case 'rejectTransfer':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.actorUsername = userUsername_(actor);
      return rejectTransfer_(payload);
    case 'cancelTransfer':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.actorUsername = userUsername_(actor);
      return cancelTransfer_(payload);
    case 'transferDevice':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.actorUsername = userUsername_(actor);
      return createTransfer_(payload);
    case 'addGSP':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      payload.recorder = userDisplayName_(actor);
      return addGSP_(payload);
    case 'editUser':
      actor = requireAuthenticated_(payload);
      if (!actor) return authError_();
      return editUser_(payload);
    default:
      return { success: false, message: 'Action không hợp lệ: ' + action };
  }
}

function login_(payload) {
  const users = getUserRows_();
  const username = String(payload.username || '').trim();
  const pin = String(payload.pin || payload.password || '').trim();
  
  if (!username || !pin) {
    return { success: false, message: 'Vui lòng nhập tên đăng nhập và mã PIN.' };
  }
  
  const user = users.find(u => {
    const account = getUserField_(u, ['Tên đăng nhập', 'Ten dang nhap', 'Username', 'Tài khoản', 'Tai khoan', 'username']);
    const email = getUserField_(u, ['Email', 'email']);
    const userPin = getUserField_(u, ['Mã PIN', 'Ma PIN', 'PIN', 'pin', 'Mật khẩu', 'Mat khau', 'Password', 'password', 'Mã pin', 'MÃ PIN']);
    return (normalize_(account) === normalize_(username) || normalize_(email) === normalize_(username)) && String(userPin).trim() === pin;
  });
  
  if (user) {
    if (userStatus_(user) === 'inactive') {
      return { success: false, message: 'Tài khoản đã bị khóa.' };
    }
    const safeUser = { ...user };
    // Xóa các trường nhạy cảm trước khi trả về
    ['Mã PIN', 'Ma PIN', 'PIN', 'pin', 'Mật khẩu', 'Mat khau', 'Password', 'password', 'Mã pin', 'MÃ PIN'].forEach(k => delete safeUser[k]);
    const session = createSessionToken_(user);
    return { success: true, user: safeUser, token: session.token, expiresAt: session.expiresAt };
  }
  return { success: false, message: 'Tên đăng nhập hoặc mã PIN không chính xác.' };
}

function createSessionToken_(user) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const body = JSON.stringify({
    username: userUsername_(user),
    expiresAt: expiresAt
  });
  const encodedBody = stripBase64Padding_(Utilities.base64EncodeWebSafe(body, Utilities.Charset.UTF_8));
  return {
    token: encodedBody + '.' + signSessionValue_(encodedBody),
    expiresAt: expiresAt
  };
}

function verifySessionToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  if (!constantTimeEqual_(signSessionValue_(parts[0]), parts[1])) return null;

  try {
    const body = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padBase64_(parts[0]))).getDataAsString());
    if (!body.username || Number(body.expiresAt) <= Date.now()) return null;
    const user = findUser_(body.username);
    if (!user) return null;
    if (userStatus_(user) === 'inactive') return null;
    return user;
  } catch (err) {
    console.error('verifySessionToken_ failed', err);
    return null;
  }
}

function requireAuthenticated_(payload) {
  return verifySessionToken_(payload && payload.sessionToken);
}

function requireAdmin_(payload) {
  const user = requireAuthenticated_(payload);
  return user && isAdmin_(user) ? user : null;
}

function authError_(message) {
  return {
    success: false,
    message: message || 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
  };
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineHtml_(value) {
  return escapeHtml_(value).replace(/\r?\n/g, '<br>');
}

function evidenceLinkRow_(label, imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!url) return '';
  return '<tr><td style="background:#f5f5f5;"><strong>' + escapeHtml_(label) + '</strong></td><td><a href="' + escapeHtml_(url) + '" target="_blank" rel="noopener">Mở file ảnh minh chứng</a></td></tr>';
}

function signSessionValue_(value) {
  const signature = Utilities.computeHmacSha256Signature(value, sessionSecret_());
  return stripBase64Padding_(Utilities.base64EncodeWebSafe(signature));
}

function sessionSecret_() {
  const configured = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (configured) return configured;
  return ScriptApp.getScriptId() + ':' + DEVICE_SPREADSHEET_ID + ':' + USERS_SPREADSHEET_ID;
}

function stripBase64Padding_(value) {
  return String(value || '').replace(/=+$/g, '');
}

function padBase64_(value) {
  const text = String(value || '');
  const padding = (4 - (text.length % 4)) % 4;
  return text + '='.repeat(padding);
}

function constantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function setupSheets() {
  ensureSheet_(SHEETS.devices, DEVICE_HEADERS);
  ensureSheet_(SHEETS.repairs, REPAIR_HEADERS);
  ensureSheet_(SHEETS.transfers, TRANSFER_HEADERS);
  ensureSheet_(SHEETS.gsp, GSP_HEADERS);
  ensureSheet_(SHEETS.documents, DOCUMENT_HEADERS);
  ensureSheet_(SHEETS.logs, LOG_HEADERS);
}

function logActivity_(action, targetId, targetName, details, actor) {
  try {
    const actorName = actor ? (userDisplayName_(actor) + ' (' + userUsername_(actor) + ')') : 'Hệ thống';
    appendObject_(SHEETS.logs, {
      'Thời gian': new Date(),
      'Hành động': action,
      'Người thực hiện': actorName,
      'ID Thiết bị': targetId || '',
      'Tên Thiết bị': targetName || '',
      'Chi tiết thay đổi': details || ''
    });
  } catch (err) {
    console.error('Lỗi khi ghi nhật ký hoạt động:', err);
  }
}


function parseDate_(dateStr) {
  if (!dateStr) return new Date(NaN);
  const parts = String(dateStr).split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  return new Date(dateStr);
}

function statusDaysUntil_(dateStr, today) {
  const text = String(dateStr || '').trim();
  if (!text || normalizeHeader_(text) === 'na') return null;
  const date = parseDate_(text);
  if (isNaN(date.getTime())) return null;
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((dateOnly.getTime() - todayOnly.getTime()) / (24 * 60 * 60 * 1000));
}

function resolveDeviceAggregateStatus_(device, docs) {
  const today = new Date();
  const physicalStatus = normalizeHeader_(device['Hiện trạng thực tế'] || device.operationalStatus || device.status || '');
  const repairing = physicalStatus.indexOf('dangkiemtra') !== -1
    || physicalStatus.indexOf('suachua') !== -1
    || physicalStatus.indexOf('suaxong') !== -1;
  const reported = !repairing && (
    physicalStatus.indexOf('baohong') !== -1
    || physicalStatus.indexOf('choduyet') !== -1
    || physicalStatus.indexOf('hong') !== -1
  );

  const daysList = [];
  (docs || []).forEach(doc => {
    const days = statusDaysUntil_(doc['Hạn đăng kiểm / Hạn hiệu lực'] || doc.expiryDate, today);
    if (typeof days === 'number') daysList.push(days);
  });
  if (daysList.length === 0) {
    const legacyDays = statusDaysUntil_(
      device['Thời hạn cấp lại/ Hạn đăng kiểm']
      || device['Hạn đăng kiểm']
      || device['Ngày bảo dưỡng tiếp theo'],
      today
    );
    if (typeof legacyDays === 'number') daysList.push(legacyDays);
  }

  const expired = daysList.some(days => days < 0);
  const warning = !expired && daysList.some(days => days >= 0 && days <= 30);
  const department = normalizeHeader_(device['Nơi đặt thiết bị'] || device.department || '');
  const unassigned = !department || department === 'chuaphanbo';

  let aggregateStatus = 'Hoạt động tốt';
  if (expired) aggregateStatus = 'Hết hạn đăng kiểm';
  else if (reported) aggregateStatus = 'Báo hỏng';
  else if (repairing) aggregateStatus = 'Đang sửa chữa';
  else if (warning) aggregateStatus = 'Sắp hết hạn đăng kiểm';
  else if (unassigned) aggregateStatus = 'Chưa phân bổ';

  let complianceStatus = 'Chưa có hạn đăng kiểm';
  if (expired) complianceStatus = 'Hết hạn đăng kiểm';
  else if (warning) complianceStatus = 'Sắp hết hạn đăng kiểm';
  else if (daysList.length > 0) complianceStatus = 'Còn hiệu lực';

  return { aggregateStatus, complianceStatus };
}

function syncDeviceAggregateStatusRow_(rowIndex, device, docs) {
  const resolved = resolveDeviceAggregateStatus_(device, docs);
  const currentAggregate = String(device['Trạng thái tổng hợp'] || '').trim();
  const currentCompliance = String(device['Cảnh báo đăng kiểm'] || '').trim();
  device['Trạng thái tổng hợp'] = resolved.aggregateStatus;
  device['Cảnh báo đăng kiểm'] = resolved.complianceStatus;

  if (currentAggregate === resolved.aggregateStatus && currentCompliance === resolved.complianceStatus) {
    return resolved;
  }

  updateRowByObject_(SHEETS.devices, rowIndex, {
    'Trạng thái tổng hợp': resolved.aggregateStatus,
    'Cảnh báo đăng kiểm': resolved.complianceStatus,
    'Ngày cập nhật trạng thái': new Date()
  });
  return resolved;
}

function syncDeviceStatusForDevice_(deviceId) {
  const rowIndex = findDeviceRow_(deviceId);
  if (rowIndex < 2) return null;
  const device = rowObject_(SHEETS.devices, rowIndex);
  const resolvedDeviceId = String(device.id || device['Seri Máy'] || deviceId || '').trim();
  const docs = getRows_(SHEETS.documents).filter(doc => String(doc.DeviceId || '').trim() === resolvedDeviceId);
  return syncDeviceAggregateStatusRow_(rowIndex, device, docs);
}

function getDevicesJoined_() {
  const deviceRows = getRowsWithRowIndex_(SHEETS.devices);
  const documents = getRows_(SHEETS.documents);
  
  const docsByDevice = {};
  documents.forEach(doc => {
    const devId = String(doc.DeviceId || '').trim();
    if (!docsByDevice[devId]) docsByDevice[devId] = [];
    docsByDevice[devId].push(doc);
  });
  
  return deviceRows.map(entry => {
    const device = entry.data;
    const devId = String(device.id || device['Seri Máy'] || '').trim();
    const devDocs = docsByDevice[devId] || [];
    device.documents = devDocs;
    
    // Tìm tài liệu khẩn cấp nhất cho tương thích ngược
    let urgentDoc = null;
    let minTime = Infinity;
    
    devDocs.forEach(doc => {
      const expDateStr = doc['Hạn đăng kiểm / Hạn hiệu lực'];
      if (expDateStr && expDateStr !== 'N/A') {
        const time = parseDate_(expDateStr).getTime();
        if (!isNaN(time) && time < minTime) {
          minTime = time;
          urgentDoc = doc;
        }
      }
    });
    
    if (urgentDoc) {
      device['Số đăng kiểm'] = urgentDoc['Số văn bản / Số Đăng kiểm'] || '';
      device['Ngày cấp/ Ngày Đăng kiểm'] = urgentDoc['Ngày cấp / Ngày Đăng kiểm'] || '';
      device['Hạn đăng kiểm'] = urgentDoc['Hạn đăng kiểm / Hạn hiệu lực'] || '';
      device['Thời hạn cấp lại/ Hạn đăng kiểm'] = urgentDoc['Hạn đăng kiểm / Hạn hiệu lực'] || '';
      device['Thời gian chuẩn bị Hồ sơ'] = urgentDoc['Thời gian chuẩn bị hồ sơ (ngày)'] || '';
      device['Thời gian  chuẩn bị Hồ sơ'] = urgentDoc['Thời gian chuẩn bị hồ sơ (ngày)'] || '';
      device['Trạng thái Hồ sơ'] = urgentDoc['Trạng thái Hồ sơ'] || 'Chưa gửi';
      device['Loại tài liệu khẩn cấp'] = urgentDoc['Loại tài liệu'] || '';
    } else {
      device['Số đăng kiểm'] = '';
      device['Ngày cấp/ Ngày Đăng kiểm'] = '';
      device['Hạn đăng kiểm'] = '';
      device['Thời hạn cấp lại/ Hạn đăng kiểm'] = '';
      device['Thời gian chuẩn bị Hồ sơ'] = '';
      device['Thời gian  chuẩn bị Hồ sơ'] = '';
      device['Trạng thái Hồ sơ'] = '';
      device['Loại tài liệu khẩn cấp'] = '';
    }

    syncDeviceAggregateStatusRow_(entry.rowIndex, device, devDocs);
    
    return device;
  });
}

function getDevicesJoinedFiltered_(payload) {
  const allDevices = getDevicesJoined_();
  if (!payload) return allDevices;
  
  const filterDept = payload.department ? normalize_(payload.department) : null;
  const filterStatus = payload.status ? normalize_(payload.status) : null;
  const urgentDays = payload.urgentExpiry ? parseInt(payload.urgentExpiry, 10) : null;
  
  return allDevices.filter(device => {
    // 1. Lọc theo khoa phòng
    if (filterDept) {
      const devDept = device['Nơi đặt thiết bị'] ? normalize_(device['Nơi đặt thiết bị']) : '';
      if (devDept !== filterDept) return false;
    }
    
    // 2. Lọc theo trạng thái hồ sơ tài liệu khẩn cấp
    if (filterStatus) {
      const devStatus = device['Trạng thái Hồ sơ'] ? normalize_(device['Trạng thái Hồ sơ']) : '';
      if (devStatus !== filterStatus) return false;
    }
    
    // 3. Lọc theo thời hạn hiệu lực sắp hết (urgentExpiry)
    if (urgentDays !== null && !isNaN(urgentDays)) {
      const expDateStr = device['Hạn đăng kiểm'];
      if (!expDateStr || expDateStr === 'N/A') return false;
      
      const expDate = parseDate_(expDateStr);
      if (isNaN(expDate.getTime())) return false;
      
      const now = new Date();
      // Đưa về cùng mốc thời gian không giờ để tính ngày chính xác hơn
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const expDayOnly = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      
      const diffTime = expDayOnly.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      // diffDays <= urgentDays (bao gồm cả đã hết hạn, tức là diffDays < 0)
      if (diffDays > urgentDays) return false;
    }
    
    return true;
  });
}


function addDevice_(payload) {
  const id = payload.serial || nextDeviceId_();
  appendObject_(SHEETS.devices, {
    id,
    'Tên Thiết bị': payload.name || '',
    'Seri Máy': id,
    'Nơi đặt thiết bị': payload.department || '',
    'Ngày cấp/ Ngày Đăng kiểm': payload.dateAdded || '',
    'Ghi chú': payload.notes || '',
    'Số lượng': payload.quantity || 1,
    'Ngày tạo': new Date(),
    'Ngày cập nhật': new Date()
  });
  syncDeviceStatusForDevice_(id);
  return { success: true, message: 'Đã thêm thiết bị.' };
}

function editDevice_(payload) {
  const rowIndex = findDeviceRow_(payload.serial || payload.id);
  if (rowIndex < 2) return { success: false, message: 'Không tìm thấy thiết bị.' };
  updateRowByObject_(SHEETS.devices, rowIndex, {
    'Tên Thiết bị': payload.name,
    'Seri Máy': payload.serial,
    'Nơi đặt thiết bị': payload.department,
    'Ngày cấp/ Ngày Đăng kiểm': payload.dateAdded,
    'Ghi chú': payload.notes,
    'Ngày cập nhật': new Date()
  });
  syncDeviceStatusForDevice_(payload.serial || payload.id);
  return { success: true, message: 'Đã cập nhật thiết bị.' };
}

function importSnapshotDevices_(payload, actor) {
  const devices = Array.isArray(payload.devices) ? payload.devices : [];
  if (devices.length === 0) return { success: false, message: 'Payload không có dữ liệu thiết bị.' };

  const now = new Date();
  const deviceRows = [];
  const documentRows = [];

  devices.forEach((item, index) => {
    const deviceId = String(item.serial || item.id || ('TB-' + String(index + 1).padStart(3, '0'))).trim();
    const deviceName = String(item.name || '').trim();
    const notes = [item.location, item.notes]
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(' - ');
    const deviceObject = {
      id: deviceId,
      'Tên Thiết bị': deviceName,
      'Đơn vị tính': item.unit || '',
      'Số lượng': item.quantity || '',
      'Model': item.model || '',
      'Seri Máy': item.serial || deviceId,
      'Nơi đặt thiết bị': item.department || '',
      'Hiện trạng thực tế': item.status || 'Đang sử dụng',
      'Hãng SX': item.manufacturer || '',
      'Nước SX': item.country || '',
      'Năm SX': item.yearMfg || '',
      'Năm SD': item.yearUse || '',
      'Giá': item.price || '',
      'Nguồn': item.source || '',
      'Phân loại': item.classification || '',
      'Công ty cung ứng': item.supplyCompany || '',
      'Nhóm': item.group || '',
      'Ghi chú': notes,
      'Ngày tạo': now,
      'Ngày cập nhật': now
    };
    const aggregate = resolveDeviceAggregateStatus_(deviceObject, item.documents || []);
    deviceObject['Trạng thái tổng hợp'] = aggregate.aggregateStatus;
    deviceObject['Cảnh báo đăng kiểm'] = aggregate.complianceStatus;
    deviceObject['Ngày cập nhật trạng thái'] = now;
    deviceRows.push(DEVICE_HEADERS.map(header => deviceObject[header] === undefined ? '' : deviceObject[header]));

    (item.documents || []).forEach((doc, docIndex) => {
      const documentObject = {
        DeviceId: deviceId,
        'Tên Thiết bị': deviceName,
        'Loại tài liệu': inferSnapshotDocType_(doc, docIndex),
        'Số văn bản / Số Đăng kiểm': doc.licenseNo || '',
        'Ngày cấp / Ngày Đăng kiểm': doc.issuedDate || '',
        'Hạn đăng kiểm / Hạn hiệu lực': doc.expiryDate || '',
        'Thời gian chuẩn bị hồ sơ (ngày)': doc.prepTime || '',
        'Trạng thái Hồ sơ': doc.status || 'Chưa gửi',
        'Người chịu trách nhiệm': doc.responsiblePerson || doc.responsible || '',
        'Phối hợp thực hiện': doc.cooperator || doc.collaborator || '',
        'Giao quản lý tại khoa': doc.departmentManager || doc.deptManager || '',
        'Ngày tạo': now,
        'Ngày cập nhật': now,
        'Link tài liệu': doc.fileUrl || ''
      };
      documentRows.push(DOCUMENT_HEADERS.map(header => documentObject[header] === undefined ? '' : documentObject[header]));
    });
  });

  replaceSheetRows_(SHEETS.devices, DEVICE_HEADERS, deviceRows);
  replaceSheetRows_(SHEETS.documents, DOCUMENT_HEADERS, documentRows);

  logActivity_(
    'Import snapshot thiết bị',
    '',
    '',
    'Đã thay dữ liệu Devices bằng ' + deviceRows.length + ' thiết bị và Documents bằng ' + documentRows.length + ' hồ sơ từ snapshot.',
    actor
  );

  return {
    success: true,
    message: 'Đã import snapshot vào Google Sheet.',
    devices: deviceRows.length,
    documents: documentRows.length
  };
}

function inferSnapshotDocType_(doc, index) {
  const license = normalizeHeader_(doc && doc.licenseNo);
  if (license.indexOf('atbx') !== -1) return 'An toàn bức xạ';
  if (license.indexOf('gp') !== -1) return 'Giấy phép';
  if (license.indexOf('kd') !== -1 || license.indexOf('kiem') !== -1) return 'Kiểm định';
  if (license.indexOf('hc') !== -1 || license.indexOf('hieu') !== -1) return 'Hiệu chuẩn';
  return 'Hồ sơ ' + (index + 1);
}

function createTransfer_(payload) {
  const deviceId = payload.deviceId || payload.serial || payload.id;
  const toDepartment = String(payload.toDepartment || '').trim();
  const actor = findUser_(payload.actorUsername);
  if (!deviceId || !toDepartment) return { success: false, message: 'Thiếu thiết bị hoặc khoa/phòng nhận.' };
  if (!actor) return { success: false, message: 'Không xác thực được người chuyển.' };

  const rowIndex = findDeviceRow_(deviceId);
  if (rowIndex < 2) return { success: false, message: 'Không tìm thấy thiết bị.' };

  const device = rowObject_(SHEETS.devices, rowIndex);
  const fromDepartment = device['Nơi đặt thiết bị'] || '';
  if (normalize_(fromDepartment) === normalize_(toDepartment)) return { success: false, message: 'Khoa nhận đang trùng với khoa hiện tại.' };
  
  const isBorrow = String(payload.reason || '').indexOf('[Mượn]') === 0;
  if (!isAdmin_(actor)) {
    if (isBorrow) {
      if (normalize_(userDepartment_(actor)) !== normalize_(toDepartment)) {
        return { success: false, message: 'Chỉ tài khoản thuộc khoa nhận mới được tạo yêu cầu mượn.' };
      }
    } else {
      if (normalize_(userDepartment_(actor)) !== normalize_(fromDepartment)) {
        return { success: false, message: 'Chỉ tài khoản thuộc khoa đang giữ thiết bị mới được tạo yêu cầu chuyển.' };
      }
    }
  }

  const imageUrl = uploadImageToDrive_(payload, 'AnhLuanChuyen');
  let reqNote = payload.reason || payload.note || '';
  if (imageUrl) {
    reqNote += '\n[Ảnh minh chứng giao]: ' + imageUrl;
  }

  const transferId = nextTransferId_();
  const now = new Date();
  appendObject_(SHEETS.transfers, {
    TransferId: transferId,
    CreatedAt: now,
    DeviceId: deviceId,
    DeviceName: device['Tên Thiết bị'] || device.name || '',
    FromDepartment: fromDepartment,
    ToDepartment: toDepartment,
    Quantity: payload.quantity || device['Số lượng'] || 1,
    Status: 'PENDING_RECEIVE',
    RequestedBy: userUsername_(actor),
    RequestedByName: userDisplayName_(actor),
    RequestedByEmail: userEmail_(actor),
    RequestedNote: reqNote,
    RequestedAt: now,
    UpdatedAt: now
  });

  sendTransferMail_({
    type: 'request',
    transferId,
    device,
    fromDepartment,
    toDepartment,
    actor,
    note: payload.reason || payload.note || '',
    evidenceUrl: imageUrl,
    evidenceLabel: 'Ảnh minh chứng giao'
  });

  return { success: true, message: 'Đã gửi yêu cầu luân chuyển sang ' + toDepartment + '. Chờ khoa nhận xác nhận.', transferId };
}

function receiveTransfer_(payload) {
  const actor = findUser_(payload.actorUsername);
  if (!actor) return { success: false, message: 'Không xác thực được người nhận.' };
  const rowIndex = findTransferRow_(payload.transferId);
  if (rowIndex < 2) return { success: false, message: 'Không tìm thấy yêu cầu luân chuyển.' };

  const transfer = rowObject_(SHEETS.transfers, rowIndex);
  if (transfer.Status !== 'PENDING_RECEIVE') return { success: false, message: 'Yêu cầu này không còn ở trạng thái chờ nhận.' };
  if (!isAdmin_(actor) && normalize_(userDepartment_(actor)) !== normalize_(transfer.ToDepartment)) {
    return { success: false, message: 'Chỉ tài khoản thuộc khoa nhận mới được xác nhận nhận thiết bị.' };
  }

  const deviceRow = findDeviceRow_(transfer.DeviceId);
  if (deviceRow < 2) return { success: false, message: 'Không tìm thấy thiết bị cần luân chuyển.' };
  const now = new Date();
  const imageUrl = uploadImageToDrive_(payload, 'AnhLuanChuyen');
  let recNote = payload.note || '';
  if (imageUrl) {
    recNote += '\n[Ảnh minh chứng nhận]: ' + imageUrl;
  }

  updateRowByObject_(SHEETS.devices, deviceRow, {
    'Nơi đặt thiết bị': transfer.ToDepartment,
    'Ngày cập nhật': now
  });
  syncDeviceStatusForDevice_(transfer.DeviceId);
  updateRowByObject_(SHEETS.transfers, rowIndex, {
    Status: 'COMPLETED',
    ReceivedBy: userUsername_(actor),
    ReceivedByName: userDisplayName_(actor),
    ReceivedByEmail: userEmail_(actor),
    ReceivedNote: recNote,
    ReceivedAt: now,
    UpdatedAt: now
  });

  sendTransferMail_({
    type: 'received',
    transfer,
    actor,
    note: payload.note || '',
    evidenceUrl: imageUrl,
    evidenceLabel: 'Ảnh minh chứng nhận'
  });

  return { success: true, message: 'Đã xác nhận nhận thiết bị và cập nhật khoa/phòng sử dụng.' };
}

function rejectTransfer_(payload) {
  const actor = findUser_(payload.actorUsername);
  if (!actor) return { success: false, message: 'Không xác thực được người từ chối.' };
  const rowIndex = findTransferRow_(payload.transferId);
  if (rowIndex < 2) return { success: false, message: 'Không tìm thấy yêu cầu luân chuyển.' };

  const transfer = rowObject_(SHEETS.transfers, rowIndex);
  if (transfer.Status !== 'PENDING_RECEIVE') return { success: false, message: 'Yêu cầu này không còn ở trạng thái chờ nhận.' };
  if (!isAdmin_(actor) && normalize_(userDepartment_(actor)) !== normalize_(transfer.ToDepartment)) {
    return { success: false, message: 'Chỉ tài khoản thuộc khoa nhận mới được từ chối yêu cầu.' };
  }

  const now = new Date();
  updateRowByObject_(SHEETS.transfers, rowIndex, {
    Status: 'REJECTED',
    RejectedBy: userUsername_(actor),
    RejectedAt: now,
    RejectReason: payload.reason || '',
    UpdatedAt: now
  });

  sendTransferMail_({
    type: 'rejected',
    transfer,
    actor,
    note: payload.reason || ''
  });

  return { success: true, message: 'Đã từ chối yêu cầu luân chuyển.' };
}

function cancelTransfer_(payload) {
  const actor = findUser_(payload.actorUsername);
  if (!actor) return { success: false, message: 'Không xác thực được người hủy.' };
  const rowIndex = findTransferRow_(payload.transferId);
  if (rowIndex < 2) return { success: false, message: 'Không tìm thấy yêu cầu luân chuyển.' };

  const transfer = rowObject_(SHEETS.transfers, rowIndex);
  if (transfer.Status !== 'PENDING_RECEIVE') return { success: false, message: 'Chỉ hủy được yêu cầu đang chờ nhận.' };
  if (!isAdmin_(actor) && String(userUsername_(actor)) !== String(transfer.RequestedBy)) {
    return { success: false, message: 'Chỉ người tạo yêu cầu hoặc Admin mới được hủy.' };
  }

  updateRowByObject_(SHEETS.transfers, rowIndex, {
    Status: 'CANCELLED',
    RejectReason: payload.reason || 'Đã hủy yêu cầu',
    UpdatedAt: new Date()
  });

  sendTransferMail_({
    type: 'cancelled',
    transfer,
    actor,
    note: payload.reason || 'Đã hủy yêu cầu'
  });

  return { success: true, message: 'Đã hủy yêu cầu luân chuyển.' };
}

function uploadImageToDrive_(payload, folderName) {
  if (!payload.imageContent || !payload.imageName) return '';
  try {
    let folder;
    try {
      const ss = SpreadsheetApp.openById(DEVICE_SPREADSHEET_ID);
      const parentFolder = DriveApp.getFileById(ss.getId()).getParents().next();
      const folders = parentFolder.getFoldersByName(folderName || 'HinhAnhMinhChung');
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = parentFolder.createFolder(folderName || 'HinhAnhMinhChung');
      }
    } catch (e) {
      folder = DriveApp.getRootFolder();
    }
    
    let base64Data = payload.imageContent;
    if (base64Data.indexOf('base64,') !== -1) {
      base64Data = base64Data.split('base64,')[1];
    }
    
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, payload.imageMimeType || 'image/jpeg', payload.imageName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error('Lỗi tải ảnh:', err);
    return '';
  }
}

function reportRepair_(payload) {
  const deviceId = payload.deviceId || payload.serial || '';
  const cleanDeviceId = String(deviceId).replace('[KHẨN] ', '').trim();
  
  const imageUrl = uploadImageToDrive_(payload, 'AnhSuaChua');
  let description = payload.description || '';
  if (imageUrl) {
    description += '\n[Ảnh minh chứng]: ' + imageUrl;
  }
  
  appendObject_(SHEETS.repairs, {
    'Thời gian': new Date(),
    'Mã Máy/Thiết bị': deviceId,
    'Người báo lỗi': payload.userName || payload.name || '',
    'Email người báo': payload.userEmail || payload.email || '',
    'Mô tả lỗi': description,
    'Trạng Thái': 'Chờ duyệt'
  });

  const deviceRowIndex = findDeviceRow_(cleanDeviceId);
  if (deviceRowIndex >= 2) {
    updateRowByObject_(SHEETS.devices, deviceRowIndex, {
      'Hiện trạng thực tế': 'Báo hỏng - chờ duyệt',
      'Ngày cập nhật': new Date()
    });
    syncDeviceStatusForDevice_(cleanDeviceId);
  }

  // Gửi email thông báo báo hỏng
  try {
    const device = findDeviceById_(cleanDeviceId);
    const recipients = device ? getDeviceRecipients_(device) : adminEmails_();
      if (recipients.length > 0) {
        sendNotificationMail_({
          recipients: recipients,
        subject: '[QLTTB] ⚠️ Báo hỏng thiết bị: ' + (device ? (device['Tên Thiết bị'] || cleanDeviceId) : cleanDeviceId),
          body: [
            '<h3 style="color:#d32f2f;">Thông báo thiết bị báo hỏng</h3>',
            '<table style="border-collapse:collapse;width:100%;" border="1" cellpadding="8">',
          '<tr><td style="background:#f5f5f5;width:180px;"><strong>Mã thiết bị</strong></td><td>' + escapeHtml_(cleanDeviceId) + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Tên thiết bị</strong></td><td>' + escapeHtml_(device ? (device['Tên Thiết bị'] || '') : '') + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Model / Seri</strong></td><td>' + escapeHtml_(device ? (device.Model || '') : '') + ' / ' + escapeHtml_(device ? (device['Seri Máy'] || '') : '') + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Nơi đặt</strong></td><td>' + escapeHtml_(device ? (device['Nơi đặt thiết bị'] || '') : '') + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Người báo lỗi</strong></td><td>' + escapeHtml_(payload.userName || '') + ' (' + escapeHtml_(payload.userEmail || '') + ')</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Mô tả lỗi</strong></td><td style="color:#d32f2f;">' + formatMultilineHtml_(payload.description || '') + '</td></tr>',
          evidenceLinkRow_('Ảnh minh chứng', imageUrl),
            '</table>',
            '<p style="margin-top:16px;">Vui lòng đăng nhập hệ thống <strong>Quản lý Trang thiết bị Y tế</strong> để xem chi tiết và xử lý.</p>'
          ].join('')
        });
      }
  } catch (err) { console.error('reportRepair_ email failed', err); }

  return { success: true, message: 'Đã ghi nhận báo hỏng.' };
}

function approveRepair_(payload) {
  const rows = getRows_(SHEETS.repairs);
  const idx = rows.findIndex(row => String(row['Thời gian']) === String(payload.rowId));
  if (idx < 0) return { success: false, message: 'Không tìm thấy phiếu sửa chữa.' };
  
  const newStatus = payload.newStatus || payload.status || 'Đã duyệt';
  
  const imageUrl = uploadImageToDrive_(payload, 'AnhSuaChua');
  let processNote = payload.note || '';
  if (imageUrl) {
    processNote += '\n[Ảnh hoàn thành/xử lý]: ' + imageUrl;
  }
  
  updateRowByObject_(SHEETS.repairs, idx + 2, {
    'Trạng Thái': newStatus,
    'Người duyệt': payload.approver || '',
    'Ghi chú xử lý': processNote
  });

  // Đồng bộ hiện trạng thiết bị nếu trạng thái sửa chữa thay đổi
  const repairRow = rows[idx];
  const deviceId = String(repairRow['Mã Máy/Thiết bị'] || '').replace('[KHẨN] ', '').trim();
  if (deviceId) {
    const deviceRowIndex = findDeviceRow_(deviceId);
    if (deviceRowIndex >= 2) {
      let deviceStatus = '';
      const normalizedStatus = normalizeHeader_(newStatus);
      if (normalizedStatus.indexOf('tuchoi') !== -1) deviceStatus = 'Đang sử dụng';
      else if (normalizedStatus.indexOf('duyet') !== -1 || normalizedStatus.indexOf('kiemtra') !== -1) deviceStatus = 'Đang kiểm tra';
      else if (normalizedStatus.indexOf('suaxong') !== -1) deviceStatus = 'Đã sửa xong - chờ bàn giao';
      else if (normalizedStatus.indexOf('hoanthanh') !== -1) deviceStatus = 'Đang sử dụng';
      else if (normalizedStatus.indexOf('sua') !== -1) deviceStatus = 'Đang sửa chữa';
      else if (normalizedStatus.indexOf('hong') !== -1) deviceStatus = 'Hỏng';
      if (deviceStatus) {
        updateRowByObject_(SHEETS.devices, deviceRowIndex, {
          'Hiện trạng thực tế': deviceStatus,
          'Ngày cập nhật': new Date()
        });
      }
      syncDeviceStatusForDevice_(deviceId);
    }
  }

  // Gửi email thông báo cập nhật sửa chữa
  try {
    const device = findDeviceById_(deviceId);
    const recipients = device ? getDeviceRecipients_(device) : adminEmails_();
      // Thêm người báo lỗi vào danh sách nhận
      const reporterEmail = String(repairRow['Email người báo'] || '').trim();
      if (reporterEmail) recipients.push(reporterEmail);
      const uniqueRecipients = Array.from(new Set(recipients));
      if (uniqueRecipients.length > 0) {
        sendNotificationMail_({
          recipients: uniqueRecipients,
        subject: '[QLTTB] 🔧 Cập nhật sửa chữa thiết bị: ' + (device ? (device['Tên Thiết bị'] || deviceId) : deviceId),
          body: [
            '<h3 style="color:#1565c0;">Cập nhật tình trạng sửa chữa thiết bị</h3>',
            '<table style="border-collapse:collapse;width:100%;" border="1" cellpadding="8">',
          '<tr><td style="background:#f5f5f5;width:180px;"><strong>Mã thiết bị</strong></td><td>' + escapeHtml_(deviceId) + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Tên thiết bị</strong></td><td>' + escapeHtml_(device ? (device['Tên Thiết bị'] || '') : '') + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Trạng thái mới</strong></td><td style="font-weight:bold;color:#1565c0;">' + escapeHtml_(newStatus) + '</td></tr>',
          '<tr><td style="background:#f5f5f5;"><strong>Người duyệt</strong></td><td>' + escapeHtml_(payload.approver || '') + '</td></tr>',
          payload.note ? '<tr><td style="background:#f5f5f5;"><strong>Ghi chú xử lý</strong></td><td>' + formatMultilineHtml_(payload.note) + '</td></tr>' : '',
          evidenceLinkRow_('Ảnh hoàn thành/xử lý', imageUrl),
            '</table>',
            '<p style="margin-top:16px;">Vui lòng đăng nhập hệ thống <strong>Quản lý Trang thiết bị Y tế</strong> để xem chi tiết.</p>'
          ].join('')
        });
      }
  } catch (err) { console.error('approveRepair_ email failed', err); }

  return { success: true, message: 'Đã cập nhật phiếu sửa chữa.' };
}

function canConfirmRepairCompletion_(payload, actor) {
  const newStatus = normalizeHeader_(payload && (payload.newStatus || payload.status));
  if (newStatus !== 'dahoanthanh') return false;

  const rows = getRows_(SHEETS.repairs);
  const repairRow = rows.find(row => String(row['Thời gian']) === String(payload.rowId));
  if (!repairRow) return false;

  const actorEmail = normalize_(userEmail_(actor));
  const actorName = normalize_(userDisplayName_(actor));
  const reporterEmail = normalize_(repairRow['Email người báo']);
  const reporterName = normalize_(repairRow['Người báo lỗi']);
  if ((actorEmail && actorEmail === reporterEmail) || (actorName && actorName === reporterName)) {
    return true;
  }

  const deviceId = String(repairRow['Mã Máy/Thiết bị'] || '').replace('[KHẨN] ', '').trim();
  const device = findDeviceById_(deviceId);
  if (!device) return false;

  const actorDept = normalize_(userDepartment_(actor));
  const deviceDept = normalize_(device['Nơi đặt thiết bị']);
  return Boolean(actorDept && deviceDept && actorDept === deviceDept);
}

function hasDocumentAccess_(actor, device, doc) {
  if (!actor) return false;
  // 1. Admin có quyền tối cao
  if (isAdmin_(actor)) return true;
  
  // 2. Kiểm tra trùng khoa phòng của thiết bị
  const userDept = userDepartment_(actor);
  const deviceDept = device ? (device['Nơi đặt thiết bị'] || device.department || '') : '';
  if (userDept && deviceDept && normalize_(userDept) === normalize_(deviceDept)) {
    return true;
  }
  
  // 3. Kiểm tra người chịu trách nhiệm hoặc phối hợp hoặc giao quản lý trong doc
  if (doc) {
    const userFullName = userDisplayName_(actor);
    const userEmail = userEmail_(actor);
    const userUsername = userUsername_(actor);
    
    const responsible = String(doc['Người chịu trách nhiệm'] || doc.responsible || '');
    const collaborator = String(doc['Phối hợp thực hiện'] || doc.collaborator || '');
    const deptManager = String(doc['Giao quản lý tại khoa'] || doc.deptManager || '');
    
    const checkField = (fieldValue) => {
      if (!fieldValue) return false;
      const valNorm = normalize_(fieldValue);
      return (
        (userFullName && valNorm.indexOf(normalize_(userFullName)) !== -1) ||
        (userEmail && valNorm.indexOf(normalize_(userEmail)) !== -1) ||
        (userUsername && valNorm.indexOf(normalize_(userUsername)) !== -1)
      );
    };
    
    if (checkField(responsible) || checkField(collaborator) || checkField(deptManager)) {
      return true;
    }
  }
  
  return false;
}

function updateDocStatus_(payload, actor) {
  const deviceId = String(payload.serial || '').trim();
  const docType = String(payload.docType || '').trim();
  const status = String(payload.status || '').trim();
  
  if (!deviceId) return { success: false, message: 'Thiếu DeviceId / Số Seri.' };
  
  const devRows = getRows_(SHEETS.devices);
  const device = devRows.find(d => String(d.id || d['Seri Máy'] || '').trim() === deviceId);
  
  const rows = getRows_(SHEETS.documents);
  let foundIndex = -1;
  let existingDoc = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row.DeviceId || '').trim() === deviceId) {
      if (!docType || String(row['Loại tài liệu'] || '').trim() === docType) {
        foundIndex = i + 2;
        existingDoc = row;
        break;
      }
    }
  }
  
  if (foundIndex < 2) {
    return { success: false, message: 'Không tìm thấy tài liệu đăng kiểm phù hợp cho thiết bị ' + deviceId + ' (Loại: ' + (docType || 'Bất kỳ') + ').' };
  }
  
  // Kiểm tra quyền truy cập tài liệu trước khi cập nhật trạng thái
  if (!hasDocumentAccess_(actor, device, existingDoc)) {
    return { success: false, message: 'Bạn không có quyền cập nhật tài liệu cho thiết bị này.' };
  }
  
  const oldStatus = existingDoc['Trạng thái Hồ sơ'] || '';
  updateRowByObject_(SHEETS.documents, foundIndex, {
    'Trạng thái Hồ sơ': status,
    'Ngày cập nhật': new Date()
  });
  syncDeviceStatusForDevice_(deviceId);
  
  // Ghi log hoạt động
  logActivity_(
    'Cập nhật trạng thái tài liệu',
    deviceId,
    device ? (device['Tên Thiết bị'] || '') : '',
    'Cập nhật trạng thái tài liệu "' + docType + '" từ "' + oldStatus + '" thành "' + status + '".',
    actor
  );
  
  return { success: true, message: 'Đã cập nhật trạng thái tài liệu ' + docType + ' của thiết bị ' + deviceId + ' thành "' + status + '".' };
}

function addDocument_(payload, actor) {
  const deviceId = String(payload.serial || '').trim();
  const docType = String(payload.docType || '').trim();
  
  if (!deviceId || !docType) {
    return { success: false, message: 'Thiếu DeviceId hoặc Loại tài liệu.' };
  }
  
  const devRows = getRows_(SHEETS.devices);
  const device = devRows.find(d => String(d.id || d['Seri Máy'] || '').trim() === deviceId);
  
  // Kiểm tra xem đã tồn tại loại tài liệu này cho thiết bị chưa
  const rows = getRows_(SHEETS.documents);
  let foundIndex = -1;
  let existingDoc = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row.DeviceId || '').trim() === deviceId && String(row['Loại tài liệu'] || '').trim() === docType) {
      foundIndex = i + 2;
      existingDoc = row;
      break;
    }
  }
  
  // Kiểm tra quyền truy cập tài liệu
  if (!hasDocumentAccess_(actor, device, existingDoc || payload)) {
    return { success: false, message: 'Bạn không có quyền thêm hoặc sửa đổi tài liệu cho thiết bị này.' };
  }
  
  let fileUrl = payload.fileUrl || '';
  
  // Nếu có file đính kèm dạng Base64
  if (payload.fileContent && payload.fileName) {
    try {
      let folder;
      try {
        const ss = SpreadsheetApp.openById(DEVICE_SPREADSHEET_ID);
        const parentFolder = DriveApp.getFileById(ss.getId()).getParents().next();
        const folders = parentFolder.getFoldersByName('Tài liệu kiểm định');
        if (folders.hasNext()) {
          folder = folders.next();
        } else {
          folder = parentFolder.createFolder('Tài liệu kiểm định');
        }
      } catch (e) {
        folder = DriveApp.getRootFolder();
      }
      
      const decoded = Utilities.base64Decode(payload.fileContent);
      const blob = Utilities.newBlob(decoded, payload.mimeType || 'application/pdf', payload.fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = file.getUrl();
    } catch (err) {
      return { success: false, message: 'Không thể tải file lên Google Drive: ' + err.toString() };
    }
  }
  
  const existingLink = foundIndex >= 2 ? existingDoc['Link tài liệu'] || '' : '';
  const finalFileUrl = fileUrl || existingLink;
  
  const docData = {
    'DeviceId': deviceId,
    'Loại tài liệu': docType,
    'Số văn bản / Số Đăng kiểm': payload.licenseNo || '',
    'Ngày cấp / Ngày Đăng kiểm': payload.issuedDate || '',
    'Hạn đăng kiểm / Hạn hiệu lực': payload.expiryDate || '',
    'Thời gian chuẩn bị hồ sơ (ngày)': payload.prepTime || '',
    'Trạng thái Hồ sơ': payload.status || 'Chưa gửi',
    'Người chịu trách nhiệm': payload.responsible || '',
    'Phối hợp thực hiện': payload.collaborator || '',
    'Giao quản lý tại khoa': payload.deptManager || '',
    'Link tài liệu': finalFileUrl,
    'Ngày cập nhật': new Date()
  };
  
  let deviceName = device ? (device['Tên Thiết bị'] || device.name || '') : '';
  docData['Tên Thiết bị'] = deviceName;
  
  if (foundIndex >= 2) {
    // Cập nhật tài liệu cũ
    const changes = [];
    const oldDoc = existingDoc;
    if (oldDoc['Số văn bản / Số Đăng kiểm'] !== docData['Số văn bản / Số Đăng kiểm']) {
      changes.push('Số văn bản: "' + oldDoc['Số văn bản / Số Đăng kiểm'] + '" -> "' + docData['Số văn bản / Số Đăng kiểm'] + '"');
    }
    if (oldDoc['Hạn đăng kiểm / Hạn hiệu lực'] !== docData['Hạn đăng kiểm / Hạn hiệu lực']) {
      changes.push('Hạn hiệu lực: "' + oldDoc['Hạn đăng kiểm / Hạn hiệu lực'] + '" -> "' + docData['Hạn đăng kiểm / Hạn hiệu lực'] + '"');
    }
    if (oldDoc['Link tài liệu'] !== docData['Link tài liệu']) {
      changes.push('Tập tin đính kèm được cập nhật mới');
    }
    
    updateRowByObject_(SHEETS.documents, foundIndex, docData);
    syncDeviceStatusForDevice_(deviceId);
    
    logActivity_(
      'Cập nhật tài liệu',
      deviceId,
      deviceName,
      'Cập nhật tài liệu "' + docType + '". ' + (changes.length > 0 ? ('Chi tiết: ' + changes.join(', ')) : 'Không có thay đổi quan trọng.'),
      actor
    );
    
    return { success: true, message: 'Đã cập nhật thông tin tài liệu và file.', fileUrl: finalFileUrl };
  } else {
    // Tạo mới tài liệu
    docData['Ngày tạo'] = new Date();
    
    appendObject_(SHEETS.documents, docData);
    syncDeviceStatusForDevice_(deviceId);
    
    logActivity_(
      'Thêm mới tài liệu',
      deviceId,
      deviceName,
      'Thêm mới tài liệu "' + docType + '" (Số văn bản: ' + (payload.licenseNo || 'N/A') + ').',
      actor
    );
    
    return { success: true, message: 'Đã thêm mới tài liệu và file thành công.', fileUrl: finalFileUrl };
  }
}

function addGSP_(payload) {
  appendObject_(SHEETS.gsp, {
    date: new Date(),
    shift: payload.shift,
    tempKho: payload.tempKho,
    tempTuLanh: payload.tempTuLanh,
    humidity: payload.humidity,
    note: payload.note,
    recorder: payload.recorder
  });
  return { success: true, message: 'Đã lưu nhật ký GSP.' };
}

function getDepartments_() {
  const departments = {};
  getRows_(SHEETS.devices).forEach(row => {
    const value = String(row['Nơi đặt thiết bị'] || row.department || '').trim();
    if (value) departments[value] = true;
  });
  getUserRows_().forEach(row => {
    const value = String(row['Khoa/Phòng'] || '').trim();
    if (value) departments[value] = true;
  });
  return Object.keys(departments).sort();
}

function getRows_(sheetName) {
  const sheet = deviceSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  return values
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

function getRowsWithRowIndex_(sheetName) {
  const sheet = deviceSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  return values
    .map((row, index) => ({ row, rowIndex: index + 2 }))
    .filter(entry => entry.row.some(cell => String(cell).trim() !== ''))
    .map(entry => ({
      rowIndex: entry.rowIndex,
      data: Object.fromEntries(headers.map((header, index) => [header, entry.row[index] || '']))
    }));
}

function getUserRows_() {
  const sheet = userSheet_();
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  return values
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

function getUserField_(user, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const direct = user[keys[i]];
    if (direct !== undefined && String(direct).trim() !== '') return direct;
  }

  const wanted = keys.map(normalizeHeader_);
  const actualKeys = Object.keys(user);
  for (let i = 0; i < actualKeys.length; i += 1) {
    if (wanted.indexOf(normalizeHeader_(actualKeys[i])) > -1) {
      const value = user[actualKeys[i]];
      if (value !== undefined && String(value).trim() !== '') return value;
    }
  }
  return '';
}

function userUsername_(user) {
  return String(getUserField_(user, ['Tên đăng nhập', 'Ten dang nhap', 'Username', 'Tài khoản', 'Tai khoan', 'username']) || '').trim();
}

function userDisplayName_(user) {
  return String(getUserField_(user, ['Họ và Tên', 'Họ và tên', 'Ho va Ten', 'Ho va ten', 'Name', 'name']) || userUsername_(user)).trim();
}

function userEmail_(user) {
  return String(getUserField_(user, ['Email', 'email']) || '').trim();
}

function userDepartment_(user) {
  return String(getUserField_(user, ['Khoa/Phòng', 'Khoa/Phong', 'Khoa/ Phòng', 'Khoa', 'Department', 'department', 'Nơi công tác', 'Noi cong tac']) || '').trim();
}

function userStatus_(user) {
  return String(getUserField_(user, ['Trạng thái', 'Trang thai', 'Status', 'status']) || 'active').trim().toLowerCase();
}

function appendObject_(sheetName, object) {
  const sheet = deviceSpreadsheet_().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(header => object[header] === undefined ? '' : object[header]));
}

function updateRowByObject_(sheetName, rowIndex, object) {
  const sheet = deviceSpreadsheet_().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const range = sheet.getRange(rowIndex, 1, 1, headers.length);
  const row = range.getValues()[0];
  headers.forEach((header, index) => {
    if (object[header] !== undefined) row[index] = object[header];
  });
  range.setValues([row]);
}

function replaceSheetRows_(sheetName, headers, rows) {
  const sheet = deviceSpreadsheet_().getSheetByName(sheetName) || deviceSpreadsheet_().insertSheet(sheetName);
  const width = headers.length;
  const clearWidth = Math.max(sheet.getLastColumn(), width);
  sheet.getRange(1, 1, 1, width).setValues([headers]);
  sheet.setFrozenRows(1);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, clearWidth).clearContent();
  }
  if (rows.length > 0) {
    for (let start = 0; start < rows.length; start += 500) {
      const chunk = rows.slice(start, start + 500);
      sheet.getRange(start + 2, 1, chunk.length, width).setValues(chunk);
    }
  }
}

function rowObject_(sheetName, rowIndex) {
  const sheet = deviceSpreadsheet_().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getDisplayValues()[0];
  return Object.fromEntries(headers.map((header, index) => [header, row[index] || '']));
}

function findDeviceRow_(deviceId) {
  const sheet = deviceSpreadsheet_().getSheetByName(SHEETS.devices);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return -1;
  const headers = values[0];
  const idIndex = headers.indexOf('id');
  const serialIndex = headers.indexOf('Seri Máy');
  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][idIndex]) === String(deviceId) || String(values[i][serialIndex]) === String(deviceId)) {
      return i + 1;
    }
  }
  return -1;
}

function findTransferRow_(transferId) {
  const sheet = deviceSpreadsheet_().getSheetByName(SHEETS.transfers);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return -1;
  const headers = values[0];
  const idIndex = headers.indexOf('TransferId');
  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][idIndex]) === String(transferId)) return i + 1;
  }
  return -1;
}

function findUser_(username) {
  const normalized = normalize_(username);
  if (!normalized) return null;
  return getUserRows_().find(user => normalize_(userUsername_(user)) === normalized) || null;
}

function isAdmin_(user) {
  return normalize_(getUserField_(user, ['Quyền hạn', 'Quyền', 'Role', 'role'])) === 'admin';
}

function normalize_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeHeader_(value) {
  return normalize_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '');
}

function nextTransferId_() {
  return 'LC-' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
}

function emailsByDepartment_(department) {
  return getUserRows_()
    .filter(user => userStatus_(user) !== 'inactive')
    .filter(user => normalize_(userDepartment_(user)) === normalize_(department) || isAdmin_(user))
    .map(user => userEmail_(user))
    .filter(Boolean);
}

function sendTransferMail_(data) {
  try {
    const transfer = data.transfer || {};
    const device = data.device || {};
    const deviceId = transfer.DeviceId || device['Seri Máy'] || device.id || '';
    const deviceName = transfer.DeviceName || device['Tên Thiết bị'] || device.name || '';
    const fromDepartment = data.fromDepartment || transfer.FromDepartment || '';
    const toDepartment = data.toDepartment || transfer.ToDepartment || '';
    const actorName = data.actor ? userDisplayName_(data.actor) : '';
    const note = data.note || '';
    const evidenceUrl = data.evidenceUrl || '';
    const evidenceLabel = data.evidenceLabel || 'Ảnh minh chứng';
    const transferId = data.transferId || transfer.TransferId || '';
    let subject = '';
    let recipients = [];

    if (data.type === 'request') {
      subject = '[QLTTB] 🔄 Yêu cầu nhận luân chuyển thiết bị ' + deviceId;
      recipients = emailsByDepartment_(toDepartment);
    } else if (data.type === 'received') {
      subject = '[QLTTB] ✅ Đã nhận luân chuyển thiết bị ' + deviceId;
      recipients = emailsByDepartment_(fromDepartment).concat(emailsByDepartment_(toDepartment));
    } else if (data.type === 'rejected') {
      subject = '[QLTTB] ❌ Từ chối nhận luân chuyển thiết bị ' + deviceId;
      recipients = emailsByDepartment_(fromDepartment);
    } else if (data.type === 'cancelled') {
      subject = '[QLTTB] Đã hủy yêu cầu luân chuyển thiết bị ' + deviceId;
      recipients = emailsByDepartment_(fromDepartment).concat(emailsByDepartment_(toDepartment));
    }

    // Bổ sung người chịu trách nhiệm quản lý thiết bị vào danh sách nhận email
    const fullDevice = findDeviceById_(deviceId);
    if (fullDevice) {
      const deviceRecipients = getDeviceRecipients_(fullDevice);
      recipients = recipients.concat(deviceRecipients);
    }
    recipients = recipients.concat(adminEmails_());

    recipients = Array.from(new Set(recipients));
    if (recipients.length === 0) return;

    const htmlBody = [
      '<h3 style="color:#1565c0;">Thông báo luân chuyển thiết bị y tế</h3>',
      '<table style="border-collapse:collapse;width:100%;" border="1" cellpadding="8">',
      '<tr><td style="background:#f5f5f5;width:180px;"><strong>Mã yêu cầu</strong></td><td>' + escapeHtml_(transferId) + '</td></tr>',
      '<tr><td style="background:#f5f5f5;"><strong>Thiết bị</strong></td><td>' + escapeHtml_(deviceName) + ' (' + escapeHtml_(deviceId) + ')</td></tr>',
      '<tr><td style="background:#f5f5f5;"><strong>Từ khoa/phòng</strong></td><td>' + escapeHtml_(fromDepartment) + '</td></tr>',
      '<tr><td style="background:#f5f5f5;"><strong>Đến khoa/phòng</strong></td><td>' + escapeHtml_(toDepartment) + '</td></tr>',
      '<tr><td style="background:#f5f5f5;"><strong>Người thực hiện</strong></td><td>' + escapeHtml_(actorName) + '</td></tr>',
      note ? '<tr><td style="background:#f5f5f5;"><strong>Ghi chú/Lý do</strong></td><td>' + formatMultilineHtml_(note) + '</td></tr>' : '',
      evidenceLinkRow_(evidenceLabel, evidenceUrl),
      '</table>',
      '<p style="margin-top:16px;">Vui lòng đăng nhập hệ thống <strong>Quản lý Trang thiết bị Y tế</strong> để xử lý.</p>'
    ].join('');

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (err) {
    console.error('sendTransferMail_ failed', err);
  }
}

function ensureSheet_(name, headers) {
  const ss = deviceSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  headers.forEach((header, index) => {
    if (existing.indexOf(header) !== -1) return;
    const blankIndex = existing.findIndex(value => !value);
    if (blankIndex >= 0) {
      sheet.getRange(1, blankIndex + 1).setValue(header);
      existing[blankIndex] = header;
      return;
    }
    const newIndex = existing.length;
    sheet.getRange(1, newIndex + 1).setValue(header);
    existing.push(header);
  });
}

function deviceSpreadsheet_() {
  return SpreadsheetApp.openById(DEVICE_SPREADSHEET_ID);
}

function userSpreadsheet_() {
  return SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
}

function userSheet_() {
  const ss = userSpreadsheet_();
  return sheetByGid_(ss, USERS_SHEET_GID) || ss.getSheetByName(SHEETS.users) || ss.getSheets()[0];
}

function sheetByGid_(spreadsheet, gid) {
  return spreadsheet.getSheets().find(sheet => sheet.getSheetId() === gid) || null;
}

function nextDeviceId_(offset) {
  const count = offset || Math.max(getRows_(SHEETS.devices).length + 1, 1);
  return 'TTB-2026-' + String(count).padStart(4, '0');
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================
// HỆ THỐNG GỬI EMAIL THÔNG BÁO
// ============================

function findDeviceById_(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  const devices = getRows_(SHEETS.devices);
  return devices.find(d => String(d.id || '').trim() === id || String(d['Seri Máy'] || '').trim() === id) || null;
}

function emailsByNames_(namesStr) {
  if (!namesStr) return [];
  const names = String(namesStr).split(/[,;\n]+/).map(n => n.trim().toLowerCase()).filter(Boolean);
  if (names.length === 0) return [];
  const users = getUserRows_().filter(u => userStatus_(u) !== 'inactive');
  const emails = [];
  names.forEach(name => {
    users.forEach(user => {
      const fullName = String(getUserField_(user, ['Họ và Tên', 'hoVaTen', 'name']) || '').trim().toLowerCase();
      if (fullName && fullName.indexOf(name) >= 0) {
        const email = userEmail_(user);
        if (email) emails.push(email);
      }
    });
  });
  return emails;
}

function adminEmails_() {
  return Array.from(new Set(getUserRows_()
    .filter(user => userStatus_(user) !== 'inactive' && isAdmin_(user))
    .map(user => userEmail_(user))
    .filter(Boolean)));
}

function getDeviceRecipients_(device) {
  const recipients = [];
  
  // 1. Admins
  adminEmails_().forEach(email => recipients.push(email));
  
  // 2. Nhân sự khoa phòng nơi đặt thiết bị
  const dept = String(device['Nơi đặt thiết bị'] || '').trim();
  if (dept) {
    const deptEmails = emailsByDepartment_(dept);
    deptEmails.forEach(e => recipients.push(e));
  }
  
  // 3. Tìm email từ documents (Người chịu trách nhiệm, Phối hợp, Giao quản lý)
  const docs = getRows_(SHEETS.documents).filter(d => String(d.DeviceId || '').trim() === String(device.id || '').trim());
  docs.forEach(doc => {
    const responsible = String(doc['Người chịu trách nhiệm'] || '').trim();
    const collaborator = String(doc['Phối hợp thực hiện'] || '').trim();
    const deptManager = String(doc['Giao quản lý tại khoa'] || '').trim();
    
    emailsByNames_(responsible).forEach(e => recipients.push(e));
    emailsByNames_(collaborator).forEach(e => recipients.push(e));
    emailsByNames_(deptManager).forEach(e => recipients.push(e));
  });
  
  return Array.from(new Set(recipients.filter(Boolean)));
}

function sendNotificationMail_(options) {
  try {
    const recipients = (options.recipients || []).filter(Boolean);
    if (recipients.length === 0) return;
    
    const unique = Array.from(new Set(recipients));
    const htmlBody = [
      '<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;">',
      '<div style="background:#1565c0;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">',
      '<h2 style="margin:0;font-size:18px;">🏥 Trung tâm Y tế Huyện Thanh Ba</h2>',
      '<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Hệ thống Quản lý Trang thiết bị Y tế</p>',
      '</div>',
      '<div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">',
      options.body || '',
      '</div>',
      '<p style="font-size:11px;color:#999;text-align:center;margin-top:12px;">',
      'Email tự động từ hệ thống QLTTB - Vui lòng không trả lời email này.',
      '</p>',
      '</div>'
    ].join('');
    
    MailApp.sendEmail({
      to: unique.join(','),
      subject: options.subject || '[QLTTB] Thông báo',
      htmlBody: htmlBody
    });
  } catch (err) {
    console.error('sendNotificationMail_ failed', err);
  }
}

// ============================
// QUÉT CẢNH BÁO ĐĂNG KIỂM HÀNG NGÀY
// ============================

function checkComplianceDeadlines() {
  const documents = getRows_(SHEETS.documents);
  const devices = getRows_(SHEETS.devices);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  
  const deviceMap = {};
  devices.forEach(d => { deviceMap[String(d.id || '').trim()] = d; });
  
  // 1. Thu thập tất cả các cảnh báo
  const allAlerts = [];
  documents.forEach(doc => {
    const expDateStr = String(doc['Hạn đăng kiểm / Hạn hiệu lực'] || '').trim();
    if (!expDateStr || expDateStr === 'N/A') return;
    
    const expDate = parseDate_(expDateStr);
    if (isNaN(expDate.getTime())) return;
    
    const expMs = expDate.getTime();
    const daysLeft = Math.ceil((expMs - todayMs) / (24 * 60 * 60 * 1000));
    const prepDays = parseInt(doc['Thời gian chuẩn bị hồ sơ (ngày)'] || '45', 10) || 45;
    
    let alertType = '';
    let alertLevel = '';
    let alertColor = '';
    let alertIcon = '';
    let order = 0;
    
    if (daysLeft < 0) {
      alertType = 'QUÁ HẠN ĐĂNG KIỂM';
      alertLevel = 'QUÁ HẠN (' + Math.abs(daysLeft) + ' ngày)';
      alertColor = '#b71c1c';
      alertIcon = '🚨';
      order = 1;
    } else if (daysLeft <= 30) {
      alertType = 'SẮP ĐẾN HẠN ĐĂNG KIỂM (≤ 30 ngày)';
      if (daysLeft <= 1) { alertLevel = 'KHẨN CẤP - Còn ' + daysLeft + ' ngày'; alertColor = '#d32f2f'; alertIcon = '🔴'; }
      else if (daysLeft <= 3) { alertLevel = 'RẤT GẤP - Còn ' + daysLeft + ' ngày'; alertColor = '#e65100'; alertIcon = '🟠'; }
      else if (daysLeft <= 7) { alertLevel = 'GẤP - Còn ' + daysLeft + ' ngày'; alertColor = '#ef6c00'; alertIcon = '🟡'; }
      else if (daysLeft <= 15) { alertLevel = 'Cảnh báo - Còn ' + daysLeft + ' ngày'; alertColor = '#f9a825'; alertIcon = '⚠️'; }
      else { alertLevel = 'Nhắc nhở - Còn ' + daysLeft + ' ngày'; alertColor = '#1565c0'; alertIcon = '📋'; }
      order = 2;
    } else if (daysLeft <= prepDays) {
      alertType = 'CẦN CHUẨN BỊ HỒ SƠ';
      alertLevel = 'Còn ' + daysLeft + ' ngày (Hạn nộp trước ' + prepDays + ' ngày)';
      alertColor = '#1565c0';
      alertIcon = '📝';
      order = 3;
    } else {
      return; // Chưa đến hạn cảnh báo
    }
    
    const devId = String(doc.DeviceId || '').trim();
    const device = deviceMap[devId] || { id: devId };
    
    allAlerts.push({
      device: device,
      doc: doc,
      daysLeft: daysLeft,
      alertType: alertType,
      alertLevel: alertLevel,
      alertColor: alertColor,
      alertIcon: alertIcon,
      order: order
    });
  });
  
  if (allAlerts.length === 0) {
    console.log('checkComplianceDeadlines: Không có tài liệu nào sắp đến hạn.');
    return;
  }
  
  // 2. Nhóm các cảnh báo theo Email người nhận
  const recipientAlerts = {}; 
  allAlerts.forEach(alert => {
    const recipients = getDeviceRecipients_(alert.device);
    recipients.forEach(email => {
      if (!recipientAlerts[email]) recipientAlerts[email] = [];
      // Tránh duplicate nếu một người nhận nhiều nguồn
      if (!recipientAlerts[email].some(a => a.doc['Mã Tài liệu'] === alert.doc['Mã Tài liệu'])) {
        recipientAlerts[email].push(alert);
      }
    });
  });
  
  // 3. Gửi email tổng hợp cho từng người
  const emailsSent = Object.keys(recipientAlerts);
  emailsSent.forEach(email => {
    let userAlerts = recipientAlerts[email];
    
    // Sắp xếp theo mức độ ưu tiên
    userAlerts.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.daysLeft - b.daysLeft;
    });
    
    // Nhóm theo loại cảnh báo để hiển thị
    const grouped = {};
    userAlerts.forEach(a => {
      if (!grouped[a.alertType]) grouped[a.alertType] = [];
      grouped[a.alertType].push(a);
    });
    
    let emailBody = '<p>Xin chào,</p><p>Hệ thống quản lý trang thiết bị y tế gửi báo cáo định kỳ về các tài liệu đăng kiểm/kiểm định cần xử lý của bạn:</p>';
    
    const mostUrgentType = userAlerts[0].alertType;
    const mostUrgentIcon = userAlerts[0].alertIcon;
    const totalAlertsCount = userAlerts.length;
    
    Object.keys(grouped).forEach(type => {
      const groupAlerts = grouped[type];
      emailBody += `
        <h3 style="color:${groupAlerts[0].alertColor}; border-bottom: 2px solid ${groupAlerts[0].alertColor}; padding-bottom: 4px; margin-top: 24px;">
          ${groupAlerts[0].alertIcon} ${type} (${groupAlerts.length} mục)
        </h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px;" border="1" cellpadding="6">
          <thead style="background:#f5f5f5;">
            <tr>
              <th>Thiết bị</th>
              <th>Nơi đặt</th>
              <th>Loại tài liệu</th>
              <th>Số văn bản</th>
              <th>Hạn hiệu lực</th>
              <th>Mức độ</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
      `;
      groupAlerts.forEach(a => {
        const deviceName = a.device['Tên Thiết bị'] || a.device.id || '';
        const dept = a.device['Nơi đặt thiết bị'] || '';
        emailBody += `
          <tr>
            <td><strong>${deviceName}</strong><br><span style="color:#666;font-size:11px;">Mã: ${a.device.id}</span></td>
            <td>${dept}</td>
            <td>${a.doc['Loại tài liệu'] || ''}</td>
            <td>${a.doc['Số văn bản / Số Đăng kiểm'] || ''}</td>
            <td>${a.doc['Hạn đăng kiểm / Hạn hiệu lực'] || ''}</td>
            <td style="color:${a.alertColor}; font-weight:bold;">${a.alertLevel}</td>
            <td>${a.doc['Trạng thái Hồ sơ'] || 'Chưa gửi'}</td>
          </tr>
        `;
      });
      emailBody += '</tbody></table>';
    });
    
    emailBody += '<p style="margin-top:20px;">Vui lòng truy cập hệ thống <strong>Quản lý Trang thiết bị Y tế</strong> để cập nhật hồ sơ và xử lý kịp thời.</p>';
    
    sendNotificationMail_({
      recipients: [email],
      subject: `[QLTTB] ${mostUrgentIcon} Báo cáo đăng kiểm: có ${totalAlertsCount} mục cần lưu ý (gồm: ${mostUrgentType})`,
      body: emailBody
    });
  });
  
  console.log('checkComplianceDeadlines: Đã gửi báo cáo tổng hợp cho ' + emailsSent.length + ' người nhận.');
}

function createDailyTrigger() {
  // Xóa trigger cũ nếu có
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkComplianceDeadlines') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Tạo trigger mới chạy hàng ngày lúc 7:00 sáng
  ScriptApp.newTrigger('checkComplianceDeadlines')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  
  console.log('Đã tạo trigger hàng ngày cho checkComplianceDeadlines lúc 7:00 AM.');
  return { success: true, message: 'Đã tạo trigger quét đăng kiểm hàng ngày lúc 7:00 sáng.' };
}

function findUserRowIndex_(username) {
  const sheet = userSheet_();
  if (!sheet) return -1;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return -1;
  const headers = values[0];
  
  const keys = ['Tên đăng nhập', 'Ten dang nhap', 'Username', 'Tài khoản', 'Tai khoan', 'username'];
  let usernameIndex = -1;
  for (let i = 0; i < headers.length; i++) {
    const normHeader = normalizeHeader_(headers[i]);
    if (keys.some(k => normalizeHeader_(k) === normHeader)) {
      usernameIndex = i;
      break;
    }
  }
  if (usernameIndex === -1) return -1;
  
  const normalized = normalize_(username);
  for (let i = 1; i < values.length; i++) {
    if (normalize_(values[i][usernameIndex]) === normalized) {
      return i + 1;
    }
  }
  return -1;
}

function updateUserRowByObject_(rowIndex, object) {
  const sheet = userSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const range = sheet.getRange(rowIndex, 1, 1, headers.length);
  const row = range.getValues()[0];
  headers.forEach((header, index) => {
    const normHeader = normalizeHeader_(header);
    const objKeys = Object.keys(object);
    const matchingKey = objKeys.find(k => normalizeHeader_(k) === normHeader);
    if (matchingKey !== undefined && object[matchingKey] !== undefined) {
      row[index] = object[matchingKey];
    }
  });
  range.setValues([row]);
}

function editUser_(payload) {
  const actor = requireAuthenticated_(payload);
  if (!actor) return authError_();
  
  const targetUsername = String(payload.username || userUsername_(actor)).trim();
  const isEditingSelf = normalize_(userUsername_(actor)) === normalize_(targetUsername);
  
  if (!isEditingSelf && !isAdmin_(actor)) {
    return { success: false, message: 'Bạn không có quyền chỉnh sửa thông tin của người dùng này.' };
  }
  
  const rowIndex = findUserRowIndex_(targetUsername);
  if (rowIndex < 2) {
    return { success: false, message: 'Không tìm thấy tài khoản người dùng cần chỉnh sửa.' };
  }
  
  // PIN update verification
  const newPin = String(payload.newPin || payload.pin || '').trim();
  if (newPin !== '') {
    if (isEditingSelf) {
      const currentPinInput = String(payload.currentPin || '').trim();
      const targetUser = findUser_(targetUsername);
      if (!targetUser) {
        return { success: false, message: 'Không tìm thấy tài khoản người dùng.' };
      }
      const actualPin = String(getUserField_(targetUser, ['Mã PIN', 'Ma PIN', 'PIN', 'pin', 'Mật khẩu', 'Mat khau', 'Password', 'password', 'Mã pin', 'MÃ PIN']) || '').trim();
      if (actualPin !== currentPinInput) {
        return { success: false, message: 'Mã PIN hiện tại không chính xác.' };
      }
    }
  }
  
  const updateData = {};
  const setIfDefined = (targetKey, sourceKeys) => {
    for (let k of sourceKeys) {
      if (payload[k] !== undefined) {
        updateData[targetKey] = String(payload[k]).trim();
        break;
      }
    }
  };

  setIfDefined('Họ và Tên', ['fullName', 'Họ và Tên', 'Họ và tên', 'name']);
  setIfDefined('Email', ['email', 'Email']);
  setIfDefined('Khoa/Phòng', ['department', 'Khoa/Phòng', 'Khoa/Phong']);
  
  if (newPin !== '') {
    updateData['Mã PIN'] = newPin;
  }
  
  if (isAdmin_(actor)) {
    setIfDefined('Quyền hạn', ['role', 'Quyền hạn', 'Quyen han']);
    setIfDefined('Trạng thái', ['status', 'Trạng thái', 'Trang thai']);
  }
  
  updateUserRowByObject_(rowIndex, updateData);
  
  // Return the updated user object (without sensitive fields)
  const updatedUser = findUser_(targetUsername);
  if (updatedUser) {
    const safeUser = { ...updatedUser };
    ['Mã PIN', 'Ma PIN', 'PIN', 'pin', 'Mật khẩu', 'Mat khau', 'Password', 'password', 'Mã pin', 'MÃ PIN'].forEach(k => delete safeUser[k]);
    return { success: true, message: 'Cập nhật thông tin người dùng thành công.', user: safeUser };
  }
  
  return { success: true, message: 'Cập nhật thông tin người dùng thành công.' };
}
