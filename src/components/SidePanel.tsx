import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  FileText,
  Clapperboard,
  CalendarDays,
  BarChart3,
  Palette,
  Scissors,
  Wrench,
  FileBarChart,
  Repeat2,
  LogOut,
} from 'lucide-react';
import { useT } from '../context/LanguageContext';
import type { ActiveTab } from '../types/navigation';
import { TikTokAccountsModal } from './TikTokAccountsModal';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
}

interface MenuItem {
  tab: ActiveTab;
  label: string;
  icon: React.ReactNode;
  soon?: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onClose, activeTab, onNavigate, onLogout, isLoggingOut }) => {
  const t = useT();
  const [showAccountsModal, setShowAccountsModal] = useState(false);

  const handleSwitchAccount = () => {
    onClose();
    setShowAccountsModal(true);
  };

  // Escape key closes the panel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll while the panel is open
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const menuItems: MenuItem[] = [
    { tab: 'dashboard', label: t.nav_dashboard, icon: <LayoutDashboard size={19} /> },
    { tab: 'products', label: t.nav_products, icon: <Package size={19} /> },
    { tab: 'templates', label: t.nav_templates, icon: <FileText size={19} /> },
    { tab: 'create', label: t.nav_create, icon: <Clapperboard size={19} /> },
    { tab: 'calendar', label: t.nav_calendar, icon: <CalendarDays size={19} /> },
    { tab: 'analytics', label: t.nav_analytics, icon: <BarChart3 size={19} /> },
    { tab: 'brand', label: t.nav_brand, icon: <Palette size={19} /> },
    { tab: 'editor', label: t.nav_editor, icon: <Scissors size={19} />, soon: true },
    { tab: 'tools', label: t.nav_tools, icon: <Wrench size={19} />, soon: true },
    { tab: 'reports', label: t.nav_reports, icon: <FileBarChart size={19} /> },
  ];

  const handleNavigate = (tab: ActiveTab) => {
    onNavigate(tab);
    onClose();
  };

  return (
    <>
      <div
        className={`side-panel-backdrop ${isOpen ? 'open' : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <nav
        className={`side-panel ${isOpen ? 'open' : ''}`}
        role="navigation"
        aria-label={t.nav_menu}
        aria-hidden={!isOpen}
      >
        <div className="side-panel-header">
          <div className="side-panel-logo-badge">
            <span>TT</span>
          </div>
          <h1 className="side-panel-wordmark">TTChop</h1>
        </div>

        <div className="side-panel-items">
          {menuItems.map(item => (
            <button
              key={item.tab}
              type="button"
              className={`side-panel-item ${activeTab === item.tab ? 'active' : ''} ${item.soon ? 'soon' : ''}`}
              onClick={() => !item.soon && handleNavigate(item.tab)}
              disabled={item.soon}
              aria-label={item.label}
              aria-current={activeTab === item.tab ? 'page' : undefined}
            >
              <span className="side-panel-item-icon">{item.icon}</span>
              <span className="side-panel-item-label">{item.label}</span>
              {item.soon && <span className="side-panel-badge">{t.nav_soon}</span>}
            </button>
          ))}
        </div>

        <div className="side-panel-divider" />

        <div className="side-panel-footer">
          <button
            type="button"
            className="side-panel-item"
            onClick={handleSwitchAccount}
            aria-label={t.nav_switch_account}
          >
            <span className="side-panel-item-icon"><Repeat2 size={19} /></span>
            <span className="side-panel-item-label">{t.nav_switch_account}</span>
          </button>
          <button
            type="button"
            className="side-panel-item side-panel-logout"
            onClick={onLogout}
            disabled={isLoggingOut}
            aria-label={t.nav_logout}
          >
            <span className="side-panel-item-icon"><LogOut size={19} /></span>
            <span className="side-panel-item-label">{t.nav_logout}</span>
          </button>
        </div>
      </nav>

      {showAccountsModal && <TikTokAccountsModal onClose={() => setShowAccountsModal(false)} />}
    </>
  );
};
