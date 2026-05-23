import React from 'react';
import { parseFlexibleDate } from '../utils/dateUtils';

// ===== TYPES =====
interface PrintTransferData {
  transferId: string;
  deviceName: string;
  deviceId: string;
  model?: string;
  serial?: string;
  origin?: string;
  fromDepartment: string;
  toDepartment: string;
  quantity?: string;
  condition?: string;
  requestedByName: string;
  receivedByName: string;
  requestedNote?: string;
  receivedNote?: string;
  date?: string;
}

interface PrintRepairData {
  deviceName: string;
  deviceId: string;
  model?: string;
  serial?: string;
  department?: string;
  reporterName: string;
  reporterDate?: string;
  description: string;
  repairContent?: string;
  replacedParts?: string;
  resultStatus?: string;
  technicianName?: string;
  approverName?: string;
  approverNote?: string;
  completedDate?: string;
}

// ===== PRINT STYLES =====
const printStyles = `
@media print {
  body * { visibility: hidden !important; }
  .print-template, .print-template * { visibility: visible !important; }
  .print-template {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 210mm !important;
    padding: 15mm 20mm !important;
    margin: 0 !important;
    background: #fff !important;
    color: #000 !important;
    font-size: 13px !important;
    line-height: 1.6 !important;
    font-family: 'Times New Roman', serif !important;
  }
  .print-template table { page-break-inside: avoid; }
  .no-print { display: none !important; }
}

.print-template {
  font-family: 'Times New Roman', serif;
  max-width: 210mm;
  margin: 0 auto;
  padding: 15mm 20mm;
  background: #fff;
  color: #000;
  font-size: 13px;
  line-height: 1.6;
}

.print-template .header-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.print-template .header-left {
  text-align: center;
  flex: 1;
}

.print-template .header-right {
  text-align: center;
  flex: 1;
}

.print-template .org-name {
  font-weight: bold;
  font-size: 14px;
  text-transform: uppercase;
}

.print-template .republic-line {
  font-weight: bold;
  font-size: 14px;
  text-transform: uppercase;
}

.print-template .motto {
  font-style: italic;
  font-size: 13px;
  text-decoration: underline;
}

.print-template .title {
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  text-transform: uppercase;
  margin: 24px 0 8px;
}

.print-template .subtitle {
  text-align: center;
  font-style: italic;
  margin-bottom: 20px;
}

.print-template .info-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.print-template .info-table td {
  padding: 6px 10px;
  border: 1px solid #333;
  vertical-align: top;
}

.print-template .info-table .label {
  font-weight: bold;
  width: 180px;
  background: #f5f5f5;
}

.print-template .sign-section {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  text-align: center;
}

.print-template .sign-block {
  flex: 1;
  padding: 0 10px;
}

.print-template .sign-title {
  font-weight: bold;
  font-size: 13px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.print-template .sign-subtitle {
  font-style: italic;
  font-size: 12px;
  margin-bottom: 60px;
}

.print-template .sign-name {
  font-weight: bold;
}

.print-template .note-section {
  margin-top: 16px;
  padding: 10px;
  border: 1px dashed #999;
  background: #fafafa;
}

.print-template .note-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
}

.print-template .print-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: #1565c0;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  margin: 16px auto;
}
.print-template .print-btn:hover {
  background: #0d47a1;
}
`;

// ===== SHARED HEADER =====
const PrintHeader: React.FC<{ date?: string }> = ({ date }) => {
  const d = date ? (parseFlexibleDate(date) || new Date()) : new Date();
  const formattedDate = `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  return (
    <>
      <div className="header-row">
        <div className="header-left">
          <div className="org-name">Trung tâm Y tế</div>
          <div className="org-name">Huyện Thanh Ba</div>
          <div style={{ fontSize: '12px', marginTop: 4 }}>Số: ___/BB-TTYT</div>
        </div>
        <div className="header-right">
          <div className="republic-line">Cộng hòa Xã hội Chủ nghĩa Việt Nam</div>
          <div className="motto">Độc lập - Tự do - Hạnh phúc</div>
          <div style={{ marginTop: 8, fontStyle: 'italic' }}>Thanh Ba, {formattedDate}</div>
        </div>
      </div>
    </>
  );
};

// ===== BIÊN BẢN BÀN GIAO LUÂN CHUYỂN =====
export const TransferPrintTemplate: React.FC<{ data: PrintTransferData }> = ({ data }) => {
  const handlePrint = () => window.print();
  return (
    <>
      <style>{printStyles}</style>
      <div className="print-template">
        <PrintHeader date={data.date} />

        <div className="title">Biên bản bàn giao &amp; luân chuyển<br />thiết bị y tế</div>
        <div className="subtitle">(V/v luân chuyển thiết bị giữa các khoa/phòng)</div>

        <table className="info-table">
          <tbody>
            <tr>
              <td className="label">Mã yêu cầu</td>
              <td>{data.transferId}</td>
              <td className="label">Ngày thực hiện</td>
              <td>{data.date || new Date().toLocaleDateString('vi-VN')}</td>
            </tr>
            <tr>
              <td className="label">Tên thiết bị</td>
              <td colSpan={3}>{data.deviceName}</td>
            </tr>
            <tr>
              <td className="label">Model</td>
              <td>{data.model || '...........'}</td>
              <td className="label">Số Seri</td>
              <td>{data.serial || data.deviceId}</td>
            </tr>
            <tr>
              <td className="label">Xuất xứ</td>
              <td>{data.origin || '...........'}</td>
              <td className="label">Số lượng</td>
              <td>{data.quantity || '1'}</td>
            </tr>
            <tr>
              <td className="label">Hiện trạng</td>
              <td colSpan={3}>{data.condition || 'Hoạt động bình thường'}</td>
            </tr>
          </tbody>
        </table>

        <table className="info-table">
          <tbody>
            <tr>
              <td className="label">Khoa/phòng bàn giao</td>
              <td>{data.fromDepartment}</td>
            </tr>
            <tr>
              <td className="label">Khoa/phòng tiếp nhận</td>
              <td>{data.toDepartment}</td>
            </tr>
            <tr>
              <td className="label">Lý do luân chuyển</td>
              <td>{data.requestedNote || '...........'}</td>
            </tr>
            {data.receivedNote && (
              <tr>
                <td className="label">Ghi chú tiếp nhận</td>
                <td>{data.receivedNote}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sign-section">
          <div className="sign-block">
            <div className="sign-title">Người giao</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">{data.requestedByName || '...........'}</div>
          </div>
          <div className="sign-block">
            <div className="sign-title">Người nhận</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">{data.receivedByName || '...........'}</div>
          </div>
          <div className="sign-block">
            <div className="sign-title">Phòng Vật tư - TBYT</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">...........</div>
          </div>
          <div className="sign-block">
            <div className="sign-title">Lãnh đạo Trung tâm</div>
            <div className="sign-subtitle">(Ký, đóng dấu)</div>
            <div className="sign-name">...........</div>
          </div>
        </div>

        <div className="no-print" style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="print-btn" onClick={handlePrint}>
            🖨️ In biên bản
          </button>
        </div>
      </div>
    </>
  );
};

// ===== BIÊN BẢN NGHIỆM THU SỬA CHỮA =====
export const RepairPrintTemplate: React.FC<{ data: PrintRepairData }> = ({ data }) => {
  const handlePrint = () => window.print();
  return (
    <>
      <style>{printStyles}</style>
      <div className="print-template">
        <PrintHeader date={data.completedDate} />

        <div className="title">Biên bản nghiệm thu sửa chữa<br />&amp; bàn giao thiết bị y tế</div>
        <div className="subtitle">(V/v sửa chữa, bảo dưỡng thiết bị y tế)</div>

        <h4 style={{ margin: '16px 0 8px', fontSize: '14px' }}>I. Thông tin thiết bị</h4>
        <table className="info-table">
          <tbody>
            <tr>
              <td className="label">Tên thiết bị</td>
              <td colSpan={3}>{data.deviceName}</td>
            </tr>
            <tr>
              <td className="label">Model</td>
              <td>{data.model || '...........'}</td>
              <td className="label">Số Seri</td>
              <td>{data.serial || data.deviceId}</td>
            </tr>
            <tr>
              <td className="label">Khoa/phòng sử dụng</td>
              <td colSpan={3}>{data.department || '...........'}</td>
            </tr>
          </tbody>
        </table>

        <h4 style={{ margin: '16px 0 8px', fontSize: '14px' }}>II. Nội dung báo hỏng</h4>
        <table className="info-table">
          <tbody>
            <tr>
              <td className="label">Người báo hỏng</td>
              <td>{data.reporterName}</td>
              <td className="label">Ngày báo</td>
              <td>{data.reporterDate || '...........'}</td>
            </tr>
            <tr>
              <td className="label">Mô tả lỗi / Hiện tượng</td>
              <td colSpan={3} style={{ color: '#c62828' }}>{data.description}</td>
            </tr>
          </tbody>
        </table>

        <h4 style={{ margin: '16px 0 8px', fontSize: '14px' }}>III. Nội dung sửa chữa</h4>
        <table className="info-table">
          <tbody>
            <tr>
              <td className="label">Nội dung sửa chữa</td>
              <td colSpan={3}>{data.repairContent || '...........................................................'}</td>
            </tr>
            <tr>
              <td className="label">Linh kiện thay thế</td>
              <td colSpan={3}>{data.replacedParts || 'Không'}</td>
            </tr>
            <tr>
              <td className="label">Hiện trạng sau sửa chữa</td>
              <td colSpan={3} style={{ fontWeight: 'bold', color: '#2e7d32' }}>
                {data.resultStatus || 'Hoạt động bình thường'}
              </td>
            </tr>
            {data.approverNote && (
              <tr>
                <td className="label">Ghi chú xử lý</td>
                <td colSpan={3}>{data.approverNote}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sign-section">
          <div className="sign-block">
            <div className="sign-title">Người sử dụng /<br />Người báo hỏng</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">{data.reporterName || '...........'}</div>
          </div>
          <div className="sign-block">
            <div className="sign-title">Kỹ thuật viên<br />sửa chữa</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">{data.technicianName || '...........'}</div>
          </div>
          <div className="sign-block">
            <div className="sign-title">Trưởng khoa/phòng<br />sử dụng</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">...........</div>
          </div>
          <div className="sign-block">
            <div className="sign-title">Phòng Vật tư<br />TBYT</div>
            <div className="sign-subtitle">(Ký, ghi rõ họ tên)</div>
            <div className="sign-name">{data.approverName || '...........'}</div>
          </div>
        </div>

        <div className="no-print" style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="print-btn" onClick={handlePrint}>
            🖨️ In biên bản
          </button>
        </div>
      </div>
    </>
  );
};

export type { PrintTransferData, PrintRepairData };
