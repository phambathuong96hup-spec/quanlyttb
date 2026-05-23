import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Pill,
  Activity,
  Microscope,
  ClipboardPlus,
  ClipboardCheck,
  PieChart,
  Thermometer,
  Lock,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../authContext';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const publicItems = [
    { path: '/dashboard', name: 'Tổng quan', icon: Activity, private: false },
    { path: '/devices', name: 'Quản lý thiết bị', icon: Microscope, private: false },
  ];

  const privateItems = [
    { path: '/requests', name: 'Tạo yêu cầu', icon: ClipboardPlus, private: true },
    { path: '/tracking', name: 'Theo dõi thiết bị', icon: Wrench, private: true },
    { path: '/operations', name: 'Điều hành công việc', icon: ClipboardCheck, private: true },
    { path: '/reports', name: 'Thống kê & báo cáo', icon: PieChart, private: true },
    { path: '/gsp', name: 'Nhật ký nhiệt độ (GSP)', icon: Thermometer, private: true },
  ];


  const handlePrivateClick = (e: React.MouseEvent, path: string, isPrivate: boolean) => {
    if (isPrivate && !isAuthenticated) {
      e.preventDefault();
      navigate('/login', { state: { from: { pathname: path } } });
    }
  };

  return (
    <aside className={`sidebar ${!isOpen ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <Pill size={28} className="sidebar-logo-icon" />
        <span className="sidebar-title" style={{ fontSize: '0.9rem' }}>
          WebApp Dược Khoa
          <small style={{ display: 'block', fontSize: '0.68rem', opacity: 0.72, fontWeight: 500 }}>
            Quản lý Trang thiết bị
          </small>
        </span>
      </div>

      <nav className="sidebar-nav">
        {/* Label section: Public */}
        {isOpen && (
          <div className="sidebar-section-label">Thông tin chung</div>
        )}
        {publicItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={!isOpen ? item.name : undefined}
            >
              <Icon size={20} className="nav-icon" />
              <span className="nav-text">{item.name}</span>
            </NavLink>
          );
        })}

        {/* Label section: Private */}
        {isOpen && (
          <div className="sidebar-section-label" style={{ marginTop: '8px' }}>
            Ứng dụng
            {!isAuthenticated && (
              <Lock size={11} style={{ marginLeft: '6px', opacity: 0.6 }} />
            )}
          </div>
        )}
        {privateItems.map((item) => {
          const Icon = item.icon;
          const locked = !isAuthenticated;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''} ${locked ? 'nav-item-locked' : ''}`
              }
              title={!isOpen ? (locked ? `${item.name} (Cần đăng nhập)` : item.name) : undefined}
              onClick={(e) => handlePrivateClick(e, item.path, item.private)}
            >
              <Icon size={20} className="nav-icon" />
              <span className="nav-text">{item.name}</span>
              {locked && isOpen && (
                <Lock size={13} className="nav-lock-icon" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: trạng thái đăng nhập */}
      <div className="sidebar-footer">
        {isAuthenticated ? (
          <div className="sidebar-auth-status auth-ok">
            <span className="auth-dot" />
            {isOpen && <span>Đã đăng nhập</span>}
          </div>
        ) : (
          <button
            className="sidebar-login-btn"
            onClick={() => navigate('/login')}
            title="Đăng nhập để sử dụng đầy đủ tính năng"
          >
            <Lock size={15} />
            {isOpen && <span>Đăng nhập</span>}
          </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
