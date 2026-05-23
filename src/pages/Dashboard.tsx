import React, { useState } from 'react';
import {
  Stethoscope,
  Activity,
  AlertTriangle,
  Download,
  ShieldAlert,
  Wrench,
  CalendarX2
} from 'lucide-react';
import { Pie, Bar } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, Badge, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Button } from '../components/ui';
import { updateDocumentStatus } from '../services/api';
import { useDevices } from '../hooks/useDevices';
import { useRepairs } from '../hooks/useRepairs';
import { useAuth } from '../authContext';
import { parseVietnameseDate } from '../utils/dateUtils';
import { buildDashboardDeviceSummary } from '../utils/dashboardDeviceStats';
import { buildRepairStatsByMonth } from '../utils/dashboardStats';
import { removeVietnameseTones } from '../utils/stringUtils';
import {
  getRepairStatusVariant,
  isRepairActive,
  isRepairAwaitingReview,
  isRepairInProgress,
} from '../utils/statusUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';



const Dashboard: React.FC = () => {
  const { devices, isLoading: isLoadingDevices, mutate: mutateDevices } = useDevices();
  const { repairs, isLoading: isLoadingRepairs } = useRepairs();
  const isLoading = isLoadingDevices || isLoadingRepairs;
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const activeRepairs = repairs.filter(r => isRepairActive(r.status));
  const repairCount = activeRepairs.length;
  const reportedRepairCount = activeRepairs.filter(r => isRepairAwaitingReview(r.status)).length;
  const repairingCount = activeRepairs.filter(r => isRepairInProgress(r.status)).length;
  const deviceSummary = buildDashboardDeviceSummary(devices, repairs);
  const {
    stableDeviceCount,
    expiredComplianceCount,
    complianceWarningCount,
  } = deviceSummary;

  const getDepartmentStats = () => {
    const deptCount: Record<string, number> = {};
    devices.forEach(d => {
      let dept = d.department ? d.department.trim() : 'Chưa phân bổ';
      if (dept === '') dept = 'Chưa phân bổ';
      deptCount[dept] = (deptCount[dept] || 0) + 1;
    });
    const sorted = Object.entries(deptCount).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(item => item[0]);
    const data = sorted.map(item => item[1]);
    return { labels, data };
  };



  const processedDevices = devices.map(d => {
    let daysRemaining = 999;
    let warningLevel = 'safe'; // safe, warning, danger, critical
    let alertText = '';
    let urgentDocType = '';

    // Quét tất cả tài liệu, tìm tài liệu khẩn cấp nhất
    const docs = d.documents || [];
    if (docs.length > 0) {
      let bestDeadline: Date | null = null;
      let bestPrepDays = 45;
      let bestDocType = '';

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const doc of docs) {
        const parsed = parseVietnameseDate(doc.expiryDate);
        if (parsed) {
          const diffDeadline = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const submitted = doc.status === 'Đã gửi' || doc.status === 'Đã phê duyệt';
          if (submitted && diffDeadline >= 0) continue;

          if (!bestDeadline || parsed.getTime() < bestDeadline.getTime()) {
            bestDeadline = parsed;
            const match = String(doc.prepTime || '').match(/\d+/);
            bestPrepDays = match ? parseInt(match[0], 10) : 45;
            bestDocType = doc.docType;
          }
        }
      }

      if (bestDeadline) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadlineTime = (bestDeadline as Date).getTime();
        const prepStartTime = deadlineTime - (bestPrepDays * 24 * 60 * 60 * 1000);
        const diffStart = Math.ceil((prepStartTime - today.getTime()) / (1000 * 60 * 60 * 24));
        const diffDeadline = Math.ceil((deadlineTime - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDeadline < 0) {
          warningLevel = 'critical';
          alertText = `Quá hạn ${bestDocType} ${Math.abs(diffDeadline)} ngày`;
        } else if (diffStart <= 0) {
          warningLevel = 'danger';
          alertText = `Tới hạn chuẩn bị hồ sơ ${bestDocType} (còn ${diffDeadline} ngày)`;
        } else if (diffStart <= 5) {
          warningLevel = 'warning';
          alertText = `Còn ${diffStart} ngày bắt đầu làm hồ sơ ${bestDocType}`;
        }
        daysRemaining = diffStart <= 5 ? diffStart : diffDeadline;
        urgentDocType = bestDocType;
      }
    } else {
      // Tương thích ngược với dữ liệu cũ (không có documents[])
      const deadlineStr = String(d['Thời hạn cấp lại/ Hạn đăng kiểm'] || d['Ngày bảo dưỡng tiếp theo'] || '');
      const prepDaysStr = String(d['Thời gian  chuẩn bị Hồ sơ'] || d['Thời gian chuẩn bị Hồ sơ'] || '');
      const parsedDeadline = parseVietnameseDate(deadlineStr);
      if (parsedDeadline) {
        const match = prepDaysStr.match(/\d+/);
        const prepDays = match ? parseInt(match[0], 10) : 45;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadlineTime = parsedDeadline.getTime();
        const prepStartTime = deadlineTime - (prepDays * 24 * 60 * 60 * 1000);
        const diffStart = Math.ceil((prepStartTime - today.getTime()) / (1000 * 60 * 60 * 24));
        const diffDeadline = Math.ceil((deadlineTime - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDeadline < 0) {
          warningLevel = 'critical';
          alertText = `Quá hạn đăng kiểm ${Math.abs(diffDeadline)} ngày`;
        } else if (diffStart <= 0) {
          warningLevel = 'danger';
          alertText = `Tới hạn chuẩn bị hồ sơ (còn ${diffDeadline} ngày đăng kiểm)`;
        } else if (diffStart <= 5) {
          warningLevel = 'warning';
          alertText = `Còn ${diffStart} ngày bắt đầu làm hồ sơ`;
        }
        daysRemaining = diffStart <= 5 ? diffStart : diffDeadline;
      }
    }

    const docStatus = d['Trạng thái Hồ sơ'] || '';
    if (docStatus === 'Đã gửi' && warningLevel !== 'safe' && warningLevel !== 'critical') {
      warningLevel = 'success';
      alertText = 'Đã gửi hồ sơ';
    }

    const deadlineStr2 = String(d['Thời hạn cấp lại/ Hạn đăng kiểm'] || d['Hạn đăng kiểm'] || '');
    const parsedDeadline2 = parseVietnameseDate(deadlineStr2);

    return {
      ...d,
      deadlineDate: parsedDeadline2 ? parsedDeadline2.toLocaleDateString('vi-VN') : 'Không rõ',
      warningLevel,
      alertText,
      daysRemaining,
      urgentDocType,
    };
  });

  const handleDocStatusUpdate = async (serial: string, docType?: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Admin được cập nhật trạng thái hồ sơ.');
      return;
    }
    setUpdatingId(serial);
    const res = await updateDocumentStatus(serial, 'Đã gửi', docType);
    if (res && res.success) {
      mutateDevices(devices.map(d => {
        if (d.id !== serial) return d;
        return {
          ...d,
          'Trạng thái Hồ sơ': 'Đã gửi',
          documents: d.documents?.map(doc =>
            !docType || doc.docType === docType ? { ...doc, status: 'Đã gửi' } : doc
          ),
        };
      }));
    } else {
      alert('Có lỗi xảy ra: ' + (res?.message || ''));
    }
    setUpdatingId(null);
  };

  const maintenanceAlerts = processedDevices
    .filter(d => d.warningLevel !== 'safe')
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  const { labels: pieLabels, data: pieDataValues } = getDepartmentStats();
  const departmentColors = [
    '#0d9488', '#3b82f6', '#f59e0b', '#e11d48', '#64748b',
    '#7c3aed', '#0891b2', '#84cc16', '#ea580c', '#be123c',
    '#2563eb', '#16a34a', '#9333ea', '#ca8a04', '#475569',
  ];

  const pieDataConfig = {
    labels: pieLabels.length > 0 ? pieLabels : ['Chưa có dữ liệu'],
    datasets: [{
      data: pieDataValues.length > 0 ? pieDataValues : [1],
      backgroundColor: (pieLabels.length > 0 ? pieLabels : ['Chưa có dữ liệu']).map((_, index) =>
        departmentColors[index % departmentColors.length]
      ),
      borderWidth: 0,
    }],
  };

  const getRepairStatsByMonth = () => {
    const thisYear = new Date().getFullYear();
    const monthStats = buildRepairStatsByMonth(repairs, thisYear);

    return {
      labels: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
      datasets: [
        {
          label: `Số ca báo hỏng/sửa chữa hợp lệ năm ${thisYear}`,
          data: monthStats,
          backgroundColor: '#0d9488',
          borderRadius: 6
        }
      ]
    };
  };

  const barData = getRepairStatsByMonth();
  const barOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' as const } } };

  const handleExportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BAO CAO TONG QUAN HE THONG QLTTB', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Trung tam Y te khu vuc Thanh Ba', 105, 28, { align: 'center' });
    doc.text(`Ngay xuat: ${new Date().toLocaleString('vi-VN')}`, 105, 35, { align: 'center' });

    autoTable(doc, {
      startY: 42,
      head: [['Chi so', 'So lieu']],
      body: [
        ['Tong so TB quan ly', `${devices.length} may`],
        ['Dang hoat dong on dinh', `${stableDeviceCount} may`],
        ['Bao hong / cho xu ly', `${reportedRepairCount} yeu cau`],
        ['Dang sua chua', `${repairingCount} yeu cau`],
        ['Canh bao dang kiem', `${complianceWarningCount} thiet bi`],
        ['Qua han dang kiem', `${expiredComplianceCount} thiet bi`],
      ],
      styles: { fontSize: 11, cellPadding: 4 },
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold' },
    });

    const deptStats = getDepartmentStats();
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12,
      head: [['Khoa/Phong', 'So luong thiet bi']],
      body: deptStats.labels.map((l, i) => [removeVietnameseTones(l), deptStats.data[i]]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    });

    doc.save(`TongQuan_QLTTB_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header dashboard-hero">
        <div className="dashboard-hero-main">
          <span className="dashboard-hero-icon" aria-hidden="true">
            <Activity size={24} />
          </span>
          <div>
          <span className="dashboard-eyebrow">Bảng điều phối thiết bị</span>
          <h1 className="dashboard-title">Tổng quan hệ thống</h1>
          <p className="dashboard-subtitle">Theo dõi thiết bị, yêu cầu sửa chữa và hồ sơ kiểm định trong ngày.</p>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <span className="dashboard-update-chip">
            Cập nhật {new Date().toLocaleTimeString('vi-VN')}, {new Date().toLocaleDateString('vi-VN')}
          </span>
          <Button variant="secondary" icon={<Download size={18} />} onClick={handleExportPDF}>Xuất báo cáo PDF</Button>
        </div>
      </div>

      <div className="stats-grid dashboard-kpi-grid">
        <Card className="stat-card dashboard-kpi-card gradient-blue">
          <div className="stat-card-header">
            <div className="stat-icon"><Stethoscope size={26} /></div>
            <span className="stat-status-pill">Tài sản</span>
          </div>
          <div className="stat-info">
            <span className="stat-value">{isLoading ? '...' : devices.length}</span>
            <span className="stat-label">Thiết bị quản lý</span>
            <span className="stat-meta">Toàn bộ thiết bị trong hệ thống</span>
          </div>
        </Card>
        <Card className="stat-card dashboard-kpi-card gradient-teal">
          <div className="stat-card-header">
            <div className="stat-icon"><Activity size={26} /></div>
            <span className="stat-status-pill">Ổn định</span>
          </div>
          <div className="stat-info">
            <span className="stat-value">{isLoading ? '...' : stableDeviceCount}</span>
            <span className="stat-label">Hoạt động ổn định</span>
            <span className="stat-meta">Không sửa chữa mở, không quá hạn/cảnh báo đăng kiểm</span>
          </div>
        </Card>
        <Card className="stat-card dashboard-kpi-card gradient-orange">
          <div className="stat-card-header">
            <div className="stat-icon"><AlertTriangle size={26} /></div>
            <span className="stat-status-pill">Tiếp nhận</span>
          </div>
          <div className="stat-info">
            <span className="stat-value">{isLoading ? '...' : reportedRepairCount}</span>
            <span className="stat-label">Báo hỏng / chờ xử lý</span>
            <span className="stat-meta">Đang chờ duyệt hoặc phân công</span>
          </div>
        </Card>
        <Card className="stat-card dashboard-kpi-card gradient-orange">
          <div className="stat-card-header">
            <div className="stat-icon"><Wrench size={26} /></div>
            <span className="stat-status-pill">Sửa chữa</span>
          </div>
          <div className="stat-info">
            <span className="stat-value">{isLoading ? '...' : repairingCount}</span>
            <span className="stat-label">Đang sửa chữa</span>
            <span className="stat-meta">Đã tiếp nhận và đang xử lý</span>
          </div>
        </Card>
        <Card className="stat-card dashboard-kpi-card gradient-rose">
          <div className="stat-card-header">
            <div className="stat-icon"><ShieldAlert size={26} /></div>
            <span className="stat-status-pill">Hồ sơ</span>
          </div>
          <div className="stat-info">
            <span className="stat-value">{isLoading ? '...' : complianceWarningCount}</span>
            <span className="stat-label">Cảnh báo đăng kiểm</span>
            <span className="stat-meta">Sắp đến mốc chuẩn bị hồ sơ</span>
          </div>
        </Card>
        <Card className="stat-card dashboard-kpi-card gradient-rose">
          <div className="stat-card-header">
            <div className="stat-icon"><CalendarX2 size={26} /></div>
            <span className="stat-status-pill">Quá hạn</span>
          </div>
          <div className="stat-info">
            <span className="stat-value">{isLoading ? '...' : expiredComplianceCount}</span>
            <span className="stat-label">Hết hạn đăng kiểm</span>
            <span className="stat-meta">Cần ưu tiên xử lý ngay</span>
          </div>
        </Card>
      </div>

      <div className="charts-grid dashboard-analytics-grid">
        <Card className="dashboard-panel dashboard-chart-panel">
          <CardHeader title={(
            <div className="dashboard-card-heading">
              <span>Phân bổ thiết bị theo khoa/phòng</span>
              <small>Cơ cấu thiết bị đang quản lý theo đơn vị sử dụng</small>
            </div>
          )} />
          <CardBody>
            <div className="chart-container">
              {isLoading
                ? <div className="dashboard-loading-state">Đang tải biểu đồ...</div>
                : <Pie data={pieDataConfig} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              }
            </div>
            {!isLoading && pieLabels.length > 0 && (
              <div className="department-detail-list">
                {pieLabels.map((label, index) => (
                  <div className="department-detail-item" key={label}>
                    <span className="department-detail-dot" style={{ backgroundColor: departmentColors[index % departmentColors.length] }} />
                    <span className="department-detail-name">{label}</span>
                    <span className="department-detail-count">{pieDataValues[index]}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        <Card className="dashboard-panel dashboard-chart-panel">
          <CardHeader title={(
            <div className="dashboard-card-heading">
              <span>Thống kê báo hỏng & sửa chữa năm nay</span>
              <small>Chỉ tính ca hợp lệ, không gồm yêu cầu bị từ chối</small>
            </div>
          )} />
          <CardBody>
            <div className="chart-container">
              {isLoading
                ? <div className="dashboard-loading-state">Đang tải biểu đồ...</div>
                : <Bar data={barData} options={barOptions} />
              }
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="lists-grid dashboard-work-grid">
        <Card className="dashboard-panel dashboard-list-panel">
          <CardHeader
            title={(
              <div className="dashboard-card-heading">
                <span className="dashboard-title-row">
                  Yêu cầu báo hỏng {repairCount > 0 && <Badge variant="danger">{repairCount} đang mở</Badge>}
                </span>
                <small>Các yêu cầu cần theo dõi hoặc xử lý tiếp</small>
              </div>
            )}
            action={<Button variant="secondary" size="sm" onClick={() => navigate(isAdmin ? '/tracking' : '/requests?type=repair')}>Xem tất cả</Button>}
          />
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Ngày báo</TableHeader>
                <TableHeader>Mã thiết bị</TableHeader>
                <TableHeader>Khoa/phòng</TableHeader>
                <TableHeader>Tình trạng lỗi</TableHeader>
                <TableHeader>Trạng thái</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? <TableRow><TableCell colSpan={5}><div className="dashboard-table-state">Đang tải...</div></TableCell></TableRow>
                : repairCount === 0
                  ? <TableRow><TableCell colSpan={5}><div className="dashboard-table-state is-success">Không có yêu cầu sửa chữa đang mở.</div></TableCell></TableRow>
                  : activeRepairs.slice(0, 5).map((repair) => (
                    <TableRow key={`${repair.rowId}-${repair.deviceId}`}>
                      <TableCell style={{ whiteSpace: 'nowrap', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{repair.rowId.split(' ')[0]}</TableCell>
                      <TableCell><strong>{repair.deviceId}</strong></TableCell>
                      <TableCell>{devices.find(device => device.id === repair.deviceId)?.department || 'Chưa rõ'}</TableCell>
                      <TableCell>
                        <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={repair.description}>
                          {repair.description}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={getRepairStatusVariant(repair.status)}>{repair.status}</Badge></TableCell>
                    </TableRow>
                  ))
              }
            </TableBody>
          </Table>
        </Card>

        <Card className="dashboard-panel dashboard-list-panel">
          <CardHeader
            title={(
              <div className="dashboard-card-heading">
                <span className="dashboard-title-row">
                  Cảnh báo hồ sơ / đăng kiểm {maintenanceAlerts.length > 0 && <Badge variant="danger">{maintenanceAlerts.length}</Badge>}
                </span>
                <small>Nhóm theo mức độ ưu tiên xử lý hồ sơ</small>
              </div>
            )}
            action={<Button variant="secondary" size="sm" onClick={() => navigate('/devices')}>Tất cả thiết bị</Button>}
          />
          <CardBody>
            {isLoading
              ? <div className="dashboard-table-state">Đang tải...</div>
              : maintenanceAlerts.length === 0
                ? <div className="dashboard-table-state is-success">Mọi thiết bị đều đang trong hạn an toàn.</div>
                : (() => {
                    const groups: Record<string, typeof maintenanceAlerts> = {};
                    maintenanceAlerts.forEach(d => {
                      const key = d.warningLevel;
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(d);
                    });
                    const levelOrder = ['critical', 'danger', 'warning', 'success'];
                    const levelConfig: Record<string, { label: string; badgeVariant: 'danger' | 'warning' | 'success' }> = {
                      critical: { label: 'Quá hạn', badgeVariant: 'danger' },
                      danger: { label: 'Tới hạn chuẩn bị hồ sơ', badgeVariant: 'danger' },
                      warning: { label: 'Sắp tới hạn', badgeVariant: 'warning' },
                      success: { label: 'Đã gửi hồ sơ', badgeVariant: 'success' },
                    };
                    return (
                      <div className="alert-groups">
                        {levelOrder.filter(lv => groups[lv]?.length).map(lv => {
                          const cfg = levelConfig[lv];
                          const items = groups[lv];
                          return (
                            <div key={lv} className={`alert-group alert-group-${lv}`}>
                              <div className="alert-group-header">
                                <span className="alert-level-dot" aria-hidden="true" />
                                <strong style={{ fontSize: '0.95rem' }}>{cfg.label}</strong>
                                <Badge variant={cfg.badgeVariant}>{items.length}</Badge>
                              </div>
                              <div className="alert-group-list">
                                {items.map(device => (
                                  <div
                                    key={device.id}
                                    className="alert-group-item"
                                    onClick={() => navigate(`/devices/${encodeURIComponent(device.id)}`)}
                                  >
                                    <div className="alert-device-main">
                                      <strong>{device.name}</strong>
                                      <small>{device.id} • {device.department}</small>
                                    </div>
                                    <div className="alert-device-deadline">
                                      <div>{device.alertText}</div>
                                      <small>Hạn: {device.deadlineDate}</small>
                                    </div>
                                    {isAdmin && lv !== 'success' && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={(e) => { e.stopPropagation(); handleDocStatusUpdate(device.id, device.urgentDocType); }}
                                        disabled={updatingId === device.id}
                                        className="alert-action-button"
                                      >
                                        {updatingId === device.id ? '...' : 'Đã gửi'}
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
            }
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
