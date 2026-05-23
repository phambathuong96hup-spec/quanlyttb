import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, RefreshCw, FileText, X, Save, Plus, Eye, Edit } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardBody, Button, Badge, type BadgeVariant, Tabs, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Modal, FileUploader } from '../components/ui';
import { createTransfer, addDocument, type DeviceDocument } from '../services/api';
import { useDevices } from '../hooks/useDevices';
import { useTransfers } from '../hooks/useTransfers';
import { useRepairs } from '../hooks/useRepairs';
import { useAuth } from '../authContext';
import { resolveDeviceListStatus } from '../utils/deviceStatus';
import { stripEvidenceLinks } from '../utils/evidenceUtils';
import { EvidenceLinks } from '../components/EvidenceLinks';
import './Devices.css';

const DeviceProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, username, isAdmin } = useAuth();
  const { devices, isLoading: isDevicesLoading, refetch: refetchDevices } = useDevices();
  const { transfers: allTransfers, isLoading: isTransfersLoading, refetch: refetchTransfers } = useTransfers();
  const { repairs: allRepairs, isLoading: isRepairsLoading } = useRepairs();

  const isLoading = isDevicesLoading || isTransfersLoading || isRepairsLoading;
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

  // State quản lý tài liệu
  const [showDocModal, setShowDocModal] = useState(false);
  const [docModalMode, setDocModalMode] = useState<'add' | 'edit'>('add');
  const [isUploading, setIsUploading] = useState(false);
  
  // File upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Form tài liệu
  const [docType, setDocType] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [docStatus, setDocStatus] = useState('Chưa gửi');
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
        {transfers.length === 0 ? (
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
        {repairs.length === 0 ? (
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

  // Mở modal thêm/sửa tài liệu
  const handleOpenDocModal = (mode: 'add' | 'edit', doc?: DeviceDocument) => {
    setDocModalMode(mode);
    setSelectedFile(null);
    
    if (mode === 'edit' && doc) {
      setDocType(doc.docType || '');
      setLicenseNo(doc.licenseNo || '');
      setIssuedDate(formatDateToYYYYMMDD(doc.issuedDate || ''));
      setExpiryDate(formatDateToYYYYMMDD(doc.expiryDate || ''));
      setPrepTime(doc.prepTime || '');
      setDocStatus(doc.status || 'Chưa gửi');
      setResponsible(doc.responsible || '');
      setCollaborator(doc.collaborator || '');
      setDeptManager(doc.deptManager || '');
    } else {
      setDocType('');
      setLicenseNo('');
      setIssuedDate('');
      setExpiryDate('');
      setPrepTime('');
      setDocStatus('Chưa gửi');
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

      const res = await addDocument({
        serial: device.id,
        docType: docType.trim(),
        licenseNo: licenseNo.trim(),
        issuedDate: formatDateToDDMMYYYY(issuedDate),
        expiryDate: formatDateToDDMMYYYY(expiryDate),
        prepTime: prepTime.trim(),
        status: docStatus,
        responsible: responsible.trim(),
        collaborator: collaborator.trim(),
        deptManager: deptManager.trim(),
        fileContent,
        fileName,
        mimeType,
      });

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

  const documentsTab = (() => {
    const docs = device?.documents || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isAdmin && (
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
                <TableHeader>Người chịu TN</TableHeader>
                <TableHeader>File đính kèm</TableHeader>
                {isAdmin && <TableHeader style={{ textAlign: 'right' }}>Thao tác</TableHeader>}
              </TableRow>
            </TableHead>
            <TableBody>
              {docs.map((doc, idx) => {
                const days = doc.daysUntilExpiry;
                let badgeVariant: BadgeVariant = 'neutral';
                let daysText = '';
                if (days !== null) {
                  if (days < 0) { badgeVariant = 'danger'; daysText = `Quá hạn ${Math.abs(days)} ngày`; }
                  else if (days <= 7) { badgeVariant = 'danger'; daysText = `Còn ${days} ngày`; }
                  else if (days <= 30) { badgeVariant = 'warning'; daysText = `Còn ${days} ngày`; }
                  else { badgeVariant = 'success'; daysText = `Còn ${days} ngày`; }
                }
                return (
                  <TableRow key={idx}>
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
                    {isAdmin && (
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ padding: '4px 8px', minHeight: 'auto', height: '28px', fontSize: '0.8rem' }}
                            icon={<Edit size={12} />}
                            onClick={() => handleOpenDocModal('edit', doc)}
                          >
                            Sửa
                          </Button>
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
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Đang tải thông tin thiết bị...</div>
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
                <Tabs tabs={tabsData} defaultTab="general" />
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
          title={docModalMode === 'add' ? '📄 Thêm tài liệu kiểm định mới' : '📝 Sửa thông tin tài liệu'}
          size="lg"
        >
          <form onSubmit={handleSubmitDoc}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loại tài liệu *</label>
                <input 
                  type="text" 
                  value={docType} 
                  onChange={e => setDocType(e.target.value)} 
                  disabled={docModalMode === 'edit'}
                  placeholder="VD: Kiểm định, Hiệu chuẩn..."
                  required
                  list="doc-types-list"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
                <datalist id="doc-types-list">
                  <option value="Kiểm định" />
                  <option value="Hiệu chuẩn" />
                  <option value="Kiểm tra định kỳ" />
                  <option value="Bảo dưỡng định kỳ" />
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Số văn bản / số đăng kiểm</label>
                <input 
                  type="text" 
                  value={licenseNo} 
                  onChange={e => setLicenseNo(e.target.value)} 
                  placeholder="VD: KD-12345"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ngày cấp / ngày đăng kiểm</label>
                <input 
                  type="date" 
                  value={issuedDate} 
                  onChange={e => setIssuedDate(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hạn đăng kiểm / hạn hiệu lực</label>
                <input 
                  type="date" 
                  value={expiryDate} 
                  onChange={e => setExpiryDate(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Thời gian chuẩn bị hồ sơ (ngày)</label>
                <input 
                  type="number" 
                  value={prepTime} 
                  onChange={e => setPrepTime(e.target.value)} 
                  placeholder="VD: 30"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Trạng thái hồ sơ</label>
                <select 
                  value={docStatus} 
                  onChange={e => setDocStatus(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text-primary)' }}
                >
                  <option value="Chưa gửi">Chưa gửi</option>
                  <option value="Đang xử lý">Đang xử lý</option>
                  <option value="Đã gửi">Đã gửi</option>
                  <option value="Đã phê duyệt">Đã phê duyệt</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Người chịu trách nhiệm</label>
                <input 
                  type="text" 
                  value={responsible} 
                  onChange={e => setResponsible(e.target.value)} 
                  placeholder="VD: Nguyễn Văn A"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Phối hợp thực hiện</label>
                <input 
                  type="text" 
                  value={collaborator} 
                  onChange={e => setCollaborator(e.target.value)} 
                  placeholder="VD: Trần Thị B"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Giao quản lý tại khoa</label>
                <input 
                  type="text" 
                  value={deptManager} 
                  onChange={e => setDeptManager(e.target.value)} 
                  placeholder="VD: Khoa Cấp cứu"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                <FileUploader 
                  selectedFile={selectedFile}
                  onFileSelect={setSelectedFile}
                  label={docModalMode === 'edit' ? 'Thay thế file tài liệu (để trống nếu giữ nguyên file cũ)' : 'File tài liệu đính kèm'}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <Button variant="secondary" type="button" onClick={() => setShowDocModal(false)}>Hủy</Button>
              <Button variant="primary" type="submit" icon={<Save size={16} />}>Lưu tài liệu</Button>
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
