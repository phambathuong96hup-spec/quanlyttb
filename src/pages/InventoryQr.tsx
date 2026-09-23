import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '../components/ui';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../authContext';
import { exportCsv } from '../utils/exportCsv';
import {
  deleteInventoryRun,
  fetchInventoryRuns,
  saveInventoryRun,
  type DeviceData,
  type InventoryRunSavePayload,
  type InventoryRunSummary,
} from '../services/api';
import './InventoryQr.css';
import { readAuthSession } from '../authSession';
import { useActionPrompt } from '../hooks/useActionPrompt';
import { QrScannerDialog } from '../components/qr/QrScannerDialog';
import type { InventoryCondition, InventoryConfirmPayload } from '../components/qr/types';
import { cleanText } from '../components/qr/qrCodeMatcher';

const STORAGE_KEY = 'qlttb.inventory_runs';

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
  expectedCount?: number;
  scannedCount?: number;
  missingCount?: number;
  wrongDepartmentCount?: number;
  updatedAt?: string;
  isServerSummaryOnly?: boolean;
  scans: InventoryScan[];
}

const conditionText: Record<InventoryCondition, string> = {
  ok: 'Đúng vị trí',
  damaged: 'Hư hỏng',
  maintenance: 'Cần bảo trì',
  wrong_location: 'Sai khoa/phòng',
};

const readRuns = (owner: string): InventoryRun[] => {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}:${owner}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRuns = (runs: InventoryRun[], owner: string) => {
  if (readAuthSession().username !== owner) return;
  sessionStorage.setItem(`${STORAGE_KEY}:${owner}`, JSON.stringify(runs));
};

const toInventoryStatus = (status: string): InventoryStatus => (
  status.toLowerCase() === 'closed' ? 'closed' : 'active'
);

const mergeInventoryRunHistory = (
  localRuns: InventoryRun[],
  serverRuns: InventoryRunSummary[]
): InventoryRun[] => {
  const localById = new Map(localRuns.map(run => [run.runId, run]));
  const serverIds = new Set(serverRuns.map(run => run.runId));
  const mergedServerRuns = serverRuns.map(summary => {
    const local = localById.get(summary.runId);
    if (local?.syncStatus === 'pending') return local;
    return {
      ...(local || {}),
      runId: summary.runId,
      name: summary.name,
      department: summary.department,
      createdAt: summary.createdAt,
      createdBy: summary.createdBy,
      status: toInventoryStatus(summary.status),
      sheetName: summary.sheetName,
      syncStatus: 'synced' as const,
      lastSyncedAt: summary.updatedAt,
      expectedCount: summary.totalDevices,
      scannedCount: summary.scannedCount,
      missingCount: summary.missingCount,
      wrongDepartmentCount: summary.wrongDepartmentCount,
      updatedAt: summary.updatedAt,
      isServerSummaryOnly: !local,
      scans: local?.scans || [],
    };
  });
  return [
    ...mergedServerRuns,
    ...localRuns.filter(run => !serverIds.has(run.runId)),
  ].sort((first, second) => (
    new Date(second.updatedAt || second.createdAt).getTime()
    - new Date(first.updatedAt || first.createdAt).getTime()
  ));
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
  const { ask, dialog: actionDialog } = useActionPrompt();
  const toast = useToast();

  const [runs, setRuns] = useState<InventoryRun[]>(() => readRuns(username));
  const [selectedRunId, setSelectedRunId] = useState(() => readRuns(username)[0]?.runId || '');
  const [runName, setRunName] = useState('');
  const [runDepartment, setRunDepartment] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyError, setHistoryError] = useState('');

  // Scanner Dialog State
  const [isScannerOpen, setIsScannerOpen] = useState(false);

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

  const expectedDeviceCount = activeRun?.isServerSummaryOnly
    ? activeRun.expectedCount || 0
    : expectedDevices.length;
  const scannedDeviceCount = activeRun?.isServerSummaryOnly
    ? activeRun.scannedCount || 0
    : activeRun?.scans.length || 0;
  const missingDeviceCount = activeRun?.isServerSummaryOnly
    ? activeRun.missingCount || 0
    : missingDevices.length;
  const wrongDepartmentCount = activeRun?.isServerSummaryOnly
    ? activeRun.wrongDepartmentCount || 0
    : wrongLocationScans.length;
  const displayedCompletionRate = activeRun?.isServerSummaryOnly
    ? (expectedDeviceCount > 0 ? Math.round((scannedDeviceCount / expectedDeviceCount) * 100) : 0)
    : completionRate;

  const persistRuns = (nextRuns: InventoryRun[]) => {
    setRuns(nextRuns);
    writeRuns(nextRuns, username);
  };

  const loadInventoryHistory = useCallback(async () => {
    setHistoryStatus('loading');
    setHistoryError('');
    try {
      const serverRuns = await fetchInventoryRuns();
      const merged = mergeInventoryRunHistory(readRuns(username), serverRuns);
      setRuns(merged);
      writeRuns(merged, username);
      setSelectedRunId(currentId => (
        merged.some(run => run.runId === currentId) ? currentId : merged[0]?.runId || ''
      ));
      setHistoryStatus('ready');
    } catch (error) {
      setHistoryStatus('error');
      setHistoryError(error instanceof Error ? error.message : 'Không tải được lịch sử kiểm kê.');
    }
  }, [username]);

  useEffect(() => {
    void loadInventoryHistory();
  }, [loadInventoryHistory]);

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

  const handleConfirmInventoryScan = async ({
    device,
    actualDepartment: confirmedActualDept,
    condition: confirmedCondition,
    note: confirmedNote,
  }: InventoryConfirmPayload): Promise<{ success: boolean; message?: string }> => {
    if (!activeRun) {
      return { success: false, message: 'Vui lòng tạo hoặc chọn đợt kiểm kê trước.' };
    }
    if (activeRun.status === 'closed') {
      return { success: false, message: 'Đợt kiểm kê đã khóa.' };
    }
    if (activeRun.isServerSummaryOnly) {
      return { success: false, message: 'Lịch sử từ máy chủ chỉ có số liệu tổng hợp.' };
    }

    const expectedDepartment = cleanText(device.department, 'Chưa phân bổ');
    const nextActualDepartment = confirmedActualDept || (activeRun.department === 'all' ? expectedDepartment : activeRun.department);
    const nextCondition: InventoryCondition = expectedDepartment !== nextActualDepartment ? 'wrong_location' : confirmedCondition;

    const nextScan: InventoryScan = {
      deviceId: device.id,
      deviceName: device.name,
      scannedAt: new Date().toISOString(),
      scannedBy: name || username || 'Người dùng',
      expectedDepartment,
      actualDepartment: nextActualDepartment,
      condition: nextCondition,
      note: confirmedNote.trim(),
    };

    const nextRuns = runs.map(run => {
      if (run.runId !== activeRun.runId) return run;
      const otherScans = run.scans.filter(scan => scan.deviceId !== device.id);
      return { ...run, scans: [nextScan, ...otherScans] };
    });
    const nextRun = nextRuns.find(run => run.runId === activeRun.runId);
    persistRuns(nextRuns);

    const sheetName = nextRun ? await syncRunToGoogleSheets(nextRun, nextRuns) : '';
    const successMsg = sheetName
      ? `Đã ghi nhận ${device.id} và lưu Google Sheets (${sheetName}).`
      : `Đã ghi nhận ${device.id} (lưu tạm trên máy).`;
    toast.success(successMsg);
    return { success: true, message: successMsg };
  };

  const handleCloseRun = async () => {
    if (!activeRun || activeRun.isServerSummaryOnly) return;
    const confirmed = await ask({
      title: 'Khóa đợt kiểm kê',
      description: `Bạn có chắc muốn khóa đợt kiểm kê "${activeRun.name}"? Sau khi khóa sẽ không thể quét thêm thiết bị.`,
    });
    if (confirmed === null) return;

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

  const handleDeleteRun = async () => {
    if (!activeRun) return;
    const confirmed = await ask({
      title: 'Xóa đợt kiểm kê',
      description: `Xóa đợt kiểm kê "${activeRun.name}"? Dữ liệu đã quét của đợt này sẽ bị xóa khỏi danh sách.`,
    });
    if (confirmed === null) return;

    setIsSyncing(true);
    try {
      if (activeRun.sheetName) {
        const response = await deleteInventoryRun({ runId: activeRun.runId, sheetName: activeRun.sheetName });
        if (!response.success) {
          toast.error(response.message || 'Chưa xóa được trên máy chủ. Đợt kiểm kê được giữ lại.');
          return;
        }
      }
      const nextRuns = runs.filter(run => run.runId !== activeRun.runId);
      persistRuns(nextRuns);
      setSelectedRunId(nextRuns[0]?.runId || '');
      toast.success('Đã xóa đợt kiểm kê.');
    } catch {
      toast.error('Không kết nối được máy chủ. Đợt kiểm kê được giữ lại để thử lại.');
    } finally {
      setIsSyncing(false);
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

  const isScannerDisabled = !activeRun || activeRun.status === 'closed' || Boolean(activeRun.isServerSummaryOnly);
  const scannerDisabledReason = !activeRun
    ? 'Vui lòng tạo hoặc chọn một đợt kiểm kê trước khi quét.'
    : activeRun.status === 'closed'
      ? 'Đợt kiểm kê này đã được khóa. Không thể quét thêm.'
      : activeRun.isServerSummaryOnly
        ? 'Lịch sử từ máy chủ ở chế độ chỉ đọc.'
        : '';

  return (
    <div className="inventory-page">
      {actionDialog}

      {/* Header */}
      <div className="page-header inventory-header">
        <div>
          <h1 className="page-title">
            <QrCode size={28} />
            Kiểm kê QR
          </h1>
          <p className="dashboard-subtitle">
            Tạo đợt kiểm kê theo khoa/phòng, quét mã QR/mã vạch và theo dõi tiến độ thực tế ngay tại hiện trường.
          </p>
        </div>
        <div className="inventory-header-actions">
          <Badge variant={activeRun?.status === 'closed' ? 'neutral' : activeRun ? 'primary' : 'warning'}>
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
          {historyStatus === 'loading' && <Badge variant="neutral">Đang tải lịch sử...</Badge>}
          {historyStatus === 'error' && (
            <>
              <Badge variant="danger">Không tải được lịch sử</Badge>
              <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void loadInventoryHistory()}>
                Thử lại
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={handleExport}
            disabled={!activeRun || activeRun.isServerSummaryOnly}
          >
            Xuất CSV
          </Button>
        </div>
      </div>

      {historyError && <div className="inventory-sync-note" role="alert">Không tải được lịch sử: {historyError}</div>}

      {/* Hero Scanner Card: Prominent Scan Action */}
      <Card className="inventory-hero-card">
        <CardBody>
          <div className="inventory-hero-layout">
            <div className="inventory-hero-info">
              <div className="inventory-hero-header">
                <span className="inventory-hero-badge">Đợt hiện tại</span>
                <h2 className="inventory-hero-title">
                  {activeRun ? activeRun.name : 'Chưa chọn đợt kiểm kê'}
                </h2>
              </div>
              <p className="inventory-hero-desc">
                {activeRun
                  ? `Phạm vi: ${activeRun.department === 'all' ? 'Toàn trung tâm' : activeRun.department} · Tạo bởi: ${activeRun.createdBy}`
                  : 'Hãy chọn hoặc tạo đợt kiểm kê để bắt đầu quét thiết bị.'}
              </p>
              {scannerDisabledReason && (
                <div className="inventory-hero-warning" role="alert">
                  <AlertTriangle size={16} />
                  <span>{scannerDisabledReason}</span>
                </div>
              )}
            </div>

            <div className="inventory-hero-action">
              <Button
                type="button"
                variant="primary"
                size="lg"
                icon={<ScanLine size={24} />}
                className="inventory-main-scan-btn"
                onClick={event => { event.currentTarget.focus(); setIsScannerOpen(true); }}
                disabled={isScannerDisabled}
              >
                Quét thiết bị
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Progress & Summary Bar */}
      <section className="inventory-summary-grid" aria-label="Tổng hợp kiểm kê">
        <div className="inventory-summary-item">
          <strong>{expectedDeviceCount}</strong>
          <span>Cần kiểm kê</span>
        </div>
        <div className="inventory-summary-item is-success">
          <strong>{scannedDeviceCount}</strong>
          <span>Đã quét</span>
        </div>
        <div className="inventory-summary-item is-warning">
          <strong>{missingDeviceCount}</strong>
          <span>Chưa quét</span>
        </div>
        <div className="inventory-summary-item is-danger">
          <strong>{wrongDepartmentCount}</strong>
          <span>Sai vị trí</span>
        </div>
        <div className="inventory-summary-item is-accent">
          <strong>{displayedCompletionRate}%</strong>
          <span>Tiến độ</span>
        </div>
      </section>

      {/* Scanned Results vs Missing Devices Grid */}
      <section className="inventory-results-grid">
        <Card className="inventory-panel">
          <CardHeader title={`Danh sách đã ghi nhận (${scannedDeviceCount})`} />
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
                ) : activeRun?.isServerSummaryOnly ? (
                  <TableRow><TableCell colSpan={5} className="inventory-empty">Lịch sử máy chủ hiện chỉ cung cấp số liệu tổng hợp.</TableCell></TableRow>
                ) : !activeRun || activeRun.scans.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="inventory-empty">Chưa ghi nhận thiết bị nào trong đợt này.</TableCell></TableRow>
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
          <CardHeader title={`Thiết bị chưa quét (${missingDeviceCount})`} />
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
                ) : activeRun.isServerSummaryOnly ? (
                  <TableRow><TableCell colSpan={3} className="inventory-empty">Có {missingDeviceCount} thiết bị chưa quét theo số liệu máy chủ.</TableCell></TableRow>
                ) : missingDevices.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="inventory-empty"><XCircle size={16} /> Không còn thiết bị chưa quét.</TableCell></TableRow>
                ) : missingDevices.slice(0, 15).map((device: DeviceData) => (
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

      {/* Batch Management Section (Separated to prevent accidental clicks during scanning) */}
      <section className="inventory-management-section">
        <Card className="inventory-panel">
          <CardHeader title="Quản lý đợt kiểm kê" />
          <CardBody>
            <div className="inventory-management-grid">
              {/* Select Active Run */}
              <div className="inventory-management-col">
                <label className="inventory-field">
                  <span>Chọn đợt đang làm việc</span>
                  <select value={activeRun?.runId || ''} onChange={event => setSelectedRunId(event.target.value)}>
                    {runs.length === 0 && <option value="">Chưa có đợt kiểm kê</option>}
                    {runs.map(run => (
                      <option key={run.runId} value={run.runId}>
                        {run.name} ({run.department === 'all' ? 'Toàn trung tâm' : run.department}){run.status === 'closed' ? ' [Đã khóa]' : ''}{run.isServerSummaryOnly ? ' · Máy chủ' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="inventory-management-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<Lock size={16} />}
                    onClick={handleCloseRun}
                    disabled={!activeRun || activeRun.status === 'closed' || activeRun.isServerSummaryOnly || isSyncing}
                  >
                    Khóa đợt
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    icon={<Trash2 size={16} />}
                    onClick={handleDeleteRun}
                    disabled={!activeRun || isSyncing}
                  >
                    Xóa đợt
                  </Button>
                </div>
              </div>

              {/* Create New Run */}
              <div className="inventory-management-col">
                <div className="inventory-create-form">
                  <Input
                    label="Tạo đợt mới"
                    value={runName}
                    onChange={event => setRunName(event.target.value)}
                    placeholder="VD: Kiểm kê Khoa Cấp cứu T09/2026"
                  />
                  <label className="inventory-field">
                    <span>Khoa/phòng kiểm kê</span>
                    <select value={runDepartment} onChange={event => setRunDepartment(event.target.value)}>
                      <option value="all">Toàn trung tâm</option>
                      {departments.map(department => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="primary"
                    icon={<Plus size={16} />}
                    onClick={handleCreateRun}
                    disabled={isSyncing}
                  >
                    {isSyncing ? 'Đang tạo...' : 'Tạo đợt kiểm kê mới'}
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Unified QR Scanner Dialog */}
      {isScannerOpen && <QrScannerDialog
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="inventory"
        devices={devices}
        title="Quét thiết bị kiểm kê"
        subtitle={activeRun ? `Đợt: ${activeRun.name} · Khoa: ${activeRun.department === 'all' ? 'Toàn trung tâm' : activeRun.department}` : undefined}
        activeRunTitle={activeRun?.name}
        activeRunDepartment={activeRun?.department}
        scannedDeviceIds={scannedIds}
        departments={departments}
        onConfirmInventory={handleConfirmInventoryScan}
      />}
    </div>
  );
};

export default InventoryQr;
