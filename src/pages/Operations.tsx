import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  History,
  QrCode,
  ReceiptText,
  Wrench,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeVariant,
} from '../components/ui';
import { useDevices } from '../hooks/useDevices';
import { useRepairs } from '../hooks/useRepairs';
import { useTransfers } from '../hooks/useTransfers';
import { parseFlexibleDate } from '../utils/dateUtils';
import {
  buildAuditEvents,
  buildInspectionItems,
  buildInspectionTasks,
  buildSlaSummary,
  formatCurrencyVnd,
  getCalendarDays,
  getRepairAgeDays,
  getWorkflowLabel,
  type AuditEventType,
  type ComplianceStatusKind,
  type CostEntry,
  type InspectionItem,
  type TaskPriority,
  type WorkflowOverrides,
  type WorkflowStatus,
} from '../utils/operationalInsights';
import { isRepairActive } from '../utils/statusUtils';
import './Operations.css';

type OperationsTab = 'calendar' | 'tasks' | 'audit' | 'sla' | 'qr-import';

interface CostFormState {
  deviceId: string;
  date: string;
  amount: string;
  category: string;
  vendor: string;
  note: string;
}

interface ImportPreviewRow {
  rowNumber: number;
  deviceId: string;
  name: string;
  department: string;
  expiryDate: string;
  issues: string[];
}

const WORKFLOW_KEY = 'qlttb.inspectionWorkflow';
const COST_KEY = 'qlttb.maintenanceCosts';

const workflowStatusOptions: WorkflowStatus[] = ['todo', 'preparing', 'submitted', 'approved', 'returned'];

const tabs: Array<{ id: OperationsTab; label: string; icon: React.ElementType }> = [
  { id: 'calendar', label: 'Lịch kiểm định', icon: CalendarDays },
  { id: 'tasks', label: 'Nhắc việc', icon: ClipboardCheck },
  { id: 'audit', label: 'Lịch sử', icon: History },
  { id: 'sla', label: 'SLA & chi phí', icon: ReceiptText },
  { id: 'qr-import', label: 'QR & Import', icon: QrCode },
];

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const toDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toDateInputValue = (date: Date) => toDateKey(date);

const inputDateToVn = (dateText: string) => {
  const parts = dateText.split('-');
  if (parts.length !== 3) return dateText;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const inspectionStatusLabel: Record<ComplianceStatusKind, string> = {
  expired: 'Hết hạn',
  warning: 'Cần chuẩn bị',
  missing: 'Thiếu hồ sơ',
  sent: 'Đã gửi/duyệt',
  valid: 'Còn hạn',
};

const priorityLabel: Record<TaskPriority, string> = {
  critical: 'Khẩn cấp',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

const priorityVariant: Record<TaskPriority, BadgeVariant> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'neutral',
};

const auditTypeLabel: Record<AuditEventType, string> = {
  device: 'Thiết bị',
  repair: 'Sửa chữa',
  transfer: 'Luân chuyển',
  'inspection-task': 'Kiểm định',
  cost: 'Chi phí',
};

const parseImportPreview = (rawText: string, existingIds: Set<string>): ImportPreviewRow[] => {
  const seen = new Set<string>();
  return rawText
    .split(/\r?\n/)
    .map((line, index) => ({ line, rowNumber: index + 1 }))
    .filter(item => item.line.trim())
    .map(({ line, rowNumber }) => {
      const parts = line.split(/\t|,|;/).map(part => part.trim());
      const [deviceId = '', name = '', department = '', expiryDate = ''] = parts;
      const issues: string[] = [];
      if (!deviceId) issues.push('Thiếu mã thiết bị');
      if (!name) issues.push('Thiếu tên thiết bị');
      if (!department) issues.push('Thiếu khoa/phòng');
      if (!expiryDate) issues.push('Thiếu hạn đăng kiểm');
      if (deviceId && existingIds.has(deviceId)) issues.push('Trùng mã đã có');
      if (deviceId && seen.has(deviceId)) issues.push('Trùng mã trong file');
      if (expiryDate && !parseFlexibleDate(expiryDate)) issues.push('Ngày hạn không hợp lệ');
      if (deviceId) seen.add(deviceId);
      return { rowNumber, deviceId, name, department, expiryDate, issues };
    });
};

const Operations: React.FC = () => {
  const navigate = useNavigate();
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { repairs, isLoading: isLoadingRepairs } = useRepairs();
  const { transfers, isLoading: isLoadingTransfers } = useTransfers();
  const isLoading = isLoadingDevices || isLoadingRepairs || isLoadingTransfers;

  const [activeTab, setActiveTab] = useState<OperationsTab>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [workflowOverrides, setWorkflowOverrides] = useState<WorkflowOverrides>(() => readStorage(WORKFLOW_KEY, {}));
  const [costEntries, setCostEntries] = useState<CostEntry[]>(() => readStorage(COST_KEY, []));
  const [costForm, setCostForm] = useState<CostFormState>({
    deviceId: '',
    date: toDateInputValue(new Date()),
    amount: '',
    category: 'Sửa chữa',
    vendor: '',
    note: '',
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [importText, setImportText] = useState('');

  const today = useMemo(() => new Date(), []);
  const inspectionItems = useMemo(() => buildInspectionItems(devices, today), [devices, today]);
  const inspectionTasks = useMemo(
    () => buildInspectionTasks(inspectionItems, workflowOverrides),
    [inspectionItems, workflowOverrides]
  );
  const slaSummary = useMemo(() => buildSlaSummary(repairs, devices, today), [devices, repairs, today]);
  const auditEvents = useMemo(
    () => buildAuditEvents({ devices, repairs, transfers, inspectionTasks, costEntries }),
    [costEntries, devices, inspectionTasks, repairs, transfers]
  );
  const existingDeviceIds = useMemo(() => new Set(devices.map(device => device.id)), [devices]);
  const importPreviewRows = useMemo(() => parseImportPreview(importText, existingDeviceIds), [existingDeviceIds, importText]);

  const selectedDevice = devices.find(device => device.id === selectedDeviceId) || devices[0] || null;
  const profilePath = selectedDevice ? `/devices/${encodeURIComponent(selectedDevice.id)}` : '/devices';
  const deviceUrl = selectedDevice
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${profilePath}`
    : '';

  const summary = useMemo(() => {
    const expired = inspectionItems.filter(item => item.statusKind === 'expired').length;
    const warning = inspectionItems.filter(item => item.statusKind === 'warning').length;
    const totalCost = costEntries.reduce((sum, entry) => sum + entry.amount, 0);
    return { expired, warning, totalCost };
  }, [costEntries, inspectionItems]);

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const inspectionByDate = useMemo(() => {
    return inspectionItems.reduce<Record<string, InspectionItem[]>>((acc, item) => {
      const parsed = parseFlexibleDate(item.expiryDate);
      if (!parsed) return acc;
      const key = toDateKey(parsed);
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [inspectionItems]);

  const monthItems = useMemo(() => {
    return inspectionItems.filter(item => {
      const parsed = parseFlexibleDate(item.expiryDate);
      return parsed && parsed.getFullYear() === calendarMonth.getFullYear() && parsed.getMonth() === calendarMonth.getMonth();
    });
  }, [calendarMonth, inspectionItems]);

  const activeRepairs = useMemo(() => {
    return repairs
      .filter(repair => isRepairActive(repair.status))
      .map(repair => ({
        ...repair,
        ageDays: getRepairAgeDays(repair, today),
        deviceName: devices.find(device => device.id === repair.deviceId)?.name || repair.deviceId,
        department: devices.find(device => device.id === repair.deviceId)?.department || 'Không rõ',
      }))
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [devices, repairs, today]);

  const updateWorkflow = (taskKey: string, patch: Partial<WorkflowOverrides[string]>) => {
    setWorkflowOverrides(prev => {
      const current = prev[taskKey] || { status: 'todo' as const };
      const next: WorkflowOverrides = {
        ...prev,
        [taskKey]: {
          ...current,
          ...patch,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        },
      };
      writeStorage(WORKFLOW_KEY, next);
      return next;
    });
  };

  const handleAddCost = () => {
    const deviceId = costForm.deviceId || selectedDevice?.id || devices[0]?.id || '';
    const amount = Number(costForm.amount);
    if (!deviceId || !Number.isFinite(amount) || amount <= 0) {
      alert('Vui lòng chọn thiết bị và nhập chi phí hợp lệ.');
      return;
    }
    const nextEntry: CostEntry = {
      id: `${Date.now()}`,
      deviceId,
      date: inputDateToVn(costForm.date),
      amount,
      category: costForm.category,
      vendor: costForm.vendor.trim() || 'Chưa nhập',
      note: costForm.note.trim() || '—',
    };
    const next = [nextEntry, ...costEntries];
    setCostEntries(next);
    writeStorage(COST_KEY, next);
    setCostForm(prev => ({ ...prev, amount: '', vendor: '', note: '' }));
  };

  const handleDeleteCost = (id: string) => {
    const next = costEntries.filter(entry => entry.id !== id);
    setCostEntries(next);
    writeStorage(COST_KEY, next);
  };

  const changeCalendarMonth = (offset: number) => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const renderCalendarTab = () => (
    <div className="ops-split">
      <section className="ops-calendar-panel">
        <div className="ops-section-header">
          <div>
            <h2>Lịch kiểm định {String(calendarMonth.getMonth() + 1).padStart(2, '0')}/{calendarMonth.getFullYear()}</h2>
            <p>Các mốc hạn hiệu lực được đặt vào đúng ngày hết hạn để dễ ưu tiên theo tuần.</p>
          </div>
          <div className="ops-calendar-actions">
            <Button variant="secondary" size="sm" onClick={() => changeCalendarMonth(-1)}>Tháng trước</Button>
            <Button variant="secondary" size="sm" onClick={() => setCalendarMonth(new Date())}>Hôm nay</Button>
            <Button variant="secondary" size="sm" onClick={() => changeCalendarMonth(1)}>Tháng sau</Button>
          </div>
        </div>
        <div className="ops-calendar-weekdays">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <span key={day}>{day}</span>)}
        </div>
        <div className="ops-calendar-grid">
          {calendarDays.map(day => {
            const items = inspectionByDate[toDateKey(day.date)] || [];
            const urgentCount = items.filter(item => item.statusKind === 'expired' || item.statusKind === 'warning').length;
            return (
              <div key={day.key} className={`ops-calendar-day ${day.inMonth ? '' : 'is-muted'} ${urgentCount ? 'has-urgent' : ''}`}>
                <div className="ops-calendar-date">{day.date.getDate()}</div>
                {items.slice(0, 3).map(item => (
                  <span key={item.taskKey} className={`ops-calendar-chip is-${item.statusKind}`}>
                    {item.deviceId}
                  </span>
                ))}
                {items.length > 3 && <small>+{items.length - 3} hồ sơ</small>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="ops-side-panel">
        <h3>Việc trong tháng</h3>
        <div className="ops-month-list">
          {monthItems.length === 0 ? (
            <div className="ops-empty">Không có hồ sơ đến hạn trong tháng này.</div>
          ) : monthItems.slice(0, 18).map(item => (
            <div key={item.taskKey} className="ops-month-item">
              <div>
                <strong>{item.deviceName}</strong>
                <span>{item.department} · {item.docType}</span>
              </div>
              <Badge variant={priorityVariant[item.priority]}>{inspectionStatusLabel[item.statusKind]}</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderTasksTab = () => (
    <section className="ops-panel">
      <div className="ops-section-header">
        <div>
          <h2>Nhắc việc kiểm định & quy trình hồ sơ</h2>
          <p>Mỗi dòng là một việc cần xử lý. Trạng thái và ghi chú được lưu trên máy này để theo dõi nhanh.</p>
        </div>
        <Badge variant="warning">{inspectionTasks.length} việc cần theo dõi</Badge>
      </div>
      <Table className="ops-table">
        <TableHead>
          <TableRow>
            <TableHeader>Ưu tiên</TableHeader>
            <TableHeader>Thiết bị</TableHeader>
            <TableHeader>Hồ sơ</TableHeader>
            <TableHeader>Hạn</TableHeader>
            <TableHeader>Phụ trách</TableHeader>
            <TableHeader>Quy trình</TableHeader>
            <TableHeader>Ghi chú</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {inspectionTasks.length === 0 ? (
            <TableRow><TableCell colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Không có việc kiểm định cần xử lý.</TableCell></TableRow>
          ) : inspectionTasks.map(task => (
            <TableRow key={task.taskKey}>
              <TableCell><Badge variant={priorityVariant[task.priority]}>{priorityLabel[task.priority]}</Badge></TableCell>
              <TableCell><strong>{task.deviceName}</strong><br /><small>{task.deviceId} · {task.department}</small></TableCell>
              <TableCell><strong>{task.docType}</strong><br /><small>{task.licenseNo}</small></TableCell>
              <TableCell><strong>{task.expiryDate}</strong><br /><small>{task.statusText}</small></TableCell>
              <TableCell>{task.responsible}</TableCell>
              <TableCell>
                <select
                  className="ops-select"
                  value={task.workflowStatus}
                  onChange={event => updateWorkflow(task.taskKey, { status: event.target.value as WorkflowStatus })}
                >
                  {workflowStatusOptions.map(status => (
                    <option key={status} value={status}>{getWorkflowLabel(status)}</option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <input
                  className="ops-inline-input"
                  value={workflowOverrides[task.taskKey]?.note || ''}
                  onChange={event => updateWorkflow(task.taskKey, { note: event.target.value })}
                  placeholder="Ghi chú xử lý"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );

  const renderAuditTab = () => (
    <section className="ops-panel">
      <div className="ops-section-header">
        <div>
          <h2>Lịch sử thay đổi & hoạt động</h2>
          <p>Tổng hợp sửa chữa, luân chuyển, hồ sơ kiểm định và chi phí để tra cứu trách nhiệm nhanh.</p>
        </div>
        <Badge variant="primary">{auditEvents.length} sự kiện</Badge>
      </div>
      <div className="ops-timeline">
        {auditEvents.slice(0, 120).map(event => (
          <article key={event.id} className={`ops-timeline-item is-${event.type}`}>
            <div className="ops-timeline-dot" />
            <div className="ops-timeline-content">
              <div className="ops-timeline-meta">
                <Badge variant={event.type === 'cost' ? 'success' : event.type === 'repair' ? 'warning' : 'primary'}>
                  {auditTypeLabel[event.type]}
                </Badge>
                <span>{event.date}</span>
                <span>{event.actor}</span>
              </div>
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              <small>{event.deviceId}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const renderSlaTab = () => (
    <div className="ops-split">
      <section className="ops-panel">
        <div className="ops-section-header">
          <div>
            <h2>Báo cáo SLA sửa chữa</h2>
            <p>Theo dõi tuổi yêu cầu đang mở và khối lượng theo khoa/phòng.</p>
          </div>
          <Badge variant={slaSummary.overSevenDays > 0 ? 'warning' : 'success'}>{slaSummary.overSevenDays} quá 7 ngày</Badge>
        </div>
        <div className="ops-sla-grid">
          <div><strong>{slaSummary.activeCount}</strong><span>Đang mở</span></div>
          <div><strong>{slaSummary.completedCount}</strong><span>Đã hoàn thành</span></div>
          <div><strong>{slaSummary.averageActiveAge}</strong><span>Ngày TB đang mở</span></div>
          <div><strong>{slaSummary.overFourteenDays}</strong><span>Quá 14 ngày</span></div>
        </div>
        <Table className="ops-table compact">
          <TableHead>
            <TableRow>
              <TableHeader>Khoa/phòng</TableHeader>
              <TableHeader>Đang mở</TableHeader>
              <TableHeader>Đã xong</TableHeader>
              <TableHeader>Tuổi TB</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {slaSummary.byDepartment.length === 0 ? (
              <TableRow><TableCell colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>Chưa có dữ liệu sửa chữa.</TableCell></TableRow>
            ) : slaSummary.byDepartment.map(row => (
              <TableRow key={row.department}>
                <TableCell>{row.department}</TableCell>
                <TableCell>{row.activeCount}</TableCell>
                <TableCell>{row.completedCount}</TableCell>
                <TableCell>{row.averageActiveAge} ngày</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="ops-open-repairs">
          {activeRepairs.slice(0, 8).map(repair => (
            <div key={`${repair.rowId}-${repair.deviceId}`} className="ops-open-repair">
              <strong>{repair.deviceName}</strong>
              <span>{repair.department} · {repair.ageDays} ngày · {repair.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ops-panel">
        <div className="ops-section-header">
          <div>
            <h2>Chi phí sửa chữa/bảo trì</h2>
            <p>Ghi nhanh chi phí để đối chiếu theo thiết bị và nhà cung cấp.</p>
          </div>
          <Badge variant="success">{formatCurrencyVnd(summary.totalCost)}</Badge>
        </div>
        <div className="ops-cost-form">
          <select value={costForm.deviceId} onChange={event => setCostForm(prev => ({ ...prev, deviceId: event.target.value }))}>
            <option value="">Chọn thiết bị</option>
            {devices.map((device, index) => <option key={`${device.id}-${index}`} value={device.id}>{device.id} - {device.name}</option>)}
          </select>
          <input type="date" value={costForm.date} onChange={event => setCostForm(prev => ({ ...prev, date: event.target.value }))} />
          <input value={costForm.amount} onChange={event => setCostForm(prev => ({ ...prev, amount: event.target.value }))} placeholder="Chi phí" inputMode="numeric" />
          <select value={costForm.category} onChange={event => setCostForm(prev => ({ ...prev, category: event.target.value }))}>
            <option>Sửa chữa</option>
            <option>Bảo trì</option>
            <option>Kiểm định</option>
            <option>Vật tư thay thế</option>
          </select>
          <input value={costForm.vendor} onChange={event => setCostForm(prev => ({ ...prev, vendor: event.target.value }))} placeholder="Đơn vị thực hiện" />
          <input value={costForm.note} onChange={event => setCostForm(prev => ({ ...prev, note: event.target.value }))} placeholder="Ghi chú" />
          <Button icon={<ReceiptText size={16} />} onClick={handleAddCost}>Thêm chi phí</Button>
        </div>
        <div className="ops-cost-list">
          {costEntries.length === 0 ? (
            <div className="ops-empty">Chưa có chi phí nào được ghi nhận.</div>
          ) : costEntries.map(entry => (
            <div key={entry.id} className="ops-cost-item">
              <div>
                <strong>{formatCurrencyVnd(entry.amount)}</strong>
                <span>{entry.deviceId} · {entry.category} · {entry.vendor}</span>
                <small>{entry.date} · {entry.note}</small>
              </div>
              <Button size="sm" variant="secondary" onClick={() => handleDeleteCost(entry.id)}>Xóa</Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderQrImportTab = () => {
    const invalidImportRows = importPreviewRows.filter(row => row.issues.length > 0).length;
    return (
      <div className="ops-split">
        <section className="ops-panel">
          <div className="ops-section-header">
            <div>
              <h2>QR nhanh cho thiết bị</h2>
              <p>Chọn thiết bị để mở hồ sơ, báo hỏng hoặc in mã QR dán tại khoa.</p>
            </div>
            <QrCode size={30} className="ops-muted-icon" />
          </div>
          <div className="ops-qr-layout">
            <select value={selectedDevice?.id || ''} onChange={event => setSelectedDeviceId(event.target.value)}>
              {devices.map((device, index) => <option key={`${device.id}-${index}`} value={device.id}>{device.id} - {device.name}</option>)}
            </select>
            <div className="ops-qr-box">
              {selectedDevice && <QRCodeSVG value={deviceUrl} size={160} />}
            </div>
            {selectedDevice && (
              <div className="ops-qr-info">
                <strong>{selectedDevice.name}</strong>
                <span>{selectedDevice.id} · {selectedDevice.department}</span>
                <code>{deviceUrl}</code>
                <div className="ops-qr-actions">
                  <Button size="sm" onClick={() => navigate(profilePath)}>Mở hồ sơ</Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/requests?type=repair&device=${encodeURIComponent(selectedDevice.id)}`)}>Báo hỏng</Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/requests?type=transfer')}>Điều chuyển</Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-section-header">
            <div>
              <h2>Kiểm tra dữ liệu trước khi import</h2>
              <p>Dán dữ liệu từ Excel theo thứ tự: mã thiết bị, tên, khoa/phòng, hạn đăng kiểm.</p>
            </div>
            <Badge variant={invalidImportRows > 0 ? 'danger' : 'success'}>{invalidImportRows} dòng lỗi</Badge>
          </div>
          <textarea
            className="ops-import-box"
            value={importText}
            onChange={event => setImportText(event.target.value)}
            placeholder={'TB-001\tMáy thở\tICU\t31/12/2026'}
          />
          <Table className="ops-table compact">
            <TableHead>
              <TableRow>
                <TableHeader>Dòng</TableHeader>
                <TableHeader>Mã</TableHeader>
                <TableHeader>Tên</TableHeader>
                <TableHeader>Khoa/phòng</TableHeader>
                <TableHeader>Kết quả</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {importPreviewRows.length === 0 ? (
                <TableRow><TableCell colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Chưa có dữ liệu để kiểm tra.</TableCell></TableRow>
              ) : importPreviewRows.map(row => (
                <TableRow key={row.rowNumber}>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>{row.deviceId || '—'}</TableCell>
                  <TableCell>{row.name || '—'}</TableCell>
                  <TableCell>{row.department || '—'}</TableCell>
                  <TableCell>
                    {row.issues.length === 0
                      ? <Badge variant="success">Hợp lệ</Badge>
                      : <div className="ops-reason-list">{row.issues.map(issue => <span key={issue}>{issue}</span>)}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    );
  };

  return (
    <div className="operations-page">
      <div className="operations-header">
        <div>
          <h1><ClipboardCheck size={30} /> Điều hành công việc</h1>
          <p>Lịch kiểm định, nhắc việc, audit log, SLA, chi phí, QR và kiểm tra import nằm chung một nơi.</p>
        </div>
        <div className="operations-loading">
          {isLoading ? 'Đang tải dữ liệu...' : `${devices.length} thiết bị`}
        </div>
      </div>

      <div className="ops-stat-grid">
        <Card className="ops-stat-card is-danger">
          <CardBody>
            <AlertTriangle size={22} />
            <strong>{summary.expired}</strong>
            <span>Hết hạn kiểm định</span>
          </CardBody>
        </Card>
        <Card className="ops-stat-card is-warning">
          <CardBody>
            <CalendarDays size={22} />
            <strong>{summary.warning}</strong>
            <span>Cần chuẩn bị hồ sơ</span>
          </CardBody>
        </Card>
        <Card className="ops-stat-card is-success">
          <CardBody>
            <Wrench size={22} />
            <strong>{slaSummary.activeCount}</strong>
            <span>Yêu cầu sửa chữa mở</span>
          </CardBody>
        </Card>
      </div>

      <div className="operations-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'calendar' && renderCalendarTab()}
      {activeTab === 'tasks' && renderTasksTab()}
      {activeTab === 'audit' && renderAuditTab()}
      {activeTab === 'sla' && renderSlaTab()}
      {activeTab === 'qr-import' && renderQrImportTab()}

      <div className="ops-footnote">
        Trạng thái quy trình hồ sơ và chi phí đang được lưu nội bộ trên trình duyệt. Khi có sheet/API riêng, phần này có thể nối backend để dùng chung nhiều máy.
      </div>
    </div>
  );
};

export default Operations;
