import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Building2,
  Link2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Edit3,
  Server,
  User,
  Mail,
  Lock,
} from 'lucide-react';
import { Button, Input, Modal, Tabs } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import {
  fetchUsers,
  addUser,
  editUser,
  fetchDepartments,
  getCustomAppsScriptUrl,
  setCustomAppsScriptUrl,
  getGoogleSheetsApiUrl,
  testAppsScriptConnection,
  type UserData,
} from '../services/api';
import { clearApiResourceCache } from '../hooks/useApiResource';
import './AdminSettings.css';

const AdminSettings: React.FC = () => {
  const toast = useToast();

  // Tab 1: User & Department Management State
  const [users, setUsers] = useState<UserData[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');

  // Modal: Edit / Assign Department
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<'User' | 'Admin'>('User');
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Modal: Add New Account
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newRole, setNewRole] = useState<'User' | 'Admin'>('User');
  const [newPin, setNewPin] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Tab 2: Apps Script URL Configuration State
  const [activeUrl, setActiveUrl] = useState<string>(() => getGoogleSheetsApiUrl());
  const [customUrl, setCustomUrl] = useState<string | null>(() => getCustomAppsScriptUrl());
  const [inputUrl, setInputUrl] = useState<string>(() => getCustomAppsScriptUrl() || '');
  const [verifiedUrl, setVerifiedUrl] = useState<string | null>(null);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const [userList, deptList] = await Promise.all([
        fetchUsers(),
        fetchDepartments(),
      ]);
      setUsers(userList);
      if (Array.isArray(deptList)) {
        setDepartments(deptList);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu người dùng/khoa phòng:', err);
      toast.error('Không thể tải danh sách tài khoản hoặc khoa phòng.');
    } finally {
      setLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q));

      const matchDept = !selectedDeptFilter || u.department === selectedDeptFilter;
      return matchSearch && matchDept;
    });
  }, [users, userSearch, selectedDeptFilter]);

  // Open Edit/Assign Modal
  const handleOpenEdit = (user: UserData) => {
    setEditingUser(user);
    setEditFullName(user.name || '');
    setEditDepartment(user.department || '');
    setEditRole(user.role?.toLowerCase() === 'admin' ? 'Admin' : 'User');
  };

  // Submit Edit/Assign Department
  const handleSaveUserAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSavingUser(true);
    try {
      const res = await editUser({
        username: editingUser.username,
        fullName: editFullName.trim(),
        department: editDepartment.trim(),
        role: editRole,
      });

      if (res.success) {
        toast.success(res.message || `Đã cập nhật phân khoa cho tài khoản ${editingUser.username}.`);
        setUsers((prev) =>
          prev.map((u) =>
            u.username === editingUser.username
              ? {
                  ...u,
                  name: editFullName.trim() || u.name,
                  department: editDepartment.trim(),
                  role: editRole,
                }
              : u,
          ),
        );
        // Add new department to suggestions if not present
        if (editDepartment.trim() && !departments.includes(editDepartment.trim())) {
          setDepartments((prev) => [...prev, editDepartment.trim()].sort());
        }
        setEditingUser(null);
      } else {
        toast.error(res.message || 'Cập nhật tài khoản thất bại.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi kết nối khi cập nhật tài khoản.');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Submit Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      toast.error('Vui lòng nhập tên đăng nhập.');
      return;
    }
    if (!newFullName.trim()) {
      toast.error('Vui lòng nhập họ và tên.');
      return;
    }
    if (!newPin.trim()) {
      toast.error('Vui lòng nhập mã PIN khởi tạo cho tài khoản.');
      return;
    }

    setIsAddingUser(true);
    try {
      const res = await addUser({
        username: newUsername.trim(),
        fullName: newFullName.trim(),
        email: newEmail.trim() || undefined,
        department: newDepartment.trim() || undefined,
        role: newRole,
        pin: newPin.trim(),
      });

      if (res.success) {
        toast.success(res.message || `Đã tạo tài khoản ${newUsername.trim()} thành công.`);
        // Reload or add to list
        const addedUser: UserData = res.user || {
          username: newUsername.trim(),
          name: newFullName.trim(),
          email: newEmail.trim() || undefined,
          department: newDepartment.trim() || undefined,
          role: newRole,
        };
        setUsers((prev) => [addedUser, ...prev.filter((u) => u.username !== addedUser.username)]);
        if (newDepartment.trim() && !departments.includes(newDepartment.trim())) {
          setDepartments((prev) => [...prev, newDepartment.trim()].sort());
        }
        setShowAddModal(false);
        setNewUsername('');
        setNewFullName('');
        setNewEmail('');
        setNewDepartment('');
        setNewPin('');
        setNewRole('User');
      } else {
        toast.error(res.message || 'Thêm tài khoản mới thất bại.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi kết nối khi tạo tài khoản mới.');
    } finally {
      setIsAddingUser(false);
    }
  };

  // Test Connection to Apps Script URL
  const handleTestConnection = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập đường dẫn Google Apps Script Web App.');
      return;
    }

    setIsTestingUrl(true);
    setTestResult(null);
    try {
      const res = await testAppsScriptConnection(trimmed);
      setTestResult(res);
      if (res.success) {
        setVerifiedUrl(trimmed);
        toast.success('Kết nối thành công tới máy chủ Apps Script!');
      } else {
        setVerifiedUrl(null);
        toast.error(res.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerifiedUrl(null);
      setTestResult({ success: false, message: `Lỗi kết nối: ${msg}` });
      toast.error('Lỗi kiểm tra kết nối.');
    } finally {
      setIsTestingUrl(false);
    }
  };

  // Save and Activate new Apps Script URL
  const handleSaveAndActivateUrl = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập URL Google Apps Script hợp lệ.');
      return;
    }
    if (!trimmed.startsWith('https://script.google.com/macros/s/') || !trimmed.endsWith('/exec')) {
      toast.error('URL phải bắt đầu bằng https://script.google.com/macros/s/ và kết thúc bằng /exec.');
      return;
    }
    if (!verifiedUrl || verifiedUrl !== trimmed) {
      toast.error('Vui lòng kiểm tra kết nối thành công trước khi kích hoạt.');
      return;
    }

    setIsSavingUrl(true);
    try {
      setCustomAppsScriptUrl(trimmed);
      clearApiResourceCache();
      const updatedActive = getGoogleSheetsApiUrl();
      const updatedCustom = getCustomAppsScriptUrl();
      setActiveUrl(updatedActive);
      setCustomUrl(updatedCustom);
      toast.success('Đã kích hoạt link Apps Script mới! Dữ liệu thiết bị sẽ được tải từ nguồn này.');
    } catch (err) {
      console.error(err);
      toast.error('Không thể lưu đường dẫn mới vào bộ nhớ.');
    } finally {
      setIsSavingUrl(false);
    }
  };

  const isUrlVerified = Boolean(verifiedUrl && verifiedUrl === inputUrl.trim());

  // Department choices for datalists
  const departmentOptions = useMemo(() => {
    return Array.from(new Set([...departments, ...users.map((u) => u.department || '').filter(Boolean)])).sort();
  }, [departments, users]);

  // Tab 1 Content: Account & Department Management
  const tabUsersContent = (
    <div className="admin-tab-content">
      <div className="admin-toolbar">
        <div className="admin-toolbar-filters">
          <div className="admin-search-wrapper">
            <Search size={16} className="admin-search-icon" />
            <input
              type="text"
              placeholder="Tìm theo tên đăng nhập, họ tên, khoa..."
              className="admin-search-input"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>

          <select
            className="admin-select-filter"
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
          >
            <option value="">-- Tất cả khoa / phòng --</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-toolbar-actions">
          <Button
            variant="secondary"
            onClick={() => void loadInitialData()}
            disabled={loadingUsers}
            icon={<RefreshCw size={15} className={loadingUsers ? 'animate-spin' : ''} />}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            onClick={() => setShowAddModal(true)}
            icon={<UserPlus size={16} />}
          >
            Thêm tài khoản
          </Button>
        </div>
      </div>

      <div className="admin-users-table-card">
        <div className="admin-table-container">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Tên đăng nhập</th>
                <th>Họ và tên</th>
                <th>Email</th>
                <th>Khoa / Phòng trực thuộc</th>
                <th>Vai trò</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={6} className="admin-loading-row">
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    <div>Đang tải danh sách tài khoản...</div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty-row">
                    Không tìm thấy tài khoản nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const roleUpper = (u.role || 'User').toUpperCase();
                  const isAdminRole = roleUpper === 'ADMIN';
                  return (
                    <tr key={u.username}>
                      <td>
                        <span className="user-cell-username">{u.username}</span>
                      </td>
                      <td>
                        <span className="user-cell-name">{u.name || '(Chưa đặt tên)'}</span>
                      </td>
                      <td>{u.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td>
                        {u.department ? (
                          <span className="dept-badge-assigned">
                            <Building2 size={13} />
                            {u.department}
                          </span>
                        ) : (
                          <span className="dept-badge-unassigned">Chưa phân khoa</span>
                        )}
                      </td>
                      <td>
                        <span className={`role-badge ${isAdminRole ? 'admin' : 'user'}`}>
                          {isAdminRole ? 'Quản trị viên' : 'Nhân viên'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="table-action-btn"
                          onClick={() => handleOpenEdit(u)}
                          title="Phân khoa hoặc cập nhật tài khoản"
                        >
                          <Edit3 size={14} />
                          <span>Phân khoa</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Tab 2 Content: Apps Script Endpoint Configuration
  const tabConfigContent = (
    <div className="url-config-container">
      <div className="url-card">
        <div className={`url-status-banner ${customUrl ? 'custom' : ''}`}>
          <div className="url-status-icon">
            {customUrl ? (
              <CheckCircle2 size={24} color="var(--success)" />
            ) : (
              <Server size={24} color="var(--primary)" />
            )}
          </div>
          <div className="url-status-content">
            <div className="url-status-title">
              {customUrl
                ? 'Đang kết nối qua URL Google Apps Script tùy chỉnh'
                : 'Đang kết nối qua URL Google Apps Script mặc định của hệ thống'}
            </div>
            <div>
              Đường dẫn tùy chỉnh này được lưu và áp dụng trên trình duyệt hiện tại để phục vụ thử nghiệm và làm việc trực tiếp. Khi cần cấu hình máy chủ cho toàn bộ hệ thống bệnh viện, vui lòng cập nhật biến môi trường <code>VITE_THIET_BI_API_URL</code> trong mã nguồn khi triển khai bản build chính thức.
            </div>
            <code className="url-status-desc">{activeUrl}</code>
          </div>
        </div>

        <div className="url-guide-box">
          <h4>Hướng dẫn triển khai Web App trên Google Apps Script:</h4>
          <ol>
            <li>Mở dự án Google Sheet chứa dữ liệu trang thiết bị &gt; Vào <strong>Mở rộng (Extensions) &gt; Apps Script</strong>.</li>
            <li>Dán mã nguồn backend mới (trong tệp <code>gas/Code.gs</code>) vào trình soạn thảo.</li>
            <li>Nhấp vào nút <strong>Triển khai (Deploy) &gt; Tùy chọn triển khai mới (New deployment)</strong>.</li>
            <li>Chọn loại triển khai: <strong>Ứng dụng web (Web app)</strong>.</li>
            <li>Thực thi dưới dạng: <strong>Tôi (Me)</strong>; Ai có quyền truy cập: <strong>Bất kỳ ai (Anyone)</strong>.</li>
            <li>Nhấn Triển khai và sao chép <strong>URL ứng dụng web</strong> (kết thúc bằng <code>/exec</code>) dán vào ô bên dưới.</li>
          </ol>
        </div>

        <div className="url-input-section">
          <Input
            label="Đường dẫn Google Apps Script Web App mới (/exec)"
            type="text"
            placeholder="https://script.google.com/macros/s/.../exec"
            value={inputUrl}
            onChange={(e) => {
              setInputUrl(e.target.value);
              setTestResult(null);
              setVerifiedUrl(null);
            }}
            icon={<Link2 size={16} />}
          />

          {testResult && (
            <div className={`test-result-box ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? (
                <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {!isUrlVerified && inputUrl.trim() && !isTestingUrl && (
            <p className="admin-form-hint" style={{ color: 'var(--text-secondary)' }}>
              Vui lòng nhấn &quot;Kiểm tra kết nối&quot; thành công trước khi có thể Lưu &amp; Kích hoạt.
            </p>
          )}

          <div className="url-actions">
            <Button
              variant="secondary"
              onClick={() => void handleTestConnection()}
              disabled={isTestingUrl || !inputUrl.trim()}
              icon={<RefreshCw size={15} className={isTestingUrl ? 'animate-spin' : ''} />}
            >
              {isTestingUrl ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
            </Button>

            <Button
              variant="primary"
              onClick={handleSaveAndActivateUrl}
              disabled={isSavingUrl || !isUrlVerified}
              icon={<CheckCircle2 size={16} />}
            >
              {isSavingUrl ? 'Đang lưu...' : 'Lưu & Kích hoạt'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-page-container">
      <div className="admin-header">
        <div className="admin-header-title-group">
          <div className="admin-header-icon">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="admin-header-title">Quản trị Hệ thống &amp; Phân khoa</h1>
            <p className="admin-header-desc">
              Phân quyền tài khoản vào các khoa phòng và thay đổi đường dẫn kết nối Google Apps Script trực tiếp trên giao diện web.
            </p>
          </div>
        </div>
      </div>

      <Tabs
        defaultTab="users"
        tabs={[
          {
            id: 'users',
            label: 'Quản lý Tài khoản & Phân khoa',
            content: tabUsersContent,
          },
          {
            id: 'config',
            label: 'Cấu hình Link Apps Script',
            content: tabConfigContent,
          },
        ]}
      />

      {/* Modal Phân khoa / Chỉnh sửa tài khoản */}
      <Modal
        isOpen={Boolean(editingUser)}
        onClose={() => !isSavingUser && setEditingUser(null)}
        title={`Phân khoa cho tài khoản: ${editingUser?.username || ''}`}
        size="md"
      >
        <form onSubmit={handleSaveUserAssignment} className="admin-modal-form">
          <Input
            label="Họ và Tên"
            type="text"
            value={editFullName}
            onChange={(e) => setEditFullName(e.target.value)}
            disabled={isSavingUser}
            required
            icon={<User size={16} />}
          />

          <div className="admin-form-group">
            <label className="admin-form-label">Khoa / Phòng trực thuộc</label>
            <input
              type="text"
              list="admin-departments-list"
              className="admin-form-input"
              placeholder="Chọn hoặc nhập tên khoa phòng..."
              value={editDepartment}
              onChange={(e) => setEditDepartment(e.target.value)}
              disabled={isSavingUser}
            />
            <p className="admin-form-hint">
              Khi được phân vào khoa này, người dùng sẽ chỉ phụ trách và xem thiết bị thuộc khoa phòng tương ứng.
            </p>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Vai trò tài khoản</label>
            <select
              className="admin-form-select"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as 'User' | 'Admin')}
              disabled={isSavingUser}
            >
              <option value="User">Nhân viên (User) - Theo dõi thiết bị khoa</option>
              <option value="Admin">Quản trị viên (Admin) - Toàn quyền quản trị</option>
            </select>
          </div>

          <div className="admin-modal-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingUser(null)}
              disabled={isSavingUser}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingUser}>
              {isSavingUser ? 'Đang lưu...' : 'Lưu phân khoa'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Thêm tài khoản mới */}
      <Modal
        isOpen={showAddModal}
        onClose={() => !isAddingUser && setShowAddModal(false)}
        title="Thêm tài khoản người dùng mới"
        size="md"
      >
        <form onSubmit={handleAddUser} className="admin-modal-form">
          <Input
            label="Tên đăng nhập *"
            type="text"
            placeholder="VD: bs_minh, nv_lan..."
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            disabled={isAddingUser}
            required
            icon={<User size={16} />}
          />

          <Input
            label="Họ và Tên *"
            type="text"
            placeholder="VD: BS. Nguyễn Văn Minh"
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            disabled={isAddingUser}
            required
            icon={<User size={16} />}
          />

          <Input
            label="Email"
            type="email"
            placeholder="VD: minh.nv@bv.org.vn"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={isAddingUser}
            icon={<Mail size={16} />}
          />

          <div className="admin-form-group">
            <label className="admin-form-label">Khoa / Phòng trực thuộc</label>
            <input
              type="text"
              list="admin-departments-list"
              className="admin-form-input"
              placeholder="Chọn hoặc nhập khoa phòng..."
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              disabled={isAddingUser}
            />
            <p className="admin-form-hint">Chọn khoa phòng để phân công tài khoản ngay khi khởi tạo.</p>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Vai trò</label>
            <select
              className="admin-form-select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'User' | 'Admin')}
              disabled={isAddingUser}
            >
              <option value="User">Nhân viên (User)</option>
              <option value="Admin">Quản trị viên (Admin)</option>
            </select>
          </div>

          <Input
            label="Mã PIN khởi tạo *"
            type="password"
            placeholder="Nhập mã PIN khởi tạo (tối thiểu 4 ký tự)..."
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            disabled={isAddingUser}
            required
            icon={<Lock size={16} />}
          />

          <div className="admin-modal-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
              disabled={isAddingUser}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isAddingUser}>
              {isAddingUser ? 'Đang tạo...' : 'Tạo tài khoản'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Datalist for department autocomplete */}
      <datalist id="admin-departments-list">
        {departmentOptions.map((dept) => (
          <option key={dept} value={dept} />
        ))}
      </datalist>
    </div>
  );
};

export default AdminSettings;
