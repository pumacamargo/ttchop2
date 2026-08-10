import React, { useState, useEffect } from 'react';
import { ProductsView } from './components/ProductsView';
import { SessionsView } from './components/SessionsView';
import { TemplatesView } from './components/TemplatesView';
import { MasterCreatorView } from './components/MasterCreatorView';
import { VariationsMatrixView } from './components/VariationsMatrixView';
import { OverlaysView } from './components/OverlaysView';
import { RendersView } from './components/RendersView';
import { WeeklyRendersView } from './components/WeeklyRendersView';
import { CalendarView } from './components/CalendarView';
import { AuthView } from './components/AuthView';
import { useAuth } from './context/AuthContext';
import { LanguageProvider, useT } from './context/LanguageContext';
import { db } from './services/databaseService';
import type { MasterVideo } from './services/databaseService';
import {
  Package,
  Video,
  FileText,
  Sparkles,
  Scissors,
  Layers,
  Clapperboard,
  Film,
  CalendarDays,
  LogOut
} from 'lucide-react';
import './App.css';

type ActiveTab = 'products' | 'sessions' | 'templates' | 'projects' | 'renders' | 'calendar';
type ProjectsSubTab = 'ai' | 'edit' | 'overlay';

function AppInner({ appLanguage, setAppLanguage }: { appLanguage: string; setAppLanguage: (l: string) => void }) {
  const { user, loading, logout } = useAuth();
  const t = useT();
  const [activeTab, setActiveTab] = useState<ActiveTab>('products');
  const [projectsSubTab, setProjectsSubTab] = useState<ProjectsSubTab>('edit');
  const [selectedMaster, setSelectedMaster] = useState<MasterVideo | undefined>(undefined);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  type AppMode = 'prod' | 'test' | 'server';
  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('ttchop_mode') as AppMode | null;
    if (saved === 'prod' || saved === 'test' || saved === 'server') return saved;
    return localStorage.getItem('ttchop_test_mode') === 'true' ? 'test' : 'prod';
  });

  // Load initial master video selection
  useEffect(() => {
    const loadInitialData = async () => {
      const masters = await db.getMasterVideos();
      if (masters.length > 0) setSelectedMaster(masters[0]);
    };

    loadInitialData();
  }, [user]);

  useEffect(() => {
    localStorage.setItem('ttchop_mode', mode);
    localStorage.setItem('ttchop_test_mode', String(mode === 'test'));
  }, [mode]);

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

  return (
    <div className="app-container">
      {/* CENTRAL CONTAINER: Main viewport */}
      <main className="mobile-container">

        {/* App Header Bar */}
        <header className="view-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ background: 'var(--primary-glow)', width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '0.85rem' }}>TT</span>
            </div>
            <h1 style={{
              fontSize: '1.2rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em',
              fontFamily: 'var(--font-heading)',
              background: 'var(--gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>TTChop</h1>
            <span style={{
              fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--secondary)', background: 'rgba(76,215,246,0.12)',
              border: '1px solid rgba(76,215,246,0.25)', borderRadius: '4px', padding: '2px 6px'
            }}>PRO</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setMode(m => m === 'prod' ? 'test' : m === 'test' ? 'server' : 'prod')}
              style={{
                background: mode === 'test' ? 'rgba(234,179,8,0.15)' : mode === 'server' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)',
                border: `1px solid ${mode === 'test' ? 'rgba(234,179,8,0.3)' : mode === 'server' ? 'rgba(139,92,246,0.3)' : 'rgba(16,185,129,0.3)'}`,
                color: mode === 'test' ? '#eab308' : mode === 'server' ? '#8b5cf6' : '#10b981',
                padding: '4px 10px', borderRadius: '999px', cursor: 'pointer',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', transition: 'all 0.2s'
              }}
              title={mode === 'server' ? 'Server mode: calls ttchop-server directly' : `Toggle mode (${mode})`}
            >
              {mode === 'prod' ? 'PROD' : mode === 'test' ? 'TEST' : 'SERVER'}
            </button>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', padding: '6px', borderRadius: '8px',
                cursor: isLoggingOut ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isLoggingOut ? 0.6 : 1, transition: 'all 0.2s'
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* Dynamic Views Switcher */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'sessions' && <SessionsView />}
          {activeTab === 'templates' && (
            <TemplatesView
              language={appLanguage}
              onLanguageChange={setAppLanguage}
              onTemplateSelected={() => {
                setActiveTab('projects');
                setProjectsSubTab('ai');
              }}
            />
          )}
          {activeTab === 'renders' && (mode === 'server' ? <WeeklyRendersView /> : <RendersView />)}
          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'projects' && (
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
                {projectsSubTab === 'ai' && <MasterCreatorView onGoToRenders={() => setActiveTab('renders')} />}
                {projectsSubTab === 'edit' && <VariationsMatrixView initialMasterVideo={selectedMaster} onGoToRenders={() => setActiveTab('renders')} serverMode={mode === 'server'} />}
                {projectsSubTab === 'overlay' && <OverlaysView onGoToRenders={() => setActiveTab('renders')} />}
              </div>
            </div>
          )}
        </div>

        {/* Tab Touch Bar Navigation */}
        <nav className="sticky-nav">
          <button className={`nav-item ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
            <Package size={19} />
            {t.nav_products}
          </button>
          <button className={`nav-item ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
            <Video size={19} />
            {t.nav_clips}
          </button>

          {/* Create — gradient FAB circle */}
          <button
            onClick={() => setActiveTab('projects')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
          >
            <div style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: activeTab === 'projects' ? 'var(--gradient)' : 'rgba(109,59,215,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: activeTab === 'projects' ? 'none' : '1px solid rgba(109,59,215,0.5)',
              boxShadow: activeTab === 'projects' ? '0 0 20px rgba(109,59,215,0.5)' : 'none',
              transition: 'all 0.3s'
            }}>
              <Clapperboard size={20} color={activeTab === 'projects' ? '#fff' : '#a78bfa'} />
            </div>
            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: activeTab === 'projects' ? 'var(--secondary)' : 'var(--text-muted)' }}>{t.nav_create}</span>
          </button>

          <button className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            <FileText size={19} />
            {t.nav_templates}
          </button>
          {mode !== 'server' && (
            <button className={`nav-item ${activeTab === 'renders' ? 'active' : ''}`} onClick={() => setActiveTab('renders')}>
              <Film size={19} />
              {t.nav_renders}
            </button>
          )}
          {mode === 'server' && (
            <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
              <CalendarDays size={19} />
              Calendar
            </button>
          )}
        </nav>
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
