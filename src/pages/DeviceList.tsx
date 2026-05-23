import React, { useState, useEffect } from 'react';
import { Plus, Download, Printer, Search, Eye, Edit2, Save, Loader2, CheckCircle, AlertTriangle, Monitor, X, Wrench, ShieldAlert, CalendarX2 } from 'lucide-react';
import { Card, Button, Input, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Modal, useToast } from '../components/ui';
import { addDevice, editDevice, type DeviceData } from '../services/api';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../authContext';
import { exportCsv } from '../utils/exportCsv';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { matchSmartSearch } from '../utils/stringUtils';
import {
  getDeviceStatusFlags,
  isRecentDevice,
  matchesDeviceStatusFilter,
  resolveDeviceListStatus,
  type DeviceStatusFilter,
} from '../utils/deviceStatus';
import './Devices.css';

interface DeviceFormData {
  serial: string;
  name: string;
  department: string;
  dateAdded: string;
  notes: string;
}

const emptyForm: DeviceFormData = {
  serial: '',
  name: '',
  department: '',
  dateAdded: new Date().toLocaleDateString('vi-VN'),
  notes: '',
};

const splitDeviceCodes = (value: unknown) => String(value || '')
  .split(';')
  .map(item => item.trim())
  .filter(Boolean);

const DeviceList: React.FC = () => {
  const { devices, isLoading, refetch } = useDevices();

  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>('all');
  const [recentOnly, setRecentOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [printingDevices, setPrintingDevices] = useState<DeviceData[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState<DeviceFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    setSearchTerm(urlSearch);
  }, [searchParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, statusFilter, recentOnly]);

  useEffect(() => {
    if (printingDevices.length > 0) {
      setTimeout(() => {
        window.print();
        setPrintingDevices([]);
      }, 500);
    }
  }, [printingDevices]);

  const uniqueDepartments = Array.from(new Set(devices.map(d => d.department))).filter(Boolean).sort();
  const statusCounts = devices.reduce<Record<DeviceStatusFilter, number>>((acc, device) => {
    const flags = getDeviceStatusFlags(device);
    acc.all += 1;
    Object.entries(flags).forEach(([key, value]) => {
      if (value) acc[key as DeviceStatusFilter] += 1;
    });
    return acc;
  }, {
    all: 0,
    good: 0,
    reported: 0,
    repairing: 0,
    expired: 0,
    complianceWarning: 0,
    unassigned: 0,
  });
  const activeCount = statusCounts.good;
  const reportedCount = statusCounts.reported;
  const repairingCount = statusCounts.repairing;
  const complianceWarningCount = statusCounts.complianceWarning;
  const expiredComplianceCount = statusCounts.expired;
  const unassignedCount = statusCounts.unassigned;
  const recentCount = devices.filter(device => isRecentDevice(device)).length;

  const filteredDevices = devices.filter(device => {
    // Smart search (multi-keyword, diacritics-insensitive matching id, name, department, notes)
    const searchMatch = matchSmartSearch(device, ['id', 'name', 'department', 'Ghi chú'], searchTerm);
    const deptMatch = departmentFilter === 'all' || device.department === departmentFilter;
    const statusMatch = matchesDeviceStatusFilter(device, statusFilter);
    const recentMatch = !recentOnly || isRecentDevice(device);

    return searchMatch && deptMatch && statusMatch && recentMatch;
  });

  const totalPages = Math.ceil(filteredDevices.length / itemsPerPage);
  const paginatedDevices = filteredDevices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePrintSingleQR = (device: DeviceData) => setPrintingDevices([device]);
  const handlePrintBulkQR = () => {
    if (filteredDevices.length > 0) setPrintingDevices(filteredDevices.slice(0, 20));
    else toast.warning('Không có thiết bị nào trong danh sách hiển thị để in.');
  };

  const handleExportCsv = () => {
    if (filteredDevices.length === 0) { toast.warning('Không có dữ liệu để xuất CSV.'); return; }
    const exportData = filteredDevices.map(d => ({
      'Mã thiết bị': d.id,
      'Tên thiết bị': d.name,
      'Khoa/phòng': d.department,
      'Trạng thái': resolveDeviceListStatus(d, { activeFilter: statusFilter }).sheetStatus,
      'Ngày nhập / đăng kiểm': d.dateAdded,
    }));
    exportCsv(exportData, 'DanhSachThietBi_ThanhBa.csv');
  };

  const openAddModal = () => {
    if (!isAdmin) return;
    setFormData(emptyForm);
    setModalMode('add');
    setSaveMsg('');
    setShowModal(true);
  };

  const openEditModal = (device: DeviceData) => {
    if (!isAdmin) return;
    setFormData({
      serial: String(device.id || ''),
      name: String(device.name || ''),
      department: String(device.department || ''),
      dateAdded: device.dateAdded !== 'N/A' ? String(device.dateAdded || '') : '',
      notes: String(device['Ghi chú'] || ''),
    });
    setModalMode('edit');
    setSaveMsg('');
    setShowModal(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setSaveMsg('❌ Bạn không có quyền thay đổi danh mục thiết bị.');
      return;
    }
    if (!formData.name.trim() || !formData.department.trim()) {
      setSaveMsg('❌ Vui lòng điền đầy đủ tên thiết bị và khoa/phòng.');
      return;
    }
    setIsSaving(true);
    setSaveMsg('');
    const res = modalMode === 'add'
      ? await addDevice({ name: formData.name, serial: formData.serial, department: formData.department, dateAdded: formData.dateAdded, notes: formData.notes })
      : await editDevice({ serial: formData.serial, name: formData.name, department: formData.department, dateAdded: formData.dateAdded, notes: formData.notes });
    setIsSaving(false);
    if (res.success) {
      toast.success(res.message || 'Thành công!');
      await refetch();
      setShowModal(false);
    } else {
      setSaveMsg('❌ ' + (res.message || 'Có lỗi xảy ra.'));
    }
  };

  return (
    <div className="device-list-page">
      <div className="page-header">
        <h1 className="page-title">Danh sách trang thiết bị</h1>
        <div className="action-buttons">
          <Button variant="secondary" icon={<Download size={18} />} onClick={handleExportCsv}>Xuất CSV</Button>
          <Button variant="secondary" icon={<Printer size={18} />} onClick={handlePrintBulkQR}>In QR hàng loạt</Button>
          {isAdmin && <Button variant="primary" icon={<Plus size={18} />} onClick={openAddModal}>Thêm thiết bị mới</Button>}
        </div>
      </div>

      <div className="stats-grid">
        <Card className="stat-card primary-gradient">
          <div className="stat-icon-wrapper"><Monitor size={28} /></div>
          <div className="stat-content">
            <h3>{devices.length}</h3>
            <p>Tổng thiết bị</p>
          </div>
        </Card>
        
        <Card className="stat-card success-gradient">
          <div className="stat-icon-wrapper"><CheckCircle size={28} /></div>
          <div className="stat-content">
            <h3>{activeCount}</h3>
            <p>Đang hoạt động</p>
          </div>
        </Card>
        
        <Card className="stat-card danger-gradient">
          <div className="stat-icon-wrapper"><AlertTriangle size={28} /></div>
          <div className="stat-content">
            <h3>{reportedCount}</h3>
            <p>Báo hỏng / chờ xử lý</p>
          </div>
        </Card>

        <Card className="stat-card warning-gradient">
          <div className="stat-icon-wrapper"><Wrench size={28} /></div>
          <div className="stat-content">
            <h3>{repairingCount}</h3>
            <p>Đang sửa chữa</p>
          </div>
        </Card>

        <Card className="stat-card compliance-gradient">
          <div className="stat-icon-wrapper"><ShieldAlert size={28} /></div>
          <div className="stat-content">
            <h3>{complianceWarningCount}</h3>
            <p>Cảnh báo đăng kiểm</p>
          </div>
        </Card>

        <Card className="stat-card expired-gradient">
          <div className="stat-icon-wrapper"><CalendarX2 size={28} /></div>
          <div className="stat-content">
            <h3>{expiredComplianceCount}</h3>
            <p>Hết hạn đăng kiểm</p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="toolbar" style={{ padding: '20px', paddingBottom: '12px' }}>
          <div className="filter-group">
            <select className="filter-select" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
              <option value="all">Tất cả khoa/phòng</option>
              {uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as DeviceStatusFilter)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="good">Hoạt động tốt</option>
              <option value="reported">Báo hỏng</option>
              <option value="repairing">Đang sửa chữa</option>
              <option value="complianceWarning">Cảnh báo ĐK</option>
              <option value="expired">Hết hạn ĐK</option>
              <option value="unassigned">Chưa phân bổ</option>
            </select>
          </div>
          <div className="search-box" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Input 
                placeholder="Tìm kiếm mã thiết bị, tên máy..." 
                icon={<Search size={18} />} 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                style={{ paddingRight: searchTerm ? '32px' : '12px' }}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
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
            {(searchTerm || departmentFilter !== 'all' || statusFilter !== 'all' || recentOnly) && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => {
                  setSearchTerm('');
                  setDepartmentFilter('all');
                  setStatusFilter('all');
                  setRecentOnly(false);
                }}
                style={{ whiteSpace: 'nowrap' }}
                icon={<X size={14} />}
              >
                Xóa lọc
              </Button>
            )}
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="quick-filters-chips">
          <button
            className={`chip ${statusFilter === 'all' && !recentOnly ? 'active' : ''}`}
            onClick={() => {
              setStatusFilter('all');
              setRecentOnly(false);
            }}
          >
            Tất cả ({devices.length})
          </button>
          <button
            className={`chip chip-success ${statusFilter === 'good' ? 'active' : ''}`}
            onClick={() => setStatusFilter('good')}
          >
            Hoạt động tốt ({activeCount})
          </button>
          <button
            className={`chip chip-danger ${statusFilter === 'reported' ? 'active' : ''}`}
            onClick={() => setStatusFilter('reported')}
          >
            Báo hỏng ({reportedCount})
          </button>
          <button
            className={`chip chip-warning ${statusFilter === 'repairing' ? 'active' : ''}`}
            onClick={() => setStatusFilter('repairing')}
          >
            Đang sửa ({repairingCount})
          </button>
          <button
            className={`chip chip-warning ${statusFilter === 'complianceWarning' ? 'active' : ''}`}
            onClick={() => setStatusFilter('complianceWarning')}
          >
            Cảnh báo ĐK ({complianceWarningCount})
          </button>
          <button
            className={`chip chip-danger ${statusFilter === 'expired' ? 'active' : ''}`}
            onClick={() => setStatusFilter('expired')}
          >
            Hết hạn ĐK ({expiredComplianceCount})
          </button>
          <button
            className={`chip chip-neutral ${statusFilter === 'unassigned' ? 'active' : ''}`}
            onClick={() => setStatusFilter('unassigned')}
          >
            Chưa phân bổ ({unassignedCount})
          </button>
          <button
            className={`chip ${recentOnly ? 'active' : ''}`}
            onClick={() => setRecentOnly(value => !value)}
            title="Thêm mới trong vòng 30 ngày qua"
          >
            Mới nhập ({recentCount})
          </button>
        </div>

        <Table className="device-inventory-table">
          <TableHead>
            <TableRow>
              <TableHeader className="col-device-code">Mã / Seri</TableHeader>
              <TableHeader className="col-device-name">Tên thiết bị</TableHeader>
              <TableHeader className="col-device-dept">Khoa/phòng</TableHeader>
              <TableHeader className="col-device-status">Trạng thái</TableHeader>
              <TableHeader className="col-device-date">Ngày nhập</TableHeader>
              <TableHeader className="col-device-actions">Thao tác</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} /> Đang tải dữ liệu...
              </TableCell></TableRow>
            ) : paginatedDevices.length === 0 ? (
              <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                Không tìm thấy thiết bị nào phù hợp.
              </TableCell></TableRow>
            ) : paginatedDevices.map((device, index) => {
              const displayStatus = resolveDeviceListStatus(device, { activeFilter: statusFilter });
              const deviceCodes = splitDeviceCodes(device.id);
              const visibleCodes = deviceCodes.slice(0, 2);
              const hiddenCodeCount = Math.max(0, deviceCodes.length - visibleCodes.length);
              const isUnassigned = getDeviceStatusFlags(device).unassigned;
              return (
                <TableRow key={`${device.id}-${index}`} className="device-table-row">
                  <TableCell className="col-device-code">
                    <div className="device-code-stack" title={String(device.id || '')}>
                      {(visibleCodes.length > 0 ? visibleCodes : [device.id]).map((code, codeIndex) => (
                        <span className="device-id-cell" key={`${String(code)}-${codeIndex}`}>{code}</span>
                      ))}
                      {hiddenCodeCount > 0 && <span className="device-id-more">+{hiddenCodeCount}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="col-device-name">
                    <span className="device-name-cell">{device.name}</span>
                  </TableCell>
                  <TableCell className="col-device-dept">
                    <span className={`department-badge ${isUnassigned ? 'is-unassigned' : ''}`} title={String(device.department || '')}>{device.department}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`device-status-pill ${displayStatus.className}`}>
                      <span className="device-status-dot" />
                      {displayStatus.label}
                    </span>
                  </TableCell>
                  <TableCell className="col-device-date">
                    <span className="device-date-cell">{device.dateAdded}</span>
                  </TableCell>
                  <TableCell className="col-device-actions">
                    <div className="action-buttons-cell">
                      <Button variant="secondary" size="sm" icon={<Eye size={16} />} title="Xem chi tiết" onClick={() => navigate(`/devices/${encodeURIComponent(device.id)}`)} className="btn-icon-only" />
                      {isAdmin && <Button variant="secondary" size="sm" icon={<Edit2 size={16} />} title="Sửa" onClick={() => openEditModal(device)} className="btn-icon-only" />}
                      <Button variant="secondary" size="sm" icon={<Printer size={16} />} title="In QR" onClick={() => handlePrintSingleQR(device)} className="btn-icon-only" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="pagination" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Hiển thị {filteredDevices.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}–{Math.min(currentPage * itemsPerPage, filteredDevices.length)} / {filteredDevices.length} thiết bị
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant="secondary" size="sm" disabled={currentPage === 1 || totalPages === 0} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Trang trước</Button>
            <span style={{ fontSize: '0.9rem', margin: '0 8px' }}>Trang {currentPage} / {totalPages || 1}</span>
            <Button variant="secondary" size="sm" disabled={currentPage >= totalPages || totalPages === 0} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Trang sau</Button>
          </div>
        </div>
      </Card>

      {/* QR Print Area */}
      {printingDevices.length > 0 && (
        <div id="print-area">
          {printingDevices.map((device, index) => {
            // Đổi mã QR thành đường dẫn URL trỏ thẳng vào web (Device Profile)
            // Khi điện thoại quét URL, nó sẽ không search Google mà mở Trình duyệt web.
            const qrUrl = `${window.location.origin}${import.meta.env.BASE_URL}devices/${encodeURIComponent(device.id)}`;
            return (
            <div className="print-page" key={`print-${device.id}-${index}`}>
              <h2>TTYT khu vực Thanh Ba</h2>
              <p className="subtitle">Hệ thống QLTTB</p>
              <QRCodeSVG value={qrUrl} size={120} level="M" />
              <h3>{device.id}</h3>
              <p className="device-name">{device.name}</p>
              <p className="device-dept">{device.department}</p>
            </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm / Sửa thiết bị */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalMode === 'add' ? '➕ Thêm thiết bị mới' : '✏️ Sửa thông tin thiết bị'}
        size="md"
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Tên thiết bị *</label>
            <input
              name="name" value={formData.name} onChange={handleFormChange}
              placeholder="VD: Máy siêu âm màu Doppler 4D"
              required
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Seri / Mã thiết bị</label>
            <input
              name="serial" value={formData.serial} onChange={handleFormChange}
              placeholder="VD: TB-001 (để trống hệ thống tự tạo)"
              readOnly={modalMode === 'edit'}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', background: modalMode === 'edit' ? 'var(--surface-50)' : 'white', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Khoa/phòng sử dụng *</label>
            <input
              name="department" value={formData.department} onChange={handleFormChange}
              placeholder="VD: Khoa Chẩn đoán hình ảnh"
              list="dept-list"
              required
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
            <datalist id="dept-list">
              {uniqueDepartments.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Ngày nhập / đăng kiểm</label>
            <input
              name="dateAdded" value={formData.dateAdded} onChange={handleFormChange}
              placeholder="VD: 15/03/2025"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Ghi chú thêm</label>
            <textarea
              name="notes" value={formData.notes} onChange={handleFormChange}
              placeholder="Nguồn vốn, nhà cung cấp, ghi chú kỹ thuật..."
              rows={3}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {saveMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: saveMsg.startsWith('✅') ? 'var(--success-light)' : 'var(--danger-light)', color: saveMsg.startsWith('✅') ? 'var(--success)' : 'var(--danger)', fontSize: '0.9rem' }}>
              {saveMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary" icon={isSaving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />} disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : (modalMode === 'add' ? 'Thêm thiết bị' : 'Lưu thay đổi')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DeviceList;
