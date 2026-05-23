import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Menu, Search, Bell, ChevronDown, LogOut, LogIn, Info, User, Edit, Lock, Shield, Building2, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../authContext';
import { useRepairs } from '../../hooks/useRepairs';
import { useTransfers } from '../../hooks/useTransfers';
import { useDevices } from '../../hooks/useDevices';
import { Modal, Input, Button } from '../ui';
import { useToast } from '../ui/Toast';
import { fetchDepartments, editUser } from '../../services/api';
import { parseFlexibleDate } from '../../utils/dateUtils';
import { isRepairAwaitingReview } from '../../utils/statusUtils';
import './TopNav.css';

interface TopNavProps {
  toggleSidebar: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'repair' | 'transfer';
  link: string;
}

const TopNav: React.FC<TopNavProps> = ({ toggleSidebar }) => {
  const navigate = useNavigate();
  const { isAuthenticated, username, name, role, email, department, token, expiresAt, login, logout } = useAuth();
  const toast = useToast();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  // Profile View & Edit states
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for profile edit
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDept, setEditDept] = useState('');
  const [changePin, setChangePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Department choices autocomplete
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (showEditModal) {
      fetchDepartments()
        .then((depts) => {
          if (Array.isArray(depts)) {
            setDepartments(depts);
          }
        })
        .catch((err) => {
          console.error('Lỗi tải danh sách khoa phòng:', err);
        });
    }
  }, [showEditModal]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editName.trim()) {
      toast.error('Vui lòng nhập họ và tên.');
      return;
    }

    if (changePin) {
      if (!currentPin) {
        toast.error('Vui lòng nhập mã PIN hiện tại.');
        return;
      }
      if (!newPin) {
        toast.error('Vui lòng nhập mã PIN mới.');
        return;
      }
      if (newPin !== confirmPin) {
        toast.error('Mã PIN mới và xác nhận mã PIN không khớp.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await editUser({
        username: username,
        fullName: editName.trim(),
        email: editEmail.trim(),
        department: editDept.trim(),
        currentPin: changePin ? currentPin : undefined,
        newPin: changePin ? newPin : undefined,
      });

      if (res.success && res.user) {
        login({
          ...res.user,
          token,
          expiresAt,
        });
        toast.success(res.message || 'Cập nhật thông tin thành công.');
        setShowEditModal(false);
      } else {
        toast.error(res.message || 'Cập nhật thông tin thất bại.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Không thể kết nối đến máy chủ.');
    } finally {
      setIsSaving(false);
    }
  };

  const { repairs } = useRepairs();
  const { transfers } = useTransfers();
  const { devices } = useDevices();

  // Local storage for read notifications
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('qlttb.read_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const getDeviceName = useCallback((deviceId: string) => {
    return devices.find(d => d.id === deviceId)?.name || deviceId;
  }, [devices]);

  const formatNotificationDate = useCallback((value: string) => {
    const parsed = parseFlexibleDate(value);
    return parsed ? parsed.toLocaleDateString('vi-VN') : (value || 'Đang chờ');
  }, []);

  const notificationItems = useMemo((): NotificationItem[] => {
    if (!isAuthenticated) return [];

    const list: NotificationItem[] = [];
    const isAdmin = role?.toLowerCase() === 'admin';

    if (isAdmin) {
      // 1. Pending repairs for admin
      repairs.forEach((rep) => {
        if (isRepairAwaitingReview(rep.status)) {
          list.push({
            id: `repair-pending-${rep.rowId}`,
            title: 'Yêu cầu sửa chữa mới',
            message: `Thiết bị ${getDeviceName(rep.deviceId)} báo lỗi: "${rep.description}" bởi ${rep.userName}`,
            time: 'Đang chờ duyệt',
            type: 'repair',
            link: '/tracking',
          });
        }
      });

      // 2. Pending transfers for admin
      transfers.forEach((tr) => {
        if (tr.status === 'PENDING_RECEIVE') {
          list.push({
            id: `transfer-pending-${tr.transferId}`,
            title: 'Yêu cầu chuyển giao',
            message: `Bàn giao ${tr.deviceName} từ khoa ${tr.fromDepartment} sang ${tr.toDepartment}`,
            time: formatNotificationDate(tr.requestedAt),
            type: 'transfer',
            link: '/requests?type=transfer',
          });
        }
      });
    } else {
      // For staff
      const userDept = department;

      // 1. Pending transfers to their department
      transfers.forEach((tr) => {
        if (tr.status === 'PENDING_RECEIVE' && tr.toDepartment === userDept) {
          list.push({
            id: `transfer-dept-${tr.transferId}`,
            title: 'Tiếp nhận thiết bị',
            message: `Thiết bị ${tr.deviceName} đang chờ khoa ${userDept} tiếp nhận`,
            time: formatNotificationDate(tr.requestedAt),
            type: 'transfer',
            link: '/requests?type=transfer',
          });
        }
      });

      // 2. Repairs updates for this user
      repairs.forEach((rep) => {
        const isMyRepair = rep.userEmail === email || rep.userName === name;
        if (isMyRepair && !isRepairAwaitingReview(rep.status)) {
          list.push({
            id: `repair-update-${rep.rowId}-${rep.status}`,
            title: `Cập nhật sửa chữa`,
            message: `Yêu cầu sửa chữa ${getDeviceName(rep.deviceId)} được cập nhật: ${rep.status}`,
            time: rep.status,
            type: 'repair',
            link: '/requests?type=repair',
          });
        }
      });
    }

    return list;
  }, [repairs, transfers, isAuthenticated, role, name, email, department, getDeviceName, formatNotificationDate]);

  const unreadCount = useMemo(() => {
    return notificationItems.filter(item => !readIds.includes(item.id)).length;
  }, [notificationItems, readIds]);

  const markAsRead = (id: string) => {
    if (!readIds.includes(id)) {
      const newReadIds = [...readIds, id];
      setReadIds(newReadIds);
      localStorage.setItem('qlttb.read_notifications', JSON.stringify(newReadIds));
    }
  };

  const markAllAsRead = () => {
    const unreadItemIds = notificationItems.map(item => item.id);
    const newReadIds = Array.from(new Set([...readIds, ...unreadItemIds]));
    setReadIds(newReadIds);
    localStorage.setItem('qlttb.read_notifications', JSON.stringify(newReadIds));
  };

  // Click-outside to close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showDropdown && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (showNotifications && bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown, showNotifications]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    []
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && searchQuery.trim()) {
        navigate(`/devices?search=${encodeURIComponent(searchQuery.trim())}`);
        setSearchQuery('');
      }
    },
    [searchQuery, navigate]
  );

  const initial = name ? name.charAt(0).toUpperCase() : '?';

  const handleLogout = () => {
    setShowDropdown(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="menu-toggle" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
      </div>

      <div className="topnav-center">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Tìm theo tên thiết bị, số Serial..."
            className="search-input"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      </div>

      <div className="topnav-right">
        {isAuthenticated && (
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button 
              className="nav-action-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Thông báo"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="notification-badge-count">{unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-dropdown-header">
                  <span className="notification-dropdown-title">Thông báo</span>
                  {unreadCount > 0 && (
                    <button 
                      className="notification-dropdown-clear" 
                      onClick={markAllAsRead}
                    >
                      Đọc tất cả
                    </button>
                  )}
                </div>
                <div className="notification-dropdown-list">
                  {notificationItems.length > 0 ? (
                    notificationItems.map((item) => {
                      const isUnread = !readIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          className={`notification-item ${isUnread ? 'unread' : ''}`}
                          onClick={() => {
                            markAsRead(item.id);
                            setShowNotifications(false);
                            navigate(item.link);
                          }}
                        >
                          <div className="notification-item-icon-wrapper">
                            <Info size={16} />
                          </div>
                          <div className="notification-item-content">
                            <div className="notification-item-title">{item.title}</div>
                            <div className="notification-item-message">{item.message}</div>
                            <div className="notification-item-time">{item.time}</div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="notification-empty">
                      <Bell size={24} style={{ opacity: 0.4 }} />
                      <span>Không có thông báo nào</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {isAuthenticated ? (
          /* ===== ĐÃ ĐĂNG NHẬP: Hiện avatar + tên ===== */
          <div
            ref={profileRef}
            className="user-profile"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div className="avatar">{initial}</div>
            <div className="user-info">
              <span className="user-name">{name}</span>
              <span className="user-role">
                {role?.toLowerCase() === 'admin' ? 'Quản trị viên' : 'Nhân viên'}
              </span>
            </div>
            <ChevronDown size={16} color="var(--text-secondary)" />

            {showDropdown && (
              <div className="user-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="user-dropdown-info">
                  <div className="dropdown-name">{name}</div>
                  <div className="dropdown-dept">
                    {department || (role?.toLowerCase() === 'admin' ? 'Quản trị viên' : 'Nhân viên')}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setShowViewModal(true);
                  }}
                  className="user-dropdown-item"
                >
                  <User size={16} /> Xem thông tin
                </button>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setEditName(name || '');
                    setEditEmail(email || '');
                    setEditDept(department || '');
                    setChangePin(false);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setShowEditModal(true);
                  }}
                  className="user-dropdown-item"
                >
                  <Edit size={16} /> Sửa thông tin
                </button>
                <button
                  onClick={handleLogout}
                  className="user-dropdown-item danger"
                >
                  <LogOut size={16} /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ===== CHƯA ĐĂNG NHẬP: Nút Đăng nhập ===== */
          <button
            className="btn-login-topnav"
            onClick={() => navigate('/login')}
          >
            <LogIn size={16} />
            <span>Đăng nhập</span>
          </button>
        )}
      </div>

      {/* Modal Xem thông tin */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title="Thông tin cá nhân"
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setShowViewModal(false)}>
            Đóng
          </Button>
        }
      >
        <div className="profile-view-container">
          <div className="profile-view-header">
            <div className="profile-view-avatar">{initial}</div>
            <h3 className="profile-view-name">{name}</h3>
            <span className="profile-view-badge">
              {role?.toLowerCase() === 'admin' ? 'Quản trị viên' : 'Nhân viên'}
            </span>
          </div>

          <div className="profile-view-details">
            <div className="profile-detail-row">
              <div className="profile-detail-label">
                <User size={16} />
                <span>Tên đăng nhập</span>
              </div>
              <div className="profile-detail-value">{username}</div>
            </div>

            <div className="profile-detail-row">
              <div className="profile-detail-label">
                <Mail size={16} />
                <span>Email</span>
              </div>
              <div className="profile-detail-value">{email || '(Chưa cập nhật)'}</div>
            </div>

            <div className="profile-detail-row">
              <div className="profile-detail-label">
                <Building2 size={16} />
                <span>Khoa / Phòng</span>
              </div>
              <div className="profile-detail-value">{department || '(Chưa cập nhật)'}</div>
            </div>

            <div className="profile-detail-row">
              <div className="profile-detail-label">
                <Shield size={16} />
                <span>Vai trò hệ thống</span>
              </div>
              <div className="profile-detail-value">
                {role?.toLowerCase() === 'admin' ? 'Quản trị viên (Admin)' : 'Nhân viên (User)'}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Sửa thông tin */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !isSaving && setShowEditModal(false)}
        title="Cập nhật thông tin cá nhân"
        size="md"
      >
        <form onSubmit={handleSaveProfile} className="profile-edit-form">
          <Input
            label="Họ và Tên"
            type="text"
            placeholder="Nhập họ và tên..."
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={isSaving}
            required
            icon={<User size={16} />}
          />

          <Input
            label="Email"
            type="email"
            placeholder="Nhập email..."
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            disabled={isSaving}
            icon={<Mail size={16} />}
          />

          <Input
            label="Khoa / Phòng"
            type="text"
            list="edit-profile-depts"
            placeholder="Chọn hoặc nhập khoa phòng..."
            value={editDept}
            onChange={(e) => setEditDept(e.target.value)}
            disabled={isSaving}
            icon={<Building2 size={16} />}
          />
          <datalist id="edit-profile-depts">
            {departments.map((dept) => (
              <option key={dept} value={dept} />
            ))}
          </datalist>

          <div className="change-pin-section">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={changePin}
                onChange={(e) => setChangePin(e.target.checked)}
                disabled={isSaving}
              />
              <span className="checkbox-checkmark"></span>
              <span className="checkbox-label">Thay đổi mã PIN đăng nhập</span>
            </label>

            {changePin && (
              <div className="pin-fields-grid">
                <Input
                  label="Mã PIN hiện tại"
                  type="password"
                  placeholder="Nhập mã PIN cũ..."
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  disabled={isSaving}
                  required={changePin}
                  icon={<Lock size={16} />}
                />
                
                <div className="pin-new-fields">
                  <Input
                    label="Mã PIN mới"
                    type="password"
                    placeholder="Mã PIN mới..."
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    disabled={isSaving}
                    required={changePin}
                    icon={<Lock size={16} />}
                  />
                  <Input
                    label="Xác nhận mã PIN mới"
                    type="password"
                    placeholder="Nhập lại mã PIN mới..."
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    disabled={isSaving}
                    required={changePin}
                    icon={<Lock size={16} />}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="profile-edit-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowEditModal(false)}
              disabled={isSaving}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </Modal>
    </header>
  );
};

export default TopNav;
