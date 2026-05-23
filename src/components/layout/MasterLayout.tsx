import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import './MasterLayout.css';

const MasterLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 900;
  });

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="master-layout">
      <Sidebar isOpen={isSidebarOpen} />
      {isSidebarOpen && <button className="layout-scrim" aria-label="Đóng thanh điều hướng" onClick={toggleSidebar} />}
      <div className="content-wrapper">
        <TopNav toggleSidebar={toggleSidebar} />
        <main className="main-content">
          <Outlet /> {/* This will render nested routes */}
        </main>
      </div>
    </div>
  );
};

export default MasterLayout;
