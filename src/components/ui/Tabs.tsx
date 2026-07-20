import React, { useId, useState } from 'react';
import './Tabs.css';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab, activeTab: controlledActiveTab, onTabChange, className = '' }) => {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || tabs[0]?.id);
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const tabsId = useId();
  const tabDomId = (tabId: string) => `${tabsId}-tab-${tabId}`;
  const panelDomId = (tabId: string) => `${tabsId}-tabpanel-${tabId}`;

  const selectTab = (tabId: string) => {
    if (controlledActiveTab === undefined) setInternalActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null || !tabs[nextIndex]) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectTab(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(tabDomId(nextTab.id))?.focus());
  };

  return (
    <div className={`tabs-container ${className}`}>
      <div className="tabs-list" role="tablist" aria-label="Các phần thông tin">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={tabDomId(tab.id)}
            type="button"
            role="tab"
            aria-controls={panelDomId(tab.id)}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`tab-trigger ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
            onKeyDown={event => handleTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={panelDomId(activeTab || '')}
        className="tabs-content"
        role="tabpanel"
        aria-labelledby={tabDomId(activeTab || '')}
        tabIndex={0}
      >
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
};

export default Tabs;
