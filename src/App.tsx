import React, { useState, useEffect } from 'react';
import { ProductsView } from './components/ProductsView';
import { SessionsView } from './components/SessionsView';
import { TemplatesView } from './components/TemplatesView';
import { MasterCreatorView } from './components/MasterCreatorView';
import { VariationsMatrixView } from './components/VariationsMatrixView';
import { OverlaysView } from './components/OverlaysView';
import { WeeklyRendersView } from './components/WeeklyRendersView';
import { CalendarView } from './components/CalendarView';
import { DashboardView } from './components/DashboardView';
import { AnalyticsView } from './components/AnalyticsView';
import { BrandConceptView } from './components/BrandConceptView';
import { ReportsView } from './components/ReportsView';
import { EditorView } from './components/EditorView';
import { ToolsView } from './components/ToolsView';
import { SidePanel } from './components/SidePanel';
import { AuthView } from './components/AuthView';
import { useAuth } from './context/AuthContext';
import { LanguageProvider, useT } from './context/LanguageContext';
import { db } from './services/databaseService';
import type { MasterVideo } from './services/databaseService';
import type { ActiveTab } from './types/navigation';
import {
  Menu,
  Sparkles,
  Scissors,
  Layers,
} from 'lucide-react';
import './App.css';

type ProjectsSubTab = 'ai' | 'edit' | 'overlay';

function AppInner({ appLanguage, setAppLanguage }: { appLanguage: string; setAppLanguage: (l: string) => void }) {
  const { user, loading, logout } = useAuth();
  const t = useT();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [projectsSubTab, setProjectsSubTab] = useState<ProjectsSubTab>('edit');
  const [selectedMaster, setSelectedMaster] = useState<MasterVideo | undefined>(undefined);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  // Load initial master video selection
  useEffect(() => {
    const loadInitialData = async () => {
      const masters = await db.getMasterVideos();
      if (masters.length > 0) setSelectedMaster(masters[0]);
    };

    loadInitialData();
  }, [user]);

  // Scroll to top on tab change
  useEffect(() => {
    const el = document.querySelector('.view-content');
    if (el) el.scrollTop = 0;
  }, [activeTab]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Show loading screen while checking auth
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-space)',
        color: 'var(--text-secondary)'
      }}>
        <p>Checking session...</p>
      </div>
    );
  }

  // Show auth view if not logged in
  if (!user) {
    return <AuthView />;
  }

  const activeTabTitle: Record<ActiveTab, string> = {
    dashboard: t.nav_dashboard,
    products: t.nav_products,
    templates: t.nav_templates,
    create: t.nav_create,
    calendar: t.nav_calendar,
    analytics: t.nav_analytics,
    brand: t.nav_brand,
    reports: t.nav_reports,
    editor: t.nav_editor,
    tools: t.nav_tools,
    sessions: t.nav_clips,
    renders: t.nav_renders,
  };

  return (
    <div className="app-container">
      {/* CENTRAL CONTAINER: Main viewport */}
      <main className="mobile-container">

        {/* App Header Bar */}
        <header className="view-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => setIsSidePanelOpen(true)}
              aria-label={t.nav_menu}
              className="header-menu-btn"
            >
              <Menu size={22} />
            </button>
            <h1 style={{
              fontSize: '1.1rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em',
              fontFamily: 'var(--font-heading)', color: 'var(--text-primary)'
            }}>
              {activeTabTitle[activeTab]}
            </h1>
          </div>

          <span style={{
            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--secondary)', background: 'rgba(76,215,246,0.12)',
            border: '1px solid rgba(76,215,246,0.25)', borderRadius: '4px', padding: '2px 6px'
          }}>PRO</span>
        </header>

        <SidePanel
          isOpen={isSidePanelOpen}
          onClose={() => setIsSidePanelOpen(false)}
          activeTab={activeTab}
          onNavigate={setActiveTab}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
        />

        {/* Dynamic Views Switcher */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {activeTab === 'dashboard' && <DashboardView onGoToAnalytics={() => setActiveTab('analytics')} />}
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'sessions' && <SessionsView />}
          {activeTab === 'templates' && (
            <TemplatesView
              language={appLanguage}
              onLanguageChange={setAppLanguage}
              onTemplateSelected={() => {
                setActiveTab('create');
                setProjectsSubTab('ai');
              }}
            />
          )}
          {activeTab === 'renders' && <WeeklyRendersView />}
          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'brand' && <BrandConceptView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'editor' && <EditorView />}
          {activeTab === 'tools' && <ToolsView />}
          {activeTab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Sub-nav: Video AI / Collage / Overlays */}
              <div style={{ display: 'flex', gap: '0.5rem', padding: '1rem 1rem 0' }}>
                {([
                  { key: 'ai',      label: t.subnav_ai,      icon: <Sparkles size={14} /> },
                  { key: 'edit',    label: t.subnav_collage,  icon: <Scissors size={14} /> },
                  { key: 'overlay', label: t.subnav_overlay, icon: <Layers size={14} /> },
                ] as { key: ProjectsSubTab; label: string; icon: React.ReactNode }[]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setProjectsSubTab(tab.key)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '0.55rem 0.25rem',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: projectsSubTab === tab.key ? 'var(--gradient)' : 'rgba(109,59,215,0.1)',
                      color: projectsSubTab === tab.key ? '#fff' : 'var(--text-secondary)',
                      border: projectsSubTab === tab.key ? '1px solid transparent' : '1px solid rgba(109,59,215,0.3)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflow: 'auto' }}>
                {projectsSubTab === 'ai' && <MasterCreatorView onGoToCalendar={() => setActiveTab('calendar')} />}
                {projectsSubTab === 'edit' && <VariationsMatrixView initialMasterVideo={selectedMaster} onGoToCalendar={() => setActiveTab('calendar')} />}
                {projectsSubTab === 'overlay' && <OverlaysView onGoToCalendar={() => setActiveTab('calendar')} />}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function App() {
  const [appLanguage, setAppLanguage] = React.useState(() => {
    return localStorage.getItem('ttchop_language') || 'English';
  });

  React.useEffect(() => {
    localStorage.setItem('ttchop_language', appLanguage);
  }, [appLanguage]);

  return (
    <LanguageProvider language={appLanguage}>
      <AppInner appLanguage={appLanguage} setAppLanguage={setAppLanguage} />
    </LanguageProvider>
  );
}

export default App;
