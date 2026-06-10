import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Download, PackageCheck, Plus, QrCode, RefreshCw, Search, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useToast } from '../components/ui';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../authContext';
import { exportCsv } from '../utils/exportCsv';
import { saveInventoryRun, type DeviceData, type InventoryRunSavePayload } from '../services/api';
import './InventoryQr.css';

const STORAGE_KEY = 'qlttb.inventory_runs';

type InventoryCondition = 'ok' | 'damaged' | 'maintenance' | 'wrong_location';
type InventoryStatus = 'active' | 'closed';

interface InventoryScan {
  deviceId: string;
  deviceName: string;
  scannedAt: string;
  scannedBy: string;
  expectedDepartment: string;
  actualDepartment: string;
  condition: InventoryCondition;
  note: string;
}

interface InventoryRun {
  runId: string;
  name: string;
  department: string;
  createdAt: string;
  createdBy: string;
  status: InventoryStatus;
  sheetName?: string;
  syncStatus?: 'synced' | 'pending';
  lastSyncedAt?: string;
  scans: InventoryScan[];
}

const conditionText: Record<InventoryCondition, string> = {
  ok: 'Đúng vị trí',
  damaged: 'Hư hỏng',
  maintenance: 'Cần bảo trì',
  wrong_location: 'Sai khoa/phòng',
};

const readRuns = (): InventoryRun[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRuns = (runs: InventoryRun[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
};

const cleanText = (value: unknown, fallback = '') => String(value || fallback).trim();

const extractScanCode = (value: string) => {
  const text = value.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    const segments = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] || text).trim();
  } catch {
    return text;
  }
};

const matchDeviceByCode = (devices: DeviceData[], rawCode: string) => {
  const code = extractScanCode(rawCode).toLowerCase();
  if (!code) return null;
  return devices.find(device => {
    const id = cleanText(device.id).toLowerCase();
    const serial = cleanText(device.serial || device['Seri Máy']).toLowerCase();
    return id === code || serial === code || id.includes(code) || serial.includes(code);
  }) || null;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const inventorySyncFailureMessage = (message?: string) => {
  if (message?.includes('Action không hợp lệ: saveInventoryRun')) {
    return 'Google Apps Script chưa được deploy action saveInventoryRun. Dữ liệu đã lưu tạm trên máy này, hãy cập nhật Code.gs rồi bấm Đồng bộ lại.';
  }
  return message || 'Chưa đồng bộ được Google Sheets. Dữ liệu đã lưu tạm trên máy này.';
};

const InventoryQr: React.FC = () => {
  const { devices, isLoading } = useDevices();
  const { username, name } = useAuth();
  const toast = useToast();
  const [runs, setRuns] = useState<InventoryRun[]>(readRuns);
  const [selectedRunId, setSelectedRunId] = useState(() => readRuns()[0]?.runId || '');
  const [runName, setRunName] = useState('');
  const [runDepartment, setRunDepartment] = useState('all');
  const [scanCode, setScanCode] = useState('');
  const [actualDepartment, setActualDepartment] = useState('');
  const [condition, setCondition] = useState<InventoryCondition>('ok');
  const [note, setNote] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const departments = useMemo(() => (
    Array.from(new Set(devices.map(device => cleanText(device.department, 'Chưa phân bổ')).filter(Boolean)))
      .sort((first, second) => first.localeCompare(second, 'vi'))
  ), [devices]);

  const activeRun = useMemo(
    () => runs.find(run => run.runId === selectedRunId) || runs[0] || null,
    [runs, selectedRunId]
  );

  const expectedDevices = useMemo(() => {
    if (!activeRun) return [];
    if (activeRun.department === 'all') return devices;
    return devices.filter(device => cleanText(device.department, 'Chưa phân bổ') === activeRun.department);
  }, [activeRun, devices]);

  const scannedIds = useMemo(
    () => new Set((activeRun?.scans || []).map(scan => scan.deviceId)),
    [activeRun]
  );

  const missingDevices = useMemo(
    () => expectedDevices.filter(device => !scannedIds.has(device.id)),
    [expectedDevices, scannedIds]
  );

  const wrongLocationScans = useMemo(
    () => (activeRun?.scans || []).filter(scan => scan.expectedDepartment !== scan.actualDepartment),
    [activeRun]
  );

  const completionRate = expectedDevices.length > 0
    ? Math.round(((activeRun?.scans.length || 0) / expectedDevices.length) * 100)
    : 0;

  const persistRuns = (nextRuns: InventoryRun[]) => {
    setRuns(nextRuns);
    writeRuns(nextRuns);
  };

  const getExpectedDevicesForRun = (run: InventoryRun) => {
    if (run.department === 'all') return devices;
    return devices.filter(device => cleanText(device.department, 'Chưa phân bổ') === run.department);
  };

  const getMissingDevicesForRun = (run: InventoryRun) => {
    const ids = new Set(run.scans.map(scan => scan.deviceId));
    return getExpectedDevicesForRun(run).filter(device => !ids.has(device.id));
  };

  const buildSavePayload = (run: InventoryRun): InventoryRunSavePayload => ({
    runId: run.runId,
    name: run.name,
    department: run.department,
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    status: run.status,
    sheetName: run.sheetName,
    expectedCount: getExpectedDevicesForRun(run).length,
    scans: run.scans,
    missingDevices: getMissingDevicesForRun(run).map(device => ({
      deviceId: device.id,
      deviceName: device.name,
      expectedDepartment: cleanText(device.department, 'Chưa phân bổ'),
    })),
  });

  const mergeSyncedRun = (baseRuns: InventoryRun[], run: InventoryRun, sheetName?: string) => {
    const syncedRun: InventoryRun = {
      ...run,
      sheetName: sheetName || run.sheetName,
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString(),
    };
    return baseRuns.map(item => (item.runId === run.runId ? syncedRun : item));
  };

  const mergePendingRun = (baseRuns: InventoryRun[], run: InventoryRun) => (
    baseRuns.map(item => (item.runId === run.runId ? { ...run, syncStatus: 'pending' as const } : item))
  );

  const syncRunToGoogleSheets = async (run: InventoryRun, baseRuns: InventoryRun[]) => {
    setIsSyncing(true);
    try {
      const response = await saveInventoryRun(buildSavePayload(run));
      if (response.success) {
        const nextRuns = mergeSyncedRun(baseRuns, run, response.sheetName);
        persistRuns(nextRuns);
        return response.sheetName || run.sheetName || '';
      }
      persistRuns(mergePendingRun(baseRuns, run));
      toast.warning(inventorySyncFailureMessage(response.message));
      return '';
    } catch {
      persistRuns(mergePendingRun(baseRuns, run));
      toast.warning(inventorySyncFailureMessage());
      return '';
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateRun = async () => {
    const nextRun: InventoryRun = {
      runId: `KK-${Date.now()}`,
      name: runName.trim() || `Kiểm kê ${new Date().toLocaleDateString('vi-VN')}`,
      department: runDepartment,
      createdAt: new Date().toISOString(),
      createdBy: name || username || 'Người dùng',
      status: 'active',
      scans: [],
    };
    const nextRuns = [nextRun, ...runs];
    persistRuns(nextRuns);
    setSelectedRunId(nextRun.runId);
    setRunName('');
    const sheetName = await syncRunToGoogleSheets(nextRun, nextRuns);
    toast.success(sheetName ? `Đã tạo đợt kiểm kê và lưu Google Sheets: ${sheetName}` : 'Đã tạo đợt kiểm kê mới.');
  };

  const handleScan = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!activeRun) {
      toast.warning('Vui lòng tạo đợt kiểm kê trước.');
      return;
    }
    const device = matchDeviceByCode(devices, scanCode);
    if (!device) {
      toast.error('Không tìm thấy thiết bị từ mã QR/Serial vừa nhập.');
      return;
    }

    const expectedDepartment = cleanText(device.department, 'Chưa phân bổ');
    const nextActualDepartment = actualDepartment || (activeRun.department === 'all' ? expectedDepartment : activeRun.department);
    const nextCondition: InventoryCondition = expectedDepartment !== nextActualDepartment ? 'wrong_location' : condition;
    const nextScan: InventoryScan = {
      deviceId: device.id,
      deviceName: device.name,
      scannedAt: new Date().toISOString(),
      scannedBy: name || username || 'Người dùng',
      expectedDepartment,
      actualDepartment: nextActualDepartment,
      condition: nextCondition,
      note: note.trim(),
    };

    const nextRuns = runs.map(run => {
      if (run.runId !== activeRun.runId) return run;
      const otherScans = run.scans.filter(scan => scan.deviceId !== device.id);
      return { ...run, scans: [nextScan, ...otherScans] };
    });
    const nextRun = nextRuns.find(run => run.runId === activeRun.runId);
    persistRuns(nextRuns);
    setScanCode('');
    setNote('');
    setCondition('ok');
    const sheetName = nextRun ? await syncRunToGoogleSheets(nextRun, nextRuns) : '';
    toast.success(sheetName ? `Đã ghi nhận mã QR ${device.id} và lưu Google Sheets.` : `Đã ghi nhận mã QR: ${device.id}`);
  };

  const handleCloseRun = async () => {
    if (!activeRun) return;
    const nextRuns: InventoryRun[] = runs.map(run => (
      run.runId === activeRun.runId ? { ...run, status: 'closed' as const } : run
    ));
    const nextRun = nextRuns.find(run => run.runId === activeRun.runId);
    persistRuns(nextRuns);
    const sheetName = nextRun ? await syncRunToGoogleSheets(nextRun, nextRuns) : '';
    toast.success(sheetName ? `Đã khóa đợt kiểm kê và cập nhật Google Sheets: ${sheetName}` : 'Đã khóa đợt kiểm kê.');
  };

  const handleRetrySync = async () => {
    if (!activeRun) return;
    const sheetName = await syncRunToGoogleSheets(activeRun, runs);
    if (sheetName) {
      toast.success(`Đã đồng bộ lại Google Sheets: ${sheetName}`);
    }
  };

  const handleExport = () => {
    if (!activeRun) return;
    const scannedRows = activeRun.scans.map((scan, index) => ({
      STT: index + 1,
      'Mã thiết bị': scan.deviceId,
      'Tên thiết bị': scan.deviceName,
      'Khoa quản lý': scan.expectedDepartment,
      'Khoa thực tế': scan.actualDepartment,
      'Tình trạng': conditionText[scan.condition],
      'Thời gian quét': formatDateTime(scan.scannedAt),
      'Người quét': scan.scannedBy,
      'Ghi chú': scan.note,
    }));
    const missingRows = missingDevices.map((device, index) => ({
      STT: scannedRows.length + index + 1,
      'Mã thiết bị': device.id,
      'Tên thiết bị': device.name,
      'Khoa quản lý': cleanText(device.department, 'Chưa phân bổ'),
      'Khoa thực tế': '',
      'Tình trạng': 'Thiết bị chưa quét',
      'Thời gian quét': '',
      'Người quét': '',
      'Ghi chú': '',
    }));
    exportCsv([...scannedRows, ...missingRows], `KiemKeQR_${activeRun.runId}.csv`);
  };

  return (
    <div className="inventory-page">
      <div className="page-header inventory-header">
        <div>
          <h1 className="page-title">
            <QrCode size={28} />
            Kiểm kê QR
          </h1>
          <p className="dashboard-subtitle">
            Tạo đợt kiểm kê theo khoa/phòng, ghi nhận mã QR và xuất chênh lệch ngay tại hiện trường.
          </p>
        </div>
        <div className="inventory-header-actions">
          <Badge variant={activeRun?.status === 'closed' ? 'neutral' : 'primary'}>
            {activeRun ? (activeRun.status === 'closed' ? 'Đã khóa' : 'Đang kiểm kê') : 'Chưa có đợt'}
          </Badge>
          {activeRun?.sheetName && (
            <Badge variant="success">Google Sheets: {activeRun.sheetName}</Badge>
          )}
          {activeRun?.syncStatus === 'pending' && (
            <Badge variant="warning">Chưa đồng bộ</Badge>
          )}
          {activeRun?.syncStatus === 'pending' && (
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={handleRetrySync} disabled={isSyncing}>
              Đồng bộ lại
            </Button>
          )}
          <Button variant="secondary" icon={<Download size={16} />} onClick={handleExport} disabled={!activeRun}>
            CSV
          </Button>
        </div>
      </div>

      <section className="inventory-grid">
        <Card className="inventory-panel">
          <CardHeader title="Tạo đợt kiểm kê" />
          <CardBody>
            <div className="inventory-form-grid">
              <Input
                label="Tên đợt"
                value={runName}
                onChange={event => setRunName(event.target.value)}
                placeholder="Ví dụ: Kiểm kê Khoa HSCC tháng 06"
              />
              <label className="inventory-field">
                <span>Khoa/phòng</span>
                <select value={runDepartment} onChange={event => setRunDepartment(event.target.value)}>
                  <option value="all">Toàn trung tâm</option>
                  {departments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
              <Button variant="primary" icon={<Plus size={16} />} onClick={handleCreateRun} disabled={isSyncing}>
                {isSyncing ? 'Đang lưu...' : 'Tạo đợt kiểm kê'}
              </Button>
            </div>

            <label className="inventory-field inventory-run-picker">
              <span>Đợt đang mở</span>
              <select value={activeRun?.runId || ''} onChange={event => setSelectedRunId(event.target.value)}>
                {runs.length === 0 && <option value="">Chưa có đợt kiểm kê</option>}
                {runs.map(run => (
                  <option key={run.runId} value={run.runId}>
                    {run.name} - {run.department === 'all' ? 'Toàn trung tâm' : run.department}
                  </option>
                ))}
              </select>
              {activeRun?.sheetName && (
                <small className="inventory-sync-note">
                  Đang lưu tại Google Sheets: {activeRun.sheetName}
                </small>
              )}
            </label>
          </CardBody>
        </Card>

        <Card className="inventory-panel">
          <CardHeader title="Ghi nhận mã QR" />
          <CardBody>
            <form className="inventory-scan-form" onSubmit={handleScan}>
              <Input
                label="Mã QR / Serial"
                value={scanCode}
                onChange={event => setScanCode(event.target.value)}
                placeholder="Quét hoặc nhập mã thiết bị"
                icon={<Search size={16} />}
                disabled={!activeRun || activeRun.status === 'closed'}
              />
              <label className="inventory-field">
                <span>Khoa/phòng thực tế</span>
                <select
                  value={actualDepartment}
                  onChange={event => setActualDepartment(event.target.value)}
                  disabled={!activeRun || activeRun.status === 'closed'}
                >
                  <option value="">Theo đợt kiểm kê</option>
                  {departments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
              <label className="inventory-field">
                <span>Tình trạng</span>
                <select
                  value={condition}
                  onChange={event => setCondition(event.target.value as InventoryCondition)}
                  disabled={!activeRun || activeRun.status === 'closed'}
                >
                  <option value="ok">Đúng vị trí</option>
                  <option value="damaged">Hư hỏng</option>
                  <option value="maintenance">Cần bảo trì</option>
                </select>
              </label>
              <Input
                label="Ghi chú"
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Ghi chú hiện trạng nếu cần"
                disabled={!activeRun || activeRun.status === 'closed'}
              />
              <div className="inventory-scan-actions">
                <Button type="submit" variant="primary" icon={<PackageCheck size={16} />} disabled={!activeRun || activeRun.status === 'closed' || isSyncing}>
                  {isSyncing ? 'Đang lưu...' : 'Ghi nhận mã QR'}
                </Button>
                <Button type="button" variant="secondary" icon={<ClipboardCheck size={16} />} onClick={handleCloseRun} disabled={!activeRun || activeRun.status === 'closed' || isSyncing}>
                  Khóa đợt
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </section>

      <section className="inventory-summary-grid" aria-label="Tổng hợp kiểm kê">
        <div className="inventory-summary-item">
          <strong>{expectedDevices.length}</strong>
          <span>Thiết bị cần kiểm kê</span>
        </div>
        <div className="inventory-summary-item is-success">
          <strong>{activeRun?.scans.length || 0}</strong>
          <span>Đã quét</span>
        </div>
        <div className="inventory-summary-item is-warning">
          <strong>{missingDevices.length}</strong>
          <span>Thiết bị chưa quét</span>
        </div>
        <div className="inventory-summary-item is-danger">
          <strong>{wrongLocationScans.length}</strong>
          <span>Sai khoa/phòng</span>
        </div>
        <div className="inventory-summary-item">
          <strong>{completionRate}%</strong>
          <span>Tỷ lệ hoàn thành</span>
        </div>
      </section>

      <section className="inventory-results-grid">
        <Card className="inventory-panel">
          <CardHeader title="Danh sách đã ghi nhận" />
          <CardBody style={{ padding: 0 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Thiết bị</TableHeader>
                  <TableHeader>Khoa quản lý</TableHeader>
                  <TableHeader>Khoa thực tế</TableHeader>
                  <TableHeader>Tình trạng</TableHeader>
                  <TableHeader>Thời gian</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="inventory-empty">Đang tải dữ liệu thiết bị...</TableCell></TableRow>
                ) : !activeRun || activeRun.scans.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="inventory-empty">Chưa ghi nhận thiết bị nào.</TableCell></TableRow>
                ) : activeRun.scans.map(scan => (
                  <TableRow key={scan.deviceId}>
                    <TableCell>
                      <strong>{scan.deviceId}</strong>
                      <small>{scan.deviceName}</small>
                    </TableCell>
                    <TableCell>{scan.expectedDepartment}</TableCell>
                    <TableCell>{scan.actualDepartment}</TableCell>
                    <TableCell>
                      <Badge variant={scan.condition === 'wrong_location' || scan.condition === 'damaged' ? 'danger' : scan.condition === 'maintenance' ? 'warning' : 'success'}>
                        {conditionText[scan.condition]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(scan.scannedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        <Card className="inventory-panel">
          <CardHeader title="Thiết bị chưa quét" />
          <CardBody style={{ padding: 0 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Mã</TableHeader>
                  <TableHeader>Tên thiết bị</TableHeader>
                  <TableHeader>Khoa/phòng</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {!activeRun ? (
                  <TableRow><TableCell colSpan={3} className="inventory-empty">Tạo đợt kiểm kê để xem danh sách.</TableCell></TableRow>
                ) : missingDevices.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="inventory-empty"><XCircle size={16} /> Không còn thiết bị chưa quét.</TableCell></TableRow>
                ) : missingDevices.slice(0, 12).map((device: DeviceData) => (
                  <TableRow key={device.id}>
                    <TableCell><strong>{device.id}</strong></TableCell>
                    <TableCell>{device.name}</TableCell>
                    <TableCell>{cleanText(device.department, 'Chưa phân bổ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </section>
    </div>
  );
};

export default InventoryQr;
