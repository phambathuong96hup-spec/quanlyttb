// ========== THÊM VÀO GOOGLE APPS SCRIPT CỦA QLTTB ==========
// Copy toàn bộ code này vào Google Apps Script (sheet.google.com > Extensions > Apps Script)
// Sau đó Deploy lại (Deploy > Manage deployments > Update) để áp dụng thay đổi.

// =============================================================
// 1. THÊM VÀO PHẦN ĐẦU FILE (khai báo biến tên Sheet)
// =============================================================
var SHEET_GSP = 'GSP_Log';

// =============================================================
// 2. THÊM VÀO PHẦN doGet (endpoint đọc dữ liệu GSP)
// Tìm doGet và thêm đoạn này TRƯỚC phần return responseJSON mặc định
// =============================================================
/*
  if (params.action == 'getGSP') {
    return doGetGSP();
  }
*/

// =============================================================
// 3. THÊM VÀO PHẦN doPost (endpoint ghi dữ liệu GSP)
// Tìm doPost và thêm đoạn này TRƯỚC return responseJSON('Action not found')
// =============================================================
/*
  if (action == 'addGSP') {
    return doAddGSP(postData.payload);
  }
*/

// =============================================================
// 4. THÊM CÁC HÀM NÀY VÀO CUỐI FILE
// =============================================================

function doGetGSP() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_GSP);
    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    var result = [];
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // Bỏ qua dòng trống
      
      var dateVal = row[0];
      var dateStr = '';
      if (dateVal instanceof Date) {
        dateStr = Utilities.formatDate(dateVal, 'GMT+7', 'yyyy-MM-dd');
      } else {
        dateStr = String(dateVal);
      }
      
      result.push({
        date: dateStr,
        shift: String(row[1] || ''),
        tempKho: parseFloat(row[2]) || 0,
        tempTuLanh: parseFloat(row[3]) || 0,
        humidity: parseFloat(row[4]) || 0,
        note: String(row[5] || ''),
        recorder: String(row[6] || '')
      });
    }
    
    // Sắp xếp mới nhất lên đầu
    result.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doAddGSP(payload) {
  try {
    if (!payload) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Thiếu dữ liệu!' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_GSP);
    
    // Tạo Sheet GSP_Log nếu chưa có
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_GSP);
      // Tạo header
      sheet.getRange(1, 1, 1, 7).setValues([[
        'Ngày', 'Ca', 'Nhiệt độ Kho (°C)', 'Nhiệt độ Tủ lạnh (°C)', 'Độ ẩm (%)', 'Ghi chú', 'Người ghi'
      ]]);
      // Format header
      sheet.getRange(1, 1, 1, 7)
        .setBackground('#0d9488')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    var today = new Date();
    var tempKho = parseFloat(payload.tempKho) || 0;
    var tempTuLanh = parseFloat(payload.tempTuLanh) || 0;
    var humidity = parseFloat(payload.humidity) || 0;
    
    sheet.appendRow([
      today,
      payload.shift || 'Sáng',
      tempKho,
      tempTuLanh, 
      humidity,
      payload.note || '',
      payload.recorder || 'Ẩn danh'
    ]);
    
    // Kiểm tra vi phạm GSP và log
    var violations = [];
    if (tempKho < 15 || tempKho > 30) violations.push('Kho thường: ' + tempKho + '°C');
    if (tempTuLanh < 2 || tempTuLanh > 8) violations.push('Tủ lạnh: ' + tempTuLanh + '°C');
    if (humidity < 40 || humidity > 75) violations.push('Độ ẩm: ' + humidity + '%');
    
    var message = 'Ghi nhận thành công!';
    if (violations.length > 0) {
      message = '⚠️ Đã ghi nhận - CẢNH BÁO: ' + violations.join(', ') + ' vượt ngưỡng GSP!';
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: message,
      hasViolation: violations.length > 0,
      violations: violations
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      message: 'Lỗi: ' + e.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ========== HƯỚNG DẪN TÍCH HỢP VÀO doGet VÀ doPost ==========
// 
// TRONG HÀM doGet(e), THÊM VÀO TRƯỚC "return responseJSON(DEFAULT)":
//
// if (params.action == 'getGSP') {
//   return doGetGSP();
// }
//
// TRONG HÀM doPost(e), THÊM VÀO TRƯỚC "return responseJSON('Action not found')":
//
// if (action == 'addGSP') {
//   return doAddGSP(postData.payload || postData);
// }
//
// SAU ĐÓ: Deploy > Manage deployments > Update (New Version)
// ============================================================
