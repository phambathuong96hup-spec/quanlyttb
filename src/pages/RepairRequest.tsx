import { useActionPrompt } from '../hooks/useActionPrompt';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertCircle, Clock, Send, ShieldAlert, ChevronDown, ScanLine,
  CheckCircle, XCircle, Download, FileText, Loader2, RefreshCw, Wrench, Search, X
} from 'lucide-react';
import { Card, CardBody, Button, Input, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Badge, useToast, FileUploader, Modal } from '../components/ui';
import { reportRepair, approveRepair, generateRequestId, type RepairData, type DeviceData } from '../services/api';
import { useDevices } from '../hooks/useDevices';
import { useRepairs } from '../hooks/useRepairs';
import { useAuth } from '../authContext';
import { exportCsv } from '../utils/exportCsv';
import { QrScannerDialog } from '../components/qr/QrScannerDialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { removeVietnameseTones, matchSmartSearch } from '../utils/stringUtils';
import { stripEvidenceLinks } from '../utils/evidenceUtils';
import {
  DEFAULT_REPAIR_ATTACHMENT_LIMITS,
  MAX_REPAIR_ATTACHMENTS,
  REPAIR_ATTACHMENT_ACCEPT,
  buildAttachmentPayloads,
  readFileAsBase64,
  type RepairAttachmentPayload,
} from '../utils/attachmentUtils';
import { EvidenceLinks } from '../components/EvidenceLinks';
import './RepairRequest.css';
import {
  repairStatusText,
  getRepairStatusVariant,
  isRepairActive,
  isRepairAwaitingHandover,
  isRepairAwaitingReview,
  isRepairCompleted,
  isRepairDone,
  isRepairRejected,
  normalizeRepairStatus,
} from '../utils/statusUtils';



interface RepairRequestProps {
  defaultTab?: 'create' | 'requests' | 'history';
}

const MAX_DEVICE_OPTIONS = 80;

const RepairRequest: React.FC<RepairRequestProps> = ({ defaultTab = 'requests' }) => {
  const { ask, dialog: actionDialog } = useActionPrompt();
  // ===== Tab state =====
  const [activeTab, setActiveTab] = useState<'create' | 'requests' | 'history'>(defaultTab);

  // ===== Create form state =====
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { devices, isLoading: isDevicesLoading, refetch: refetchDevices } = useDevices();
  const [deviceId, setDeviceId] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [submitStage, setSubmitStage] = useState<'idle' | 'preparing' | 'sending'>('idle');
  const [prepProgress, setPrepProgress] = useState<{ completed: number; total: number } | null>(null);
  const submissionRequestIdRef = React.useRef<string>('');

  useEffect(() => {
    submissionRequestIdRef.current = '';
  }, [deviceId, description, priority, selectedFiles]);

  // ===== Repairs data =====
  const { repairs, isLoading: isRepairsLoading, refetch: refetchRepairs, mutate: mutateRepairs } = useRepairs();
  const isLoading = isDevicesLoading || isRepairsLoading;
  
  const reversedRepairs = useMemo(() => [...repairs].reverse(), [repairs]);
  const visibleDeviceOptions = useMemo(() => {
    const matchingDevices = deviceSearch.trim()
      ? devices.filter(device => matchSmartSearch(
          device as unknown as Record<string, unknown>,
          ['id', 'name', 'department'],
          deviceSearch
        ))
      : devices;
    const limitedDevices = matchingDevices.slice(0, MAX_DEVICE_OPTIONS);
    const selectedDevice = devices.find(device => device.id === deviceId);
    if (!selectedDevice || limitedDevices.some(device => device.id === selectedDevice.id)) {
      return limitedDevices;
    }
    return [selectedDevice, ...limitedDevices].slice(0, MAX_DEVICE_OPTIONS);
  }, [deviceId, deviceSearch, devices]);

  // ===== Auth =====
  const { name, email, department, isAdmin } = useAuth();
  const toast = useToast();

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ repair: RepairData; newStatus: string } | null>(null);
  const userName = name || 'Nhân viên vô danh';
  const userDepartment = department || '';
  const [userEmail, setUserEmail] = useState(email);

  // Smart Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // ===== Load data =====
  const loadData = useCallback(async () => {
    await Promise.all([refetchDevices(), refetchRepairs()]);
  }, [refetchDevices, refetchRepairs]);

  useEffect(() => {
    const prefilledId = sessionStorage.getItem('repairDeviceId');
    setDeviceId(current => {
      if (prefilledId) {
        sessionStorage.removeItem('repairDeviceId');
        return prefilledId;
      }
      return current;
    });
  }, [devices]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (email) setUserEmail(email);
  }, [email]);

  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setDeptFilter('all');
  }, [activeTab]);

  // ===== Open repairs (not completed/rejected) =====
  const openRepairs = useMemo(() =>
    reversedRepairs.filter(r => isRepairActive(r.status)),
    [reversedRepairs]
  );

  const filteredRepairs = useMemo(() => {
    let list = activeTab === 'requests' ? openRepairs : reversedRepairs;
    
    // 1. Smart Search (multi-keyword, diacritics-insensitive matching ID, name, description, status)
    if (searchQuery.trim() !== '') {
      list = list.filter(r => matchSmartSearch(r as unknown as Record<string, unknown>, ['deviceId', 'userName', 'description', 'status', 'userEmail'], searchQuery));
    }
    
    // 2. Status filter
    if (statusFilter !== 'all') {
      list = list.filter(r => r.status === statusFilter);
    }
    
    // 3. Department filter
    if (deptFilter !== 'all') {
      list = list.filter(r => {
        const cleanId = r.deviceId?.replace('[KHẨN] ', '') || '';
        const dev = devices.find(d => d.id === cleanId || d.id === r.deviceId);
        return dev?.department === deptFilter;
      });
    }
    
    return list;
  }, [activeTab, openRepairs, reversedRepairs, searchQuery, statusFilter, deptFilter, devices]);

  const visibleRepairs = filteredRepairs;

  // ===== QR Scanner Handler =====
  const handleDeviceSelectFromScanner = (selectedDevice: DeviceData) => {
    setDeviceId(selectedDevice.id);
    toast.success(`Đã chọn thiết bị: ${selectedDevice.id} - ${selectedDevice.name}`);
  };

  // ===== Submit repair =====
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!description.trim() || !userEmail.trim() || !deviceId.trim()) {
      setMessage('Vui lòng điền đầy đủ Mã thiết bị, Mô tả và Email.');
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    setSubmitStage(selectedFiles.length > 0 ? 'preparing' : 'sending');
    setPrepProgress(selectedFiles.length > 0 ? { completed: 0, total: selectedFiles.length } : null);

    let attachments: RepairAttachmentPayload[] = [];
    let isPreparingAttachments = selectedFiles.length > 0;

    try {
      if (selectedFiles.length > 0) {
        attachments = await buildAttachmentPayloads(
          selectedFiles,
          readFileAsBase64,
          (completed, total) => {
            setPrepProgress({ completed, total });
          }
        );
      }
      isPreparingAttachments = false;

      setSubmitStage('sending');
      if (!submissionRequestIdRef.current) {
        submissionRequestIdRef.current = generateRequestId('REPAIR');
      }
      const currentRequestId = submissionRequestIdRef.current;

      const primaryAttachment = attachments[0];
      const submittedDeviceId = priority === 'urgent' ? `[KHẨN] ${deviceId}` : deviceId;
      const response = await reportRepair({
        deviceId: submittedDeviceId,
        userName,
        userEmail,
        description,
        requestId: currentRequestId,
        // Tệp đầu giữ giao thức cũ; các tệp còn lại dùng mảng mới. Payload không bị lặp Base64.
        attachments: attachments.slice(1),
        ...(primaryAttachment ? {
          imageContent: primaryAttachment.content,
          imageName: primaryAttachment.name,
          imageMimeType: primaryAttachment.mimeType,
        } : {}),
      });

      if (response.success) {
        submissionRequestIdRef.current = '';
        const repairRowId = response.repairRowId || response.repair?.rowId || '';
        const emailNotice = response.emailQueued ? ' (thông báo đang chờ gửi)' : '';
        if (response.syncStatus === 'pending' || response.partialSuccess) {
          toast.warning(
            response.message ||
            `Đã ghi nhận phiếu sửa chữa (${repairRowId || 'thành công'})${emailNotice}, nhưng trạng thái thiết bị đang chờ đối soát tự động.`
          );
        } else {
          toast.success(
            repairRowId
              ? `Yêu cầu báo hỏng đã được gửi thành công! (Mã phiếu: ${repairRowId})${emailNotice}`
              : `Yêu cầu báo hỏng đã được gửi thành công!${emailNotice}`
          );
        }
        if (attachments.length > 1 && response.attachmentCount === undefined) {
          toast.warning('Máy chủ cũ chỉ nhận tệp đầu tiên. Cần cập nhật Apps Script để nhận toàn bộ ảnh/video.');
        }
        if (response.attachmentFailures?.length) {
          toast.warning(`Có ${response.attachmentFailures.length} tệp chưa tải được lên Drive.`);
        }
        setDescription('');
        setPriority('normal');
        setSelectedFiles([]);
        setDeviceId('');
        setDeviceSearch('');
        if (response.repair) {
          const optimisticRepair = response.repair;
          mutateRepairs(currentRepairs => {
            const existingIndex = currentRepairs.findIndex(repair => repair.rowId === optimisticRepair.rowId);
            if (existingIndex < 0) return [...currentRepairs, optimisticRepair];
            return currentRepairs.map((repair, index) => index === existingIndex ? optimisticRepair : repair);
          });
        } else {
          // Máy chủ cũ chưa trả bản ghi vừa tạo; chỉ trường hợp này mới cần tải lại danh sách.
          void refetchRepairs();
        }
        setActiveTab('requests');
      } else {
        toast.error('Có lỗi xảy ra: ' + (response.message || 'Lỗi không xác định'));
      }
    } catch (err: unknown) {
      const errorMsg = (err && typeof err === 'object' && 'message' in err && typeof (err as { message: string }).message === 'string')
        ? (err as { message: string }).message
        : '';
      toast.error(
        isPreparingAttachments
          ? 'Không thể đọc tệp đính kèm. Vui lòng chọn lại tệp và thử lại.'
          : (errorMsg || 'Không thể gửi yêu cầu. Bản nháp và mã yêu cầu đã được giữ lại; vui lòng kiểm tra kết nối và nhấn thử lại.')
      );
    } finally {
      setIsSubmitting(false);
      setSubmitStage('idle');
      setPrepProgress(null);
    }
  };

  const handleConfirmReceive = async (repair: RepairData) => {
    // Khoa nhận lại thiết bị
    const res = await approveRepair({
      rowId: repair.rowId,
      deviceId: repair.deviceId,
      newStatus: 'Đã hoàn thành',
      approver: userName,
      note: 'Khoa đã nhận lại thiết bị',
    });
    if (res.success) {
      toast.success('Đã xác nhận nhận lại thiết bị!');
      mutateRepairs(repairs.map(r =>
        r.rowId === repair.rowId ? { ...r, status: 'Đã hoàn thành' } : r
      ));
    } else {
      toast.error('Lỗi khi xác nhận: ' + res.message);
    }
  };

  // ===== Approve/Reject repair =====
  const handleApproveRepair = async (repair: RepairData) => {
    if (!isAdmin) { toast.warning('Bạn không có quyền duyệt yêu cầu sửa chữa.'); return; }
    const note = await ask({ title: 'Duyệt yêu cầu sửa chữa', label: 'Ghi chú duyệt (nếu có)' });
    if (note === null) return;
    const res = await approveRepair({
      rowId: repair.rowId,
      deviceId: repair.deviceId,
      newStatus: 'Đã duyệt',
      approver: userName,
      note,
    });
    toast.info(res.message || (res.success ? 'Đã đồng ý xử lý.' : 'Có lỗi xảy ra.'));
    await loadData();
  };

  const handleRejectRepair = async (repair: RepairData) => {
    if (!isAdmin) { toast.warning('Bạn không có quyền từ chối yêu cầu sửa chữa.'); return; }
    const reasonText = await ask({ title: 'Từ chối sửa chữa', label: 'Lý do từ chối', required: true });
    if (reasonText === null) return;
    const res = await approveRepair({
      rowId: repair.rowId,
      deviceId: repair.deviceId,
      newStatus: 'Từ chối',
      approver: userName,
      note: reasonText,
    });
    toast.info(res.message || (res.success ? 'Đã từ chối.' : 'Có lỗi xảy ra.'));
    await loadData();
  };

  const handleStatusChange = async (repair: RepairData, newStatus: string) => {
    if (!isAdmin) { toast.warning('Bạn không có quyền cập nhật tiến độ sửa chữa.'); return; }
    if (!newStatus) return;
    setPendingStatusChange({ repair, newStatus });
    setConfirmOpen(true);
  };

  const executeStatusChange = async () => {
    if (!pendingStatusChange) return;
    const { repair, newStatus } = pendingStatusChange;
    setIsUpdatingStatus(true);
    
    let imageContent = '';
    let imageName = '';
    let imageMimeType = '';

    if (statusFile) {
      try {
        imageContent = await readFileAsBase64(statusFile);
        imageName = statusFile.name;
        imageMimeType = statusFile.type;
      } catch {
        toast.error('Lỗi khi đọc file đính kèm.');
        setIsUpdatingStatus(false);
        return;
      }
    }

    const res = await approveRepair({
      rowId: repair.rowId,
      deviceId: repair.deviceId,
      newStatus,
      approver: userName,
      note: '',
      imageContent,
      imageName,
      imageMimeType,
    });

    setIsUpdatingStatus(false);
    setConfirmOpen(false);
    setPendingStatusChange(null);
    setStatusFile(null);

    if (!res.success) {
      toast.error('Lỗi khi cập nhật: ' + res.message);
    } else {
      mutateRepairs(repairs.map(r =>
        r.rowId === repair.rowId ? { ...r, status: newStatus } : r
      ));
      toast.success(`Đã cập nhật trạng thái "${repair.deviceId}" thành "${newStatus}"`);
    }
    await loadData();
  };

  // ===== Export =====
  const exportRows = visibleRepairs.map((r, index) => ({
    STT: index + 1,
    'Thời gian': r.rowId,
    'Mã thiết bị': r.deviceId,
    'Người báo': r.userName,
    'Email': r.userEmail,
    'Mô tả lỗi': r.description,
    'Trạng thái': r.status,
  }));

  const exportCsvFile = () => {
    if (exportRows.length === 0) { toast.warning('Không có dữ liệu để xuất.'); return; }
    exportCsv(exportRows, `BaoHong_SuaChua_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('BAO CAO BAO HONG / SUA CHUA', 148, 18, { align: 'center' });
    autoTable(doc, {
      startY: 28,
      head: [['STT', 'Thoi gian', 'Ma TB', 'Nguoi bao', 'Mo ta loi', 'Trang thai']],
      body: exportRows.map(row => [
        row.STT, row['Thời gian'], row['Mã thiết bị'], removeVietnameseTones(row['Người báo']),
        removeVietnameseTones(row['Mô tả lỗi']), removeVietnameseTones(row['Trạng thái']),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    });
    doc.save(`BaoHong_SuaChua_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`);
  };

  const statusOptions = ['Chờ duyệt', 'Đã duyệt', 'Đang kiểm tra', 'Đang sửa chữa', 'Đã sửa xong (Chờ bàn giao)', 'Đã hoàn thành', 'Từ chối'];

  return (
    <div className="reports-page request-workspace request-workspace-repair">
      {actionDialog}
      {/* ===== Page Header ===== */}
      <div className="page-header request-section-header">
        <div>
          <h1 className="page-title request-section-title">
            <span className="request-title-icon" aria-hidden="true">
              <Wrench size={22} />
            </span>
            Báo hỏng / Sửa chữa
          </h1>
          <p className="dashboard-subtitle">
            Gửi yêu cầu báo hỏng, theo dõi tiến độ xử lý, duyệt hoặc từ chối yêu cầu sửa chữa.
          </p>
        </div>
        <div className="action-buttons request-actions">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={loadData}>Làm mới</Button>
          <Button variant="secondary" icon={<FileText size={16} />} onClick={exportPdf}>PDF</Button>
          <Button variant="primary" icon={<Download size={16} />} onClick={exportCsvFile}>CSV</Button>
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <div className="reports-tabs-container request-subtabs">
        <button className={`report-main-tab request-subtab ${activeTab === 'create' ? 'active' : ''}`} onClick={() => setActiveTab('create')}>
          Tạo yêu cầu
        </button>
        <button className={`report-main-tab request-subtab ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
          Tiếp nhận yêu cầu ({openRepairs.length})
        </button>
        <button className={`report-main-tab request-subtab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          Lịch sử
        </button>
      </div>

      {/* ===== Tab: Tạo yêu cầu ===== */}
      {activeTab === 'create' ? (
        <Card className="request-card request-card-repair">
          <CardBody className="request-card-body">
            <div className="device-summary request-summary request-summary-repair">
              <div className="device-summary-icon request-summary-icon">
                <ShieldAlert size={26} />
              </div>
              <div className="device-summary-info request-summary-content">
                <h3>Ghi nhận sự cố thiết bị</h3>
                <p>Ghi nhận sự cố, mức độ ưu tiên và minh chứng để chuyển cho bộ phận xử lý.</p>
              </div>
            </div>

            <form className="form-section request-form" onSubmit={handleSubmit}>
              <div className="request-field request-device-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                  <label className="input-label" htmlFor="repair-device" style={{ margin: 0 }}>Thiết bị báo hỏng</label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<ScanLine size={15} />}
                    onClick={event => { event.currentTarget.focus(); setIsScannerOpen(true); }}
                  >
                    Quét mã thiết bị
                  </Button>
                </div>
                <Input
                  value={deviceSearch}
                  onChange={event => setDeviceSearch(event.target.value)}
                  placeholder="Tìm theo mã, tên hoặc khoa/phòng"
                  icon={<Search size={16} />}
                />
                <div className="request-select-wrap">
                  <select
                    id="repair-device"
                    value={deviceId}
                    onChange={e => setDeviceId(e.target.value)}
                    className="request-select"
                    style={{
                      width: '100%', padding: '10px 36px 10px 14px',
                      border: '1.5px solid var(--border)', borderRadius: '8px',
                      fontSize: '0.95rem', background: 'white', appearance: 'none',
                      cursor: 'pointer', color: 'var(--text-primary)'
                    }}
                  >
                    <option value="" disabled>-- Chọn thiết bị --</option>
                    {visibleDeviceOptions.map((d, index) => (
                      <option key={`${d.id}-${index}`} value={d.id}>{d.id} — {d.name} ({d.department})</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="request-select-chevron" />
                </div>
                {devices.length > MAX_DEVICE_OPTIONS && (
                  <p className="request-field-hint">
                    Hiển thị tối đa {MAX_DEVICE_OPTIONS} thiết bị. Nhập từ khóa để thu hẹp danh sách.
                  </p>
                )}
                <p className="request-field-hint">
                  Hoặc nhập tay mã thiết bị:
                </p>
                <input
                  type="text"
                  value={deviceId}
                  onChange={e => setDeviceId(e.target.value)}
                  placeholder="Nhập tay mã TB nếu không có trong danh sách"
                  className="request-text-input"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.9rem', marginTop: '4px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Info grid: vị trí & người báo */}
              <div className="info-grid request-info-grid">
                <div className="info-item">
                  <span className="info-label">Vị trí thiết bị</span>
                  <span className="info-value">{devices.find(d => d.id === deviceId)?.department || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Người tạo yêu cầu</span>
                  <span className="info-value">{userName} ({userDepartment})</span>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Mức độ ưu tiên</label>
                <div className="priority-options">
                  <label className={`radio-card ${priority === 'normal' ? 'selected' : ''}`} onClick={() => setPriority('normal')}>
                    <input type="radio" name="priority" value="normal" checked={priority === 'normal'} onChange={() => setPriority('normal')} />
                    <div className="radio-label"><Clock size={24} /><span>Bình thường</span></div>
                  </label>
                  <label className={`radio-card urgent ${priority === 'urgent' ? 'selected' : ''}`} onClick={() => setPriority('urgent')}>
                    <input type="radio" name="priority" value="urgent" checked={priority === 'urgent'} onChange={() => setPriority('urgent')} />
                    <div className="radio-label"><AlertCircle size={24} /><span>Khẩn cấp</span></div>
                  </label>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Mô tả tình trạng hỏng hóc</label>
                <div className="input-wrapper">
                  <textarea
                    className="input-field"
                    placeholder="Mô tả chi tiết biểu hiện lỗi (VD: Máy không lên nguồn, màn hình báo lỗi E02...)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <FileUploader
                  files={selectedFiles}
                  onFilesChange={setSelectedFiles}
                  accept={REPAIR_ATTACHMENT_ACCEPT}
                  label="Ảnh và video minh chứng (tùy chọn)"
                  helperText="Có thể chọn nhiều ảnh JPG, PNG, WebP và video MP4, MOV, WebM cùng lúc"
                  maxSizeMB={DEFAULT_REPAIR_ATTACHMENT_LIMITS.maxSizeMB}
                  maxTotalSizeMB={DEFAULT_REPAIR_ATTACHMENT_LIMITS.maxTotalSizeMB}
                  maxFiles={MAX_REPAIR_ATTACHMENTS}
                  multiple
                  disabled={isSubmitting}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Email của bạn (Nhận kết quả phản hồi)</label>
                <Input
                  type="email"
                  placeholder="VD: nhanvien@benhvien.vn"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  readOnly={email !== ''}
                  style={{ backgroundColor: email !== '' ? 'var(--surface-50)' : 'white' }}
                  required
                />
                {email !== ''
                  ? <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>* Email được đồng bộ từ tài khoản của bạn.</p>
                  : <p style={{ fontSize: '0.8rem', color: 'var(--warning)', marginTop: '4px' }}>* Nhờ admin cập nhật email trong Sheet Users để tự động điền.</p>
                }
              </div>

              {message && (
                <div style={{
                  color: message.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 600,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: message.startsWith('✅') ? 'var(--success-light)' : 'var(--danger-light)',
                }}>
                  {message}
                </div>
              )}

              <div className="request-submit-status" aria-live="polite">
                {submitStage === 'preparing'
                  ? `Đang chuẩn bị tệp (${prepProgress ? prepProgress.completed : 0}/${selectedFiles.length})...`
                  : submitStage === 'sending'
                    ? 'Đang gửi yêu cầu, vui lòng chờ…'
                    : ''}
              </div>
              <Button type="submit" variant="primary" className="submit-btn request-submit-btn" icon={isSubmitting ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} />} disabled={isSubmitting}>
                {submitStage === 'preparing'
                  ? `Đang chuẩn bị tệp (${prepProgress ? prepProgress.completed : 0}/${selectedFiles.length})...`
                  : isSubmitting
                    ? 'Đang gửi...'
                    : 'Gửi yêu cầu sửa chữa'}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : (
        /* ===== Tab: Tiếp nhận yêu cầu / Lịch sử ===== */
        <Card>
          <div className="toolbar" style={{ padding: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
              <Input 
                placeholder="Tìm kiếm mã thiết bị, người báo, mô tả lỗi..." 
                icon={<Search size={18} />} 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                style={{ paddingRight: searchQuery ? '32px' : '12px' }}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  style={{ 
                    position: 'absolute', 
                    right: '10px', 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                  title="Xóa tìm kiếm"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {activeTab === 'history' && (
              <select 
                className="filter-select" 
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value)}
                style={{ minWidth: '160px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}
              >
                <option value="all">Tất cả trạng thái</option>
                {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
            <select 
              className="filter-select" 
              value={deptFilter} 
              onChange={e => setDeptFilter(e.target.value)}
              style={{ minWidth: '180px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}
            >
              <option value="all">Tất cả khoa/phòng</option>
              {Array.from(new Set(devices.map(d => d.department))).filter(Boolean).sort().map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            {(searchQuery || statusFilter !== 'all' || deptFilter !== 'all') && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setDeptFilter('all');
                }}
                icon={<X size={14} />}
              >
                Xóa lọc
              </Button>
            )}
          </div>
          <CardBody style={{ padding: 0 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Thời gian</TableHeader>
                  <TableHeader>Thiết bị</TableHeader>
                  <TableHeader>Người báo</TableHeader>
                  <TableHeader>Mô tả lỗi</TableHeader>
                  <TableHeader>Trạng thái</TableHeader>
                  <TableHeader>Thao tác</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</TableCell></TableRow>
                ) : visibleRepairs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Không có dữ liệu.</TableCell></TableRow>
                ) : visibleRepairs.map((repair, index) => {
                  const normalizedStatus = normalizeRepairStatus(repair.status);
                  const isCompleted = isRepairCompleted(repair.status);
                  const isRejected = isRepairRejected(repair.status);
                  const isPending = isRepairAwaitingReview(repair.status);
                  const isAwaitingHandover = isRepairAwaitingHandover(repair.status);
                  const isDone = isRepairDone(repair.status);

                  return (
                    <TableRow key={`${repair.rowId}-${index}`}>
                      <TableCell>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: isDone ? 0.7 : 1 }}>
                          {repair.rowId}
                        </span>
                      </TableCell>
                      <TableCell>
                        <strong style={{ opacity: isDone ? 0.7 : 1 }}>
                          {repair.deviceId}
                        </strong>
                      </TableCell>
                      <TableCell>
                        <div style={{ opacity: isDone ? 0.7 : 1, display: 'flex', flexDirection: 'column' }}>
                          <span>{repair.userName}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{repair.userEmail}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span style={{
                          opacity: isDone ? 0.7 : 1,
                          maxWidth: '300px', whiteSpace: 'normal', display: 'inline-block'
                        }}>
                          {stripEvidenceLinks(repair.description) || '—'}
                        </span>
                        <EvidenceLinks text={repair.description} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRepairStatusVariant(repair.status)}>
                          {isCompleted ? <CheckCircle size={12} /> :
                            isRejected ? <XCircle size={12} /> :
                            normalizedStatus.includes('sua') ? <Wrench size={12} /> :
                            isPending ? <Clock size={12} /> :
                            <Search size={12} />
                          }
                          <span style={{ marginLeft: '4px' }}>{repairStatusText[repair.status] || repair.status}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {activeTab === 'requests' && !isDone ? (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Approve / Reject buttons for pending */}
                            {isPending && isAdmin && (
                              <>
                                <Button size="sm" variant="success" icon={<CheckCircle size={14} />} onClick={() => handleApproveRepair(repair)}>
                                  Đồng ý
                                </Button>
                                <Button size="sm" variant="danger" icon={<XCircle size={14} />} onClick={() => handleRejectRepair(repair)}>
                                  Không đồng ý
                                </Button>
                              </>
                            )}
                            {/* Status change dropdown for in-progress items */}
                            {isAdmin && !isPending && (
                              <select
                                value={statusOptions.includes(repair.status) ? repair.status : ''}
                                onChange={(e) => handleStatusChange(repair, e.target.value)}
                                className="status-select"
                              >
                                <option value="" disabled>-- Cập nhật --</option>
                                {statusOptions.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            )}
                            {isAwaitingHandover && (
                              <Button 
                                size="sm" 
                                variant="primary" 
                                onClick={() => handleConfirmReceive(repair)}
                              >
                                Nhận lại máy
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {repair.status}
                            </span>
                            {repair.status === 'Đã sửa xong (Chờ bàn giao)' && (
                              <Button 
                                size="sm" 
                                variant="primary" 
                                onClick={() => handleConfirmReceive(repair)}
                              >
                                Nhận lại máy
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <Modal 
        isOpen={confirmOpen} 
        onClose={() => { if (!isUpdatingStatus) { setConfirmOpen(false); setPendingStatusChange(null); setStatusFile(null); } }}
        title="Xác nhận cập nhật tiến độ"
      >
        {pendingStatusChange && (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0 }}>Xác nhận cập nhật trạng thái thiết bị <strong>{pendingStatusChange.repair.deviceId}</strong> thành <Badge variant="primary">{pendingStatusChange.newStatus}</Badge>?</p>
            
            {(pendingStatusChange.newStatus.includes('sửa xong') || pendingStatusChange.newStatus.includes('hoàn thành')) && (
              <FileUploader
                files={statusFile ? [statusFile] : []}
                onFilesChange={files => setStatusFile(files[0] || null)}
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                label="Ảnh minh chứng (tùy chọn)"
                helperText="Hỗ trợ ảnh JPG, PNG và WebP"
                maxSizeMB={5}
                maxTotalSizeMB={5}
                maxFiles={1}
                disabled={isUpdatingStatus}
              />
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <Button variant="secondary" onClick={() => { setConfirmOpen(false); setPendingStatusChange(null); setStatusFile(null); }} disabled={isUpdatingStatus}>Hủy</Button>
              <Button variant="primary" onClick={executeStatusChange} disabled={isUpdatingStatus} icon={isUpdatingStatus ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : undefined}>
                {isUpdatingStatus ? 'Đang cập nhật...' : 'Cập nhật'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {isScannerOpen && <QrScannerDialog
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        mode="repair"
        devices={devices}
        title="Quét thiết bị báo hỏng"
        subtitle="Báo hỏng / sửa chữa"
        onSelectDevice={handleDeviceSelectFromScanner}
      />}
    </div>
  );
};

export default RepairRequest;
