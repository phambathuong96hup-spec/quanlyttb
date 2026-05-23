import React, { useState, useMemo } from 'react';
import { approveRepair, createTransfer, type RepairData, type TransferData } from '../services/api';
import { useRepairs } from '../hooks/useRepairs';
import { useTransfers } from '../hooks/useTransfers';
import { Card, CardHeader, CardBody, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Badge, useToast, ConfirmDialog, Button } from '../components/ui';
import { CheckCircle, Clock, Search, Wrench, Activity, XCircle } from 'lucide-react';
import { useAuth } from '../authContext';
import {
  getRepairStatusVariant,
  isRepairCompleted,
  isRepairDone,
  isRepairRejected,
  normalizeRepairStatus,
  transferStatusText,
  getTransferStatusVariant,
} from '../utils/statusUtils';
import { stripEvidenceLinks } from '../utils/evidenceUtils';
import { EvidenceLinks } from '../components/EvidenceLinks';
import './TrackDevices.css';

const TrackDevices: React.FC = () => {
  const { name, username, role, department } = useAuth();
  const isAdmin = role?.toLowerCase() === 'admin';
  const toast = useToast();
  
  const { repairs, isLoading: isLoadingRepairs, refetch: refetchRepairs, mutate: mutateRepairs } = useRepairs();
  const { transfers, isLoading: isLoadingTransfers, refetch: refetchTransfers } = useTransfers();
  
  const reversedRepairs = useMemo(() => [...repairs].reverse(), [repairs]);
  const reversedTransfers = useMemo(() => [...transfers].reverse(), [transfers]);

  const visibleRepairs = useMemo(() => {
    if (isAdmin) return reversedRepairs;
    return reversedRepairs.filter(r => r.userName === name || r.userEmail === username);
  }, [reversedRepairs, isAdmin, name, username]);

  const visibleTransfers = useMemo(() => {
    if (isAdmin) return reversedTransfers;
    return reversedTransfers.filter(t => t.fromDepartment === department || t.toDepartment === department || t.requestedBy === username);
  }, [reversedTransfers, isAdmin, department, username]);

  const [activeTab, setActiveTab] = useState<'repairs' | 'transfers'>('repairs');

  // Confirm dialog state for Repairs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ rowId: string; deviceId: string; newStatus: string } | null>(null);

  const requestStatusChange = (rowId: string, deviceId: string, newStatus: string) => {
    if (!newStatus || newStatus === '') return;
    setPendingAction({ rowId, deviceId, newStatus });
    setConfirmOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingAction) return;
    const { rowId, deviceId, newStatus } = pendingAction;
    setConfirmOpen(false);
    setPendingAction(null);

    mutateRepairs(repairs.map((r: RepairData) => 
      r.rowId === rowId ? { ...r, status: newStatus } : r
    ));

    const res = await approveRepair({
      rowId,
      deviceId,
      newStatus,
      approver: name,
    });

    if (!res.success) {
      toast.error('Lỗi khi cập nhật: ' + res.message);
      refetchRepairs();
    } else {
      toast.success(`Đã cập nhật trạng thái "${deviceId}" thành "${newStatus}"`);
    }
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
      refetchTransfers();
    } else {
      toast.error(response.message || 'Lỗi khi tạo phiếu hoàn trả');
    }
  };

  const statusOptions = ['Đang kiểm tra', 'Đang sửa chữa', 'Đã sửa xong (Chờ bàn giao)', 'Đã hoàn thành'];

  return (
    <div className="admin-repairs-page">
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={28} style={{ color: 'var(--primary)' }} />
          Theo dõi thiết bị
        </h1>
        <p className="dashboard-subtitle">Quản lý tiến độ sửa chữa và theo dõi luân chuyển thiết bị</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Button 
          variant={activeTab === 'repairs' ? 'primary' : 'secondary'} 
          onClick={() => setActiveTab('repairs')}
        >
          Tiến độ sửa chữa
        </Button>
        <Button 
          variant={activeTab === 'transfers' ? 'primary' : 'secondary'} 
          onClick={() => setActiveTab('transfers')}
        >
          Lịch sử luân chuyển
        </Button>
      </div>

      {activeTab === 'repairs' && (
        <Card>
          <CardHeader title="Danh sách yêu cầu sửa chữa (Mới nhất nằm trên cùng)" />
          <CardBody style={{ padding: '0' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Thời gian báo</TableHeader>
                  <TableHeader>Thiết bị</TableHeader>
                  <TableHeader>Người báo</TableHeader>
                  <TableHeader>Mô tả lỗi</TableHeader>
                  <TableHeader>Trạng thái hiện tại</TableHeader>
                  <TableHeader>Cập nhật trạng thái</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingRepairs ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Đang tải danh sách yêu cầu...</TableCell></TableRow>
                ) : repairs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Chưa có yêu cầu báo hỏng nào.</TableCell></TableRow>
                ) : (
                  visibleRepairs.map((rp, index) => {
                    const normalizedStatus = normalizeRepairStatus(rp.status);
                    const isCompleted = isRepairCompleted(rp.status);
                    const isRejected = isRepairRejected(rp.status);
                    const isDone = isRepairDone(rp.status);
                    return (
                      <TableRow key={index} className={isDone ? 'completed-row' : ''}>
                        <TableCell>
                          <span className="repair-time">{rp.rowId}</span>
                        </TableCell>
                        <TableCell>
                          <span className="repair-device-id">{rp.deviceId}</span>
                        </TableCell>
                        <TableCell>
                          <div className="repair-reporter">
                            <span>{rp.userName}</span>
                            <span className="repair-reporter-email">{rp.userEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="repair-description">{stripEvidenceLinks(rp.description) || '—'}</span>
                          <EvidenceLinks text={rp.description} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRepairStatusVariant(rp.status)}>
                            {isCompleted ? <CheckCircle size={12}/> : (isRejected ? <XCircle size={12}/> : (normalizedStatus.includes('sua') ? <Wrench size={12}/> : (normalizedStatus.includes('cho') ? <Clock size={12}/> : <Search size={12}/>)))}
                            <span style={{marginLeft: '4px'}}>{rp.status}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isAdmin && !isDone ? (
                            <select 
                              className="status-select"
                              value={statusOptions.includes(rp.status) ? rp.status : ""}
                              onChange={(e) => requestStatusChange(rp.rowId, rp.deviceId, e.target.value)}
                            >
                              <option value="" disabled>-- Chọn trạng thái --</option>
                              {statusOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : isAdmin && isDone ? (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Đã kết thúc</span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>{rp.status}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {activeTab === 'transfers' && (
        <Card>
          <CardHeader title="Danh sách luân chuyển thiết bị" />
          <CardBody style={{ padding: '0' }}>
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
                {isLoadingTransfers ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</TableCell></TableRow>
                ) : visibleTransfers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Không có dữ liệu.</TableCell></TableRow>
                ) : visibleTransfers.map(transfer => (
                  <TableRow key={transfer.transferId}>
                    <TableCell><strong>{transfer.transferId}</strong><br /><small>{transfer.createdAt || transfer.requestedAt}</small></TableCell>
                    <TableCell><strong>{transfer.deviceName || transfer.deviceId}</strong><br /><small>{transfer.deviceId}</small></TableCell>
                    <TableCell>{transfer.fromDepartment}<br /><strong>→ {transfer.toDepartment}</strong></TableCell>
                    <TableCell>{transfer.requestedByName || transfer.requestedBy}<br /><small>{transfer.requestedNote}</small></TableCell>
                    <TableCell><Badge variant={getTransferStatusVariant(transfer.status)}>{transferStatusText[transfer.status] || transfer.status}</Badge></TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {transfer.receivedByName || transfer.rejectReason || '—'}
                        </span>
                        {transfer.status === 'COMPLETED' && (
                          <Button size="sm" variant="primary" onClick={() => handleReturnDevice(transfer)}>
                            Hoàn trả
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingAction(null); }}
        onConfirm={handleConfirmStatusChange}
        title="Xác nhận cập nhật"
        message={pendingAction ? `Bạn có chắc muốn cập nhật trạng thái thiết bị "${pendingAction.deviceId}" thành "${pendingAction.newStatus}"?` : ''}
        confirmText="Cập nhật"
        variant="primary"
      />
    </div>
  );
};

export default TrackDevices;
