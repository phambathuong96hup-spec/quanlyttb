import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { CheckCircle, Download, FileText, Loader2, RefreshCw, Repeat2, Send, XCircle, X, Camera, Search } from 'lucide-react';
import { Card, CardBody, Button, Input, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Badge, useToast, FileUploader, Modal } from '../components/ui';
import { matchSmartSearch, removeVietnameseTones } from '../utils/stringUtils';
import {
  createTransfer,
  receiveTransfer,
  rejectTransfer,
  cancelTransfer,
  type TransferData,
} from '../services/api';
import { useDevices } from '../hooks/useDevices';
import { useTransfers } from '../hooks/useTransfers';
import { useAuth } from '../authContext';
import { exportCsv } from '../utils/exportCsv';
import { getAssignableDepartments } from '../utils/departmentUtils';
import { stripEvidenceLinks } from '../utils/evidenceUtils';
import { EvidenceLinks } from '../components/EvidenceLinks';
import { Html5Qrcode } from 'html5-qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Transfers.css';

import { transferStatusText, getTransferStatusVariant } from '../utils/statusUtils';

interface TransfersProps {
  defaultTab?: 'create' | 'requests' | 'history';
}

const Transfers: React.FC<TransfersProps> = ({ defaultTab = 'requests' }) => {
  const { devices, isLoading: isDevicesLoading, refetch: refetchDevices } = useDevices();
  const { transfers, isLoading: isTransfersLoading, refetch: refetchTransfers } = useTransfers();
  const isLoading = isDevicesLoading || isTransfersLoading;
  
  const reversedTransfers = useMemo(() => [...transfers].reverse(), [transfers]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'requests' | 'history'>(defaultTab);
  const [transferType, setTransferType] = useState<'Cho mượn' | 'Mượn' | 'Trả'>('Cho mượn');
  const [deviceId, setDeviceId] = useState('');
  const [toDepartment, setToDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner-region';

  // File states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Receive Modal states
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [pendingReceiveTransfer, setPendingReceiveTransfer] = useState<TransferData | null>(null);
  const [receiveFile, setReceiveFile] = useState<File | null>(null);
  const [receiveNote, setReceiveNote] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Smart Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { username, department: userDepartment, name: userName, isAdmin } = useAuth();
  const toast = useToast();

  const loadData = useCallback(async () => {
    await Promise.all([refetchDevices(), refetchTransfers()]);
  }, [refetchDevices, refetchTransfers]);

  useEffect(() => {
    setDeviceId(current => {
      if (current || devices.length === 0) return current;
      const first = devices.find(d => isAdmin || d.department === userDepartment) || devices[0];
      return first.id;
    });
  }, [devices, isAdmin, userDepartment]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setDeptFilter('all');
    setTypeFilter('all');
  }, [activeTab]);

  const departments = useMemo(() => {
    return Array.from(new Set(devices.map(d => d.department).filter(Boolean))).sort();
  }, [devices]);

  // ===== QR Scanner Logic =====
  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === 2 /* SCANNING */) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch { /* ignore */ }
  }, []);

  const transferableDevices = useMemo(() => {
    // Show all devices — backend validates ownership/permission on submit
    return devices;
  }, [devices]);

  const startScanner = useCallback(async () => {
    setScanResult('');
    setShowScanner(true);
    // Wait for DOM element to render
    await new Promise(r => setTimeout(r, 350));
    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Found a code — match to device
          const cleanCode = decodedText.trim().toLowerCase();
          const found = transferableDevices.find(d =>
            d.id.toLowerCase() === cleanCode ||
            d.id.toLowerCase().includes(cleanCode) ||
            (d.serial && String(d.serial).toLowerCase().includes(cleanCode))
          );
          if (found) {
            setDeviceId(found.id);
            setScanResult(`✅ Đã tìm thấy: ${found.id} - ${found.name}`);
          } else {
            setScanResult(`⚠️ Không tìm thấy thiết bị với mã: ${decodedText}`);
          }
          // Stop after first successful read
          html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
          scannerRef.current = null;
          setTimeout(() => setShowScanner(false), 1500);
        },
        () => { /* ignore scan failures (no code in frame) */ }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setScanResult(`❌ Không thể mở camera: ${message}`);
      setTimeout(() => setShowScanner(false), 2500);
    }
  }, [transferableDevices]);

  const closeScanner = useCallback(async () => {
    await stopScanner();
    setShowScanner(false);
    setScanResult('');
  }, [stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);
  // ===== End QR Scanner =====

  const pendingRequests = reversedTransfers.filter(t => t.status === 'PENDING_RECEIVE' && (isAdmin || t.toDepartment === userDepartment || t.requestedBy === username || t.fromDepartment === userDepartment));

  const filteredTransfers = useMemo(() => {
    let list = activeTab === 'requests' ? pendingRequests : reversedTransfers;
    
    // 1. Smart Search (multi-keyword, diacritics-insensitive matching ID, name, note, status, requester)
    if (searchQuery.trim() !== '') {
      list = list.filter(t => matchSmartSearch(t as unknown as Record<string, unknown>, ['transferId', 'deviceId', 'deviceName', 'requestedBy', 'requestedByName', 'requestedNote', 'receivedByName', 'receivedNote', 'rejectReason'], searchQuery));
    }
    
    // 2. Status filter
    if (statusFilter !== 'all') {
      list = list.filter(t => t.status === statusFilter);
    }
    
    // 3. Department filter
    if (deptFilter !== 'all') {
      list = list.filter(t => t.fromDepartment === deptFilter || t.toDepartment === deptFilter);
    }

    // 4. Type filter (extract type from note like `[Cho mượn]`, `[Mượn]`, `[Trả]`)
    if (typeFilter !== 'all') {
      list = list.filter(t => {
        const note = String(t.requestedNote || '').toLowerCase();
        if (typeFilter === 'Cho mượn') return note.includes('[cho mượn]');
        if (typeFilter === 'Mượn') return note.includes('[mượn]');
        if (typeFilter === 'Trả') return note.includes('[trả]');
        return true;
      });
    }
    
    return list;
  }, [activeTab, pendingRequests, reversedTransfers, searchQuery, statusFilter, deptFilter, typeFilter]);

  const visibleTransfers = filteredTransfers;

  const selectedDevice = devices.find(device => device.id === deviceId);
  const availableDepartments = useMemo(() => {
    return getAssignableDepartments(departments).filter(dept => dept !== selectedDevice?.department);
  }, [departments, selectedDevice?.department]);
  const departmentSuggestions = useMemo(() => {
    const query = removeVietnameseTones(toDepartment.trim().toLowerCase());
    const matches = query
      ? availableDepartments.filter(dept => removeVietnameseTones(dept.toLowerCase()).includes(query))
      : availableDepartments;
    return matches.slice(0, 8);
  }, [availableDepartments, toDepartment]);

  useEffect(() => {
    if (transferType === 'Trả' && selectedDevice?.department) {
      setToDepartment(selectedDevice.department);
    }
  }, [transferType, selectedDevice]);

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    const actualToDepartment = transferType === 'Mượn' ? userDepartment : toDepartment;
    
    if (!deviceId || !actualToDepartment) {
      setMessage('Vui lòng điền đầy đủ thông tin thiết bị và khoa nhận.');
      return;
    }
    setIsSaving(true);
    
    let imageContent = '';
    let imageName = '';
    let imageMimeType = '';

    if (selectedFile) {
      try {
        imageContent = await readFileAsBase64(selectedFile);
        imageName = selectedFile.name;
        imageMimeType = selectedFile.type;
      } catch {
        toast.error('Lỗi khi đọc file đính kèm.');
        setIsSaving(false);
        return;
      }
    }
    
    const finalReason = `[${transferType}] ${reason}`;
    const response = await createTransfer({ 
      deviceId, 
      toDepartment: actualToDepartment, 
      reason: finalReason, 
      actorUsername: username,
      imageContent,
      imageName,
      imageMimeType
    });
    setIsSaving(false);
    setMessage(response.message || '');
    if (response.success) {
      setReason('');
      setSelectedFile(null);
      if (transferType === 'Cho mượn' || transferType === 'Trả') setToDepartment('');
      await loadData();
      setActiveTab('requests');
    }
  };

  const handleReceiveClick = (transfer: TransferData) => {
    setPendingReceiveTransfer(transfer);
    setReceiveNote('');
    setReceiveFile(null);
    setIsReceiveModalOpen(true);
  };

  const executeReceive = async () => {
    if (!pendingReceiveTransfer) return;
    setIsReceiving(true);
    
    let imageContent = '';
    let imageName = '';
    let imageMimeType = '';

    if (receiveFile) {
      try {
        imageContent = await readFileAsBase64(receiveFile);
        imageName = receiveFile.name;
        imageMimeType = receiveFile.type;
      } catch {
        toast.error('Lỗi khi đọc file đính kèm.');
        setIsReceiving(false);
        return;
      }
    }
    
    const response = await receiveTransfer({ 
      transferId: pendingReceiveTransfer.transferId, 
      actorUsername: username, 
      note: receiveNote,
      imageContent,
      imageName,
      imageMimeType
    });
    
    setIsReceiving(false);
    setIsReceiveModalOpen(false);
    setPendingReceiveTransfer(null);
    setReceiveFile(null);
    
    toast.info(response.message || (response.success ? 'Đã nhận.' : 'Có lỗi xảy ra.'));
    await loadData();
  };

  const handleReject = async (transfer: TransferData) => {
    // TODO: Consider replacing window.prompt with a custom Modal for better mobile UX
    const reasonText = window.prompt('Lý do từ chối tiếp nhận thiết bị:') || '';
    if (!reasonText.trim()) return;
    const response = await rejectTransfer({ transferId: transfer.transferId, actorUsername: username, reason: reasonText });
    toast.info(response.message || (response.success ? 'Đã từ chối.' : 'Có lỗi xảy ra.'));
    await loadData();
  };

  const handleCancel = async (transfer: TransferData) => {
    // TODO: Consider replacing window.confirm with a custom Modal for better mobile UX
    if (!window.confirm('Bạn có chắc chắn muốn thu hồi yêu cầu chuyển giao này?')) return;
    const response = await cancelTransfer({ transferId: transfer.transferId, actorUsername: username, reason: 'Người tạo yêu cầu hủy' });
    toast.info(response.message || (response.success ? 'Đã hủy.' : 'Có lỗi xảy ra.'));
    await loadData();
  };

  const handleReturnDevice = async (transfer: TransferData) => {
    if (!window.confirm(`Bạn muốn hoàn trả thiết bị ${transfer.deviceName || transfer.deviceId} về khoa ${transfer.fromDepartment}?`)) return;
    
    const response = await createTransfer({ 
      deviceId: transfer.deviceId, 
      toDepartment: transfer.fromDepartment, 
      reason: `[Hoàn trả] Hoàn trả thiết bị từ phiếu ${transfer.transferId}`, 
      actorUsername: username,
      imageContent: '',
      imageName: '',
      imageMimeType: ''
    });

    if (response.success) {
      toast.success('Đã tạo phiếu hoàn trả thành công!');
      await loadData();
      setActiveTab('requests');
    } else {
      toast.error(response.message || 'Lỗi khi tạo phiếu hoàn trả');
    }
  };

  const exportRows = visibleTransfers.map((t, index) => ({
    STT: index + 1,
    'Mã yêu cầu': t.transferId,
    'Thời gian tạo': t.createdAt,
    'Mã thiết bị': t.deviceId,
    'Tên thiết bị': t.deviceName,
    'Từ khoa/phòng': t.fromDepartment,
    'Đến khoa/phòng': t.toDepartment,
    'Trạng thái': transferStatusText[t.status] || t.status,
    'Người chuyển': t.requestedByName,
    'Người nhận': t.receivedByName,
    'Lý do/Ghi chú': t.requestedNote || t.receivedNote || t.rejectReason,
  }));

  const exportCsvFile = () => {
    if (exportRows.length === 0) { toast.warning('Không có dữ liệu để xuất.'); return; }
    exportCsv(exportRows, `LuanChuyenThietBi_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('BAO CAO LUAN CHUYEN THIET BI', 148, 18, { align: 'center' });
    autoTable(doc, {
      startY: 28,
      head: [['STT', 'Ma YC', 'Ma TB', 'Ten thiet bi', 'Tu khoa', 'Den khoa', 'Trang thai', 'Nguoi chuyen', 'Nguoi nhan']],
      body: exportRows.map(row => [
        row.STT,
        row['Mã yêu cầu'],
        row['Mã thiết bị'],
        row['Tên thiết bị'],
        row['Từ khoa/phòng'],
        row['Đến khoa/phòng'],
        row['Trạng thái'],
        row['Người chuyển'],
        row['Người nhận'],
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    });
    doc.save(`LuanChuyenThietBi_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="transfers-page request-workspace request-workspace-transfer">
      <div className="page-header request-section-header">
        <div>
          <h1 className="page-title request-section-title">
            <span className="request-title-icon" aria-hidden="true">
              <Repeat2 size={22} />
            </span>
            Luân chuyển trang thiết bị
          </h1>
          <p className="dashboard-subtitle">
            Khoa đang giữ thiết bị tạo yêu cầu, khoa nhận xác nhận trước khi cập nhật vị trí thiết bị.
          </p>
        </div>
        <div className="action-buttons request-actions">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={loadData}>Làm mới</Button>
          <Button variant="secondary" icon={<FileText size={16} />} onClick={exportPdf}>PDF</Button>
          <Button variant="primary" icon={<Download size={16} />} onClick={exportCsvFile}>CSV</Button>
        </div>
      </div>

      <div className="reports-tabs-container request-subtabs">
        <button className={`report-main-tab request-subtab ${activeTab === 'create' ? 'active' : ''}`} onClick={() => setActiveTab('create')}>Tạo yêu cầu</button>
        <button className={`report-main-tab request-subtab ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>Tiếp nhận yêu cầu ({pendingRequests.length})</button>
        <button className={`report-main-tab request-subtab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Lịch sử</button>
      </div>

      {activeTab === 'create' ? (
        <Card className="request-card request-card-transfer">
          <CardBody className="request-card-body">
            <div className="transfer-summary request-summary request-summary-transfer">
              <div className="transfer-summary-icon request-summary-icon">
                <Repeat2 size={28} style={{ color: 'white' }} />
              </div>
              <div className="transfer-summary-info request-summary-content">
                <h3>Luân chuyển / Mượn thiết bị</h3>
                <p>Tạo yêu cầu chuyển thiết bị giữa các khoa phòng.</p>
              </div>
            </div>

            <form className="form-section request-form" onSubmit={submitTransfer}>
              <div className="request-field">
                <label className="input-label">Loại yêu cầu</label>
                <select className="filter-select request-select" style={{ marginBottom: '8px' }} value={transferType} onChange={e => {
                  setTransferType(e.target.value as 'Cho mượn' | 'Mượn' | 'Trả');
                  setToDepartment('');
                }}>
                  <option value="Cho mượn">Cho mượn / Luân chuyển đi</option>
                  <option value="Mượn">Mượn thiết bị từ khoa khác</option>
                  <option value="Trả">Trả thiết bị về khoa cũ</option>
                </select>
              </div>
              <div className="request-field">
                <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Thiết bị
                  <Button className="request-qr-button" variant="secondary" size="sm" type="button" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={startScanner}>
                    <Camera size={14} style={{ marginRight: '4px' }} /> Quét QR/Barcode
                  </Button>
                </label>

                {/* ===== QR Scanner Modal ===== */}
                {showScanner && (
                  <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} onClick={closeScanner}>
                    <div style={{
                      background: 'var(--surface, #fff)', borderRadius: '16px', padding: '20px',
                      width: '90%', maxWidth: '420px', position: 'relative',
                    }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <strong style={{ fontSize: '1.05rem' }}>📷 Quét mã QR / barcode</strong>
                        <button onClick={closeScanner} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                          <X size={20} />
                        </button>
                      </div>
                      <div id={scannerContainerId} style={{ width: '100%', minHeight: '280px', borderRadius: '8px', overflow: 'hidden' }} />
                      {scanResult && (
                        <div style={{
                          marginTop: '12px', padding: '10px', borderRadius: '8px',
                          background: scanResult.startsWith('✅') ? '#d1fae5' : scanResult.startsWith('⚠') ? '#fef3c7' : '#fee2e2',
                          fontWeight: 600, textAlign: 'center', fontSize: '0.9rem',
                        }}>
                          {scanResult}
                        </div>
                      )}
                      <p style={{ textAlign: 'center', marginTop: '10px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        Hướng camera vào mã QR hoặc Barcode trên thiết bị
                      </p>
                    </div>
                  </div>
                )}
                {/* ===== End Scanner Modal ===== */}
                <select className="filter-select request-select" value={deviceId} onChange={e => setDeviceId(e.target.value)} required>
                  <option value="" disabled>-- Chọn thiết bị --</option>
                  {transferableDevices.map((device, index) => (
                    <option key={`${device.id}-${index}`} value={device.id}>{device.id} - {device.name}</option>
                  ))}
                </select>
              </div>
              <div className="info-grid request-info-grid">
                <div className="info-item"><span className="info-label">Vị trí thiết bị (các khoa chứa thiết bị)</span><span className="info-value">{selectedDevice?.department || '—'}</span></div>
                <div className="info-item"><span className="info-label">Người tạo yêu cầu</span><span className="info-value">{userName || username} ({userDepartment})</span></div>
              </div>
              <div className="request-field">
                <label className="input-label" htmlFor="transfer-to-department">{transferType === 'Cho mượn' || transferType === 'Trả' ? 'Khoa/phòng nhận' : 'Chuyển về khoa (Khoa của bạn)'}</label>
                {transferType === 'Trả' ? (
                  <Input id="transfer-to-department" value={toDepartment} readOnly disabled required style={{ backgroundColor: 'var(--surface-50)' }} />
                ) : transferType === 'Cho mượn' ? (
                  <div className="transfer-department-picker">
                    <Input
                      id="transfer-to-department"
                      value={toDepartment}
                      onChange={e => setToDepartment(e.target.value)}
                      placeholder="Nhập hoặc chọn khoa/phòng nhận"
                      aria-describedby="transfer-to-department-help"
                      required
                    />
                    <p id="transfer-to-department-help" className="request-field-hint">
                      Chọn gợi ý bên dưới hoặc nhập tên khoa/phòng mới.
                    </p>
                    {departmentSuggestions.length > 0 && (
                      <div className="transfer-department-options" aria-label="Gợi ý khoa/phòng nhận">
                        {departmentSuggestions.map(dept => (
                          <button
                            key={dept}
                            type="button"
                            className={`transfer-department-option ${toDepartment === dept ? 'active' : ''}`}
                            aria-pressed={toDepartment === dept}
                            onClick={() => setToDepartment(dept)}
                          >
                            {dept}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Input id="transfer-to-department" value={userDepartment} readOnly disabled required style={{ backgroundColor: 'var(--surface-50)' }} />
                )}
              </div>
              <div className="request-field">
                <label className="input-label">Lý do</label>
                <textarea className="input-field" value={reason} onChange={e => setReason(e.target.value)} placeholder="Lý do, tình trạng bàn giao, phụ kiện đi kèm..." />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <FileUploader 
                  selectedFile={selectedFile}
                  onFileSelect={setSelectedFile}
                  label="Ảnh minh chứng tình trạng bàn giao (tùy chọn)"
                  maxSizeMB={5}
                />
              </div>
              {message && (
                <div style={{
                  color: message.startsWith('Đã') ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 600,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: message.startsWith('Đã') ? 'var(--success-light)' : 'var(--danger-light)',
                }}>
                  {message}
                </div>
              )}
              <Button type="submit" variant="primary" className="submit-btn request-submit-btn" icon={isSaving ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} />} disabled={isSaving}>
                {isSaving ? 'Đang gửi...' : 'Gửi yêu cầu sang khoa nhận'}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="toolbar" style={{ padding: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
              <Input 
                placeholder="Tìm kiếm thiết bị, người chuyển, ghi chú..." 
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
                <option value="PENDING_RECEIVE">Chờ khoa nhận</option>
                <option value="COMPLETED">Đã nhận</option>
                <option value="REJECTED">Từ chối</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            )}
            <select 
              className="filter-select" 
              value={typeFilter} 
              onChange={e => setTypeFilter(e.target.value)}
              style={{ minWidth: '150px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}
            >
              <option value="all">Tất cả loại yêu cầu</option>
              <option value="Cho mượn">Cho mượn</option>
              <option value="Mượn">Mượn thiết bị</option>
              <option value="Trả">Trả thiết bị</option>
            </select>
            <select 
              className="filter-select" 
              value={deptFilter} 
              onChange={e => setDeptFilter(e.target.value)}
              style={{ minWidth: '180px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }}
            >
              <option value="all">Tất cả khoa/phòng</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            {(searchQuery || statusFilter !== 'all' || deptFilter !== 'all' || typeFilter !== 'all') && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setDeptFilter('all');
                  setTypeFilter('all');
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
                  <TableHeader>Yêu cầu</TableHeader>
                  <TableHeader>Thiết bị</TableHeader>
                  <TableHeader>Luân chuyển</TableHeader>
                  <TableHeader>Người chuyển</TableHeader>
                  <TableHeader>Trạng thái</TableHeader>
                  <TableHeader>Thao tác</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</TableCell></TableRow>
                ) : visibleTransfers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Không có dữ liệu.</TableCell></TableRow>
                ) : visibleTransfers.map(transfer => (
                  <TableRow key={transfer.transferId}>
                    <TableCell><strong>{transfer.transferId}</strong><br /><small>{transfer.createdAt || transfer.requestedAt}</small></TableCell>
                    <TableCell><strong>{transfer.deviceName || transfer.deviceId}</strong><br /><small>{transfer.deviceId}</small></TableCell>
                    <TableCell>{transfer.fromDepartment}<br /><strong>→ {transfer.toDepartment}</strong></TableCell>
                    <TableCell>
                      {transfer.requestedByName || transfer.requestedBy}
                      <br />
                      <small>{stripEvidenceLinks(transfer.requestedNote) || '—'}</small>
                      <EvidenceLinks text={[transfer.requestedNote, transfer.receivedNote].filter(Boolean).join('\n')} />
                    </TableCell>
                    <TableCell><Badge variant={getTransferStatusVariant(transfer.status)}>{transferStatusText[transfer.status] || transfer.status}</Badge></TableCell>
                    <TableCell>
                      {transfer.status === 'PENDING_RECEIVE' && (activeTab === 'requests' || isAdmin) ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {(isAdmin || transfer.toDepartment === userDepartment) && (
                            <Button size="sm" variant="success" icon={<CheckCircle size={14} />} onClick={() => handleReceiveClick(transfer)}>Nhận</Button>
                          )}
                          {(isAdmin || transfer.toDepartment === userDepartment) && (
                            <Button size="sm" variant="danger" icon={<XCircle size={14} />} onClick={() => handleReject(transfer)}>Từ chối</Button>
                          )}
                          {(isAdmin || transfer.requestedBy === username || transfer.fromDepartment === userDepartment) && (
                             <Button size="sm" variant="secondary" onClick={() => handleCancel(transfer)}>Hủy</Button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{transfer.receivedByName || transfer.rejectReason || '—'}</span>
                          {transfer.status === 'COMPLETED' && (isAdmin || transfer.toDepartment === userDepartment) && (
                            <Button size="sm" variant="primary" onClick={() => handleReturnDevice(transfer)}>Hoàn trả</Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <Modal 
        isOpen={isReceiveModalOpen} 
        onClose={() => { if (!isReceiving) setIsReceiveModalOpen(false); }}
        title="Xác nhận nhận thiết bị"
      >
        {pendingReceiveTransfer && (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0 }}>Xác nhận nhận thiết bị <strong>{pendingReceiveTransfer.deviceName || pendingReceiveTransfer.deviceId}</strong> từ khoa <strong>{pendingReceiveTransfer.fromDepartment}</strong>?</p>
            
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.85rem' }}>Ghi chú nhận (tùy chọn)</label>
              <textarea 
                className="input-field" 
                value={receiveNote} 
                onChange={e => setReceiveNote(e.target.value)} 
                placeholder="Tình trạng lúc nhận, phụ kiện..." 
                style={{ width: '100%' }}
              />
            </div>
            
            <FileUploader 
              selectedFile={receiveFile}
              onFileSelect={setReceiveFile}
              label="Ảnh minh chứng lúc nhận (tùy chọn)"
              maxSizeMB={5}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <Button variant="secondary" onClick={() => setIsReceiveModalOpen(false)} disabled={isReceiving}>Hủy</Button>
              <Button variant="success" onClick={executeReceive} disabled={isReceiving} icon={isReceiving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}>
                {isReceiving ? 'Đang xử lý...' : 'Xác nhận nhận'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Transfers;
