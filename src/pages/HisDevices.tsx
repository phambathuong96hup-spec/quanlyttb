import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bed, Building2, Database, RefreshCw, Search, Server, SlidersHorizontal, Stethoscope, Wrench, X } from 'lucide-react';
import Button from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import {
  fetchHisCategories,
  fetchHisDashboardStats,
  fetchHisDepartments,
  fetchHisDepartmentDashboardOptional,
  fetchHisDeviceUsages,
  fetchHisSyncStatus,
  getHisDevicesApiBaseUrl,
  type HisCategory,
  type HisDashboardStats,
  type HisDepartment,
  type HisDepartmentDashboard,
  type HisDepartmentDashboardDevice,
  type HisDeviceUsage,
  type HisSyncStatus,
} from '../services/hisDevicesApi';
import './HisDevices.css';

const emptyStats: HisDashboardStats = {
  patients_using: 0,
  machines_total: 0,
  machines_in_use: 0,
  machines_available: 0,
  machines_maintenance: 0,
  categories: [],
};

const emptyDepartmentDashboard: HisDepartmentDashboard = {
  summary: {
    departments: 0,
    machines_total: 0,
    in_use: 0,
    available: 0,
    maintenance: 0,
  },
  departments: [],
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Chưa có dữ liệu';
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

const renderDeviceRows = (
  devices: HisDepartmentDashboardDevice[],
  emptyText: string,
  mode: 'in_use' | 'available' | 'maintenance'
) => {
  if (devices.length === 0) {
    return <span className="his-mini-empty">{emptyText}</span>;
  }

  return (
    <>
      {devices.slice(0, 5).map(device => (
        <div className="his-mini-device" key={`${mode}-${device.machine_code}`}>
          <strong>{device.machine_name}</strong>
          <span>{device.machine_code} · {device.category_name || 'Chưa phân loại'} · {device.room_code || 'Chưa gán phòng'}</span>
          {mode === 'in_use' && device.patient_name && (
            <span>BN: {device.patient_name} ({device.his_treatment_code || '—'})</span>
          )}
          {mode === 'in_use' && device.started_at && (
            <span>Từ: {formatDateTime(device.started_at)}</span>
          )}
        </div>
      ))}
      {devices.length > 5 && <span className="his-mini-more">+{devices.length - 5} thiết bị khác</span>}
    </>
  );
};

const HisDevices: React.FC = () => {
  const [stats, setStats] = useState<HisDashboardStats>(emptyStats);
  const [departmentDashboard, setDepartmentDashboard] = useState<HisDepartmentDashboard>(emptyDepartmentDashboard);
  const [usages, setUsages] = useState<HisDeviceUsage[]>([]);
  const [departments, setDepartments] = useState<HisDepartment[]>([]);
  const [categories, setCategories] = useState<HisCategory[]>([]);
  const [syncStatus, setSyncStatus] = useState<HisSyncStatus | null>(null);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const apiBaseUrl = useMemo(() => getHisDevicesApiBaseUrl(), []);
  const activeFilterCount = [selectedDept, selectedCategory, submittedSearch].filter(Boolean).length;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [nextStats, nextDepartmentDashboard, nextUsages, nextDepartments, nextCategories, nextSyncStatus] = await Promise.all([
        fetchHisDashboardStats(selectedDept),
        fetchHisDepartmentDashboardOptional({ dept: selectedDept, category: selectedCategory }),
        fetchHisDeviceUsages({ dept: selectedDept, category: selectedCategory, search: submittedSearch, page: 1, limit: 100 }),
        fetchHisDepartments(),
        fetchHisCategories(),
        fetchHisSyncStatus(),
      ]);
      setStats(nextStats || emptyStats);
      setDepartmentDashboard(nextDepartmentDashboard || emptyDepartmentDashboard);
      setUsages(Array.isArray(nextUsages) ? nextUsages : []);
      setDepartments(Array.isArray(nextDepartments) ? nextDepartments : []);
      setCategories(Array.isArray(nextCategories) ? nextCategories : []);
      setSyncStatus(nextSyncStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStats(emptyStats);
      setDepartmentDashboard(emptyDepartmentDashboard);
      setUsages([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, selectedDept, submittedSearch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSubmittedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const clearFilters = () => {
    setSelectedDept('');
    setSelectedCategory('');
    setSearch('');
    setSubmittedSearch('');
  };

  return (
    <div className="his-devices-page">
      <section className="his-devices-hero">
        <div className="his-devices-hero-main">
          <span className="his-devices-hero-icon"><Stethoscope size={24} /></span>
          <div>
            <span className="his-devices-eyebrow">HIS realtime</span>
            <h1 className="his-devices-title">Theo dõi thiết bị bệnh nhân đang sử dụng</h1>
            <p className="his-devices-subtitle">
              Dữ liệu đồng bộ từ module FastAPI/PostgreSQL tại {apiBaseUrl}.
            </p>
          </div>
        </div>
        <div className="his-devices-hero-actions">
          <span className={`his-sync-chip ${syncStatus?.status === 'failed' ? 'is-danger' : ''}`}>
            <Database size={15} />
            {syncStatus?.status || 'Chưa đồng bộ'} - {formatDateTime(syncStatus?.finished_at || syncStatus?.started_at)}
          </span>
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void loadData()} disabled={isLoading}>
            Làm mới
          </Button>
        </div>
      </section>

      {error && (
        <div className="his-devices-alert" role="alert">
          <Server size={18} />
          <span>Không kết nối được module HIS: {error}</span>
        </div>
      )}

      <section className="his-devices-kpi-grid">
        <Card className="his-kpi-card">
          <CardBody>
            <span className="his-kpi-icon"><Bed size={22} /></span>
            <strong>{stats.patients_using}</strong>
            <span>Bệnh nhân dùng thiết bị</span>
          </CardBody>
        </Card>
        <Card className="his-kpi-card">
          <CardBody>
            <span className="his-kpi-icon"><Activity size={22} /></span>
            <strong>{stats.machines_in_use}</strong>
            <span>Thiết bị đang dùng</span>
          </CardBody>
        </Card>
        <Card className="his-kpi-card">
          <CardBody>
            <span className="his-kpi-icon"><Database size={22} /></span>
            <strong>{stats.machines_available}</strong>
            <span>Thiết bị đang trống</span>
          </CardBody>
        </Card>
        <Card className="his-kpi-card">
          <CardBody>
            <span className="his-kpi-icon"><Wrench size={22} /></span>
            <strong>{stats.machines_maintenance}</strong>
            <span>Đến hạn/Bảo dưỡng</span>
          </CardBody>
        </Card>
        <Card className="his-kpi-card">
          <CardBody>
            <span className="his-kpi-icon"><Stethoscope size={22} /></span>
            <strong>{stats.machines_total}</strong>
            <span>Tổng thiết bị active</span>
          </CardBody>
        </Card>
      </section>

      <Card className="his-department-dashboard">
        <CardHeader
          title="Khoa/phòng đang sử dụng thiết bị"
          action={<span className="his-filter-summary">{departmentDashboard.summary.departments} khoa/phòng</span>}
        />
        <CardBody>
          <div className="his-department-summary" aria-label="Thống kê thiết bị theo trạng thái">
            <span><Building2 size={16} /> {departmentDashboard.summary.machines_total} thiết bị</span>
            <span className="is-danger"><Activity size={16} /> {departmentDashboard.summary.in_use} đang dùng</span>
            <span className="is-success"><Database size={16} /> {departmentDashboard.summary.available} đang trống</span>
            <span className="is-warning"><Wrench size={16} /> {departmentDashboard.summary.maintenance} đến hạn</span>
          </div>

          {departmentDashboard.departments.length === 0 ? (
            <div className="his-table-state">Không có thiết bị phù hợp bộ lọc khoa/phòng.</div>
          ) : (
            <div className="his-department-grid">
              {departmentDashboard.departments.map(dept => (
                <article className="his-department-card" key={dept.department_code}>
                  <header>
                    <div>
                      <h3>{dept.department_name}</h3>
                      <span>{dept.department_code} · {dept.total} thiết bị</span>
                    </div>
                    <div className="his-department-counts">
                      <span className="is-danger">{dept.in_use} dùng</span>
                      <span className="is-success">{dept.available} trống</span>
                      <span className="is-warning">{dept.maintenance} hạn</span>
                    </div>
                  </header>
                  <div className="his-room-strip">
                    {dept.rooms.slice(0, 4).map(room => (
                      <span key={`${dept.department_code}-${room.room_code}`}>
                        {room.room_code}: {room.in_use} dùng · {room.available} trống · {room.maintenance} hạn
                      </span>
                    ))}
                  </div>
                  <div className="his-device-status-columns">
                    <section>
                      <h4>Đang sử dụng</h4>
                      {renderDeviceRows(dept.devices.in_use, 'Không có thiết bị đang dùng', 'in_use')}
                    </section>
                    <section>
                      <h4>Đang trống</h4>
                      {renderDeviceRows(dept.devices.available, 'Không có thiết bị trống', 'available')}
                    </section>
                    <section>
                      <h4>Đến hạn/Bảo dưỡng</h4>
                      {renderDeviceRows(dept.devices.maintenance, 'Không có thiết bị đến hạn', 'maintenance')}
                    </section>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="his-devices-panel">
        <CardHeader
          title="Danh sách sử dụng thiết bị"
          action={<span className="his-filter-summary">{activeFilterCount ? `${activeFilterCount} điều kiện` : 'Tự động lọc'}</span>}
        />
        <CardBody>
          <div className="his-filter-bar" aria-label="Bộ lọc danh sách sử dụng thiết bị">
            <div className="his-filter-field his-filter-field-select">
              <SlidersHorizontal size={15} />
              <select value={selectedDept} onChange={(event) => setSelectedDept(event.target.value)} aria-label="Lọc theo khoa">
                <option value="">Tất cả khoa</option>
                {departments.map(dept => <option key={dept.code} value={dept.code}>{dept.name}</option>)}
              </select>
            </div>
            <div className="his-filter-field his-filter-field-select">
              <Stethoscope size={15} />
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} aria-label="Lọc theo loại thiết bị">
                <option value="">Tất cả loại</option>
                {categories.map(category => <option key={category.code} value={category.code}>{category.name}</option>)}
              </select>
            </div>
            <label className="his-filter-field his-search-field">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm mã bệnh án, mã điều trị, thiết bị"
              />
            </label>
            <button
              type="button"
              className="his-clear-filter"
              onClick={clearFilters}
              disabled={activeFilterCount === 0 && !search}
              aria-label="Xóa bộ lọc"
              title="Xóa bộ lọc"
            >
              <X size={16} />
            </button>
          </div>
          <Table className="his-devices-table">
            <TableHead>
              <TableRow>
                <TableHeader>Bệnh nhân</TableHeader>
                <TableHeader>Thiết bị</TableHeader>
                <TableHeader>Dịch vụ</TableHeader>
                <TableHeader>Khoa</TableHeader>
                <TableHeader>Bắt đầu</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="his-table-state">Đang tải dữ liệu HIS...</TableCell>
                </TableRow>
              ) : usages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="his-table-state">Không có lượt sử dụng thiết bị phù hợp.</TableCell>
                </TableRow>
              ) : usages.map(usage => (
                <TableRow key={usage.usage_id}>
                  <TableCell>
                    <strong>{usage.his_treatment_code}</strong>
                    <small>Mã bệnh án</small>
                  </TableCell>
                  <TableCell>
                    <strong>{usage.machine_name}</strong>
                    <small>{usage.machine_code} - {usage.category_name}</small>
                  </TableCell>
                  <TableCell>{usage.service_name || 'Chưa có tên dịch vụ'}</TableCell>
                  <TableCell>{usage.department_name || usage.department_code || 'Chưa gán khoa'}</TableCell>
                  <TableCell>{formatDateTime(usage.started_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
};

export default HisDevices;
