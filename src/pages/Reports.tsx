import React, { useMemo, useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Activity,
  CheckCircle,
  ShieldCheck,
  ShieldAlert,
  CalendarClock,
  CalendarX2,
  Filter,
  ListChecks,
} from 'lucide-react';
import { Card, CardBody, Button, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Badge, type BadgeVariant } from '../components/ui';
import { useDevices } from '../hooks/useDevices';
import { useRepairs } from '../hooks/useRepairs';
import type { DeviceData, DeviceDocument } from '../services/api';
import { exportCsv, type CsvRow } from '../utils/exportCsv';
import { daysUntil, parseFlexibleDate } from '../utils/dateUtils';
import { removeVietnameseTones } from '../utils/stringUtils';
import { getRepairStatusVariant, isRepairActive, isRepairCompleted } from '../utils/statusUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Reports.css';

type InspectionStatusFilter = 'all' | 'valid' | 'warning' | 'expired' | 'missing' | 'sent';
type InspectionStatusKind = Exclude<InspectionStatusFilter, 'all'>;
type InspectionStats = Record<InspectionStatusKind, number> & { total: number };

interface InspectionRow {
  key: string;
  deviceId: string;
  deviceName: string;
  department: string;
  docType: string;
  licenseNo: string;
  issuedDate: string;
  expiryDate: string;
  prepTime: string;
  responsible: string;
  deptManager: string;
  docStatus: string;
  daysUntilExpiry: number | null;
  statusKind: InspectionStatusKind;
  statusText: string;
  badgeVariant: BadgeVariant;
  sortRank: number;
}

const EMPTY_TEXT = '—';
const missingValueSet = new Set(['', 'n/a', 'na', '-', EMPTY_TEXT, 'khong co']);

const cleanText = (value: unknown, fallback = EMPTY_TEXT) => {
  const text = String(value ?? '').trim();
  const normalized = removeVietnameseTones(text.toLowerCase());
  return text && !missingValueSet.has(normalized) ? text : fallback;
};

const calculateDaysUntilExpiry = (expiryDate: string, providedDays?: number | null) => {
  if (typeof providedDays === 'number' && Number.isFinite(providedDays)) return providedDays;
  const parsed = parseFlexibleDate(expiryDate);
  return parsed ? daysUntil(parsed) : null;
};

const isSentOrApproved = (status: string) => {
  const normalized = removeVietnameseTones(status.toLowerCase());
  return normalized.includes('da gui') || normalized.includes('da phe duyet');
};

const resolveInspectionStatus = (
  docStatus: string,
  days: number | null,
  hasExpiryDate: boolean
): Pick<InspectionRow, 'statusKind' | 'statusText' | 'badgeVariant' | 'sortRank'> => {
  if (isSentOrApproved(docStatus)) {
    return {
      statusKind: 'sent',
      statusText: docStatus,
      badgeVariant: 'success',
      sortRank: 4,
    };
  }

  if (!hasExpiryDate || days === null) {
    return {
      statusKind: 'missing',
      statusText: 'Thiếu hạn hiệu lực',
      badgeVariant: 'neutral',
      sortRank: 2,
    };
  }

  if (days < 0) {
    return {
      statusKind: 'expired',
      statusText: `Hết hạn ${Math.abs(days)} ngày`,
      badgeVariant: 'danger',
      sortRank: 0,
    };
  }

  if (days <= 30) {
    return {
      statusKind: 'warning',
      statusText: `Còn ${days} ngày`,
      badgeVariant: 'warning',
      sortRank: 1,
    };
  }

  return {
    statusKind: 'valid',
    statusText: `Còn ${days} ngày`,
    badgeVariant: 'success',
    sortRank: 5,
  };
};

const buildInspectionRowFromDocument = (
  device: DeviceData,
  doc: DeviceDocument,
  index: number,
  deviceIndex: number
): InspectionRow => {
  const expiryDate = cleanText(doc.expiryDate, '');
  const docStatus = cleanText(doc.status, 'Chưa gửi');
  const days = calculateDaysUntilExpiry(expiryDate, doc.daysUntilExpiry);
  const status = resolveInspectionStatus(docStatus, days, Boolean(expiryDate));

  return {
    key: `${deviceIndex}-${device.id}-${index}-${doc.docType || 'doc'}`,
    deviceId: device.id,
    deviceName: device.name,
    department: cleanText(device.department, 'Chưa phân bổ'),
    docType: cleanText(doc.docType, 'Hồ sơ kiểm định'),
    licenseNo: cleanText(doc.licenseNo),
    issuedDate: cleanText(doc.issuedDate),
    expiryDate: cleanText(expiryDate),
    prepTime: cleanText(doc.prepTime),
    responsible: cleanText(doc.responsible),
    deptManager: cleanText(doc.deptManager),
    docStatus,
    daysUntilExpiry: days,
    ...status,
  };
};

const buildLegacyInspectionRow = (device: DeviceData, deviceIndex: number): InspectionRow | null => {
  const issuedDate = cleanText(device['Ngày cấp/ Ngày Đăng kiểm'], '');
  const expiryDate = cleanText(
    device['Thời hạn cấp lại/ Hạn đăng kiểm'] || device['Hạn đăng kiểm'] || device['Ngày bảo dưỡng tiếp theo'],
    ''
  );
  const licenseNo = cleanText(device['Số văn bản / Số Đăng kiểm'] || device['Số đăng kiểm'], '');
  const rawDocStatus = cleanText(device['Trạng thái Hồ sơ'], '');
  const hasLegacyInspectionData = Boolean(issuedDate || expiryDate || licenseNo || rawDocStatus);
  if (!hasLegacyInspectionData) return null;

  const docStatus = rawDocStatus || 'Chưa gửi';
  const days = calculateDaysUntilExpiry(expiryDate);
  const hasAnyInspectionData = Boolean(issuedDate || expiryDate);
  const status = resolveInspectionStatus(docStatus, days, Boolean(expiryDate));

  return {
    key: `${deviceIndex}-${device.id}-legacy-inspection`,
    deviceId: device.id,
    deviceName: device.name,
    department: cleanText(device.department, 'Chưa phân bổ'),
    docType: hasAnyInspectionData ? 'Đăng kiểm / bảo dưỡng' : 'Hồ sơ theo dõi',
    licenseNo: cleanText(licenseNo),
    issuedDate: cleanText(issuedDate),
    expiryDate: cleanText(expiryDate),
    prepTime: cleanText(device['Thời gian  chuẩn bị Hồ sơ'] || device['Thời gian chuẩn bị Hồ sơ']),
    responsible: cleanText(device['Người chịu trách nhiệm']),
    deptManager: cleanText(device['Giao quản lý tại khoa']),
    docStatus,
    daysUntilExpiry: days,
    ...status,
  };
};

const formatInspectionDays = (row: InspectionRow) => {
  if (row.daysUntilExpiry === null) return EMPTY_TEXT;
  if (row.daysUntilExpiry < 0) return `Quá hạn ${Math.abs(row.daysUntilExpiry)} ngày`;
  if (row.daysUntilExpiry === 0) return 'Hết hạn hôm nay';
  return `Còn ${row.daysUntilExpiry} ngày`;
};

const toPdfText = (value: unknown) => removeVietnameseTones(String(value ?? ''));

const Reports: React.FC = () => {
  const { devices, isLoading: isDevicesLoading } = useDevices();
  const { repairs, isLoading: isRepairsLoading } = useRepairs();
  const isLoading = isDevicesLoading || isRepairsLoading;
  
  const [activeMainTab, setActiveMainTab] = useState<'thong-ke' | 'bao-cao'>('thong-ke');
  const [subTab, setSubTab] = useState<'sua-xong' | 'kiem-dinh'>('sua-xong');
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState<InspectionStatusFilter>('all');
  const [inspectionDepartmentFilter, setInspectionDepartmentFilter] = useState('all');

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return true;
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!parts) return true;
    const [ , day, month, year ] = parts;
    const rDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const fDate = new Date(fromDate); fDate.setHours(0, 0, 0, 0);
    const tDate = new Date(toDate); tDate.setHours(23, 59, 59, 999);
    return rDate >= fDate && rDate <= tDate;
  };

  const activeRepairs = repairs.filter(r => isRepairActive(r.status) && isDateInRange(r.rowId));
  const completedRepairs = repairs.filter(r => isRepairCompleted(r.status) && isDateInRange(r.rowId));

  const getDeviceDetails = (id: string) => devices.find(d => d.id === id);

  const inspectionRows = useMemo(() => {
    return devices.flatMap((device, deviceIndex) => {
      const docs = device.documents || [];
      if (docs.length === 0) {
        const legacyRow = buildLegacyInspectionRow(device, deviceIndex);
        return legacyRow ? [legacyRow] : [];
      }
      return docs.map((doc, index) => buildInspectionRowFromDocument(device, doc, index, deviceIndex));
    }).sort((a, b) => {
      const dayA = a.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER;
      const dayB = b.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER;
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
      if (dayA !== dayB) return dayA - dayB;
      return a.deviceName.localeCompare(b.deviceName, 'vi');
    });
  }, [devices]);

  const inspectionDepartments = useMemo(() => {
    return Array.from(new Set(inspectionRows.map(row => row.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [inspectionRows]);

  const inspectionStats = useMemo(() => {
    return inspectionRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.statusKind] += 1;
        return acc;
      },
      {
        total: 0,
        valid: 0,
        warning: 0,
        expired: 0,
        missing: 0,
        sent: 0,
      } as InspectionStats
    );
  }, [inspectionRows]);

  const filteredInspectionRows = useMemo(() => {
    return inspectionRows.filter(row => {
      const matchesStatus = inspectionStatusFilter === 'all' || row.statusKind === inspectionStatusFilter;
      const matchesDepartment = inspectionDepartmentFilter === 'all' || row.department === inspectionDepartmentFilter;
      return matchesStatus && matchesDepartment;
    });
  }, [inspectionDepartmentFilter, inspectionRows, inspectionStatusFilter]);

  const inspectionSummaryCards: Array<{
    filter: InspectionStatusFilter;
    label: string;
    value: number;
    detail: string;
    tone: string;
    icon: React.ReactNode;
  }> = [
    { filter: 'all', label: 'Tổng hồ sơ', value: inspectionStats.total, detail: `${devices.length} thiết bị`, tone: 'is-total', icon: <ListChecks size={18} /> },
    { filter: 'valid', label: 'Còn hạn', value: inspectionStats.valid, detail: '> 30 ngày', tone: 'is-valid', icon: <ShieldCheck size={18} /> },
    { filter: 'warning', label: 'Cần chuẩn bị', value: inspectionStats.warning, detail: '0 - 30 ngày', tone: 'is-warning', icon: <CalendarClock size={18} /> },
    { filter: 'expired', label: 'Hết hạn', value: inspectionStats.expired, detail: 'quá hạn hiệu lực', tone: 'is-expired', icon: <CalendarX2 size={18} /> },
    { filter: 'missing', label: 'Thiếu hồ sơ', value: inspectionStats.missing, detail: 'cần bổ sung', tone: 'is-missing', icon: <ShieldAlert size={18} /> },
    { filter: 'sent', label: 'Đã gửi/duyệt', value: inspectionStats.sent, detail: 'đã xử lý', tone: 'is-sent', icon: <CheckCircle size={18} /> },
  ];

  const handleExportCsv = () => {
    let exportData: CsvRow[] = [];
    if (activeMainTab === 'thong-ke') {
      if (activeRepairs.length === 0) return alert('Không có dữ liệu.');
      exportData = activeRepairs.map((r, i) => {
        const d = getDeviceDetails(r.deviceId);
        return { STT: i+1, 'Ngày báo hỏng': r.rowId, 'Thiết bị': d ? d.name : 'Unknown', 'Mô tả lỗi': r.description, 'Tình trạng': r.status };
      });
    } else {
      if (subTab === 'sua-xong') {
        if (completedRepairs.length === 0) return alert('Không có dữ liệu.');
        exportData = completedRepairs.map((r, i) => {
          const d = getDeviceDetails(r.deviceId);
          return { STT: i+1, 'Ngày hoàn thành': r.rowId, 'Thiết bị': d ? d.name : 'Unknown', 'Mô tả': r.description, 'Trạng thái': r.status };
        });
      } else {
        if (filteredInspectionRows.length === 0) return alert('Không có dữ liệu.');
        exportData = filteredInspectionRows.map((row, i) => ({
          STT: i + 1,
          'Mã TB': row.deviceId,
          'Tên thiết bị': row.deviceName,
          'Khoa/phòng': row.department,
          'Loại hồ sơ': row.docType,
          'Số văn bản': row.licenseNo,
          'Ngày cấp/đăng kiểm': row.issuedDate,
          'Hạn hiệu lực': row.expiryDate,
          'Thời gian chuẩn bị': row.prepTime,
          'Người phụ trách': row.responsible,
          'Còn lại/quá hạn': formatInspectionDays(row),
          'Trạng thái': row.statusText,
          'Trạng thái hồ sơ': row.docStatus,
        }));
      }
    }
    exportCsv(exportData, `BaoCao_${activeMainTab}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    
    let title = 'BAO CAO THONG KE';
    let headers: string[][] = [];
    let body: (string | number)[][] = [];

    if (activeMainTab === 'thong-ke') {
      title = 'THONG KE THIET BI DANG HONG HOC';
      headers = [['STT', 'Ngay bao', 'Ma TB', 'Ten Thiet Bi', 'Khoa/Phong', 'Mo ta loi', 'Trang thai']];
      body = activeRepairs.map((r, i) => {
        const d = getDeviceDetails(r.deviceId);
        return [i+1, r.rowId, r.deviceId, d ? d.name : '', d ? d.department : '', r.description.substring(0,40), r.status];
      });
    } else {
      if (subTab === 'sua-xong') {
        title = 'BAO CAO THIET BI DA SUA XONG';
        headers = [['STT', 'Ngay hoan thanh', 'Ma TB', 'Ten Thiet Bi', 'Thong tin sua', 'Trang thai']];
        body = completedRepairs.map((r, i) => {
          const d = getDeviceDetails(r.deviceId);
          return [i+1, r.rowId, r.deviceId, d ? d.name : '', r.description.substring(0,40), r.status];
        });
      } else {
        title = 'BAO CAO KIEM DINH CHUNG';
        headers = [['STT', 'Ma TB', 'Ten Thiet Bi', 'Khoa/Phong', 'Loai ho so', 'Ngay cap', 'Han hieu luc', 'Con lai', 'Trang thai']];
        body = filteredInspectionRows.map((row, i) => [
          i + 1,
          row.deviceId,
          toPdfText(row.deviceName),
          toPdfText(row.department),
          toPdfText(row.docType),
          toPdfText(row.issuedDate),
          toPdfText(row.expiryDate),
          toPdfText(formatInspectionDays(row)),
          toPdfText(row.statusText),
        ]);
      }
    }

    doc.text(title, 148, 18, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    if (activeMainTab === 'thong-ke' || subTab === 'sua-xong') {
      doc.text(`Tu ngay: ${fromDate}   Den ngay: ${toDate}`, 148, 26, { align: 'center' });
    }

    autoTable(doc, {
      startY: 32,
      head: headers,
      body: body.length > 0 ? body : [headers[0].map((_, index) => index === 0 ? 'Khong co du lieu bao cao' : '')],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold' }
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Trang ${i}/${pageCount} - In luc: ${new Date().toLocaleString('vi-VN')}`, 148, 200, { align: 'center' });
    }

    doc.save(`${title.replace(/ /g, '_')}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="reports-page">
      <div className="page-header">
        <h1 className="page-title">Thống kê & Báo cáo</h1>
        <p className="page-subtitle">Quản lý và theo dõi tình trạng thiết bị y tế tổng thể</p>
      </div>

      <div className="reports-tabs-container">
        <div className={`report-main-tab ${activeMainTab === 'thong-ke' ? 'active' : ''}`} onClick={() => setActiveMainTab('thong-ke')}>
          <Activity size={20} />
          <span>Thống kê thiết bị</span>
        </div>
        <div className={`report-main-tab ${activeMainTab === 'bao-cao' ? 'active' : ''}`} onClick={() => setActiveMainTab('bao-cao')}>
          <FileText size={20} />
          <span>Báo cáo tổng hợp</span>
        </div>
      </div>

      <Card className="report-content-card">
        <CardBody style={{ padding: '24px' }}>
          
          <div className="report-toolbar">
            {(activeMainTab === 'thong-ke' || (activeMainTab === 'bao-cao' && subTab === 'sua-xong')) && (
              <div className="date-pickers">
                <div className="date-picker-wrapper">
                  <span className="date-label">Từ:</span>
                  <input type="date" className="date-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div className="date-picker-wrapper">
                  <span className="date-label">Đến:</span>
                  <input type="date" className="date-input" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>
            )}
            
            {activeMainTab === 'bao-cao' && (
              <div className="sub-tabs-container">
                <button className={`sub-tab-btn ${subTab === 'sua-xong' ? 'active' : ''}`} onClick={() => setSubTab('sua-xong')}>
                  <CheckCircle size={16} /> Báo cáo sửa xong
                </button>
                <button className={`sub-tab-btn ${subTab === 'kiem-dinh' ? 'active' : ''}`} onClick={() => setSubTab('kiem-dinh')}>
                  <ShieldCheck size={16} /> Kiểm định chung
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>In</Button>
              <Button variant="secondary" icon={<FileText size={16} />} onClick={handleExportPDF}>Tải PDF</Button>
              <Button variant="primary" icon={<Download size={16} />} onClick={handleExportCsv}>Tải CSV</Button>
            </div>
          </div>

          <div className="report-table-wrapper" style={{ marginTop: '24px' }}>
            
            {/* THỐNG KÊ (ĐANG HỎNG) */}
            {activeMainTab === 'thong-ke' && (
              <>
                <h3 style={{ marginBottom: '16px', color: 'var(--primary-dark)', fontSize: '1.2rem', fontWeight: 600 }}>
                  Thống kê thiết bị đang gặp sự cố ({activeRepairs.length})
                </h3>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Ngày báo hỏng</TableHeader>
                      <TableHeader>Thiết bị</TableHeader>
                      <TableHeader>Người báo</TableHeader>
                      <TableHeader>Tình trạng / Lỗi</TableHeader>
                      <TableHeader>Trạng thái</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading ? <TableRow><TableCell colSpan={5} style={{textAlign:'center', padding: '2rem'}}>Đang tải...</TableCell></TableRow> : 
                     activeRepairs.length === 0 ? <TableRow><TableCell colSpan={5} style={{textAlign:'center', padding: '2rem'}}>Không có thiết bị hỏng trong kỳ.</TableCell></TableRow> :
                     activeRepairs.map((r, i) => {
                       const d = getDeviceDetails(r.deviceId);
                       return (
                         <TableRow key={i}>
                           <TableCell style={{color:'var(--text-secondary)'}}>{r.rowId}</TableCell>
                           <TableCell><strong>{d ? d.name : r.deviceId}</strong><br/><small>{d?.department}</small></TableCell>
                           <TableCell>{r.userName}</TableCell>
                           <TableCell>{r.description}</TableCell>
                           <TableCell><Badge variant={getRepairStatusVariant(r.status)}>{r.status}</Badge></TableCell>
                         </TableRow>
                       );
                     })
                    }
                  </TableBody>
                </Table>
              </>
            )}

            {/* BÁO CÁO SỬA XONG */}
            {activeMainTab === 'bao-cao' && subTab === 'sua-xong' && (
              <>
                <h3 style={{ marginBottom: '16px', color: 'var(--success)', fontSize: '1.2rem', fontWeight: 600 }}>
                  Báo cáo thiết bị đã sửa xong ({completedRepairs.length})
                </h3>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Ngày hoàn thành</TableHeader>
                      <TableHeader>Thiết bị</TableHeader>
                      <TableHeader>Tiến độ / Ghi chú</TableHeader>
                      <TableHeader>Trạng thái</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading ? <TableRow><TableCell colSpan={5} style={{textAlign:'center', padding: '2rem'}}>Đang tải...</TableCell></TableRow> : 
                     completedRepairs.length === 0 ? <TableRow><TableCell colSpan={5} style={{textAlign:'center', padding: '2rem'}}>Chưa có thiết bị hoàn thành sửa chữa trong kỳ.</TableCell></TableRow> :
                     completedRepairs.map((r, i) => {
                       const d = getDeviceDetails(r.deviceId);
                       return (
                         <TableRow key={i}>
                           <TableCell style={{color:'var(--text-secondary)'}}>{r.rowId}</TableCell>
                           <TableCell><strong>{d ? d.name : r.deviceId}</strong><br/><small>{d?.department}</small></TableCell>
                           <TableCell>{r.description}</TableCell>
                           <TableCell><Badge variant={getRepairStatusVariant(r.status)}>{r.status}</Badge></TableCell>
                         </TableRow>
                       );
                     })
                    }
                  </TableBody>
                </Table>
                
              </>
            )}

            {/* KIỂM ĐỊNH CHUNG */}
            {activeMainTab === 'bao-cao' && subTab === 'kiem-dinh' && (
              <section className="inspection-panel">
                <div className="inspection-panel-header">
                  <div>
                    <div className="inspection-kicker">
                      <ShieldCheck size={16} />
                      <span>Kiểm định chung</span>
                    </div>
                    <h3>Hồ sơ kiểm định & đăng kiểm theo thiết bị</h3>
                    <p>
                      Theo dõi từng hồ sơ, hạn hiệu lực, thời gian chuẩn bị và người phụ trách để ưu tiên xử lý đúng việc.
                    </p>
                  </div>
                  <div className="inspection-count">
                    <strong>{filteredInspectionRows.length}</strong>
                    <span>đang hiển thị</span>
                  </div>
                </div>

                <div className="inspection-summary-grid">
                  {inspectionSummaryCards.map(card => (
                    <button
                      key={card.filter}
                      type="button"
                      className={`inspection-summary-card ${card.tone} ${inspectionStatusFilter === card.filter ? 'active' : ''}`}
                      aria-pressed={inspectionStatusFilter === card.filter}
                      onClick={() => setInspectionStatusFilter(card.filter)}
                    >
                      <span className="inspection-summary-icon">{card.icon}</span>
                      <span className="inspection-summary-content">
                        <strong>{card.value}</strong>
                        <span>{card.label}</span>
                        <small>{card.detail}</small>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="inspection-filter-bar">
                  <div className="inspection-filter-title">
                    <Filter size={16} />
                    <span>Bộ lọc</span>
                  </div>
                  <label className="inspection-filter-field">
                    <span>Tình trạng</span>
                    <select value={inspectionStatusFilter} onChange={event => setInspectionStatusFilter(event.target.value as InspectionStatusFilter)}>
                      <option value="all">Tất cả tình trạng</option>
                      <option value="valid">Còn hạn</option>
                      <option value="warning">Cần chuẩn bị</option>
                      <option value="expired">Hết hạn</option>
                      <option value="missing">Thiếu hồ sơ</option>
                      <option value="sent">Đã gửi/duyệt</option>
                    </select>
                  </label>
                  <label className="inspection-filter-field">
                    <span>Khoa/phòng</span>
                    <select value={inspectionDepartmentFilter} onChange={event => setInspectionDepartmentFilter(event.target.value)}>
                      <option value="all">Tất cả khoa/phòng</option>
                      {inspectionDepartments.map(department => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                  </label>
                  <div className="inspection-filter-result">
                    {filteredInspectionRows.length}/{inspectionRows.length} dòng
                  </div>
                </div>

                <Table className="inspection-table">
                  <TableHead>
                    <TableRow>
                      <TableHeader>Thiết bị</TableHeader>
                      <TableHeader>Khoa/phòng</TableHeader>
                      <TableHeader>Hồ sơ</TableHeader>
                      <TableHeader>Ngày cấp</TableHeader>
                      <TableHeader>Hạn hiệu lực</TableHeader>
                      <TableHeader>Phụ trách</TableHeader>
                      <TableHeader>Trạng thái</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} style={{textAlign:'center', padding: '2rem'}}>Đang tải...</TableCell>
                      </TableRow>
                    ) : filteredInspectionRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} style={{textAlign:'center', padding: '2rem', color: 'var(--text-secondary)'}}>
                          Không có hồ sơ phù hợp với bộ lọc.
                        </TableCell>
                      </TableRow>
                    ) : filteredInspectionRows.map(row => (
                      <TableRow key={row.key} className={`inspection-row status-${row.statusKind}`}>
                        <TableCell>
                          <div className="inspection-device-cell">
                            <strong>{row.deviceName}</strong>
                            <span>{row.deviceId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inspection-department">{row.department}</span>
                        </TableCell>
                        <TableCell>
                          <div className="inspection-doc-cell">
                            <strong>{row.docType}</strong>
                            <span>{row.licenseNo}</span>
                          </div>
                        </TableCell>
                        <TableCell>{row.issuedDate}</TableCell>
                        <TableCell>
                          <div className="inspection-expiry-cell">
                            <strong>{row.expiryDate}</strong>
                            <span className={`inspection-days is-${row.statusKind}`}>{formatInspectionDays(row)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="inspection-owner-cell">
                            <strong>{row.responsible}</strong>
                            {row.deptManager !== EMPTY_TEXT && <span>{row.deptManager}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="inspection-status-cell">
                            <Badge variant={row.badgeVariant}>{row.statusText}</Badge>
                            {row.docStatus !== row.statusText && row.docStatus !== EMPTY_TEXT && (
                              <span>{row.docStatus}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default Reports;
