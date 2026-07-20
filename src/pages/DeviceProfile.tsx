import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, RefreshCw, FileText, X, Save, Plus, Eye, Edit, Send, CalendarPlus } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardBody, Button, Badge, type BadgeVariant, Tabs, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Modal, FileUploader } from '../components/ui';
import { createTransfer, addDocument, markDocumentSent, renewDocument, type DeviceDocument } from '../services/api';
import { useDevices } from '../hooks/useDevices';
import { useTransfers } from '../hooks/useTransfers';
import { useRepairs } from '../hooks/useRepairs';
import { useAuth } from '../authContext';
import { resolveDeviceListStatus } from '../utils/deviceStatus';
import { isArchivedDocumentStatus, isRegistrationDocumentType } from '../utils/documentWorkflow';
import { stripEvidenceLinks } from '../utils/evidenceUtils';
import { EvidenceLinks } from '../components/EvidenceLinks';
import './Devices.css';

const DeviceProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, username } = useAuth();
  const {
    devices,
    isLoading: isDevicesLoading,
    error: devicesError,
    refetch: refetchDevices,
  } = useDevices();
  const {
    transfers: allTransfers,
    isLoading: isTransfersLoading,
    error: transfersError,
    refetch: refetchTransfers,
  } = useTransfers();
  const {
    repairs: allRepairs,
    isLoading: isRepairsLoading,
    error: repairsError,
    refetch: refetchRepairs,
  } = useRepairs();
  const decodedId = decodeURIComponent(id || '');
  const device = devices.find(d => d.id === decodedId) || null;
  const profileStatus = device ? resolveDeviceListStatus(device) : null;
  const departments = Array.from(new Set(devices.map(d => d.department).filter(Boolean))).sort();
  const transfers = allTransfers.filter(t => t.deviceId === decodedId).reverse();
  const repairs = allRepairs.filter(r => r.deviceId === decodedId);

  // Modal điều chuyển khoa
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newDept, setNewDept] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [activeProfileTab, setActiveProfileTab] = useState('general');

  // State quản lý tài liệu
  const [showDocModal, setShowDocModal] = useState(false);
  const [docModalMode, setDocModalMode] = useState<'add' | 'edit' | 'renew'>('add');
  const [isUploading, setIsUploading] = useState(false);
  const [updatingDocumentId, setUpdatingDocumentId] = useState<string | null>(null);
  
  // File upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Form tài liệu
  const [documentId, setDocumentId] = useState('');
  const [docType, setDocType] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [docStatus, setDocStatus] = useState('Chưa gửi');
  const [sentDate, setSentDate] = useState('');
  const [responsible, setResponsible] = useState('');
  const [collaborator, setCollaborator] = useState('');
  const [deptManager, setDeptManager] = useState('');



  const handleReportBroken = () => {
    // Lưu deviceId vào sessionStorage để báo hỏng trang tự điền sẵn
    if (device) sessionStorage.setItem('repairDeviceId', device.id);
    navigate('/requests?type=repair');
  };

  const handleTransfer = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/devices/${id}` } } });
      return;
    }
    if (!newDept.trim()) { alert('Vui lòng nhập khoa/phòng đích.'); return; }
    if (!device) return;
    const res = await createTransfer({
      deviceId: device.id,
      toDepartment: newDept,
      reason: transferNote,
      actorUsername: username,
    });
    alert((res.success ? '✅ ' : '❌ ') + (res.message || 'Có lỗi xảy ra.'));
    if (res.success) {
      await refetchTransfers();
      setShowTransferModal(false);
      setNewDept('');
      setTransferNote('');
    }
  };

  const generalInfoTab = (
    <div className="info-grid">
      <div className="info-section-title">Thông tin cơ bản</div>
      <div className="info-item"><span className="info-label">Tên thiết bị</span><span className="info-value">{device?.name || '—'}</span></div>
      <div className="info-item"><span className="info-label">Mã thiết bị</span><span className="info-value">{device?.id || '—'}</span></div>
      <div className="info-item"><span className="info-label">Seri máy</span><span className="info-value">{String(device?.['Seri Máy'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Model</span><span className="info-value">{String(device?.['Model'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Đơn vị tính</span><span className="info-value">{String(device?.['Đơn vị tính'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Số lượng</span><span className="info-value">{String(device?.['Số lượng'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Nhóm</span><span className="info-value">{String(device?.['Nhóm'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Phân loại</span><span className="info-value">{String(device?.['Phân loại'] || '—')}</span></div>

      <div className="info-section-title">Vị trí & trạng thái</div>
      <div className="info-item"><span className="info-label">Khoa/phòng sử dụng</span><span className="info-value">{device?.department || '—'}</span></div>
      <div className="info-item"><span className="info-label">Hiện trạng thực tế</span><span className="info-value">{String(device?.['Hiện trạng thực tế'] || '—')}</span></div>

      <div className="info-section-title">Thông tin kỹ thuật</div>
      <div className="info-item"><span className="info-label">Hãng sản xuất</span><span className="info-value">{String(device?.['Hãng SX'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Nước sản xuất</span><span className="info-value">{String(device?.['Nước SX'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Năm sản xuất</span><span className="info-value">{String(device?.['Năm SX'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Năm sử dụng</span><span className="info-value">{String(device?.['Năm SD'] || '—')}</span></div>

      <div className="info-section-title">Tài chính & Nguồn gốc</div>
      <div className="info-item"><span className="info-label">Giá trị</span><span className="info-value">{String(device?.['Giá'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Nguồn vốn</span><span className="info-value">{String(device?.['Nguồn'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Công ty cung ứng</span><span className="info-value">{String(device?.['Công ty cung ứng'] || '—')}</span></div>
      <div className="info-item"><span className="info-label">Ghi chú</span><span className="info-value">{String(device?.['Ghi chú'] || '—')}</span></div>
    </div>
  );

  const movementHistoryTab = (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Khoa/phòng</TableHeader>
          <TableHeader>Từ ngày</TableHeader>
          <TableHeader>Đến ngày</TableHeader>
          <TableHeader>Người bàn giao</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {isTransfersLoading ? (
          <TableRow>
            <TableCell colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
              Đang tải lịch sử luân chuyển...
            </TableCell>
          </TableRow>
        ) : transfersError ? (
          <TableRow>
            <TableCell colSpan={4} style={{ textAlign: 'center', color: 'var(--danger)', padding: '2rem' }}>
              <p>Không tải được lịch sử luân chuyển: {transfersError.message}</p>
              <Button size="sm" variant="secondary" onClick={() => void refetchTransfers()}>Thử lại</Button>
            </TableCell>
          </TableRow>
        ) : transfers.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
              Chưa có lịch sử luân chuyển.
            </TableCell>
          </TableRow>
        ) : transfers.map(transfer => (
          <TableRow key={transfer.transferId}>
            <TableCell>{transfer.fromDepartment} → <strong>{transfer.toDepartment}</strong></TableCell>
            <TableCell>{transfer.requestedAt || transfer.createdAt}</TableCell>
            <TableCell>{transfer.receivedAt || transfer.status}</TableCell>
            <TableCell>{transfer.requestedByName || transfer.requestedBy}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const maintenanceHistoryTab = (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Ngày</TableHeader>
          <TableHeader>Mô tả lỗi</TableHeader>
          <TableHeader>Trạng thái</TableHeader>
          <TableHeader>Người báo</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {isRepairsLoading ? (
          <TableRow>
            <TableCell colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
              Đang tải lịch sử sửa chữa...
            </TableCell>
          </TableRow>
        ) : repairsError ? (
          <TableRow>
            <TableCell colSpan={4} style={{ textAlign: 'center', color: 'var(--danger)', padding: '2rem' }}>
              <p>Không tải được lịch sử sửa chữa: {repairsError.message}</p>
              <Button size="sm" variant="secondary" onClick={() => void refetchRepairs()}>Thử lại</Button>
            </TableCell>
          </TableRow>
        ) : repairs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
              Chưa có lịch sử sửa chữa cho thiết bị này.
            </TableCell>
          </TableRow>
        ) : repairs.map((repair, idx) => (
          <TableRow key={repair.rowId || idx}>
            <TableCell>{repair.rowId || '—'}</TableCell>
            <TableCell>
              <span>{stripEvidenceLinks(repair.description) || '—'}</span>
              <EvidenceLinks text={repair.description} />
            </TableCell>
            <TableCell>
              <Badge variant={repair.status === 'Đã xử lý' ? 'success' : repair.status === 'Từ chối' ? 'danger' : 'warning'}>
                {repair.status}
              </Badge>
            </TableCell>
            <TableCell>{repair.userName || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  // Helpers chuyển đổi định dạng ngày
  const formatDateToDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatDateToYYYYMMDD = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch { /* ignore error, fallback to dateStr */ }
    return dateStr;
  };

  const getTodayInputDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper chuyển đổi file sang Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Mở modal thêm/sửa/gia hạn tài liệu
  const handleOpenDocModal = (mode: 'add' | 'edit' | 'renew', doc?: DeviceDocument) => {
    setDocModalMode(mode);
    setSelectedFile(null);
    setDocumentId(doc?.documentId || '');

    if (mode === 'edit' && doc) {
      setDocType(doc.docType || '');
      setLicenseNo(doc.licenseNo || '');
      setIssuedDate(formatDateToYYYYMMDD(doc.issuedDate || ''));
      setExpiryDate(formatDateToYYYYMMDD(doc.expiryDate || ''));
      setPrepTime(doc.prepTime || '');
      setDocStatus(doc.status || 'Chưa gửi');
      setSentDate(formatDateToYYYYMMDD(doc.sentDate || ''));
      setResponsible(doc.responsible || '');
      setCollaborator(doc.collaborator || '');
      setDeptManager(doc.deptManager || '');
    } else if (mode === 'renew' && doc) {
      setDocType(doc.docType || 'Đăng kiểm');
      setLicenseNo('');
      setIssuedDate(getTodayInputDate());
      setExpiryDate('');
      setPrepTime(doc.prepTime || '');
      setDocStatus('Đã phê duyệt');
      setSentDate(formatDateToYYYYMMDD(doc.sentDate || ''));
      setResponsible(doc.responsible || '');
      setCollaborator(doc.collaborator || '');
      setDeptManager(doc.deptManager || '');
    } else {
      setDocumentId('');
      setDocType('');
      setLicenseNo('');
      setIssuedDate('');
      setExpiryDate('');
      setPrepTime('');
      setDocStatus('Chưa gửi');
      setSentDate('');
      setResponsible('');
      setCollaborator('');
      setDeptManager('');
    }
    setShowDocModal(true);
  };

  // Submit tài liệu (lưu & upload)
  const handleSubmitDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    if (!docType.trim()) {
      alert('Vui lòng chọn hoặc nhập Loại tài liệu.');
      return;
    }
    if (docModalMode === 'add') {
      const duplicateActiveDocument = (device.documents || []).find(doc => (
        !isArchivedDocumentStatus(doc.status)
        && doc.docType.trim().localeCompare(docType.trim(), 'vi', { sensitivity: 'base' }) === 0
      ));
      if (duplicateActiveDocument) {
        const suggestedAction = isRegistrationDocumentType(duplicateActiveDocument.docType)
          ? '“Gia hạn đăng kiểm” hoặc “Sửa”'
          : '“Sửa”';
        alert(`Loại tài liệu này đã tồn tại. Vui lòng dùng nút ${suggestedAction} trên hồ sơ hiện tại.`);
        return;
      }
    }
    if (docModalMode === 'renew' && !expiryDate) {
      alert('Vui lòng nhập hạn đăng kiểm mới.');
      return;
    }

    setIsUploading(true);
    try {
      let fileContent = '';
      let fileName = '';
      let mimeType = '';

      if (selectedFile) {
        if (selectedFile.size > 10 * 1024 * 1024) {
          alert('Kích thước file quá lớn (tối đa 10MB).');
          setIsUploading(false);
          return;
        }
        fileContent = await fileToBase64(selectedFile);
        fileName = selectedFile.name;
        mimeType = selectedFile.type;
      }

      const documentPayload = {
        serial: device.id,
        documentId: docModalMode === 'add' ? undefined : documentId || undefined,
        docType: docType.trim(),
        licenseNo: licenseNo.trim(),
        issuedDate: formatDateToDDMMYYYY(issuedDate),
        expiryDate: formatDateToDDMMYYYY(expiryDate),
        prepTime: prepTime.trim(),
        status: docStatus,
        sentDate: formatDateToDDMMYYYY(sentDate),
        responsible: responsible.trim(),
        collaborator: collaborator.trim(),
        deptManager: deptManager.trim(),
        fileContent,
        fileName,
        mimeType,
      };
      const res = docModalMode === 'renew'
        ? await renewDocument({ ...documentPayload, expiryDate: documentPayload.expiryDate })
        : await addDocument(documentPayload);

      alert((res.success ? '✅ ' : '❌ ') + (res.message || 'Có lỗi xảy ra.'));
      if (res.success) {
        await refetchDevices();
        setShowDocModal(false);
        setSelectedFile(null);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Đã xảy ra lỗi trong quá trình lưu tài liệu.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleMarkDocumentSent = async (doc: DeviceDocument) => {
    if (!device) return;
    const updateKey = doc.documentId || `${device.id}-${doc.docType}`;
    const today = formatDateToDDMMYYYY(getTodayInputDate());
    setUpdatingDocumentId(updateKey);
    try {
      const res = await markDocumentSent(device.id, doc.docType, today, doc.documentId);
      alert((res.success ? '✅ ' : '❌ ') + (res.message || 'Có lỗi xảy ra.'));
      if (res.success) await refetchDevices();
    } catch (err) {
      console.error(err);
      alert('❌ Không thể cập nhật trạng thái gửi đăng kiểm.');
    } finally {
      setUpdatingDocumentId(null);
    }
  };

  const documentsTab = (() => {
    const docs = [...(device?.documents || [])].sort((a, b) => (
      Number(isArchivedDocumentStatus(a.status)) - Number(isArchivedDocumentStatus(b.status))
    ));
    const currentRegistrationDoc = docs.find(doc => (
      !isArchivedDocumentStatus(doc.status) && isRegistrationDocumentType(doc.docType)
    ));
    const currentRegistrationKey = currentRegistrationDoc
      ? currentRegistrationDoc.documentId || `${device?.id || ''}-${currentRegistrationDoc.docType}`
      : '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isAuthenticated && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => handleOpenDocModal('add')}
            >
              Thêm tài liệu mới
            </Button>
          </div>
        )}

        {currentRegistrationDoc && (
          <section className="registration-status-panel" aria-label="Trạng thái gửi đăng kiểm hiện tại" aria-live="polite">
            <div className="registration-status-copy">
              <span className="registration-status-eyebrow">Hồ sơ đăng kiểm hiện tại</span>
              <div className="registration-status-title-row">
                <strong>{currentRegistrationDoc.status || 'Chưa gửi'}</strong>
                <Badge variant={currentRegistrationDoc.status === 'Đã gửi' || currentRegistrationDoc.status === 'Đã phê duyệt' ? 'success' : currentRegistrationDoc.status === 'Đang xử lý' ? 'warning' : 'neutral'}>
                  {currentRegistrationDoc.docType}
                </Badge>
              </div>
              <span>
                Ngày gửi: <strong>{currentRegistrationDoc.sentDate || 'Chưa ghi nhận'}</strong>
                {' · '}Hạn hiện tại: <strong>{currentRegistrationDoc.expiryDate || 'Chưa có'}</strong>
              </span>
            </div>
            {isAuthenticated && (
              <div className="registration-status-actions">
                {currentRegistrationDoc.status !== 'Đã gửi' && currentRegistrationDoc.status !== 'Đang xử lý' && currentRegistrationDoc.status !== 'Đã phê duyệt' && (
                  <Button
                    variant="success"
                    size="sm"
                    icon={<Send size={14} />}
                    disabled={updatingDocumentId === currentRegistrationKey}
                    onClick={() => void handleMarkDocumentSent(currentRegistrationDoc)}
                  >
                    {updatingDocumentId === currentRegistrationKey ? 'Đang lưu...' : 'Đánh dấu đã gửi'}
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CalendarPlus size={14} />}
                  onClick={() => handleOpenDocModal('renew', currentRegistrationDoc)}
                >
                  Gia hạn đăng kiểm
                </Button>
              </div>
            )}
          </section>
        )}
        
        {docs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <FileText size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p>Thiết bị này chưa có tài liệu kiểm định / đăng kiểm nào.</p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Loại tài liệu</TableHeader>
                <TableHeader>Số văn bản</TableHeader>
                <TableHeader>Ngày cấp</TableHeader>
                <TableHeader>Hạn hiệu lực</TableHeader>
                <TableHeader>Thời gian chuẩn bị</TableHeader>
                <TableHeader>Trạng thái</TableHeader>
                <TableHeader>Ngày gửi đăng kiểm</TableHeader>
                <TableHeader>Người chịu TN</TableHeader>
                <TableHeader>File đính kèm</TableHeader>
                {isAuthenticated && <TableHeader style={{ textAlign: 'right' }}>Thao tác</TableHeader>}
              </TableRow>
            </TableHead>
            <TableBody>
              {docs.map((doc, idx) => {
                const days = doc.daysUntilExpiry;
                const archived = isArchivedDocumentStatus(doc.status);
                const registrationDocument = isRegistrationDocumentType(doc.docType);
                const updateKey = doc.documentId || `${device?.id || ''}-${doc.docType}`;
                let badgeVariant: BadgeVariant = 'neutral';
                let daysText = '';
                if (days !== null) {
                  if (days < 0) { badgeVariant = 'danger'; daysText = `Quá hạn ${Math.abs(days)} ngày`; }
                  else if (days <= 7) { badgeVariant = 'danger'; daysText = `Còn ${days} ngày`; }
                  else if (days <= 30) { badgeVariant = 'warning'; daysText = `Còn ${days} ngày`; }
                  else { badgeVariant = 'success'; daysText = `Còn ${days} ngày`; }
                }
                return (
                  <TableRow key={doc.documentId || `${doc.docType}-${idx}`}>
                    <TableCell><strong>{doc.docType || '—'}</strong></TableCell>
                    <TableCell>{doc.licenseNo || '—'}</TableCell>
                    <TableCell>{doc.issuedDate || '—'}</TableCell>
                    <TableCell>
                      {doc.expiryDate || '—'}
                      {daysText && <div><Badge variant={badgeVariant}>{daysText}</Badge></div>}
                    </TableCell>
                    <TableCell>{doc.prepTime ? `${doc.prepTime} ngày` : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={doc.status === 'Đã gửi' || doc.status === 'Đã phê duyệt' ? 'success' : doc.status === 'Đang xử lý' ? 'warning' : 'neutral'}>
                        {doc.status || 'Chưa gửi'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.sentDate ? (
                        <span style={{ whiteSpace: 'nowrap', fontWeight: 650 }}>{doc.sentDate}</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Chưa ghi nhận</span>
                      )}
                    </TableCell>
                    <TableCell>{doc.responsible || '—'}</TableCell>
                    <TableCell>
                      {doc.fileUrl ? (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="file-link"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          <Eye size={14} />
                          Xem file
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Không có file</span>
                      )}
                    </TableCell>
                    {isAuthenticated && (
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                          {!archived && registrationDocument && doc.status !== 'Đã gửi' && doc.status !== 'Đang xử lý' && doc.status !== 'Đã phê duyệt' && (
                            <Button
                              variant="success"
                              size="sm"
                              icon={<Send size={12} />}
                              disabled={updatingDocumentId === updateKey}
                              onClick={() => void handleMarkDocumentSent(doc)}
                            >
                              {updatingDocumentId === updateKey ? 'Đang lưu...' : 'Đánh dấu đã gửi'}
                            </Button>
                          )}
                          {!archived && registrationDocument && (
                            <Button
                              variant="primary"
                              size="sm"
                              icon={<CalendarPlus size={12} />}
                              onClick={() => handleOpenDocModal('renew', doc)}
                            >
                              Gia hạn đăng kiểm
                            </Button>
                          )}
                          {!archived && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Edit size={12} />}
                              onClick={() => handleOpenDocModal('edit', doc)}
                            >
                              Sửa
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    );
  })();

  const tabsData = [
    { id: 'general', label: 'Thông tin chung', content: generalInfoTab },
    { id: 'movement', label: 'Lịch sử luân chuyển', content: movementHistoryTab },
    { id: 'maintenance', label: 'Sửa chữa & Bảo dưỡng', content: maintenanceHistoryTab },
    { id: 'docs', label: `Tài liệu kiểm định (${device?.documents?.length || 0})`, content: documentsTab },
  ];

  return (
    <div className="device-profile-page">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />} onClick={() => navigate('/devices')}>Quay lại</Button>
      </div>

      <Card>
        <CardBody>
          {isDevicesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Đang tải thông tin thiết bị...</div>
          ) : devicesError ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--danger)' }} role="alert">
              <p>Không tải được thông tin thiết bị: {devicesError.message}</p>
              <Button variant="secondary" onClick={() => void refetchDevices()}>Thử lại</Button>
            </div>
          ) : !device ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--danger)' }}>
              Không tìm thấy thiết bị với mã: <strong>{id}</strong>
            </div>
          ) : (
            <>
              <div className="profile-header">
                <div className="device-main-info">
                  <div className="qr-code-box">
                    <QRCodeSVG
                      value={`${window.location.origin}${import.meta.env.BASE_URL}devices/${encodeURIComponent(device.id)}`}
                      size={160}
                      level="M"
                      includeMargin
                    />
                  </div>
                  <div className="device-details">
                    <h1>{device.name}</h1>
                    <div className="device-id">{device.id}</div>
                    <div>
                      {profileStatus && (
                        <Badge variant={profileStatus.badgeVariant}>
                          {profileStatus.sheetStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="action-buttons">
                  <Button variant="danger" icon={<AlertTriangle size={18} />} onClick={handleReportBroken}>Báo hỏng</Button>
                  <Button variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setShowTransferModal(true)}>Điều chuyển khoa</Button>
                </div>
              </div>

              <div style={{ marginTop: '32px' }}>
                <Tabs
                  tabs={tabsData}
                  defaultTab="general"
                  activeTab={activeProfileTab}
                  onTabChange={setActiveProfileTab}
                />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Modal điều chuyển khoa */}
      {showTransferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>🔄 Yêu cầu điều chuyển thiết bị</h2>
              <button onClick={() => setShowTransferModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Thiết bị: <strong>{device?.name}</strong> ({device?.id})</p>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem' }}>Khoa/phòng đích *</label>
                <input value={newDept} onChange={e => setNewDept(e.target.value)} placeholder="VD: Khoa Phẫu thuật"
                  list="profile-transfer-depts"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }} />
                <datalist id="profile-transfer-depts">
                  {departments.filter(dept => dept !== device?.department).map(dept => <option key={dept} value={dept} />)}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem' }}>Ghi chú</label>
                <textarea value={transferNote} onChange={e => setTransferNote(e.target.value)} rows={3} placeholder="Lý do điều chuyển..."
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Hủy</Button>
                <Button variant="primary" icon={<Save size={16} />} onClick={handleTransfer}>Ghi nhận điều chuyển</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal thêm/sửa tài liệu */}
      {showDocModal && (
        <Modal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          title={docModalMode === 'add'
            ? '📄 Thêm tài liệu kiểm định mới'
            : docModalMode === 'renew'
              ? '📅 Gia hạn đăng kiểm'
              : '📝 Sửa thông tin tài liệu'}
          size="lg"
        >
          <form onSubmit={handleSubmitDoc}>
            {docModalMode === 'renew' && (
              <div
                role="note"
                style={{ marginBottom: '16px', padding: '12px 14px', border: '1px solid #99f6e4', borderRadius: '8px', background: '#f0fdfa', color: '#115e59', lineHeight: 1.5 }}
              >
                Nhập số đăng kiểm và hạn mới. Hồ sơ hiện tại sẽ được giữ lại trong lịch sử với trạng thái “Đã gia hạn”.
              </div>
            )}
            <div className="document-form-grid">
              <div>
                <label htmlFor="document-type" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loại tài liệu *</label>
                <input 
                  id="document-type"
                  type="text" 
                  value={docType} 
                  onChange={e => setDocType(e.target.value)} 
                  disabled={docModalMode !== 'add'}
                  placeholder="VD: Kiểm định, Hiệu chuẩn..."
                  required
                  list="doc-types-list"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
                <datalist id="doc-types-list">
                  <option value="Đăng kiểm" />
                  <option value="Kiểm định" />
                  <option value="Hiệu chuẩn" />
                  <option value="Kiểm tra định kỳ" />
                  <option value="Bảo dưỡng định kỳ" />
                </datalist>
              </div>
              <div>
                <label htmlFor="document-license-number" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Số văn bản / số đăng kiểm</label>
                <input 
                  id="document-license-number"
                  type="text" 
                  value={licenseNo} 
                  onChange={e => setLicenseNo(e.target.value)} 
                  placeholder="VD: KD-12345"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="document-issued-date" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ngày cấp / ngày đăng kiểm</label>
                <input 
                  id="document-issued-date"
                  type="date" 
                  value={issuedDate} 
                  onChange={e => setIssuedDate(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="document-expiry-date" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hạn đăng kiểm / hạn hiệu lực {docModalMode === 'renew' ? '*' : ''}</label>
                <input 
                  id="document-expiry-date"
                  type="date" 
                  value={expiryDate} 
                  onChange={e => setExpiryDate(e.target.value)} 
                  required={docModalMode === 'renew'}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="document-preparation-days" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Thời gian chuẩn bị hồ sơ (ngày)</label>
                <input 
                  id="document-preparation-days"
                  type="number" 
                  value={prepTime} 
                  onChange={e => setPrepTime(e.target.value)} 
                  placeholder="VD: 30"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="document-status" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Trạng thái hồ sơ</label>
                <select 
                  id="document-status"
                  value={docStatus} 
                  onChange={e => {
                    const nextStatus = e.target.value;
                    setDocStatus(nextStatus);
                    if (nextStatus === 'Đã gửi' && !sentDate) setSentDate(getTodayInputDate());
                  }}
                  disabled={docModalMode === 'renew'}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text-primary)' }}
                >
                  <option value="Chưa gửi">Chưa gửi</option>
                  <option value="Đang xử lý">Đang xử lý</option>
                  <option value="Đã gửi">Đã gửi</option>
                  <option value="Đã phê duyệt">Đã phê duyệt</option>
                </select>
              </div>
              <div>
                <label htmlFor="document-sent-date" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ngày gửi đăng kiểm</label>
                <input
                  id="document-sent-date"
                  type="date"
                  value={sentDate}
                  onChange={e => setSentDate(e.target.value)}
                  aria-describedby="document-sent-date-help"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
                <small id="document-sent-date-help" style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                  Tự động điền khi bấm “Đánh dấu đã gửi”.
                </small>
              </div>
              <div>
                <label htmlFor="document-responsible" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Người chịu trách nhiệm</label>
                <input 
                  id="document-responsible"
                  type="text" 
                  value={responsible} 
                  onChange={e => setResponsible(e.target.value)} 
                  placeholder="VD: Nguyễn Văn A"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="document-collaborator" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Phối hợp thực hiện</label>
                <input 
                  id="document-collaborator"
                  type="text" 
                  value={collaborator} 
                  onChange={e => setCollaborator(e.target.value)} 
                  placeholder="VD: Trần Thị B"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="document-department-manager" style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Giao quản lý tại khoa</label>
                <input 
                  id="document-department-manager"
                  type="text" 
                  value={deptManager} 
                  onChange={e => setDeptManager(e.target.value)} 
                  placeholder="VD: Khoa Cấp cứu"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                <FileUploader
                  files={selectedFile ? [selectedFile] : []}
                  onFilesChange={files => setSelectedFile(files[0] || null)}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  maxSizeMB={10}
                  maxTotalSizeMB={10}
                  maxFiles={1}
                  label={docModalMode === 'edit'
                    ? 'Thay thế file tài liệu (để trống nếu giữ nguyên file cũ)'
                    : docModalMode === 'renew'
                      ? 'File chứng nhận đăng kiểm mới'
                      : 'File tài liệu đính kèm'}
                  helperText="Hỗ trợ PDF, Word, Excel, JPG và PNG"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <Button variant="secondary" type="button" onClick={() => setShowDocModal(false)}>Hủy</Button>
              <Button variant="primary" type="submit" icon={docModalMode === 'renew' ? <CalendarPlus size={16} /> : <Save size={16} />}>
                {docModalMode === 'renew' ? 'Xác nhận gia hạn' : 'Lưu tài liệu'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Loading Overlay cho upload */}
      {isUploading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          color: 'white',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: 'white',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ fontWeight: '700', fontSize: '1.1rem', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
            Đang lưu thông tin và tải tài liệu lên Google Drive...
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
            Vui lòng không đóng hoặc tải lại trang web.
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceProfile;
