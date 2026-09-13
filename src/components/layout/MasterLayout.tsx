import { Activity, Microscope, QrCode, ClipboardPlus, Menu } from 'lucide-react';
import { useAuth } from '../../authContext';
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import './MasterLayout.css';

const MasterLayout: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 900;
  });
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => { setIsMobile(media.matches); setIsSidebarOpen(!media.matches); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { if (isMobile) setIsSidebarOpen(false); }, [location.pathname, location.search, isMobile]);
  useEffect(() => {
    if (!isMobile || !isSidebarOpen) return;
    const trigger = menuTriggerRef.current;
    const sidebar = document.getElementById('app-sidebar');
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setIsSidebarOpen(false); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
    };
  }, [isMobile, isSidebarOpen]);

  const toggleSidebar = () => {
    if (!isSidebarOpen && document.activeElement instanceof HTMLElement) menuTriggerRef.current = document.activeElement;
    setIsSidebarOpen(value => !value);
  };

  return (
    <div className="master-layout">
      <Sidebar isOpen={isSidebarOpen} isMobile={isMobile} onNavigate={() => { if (isMobile) setIsSidebarOpen(false); }} />
      {isSidebarOpen && <button className="layout-scrim" aria-label="Đóng thanh điều hướng" onClick={toggleSidebar} />}
      <div className="content-wrapper" inert={isMobile && isSidebarOpen}>
        <TopNav toggleSidebar={toggleSidebar} />
        <main className="main-content">
          <Outlet /> {/* This will render nested routes */}
        </main>
      </div>
      {isAuthenticated && isMobile && <nav className="mobile-navigation" aria-label="Điều hướng điện thoại" inert={isSidebarOpen}>
        {[
          { path: '/dashboard', label: 'Tổng quan', icon: Activity },
          { path: '/devices', label: 'Thiết bị', icon: Microscope },
          { path: '/inventory', label: 'Kiểm kê QR', icon: QrCode },
          { path: '/requests', label: 'Yêu cầu', icon: ClipboardPlus },
        ].map(({ path, label, icon: Icon }) => <NavLink key={path} to={path}>
          <Icon size={21} aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
        <button type="button" onClick={event => { event.currentTarget.focus(); toggleSidebar(); }} aria-expanded={isSidebarOpen} aria-controls="app-sidebar">
          <Menu size={21} aria-hidden="true" /><span>Thêm</span>
        </button>
      </nav>}
    </div>
  );
};

export default MasterLayout;
