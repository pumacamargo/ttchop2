import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PublicProductPage } from './components/PublicProductPage.tsx'
import { TermsOfServicePage, PrivacyPolicyPage } from './components/LegalPages.tsx'
import { AuthProvider } from './context/AuthContext'
import { db } from './services/databaseService'

if (import.meta.env.DEV) {
  (window as any).__db = db;
}

const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
const publicProductMatch = window.location.pathname.match(/^\/p\/([^/]+)/);

// Las páginas legales van FUERA del AuthProvider: TikTok y las tiendas de extensiones las
// consultan de forma anónima, así que no pueden quedar detrás del login.
function Root() {
  if (publicProductMatch) return <PublicProductPage productId={publicProductMatch[1]} />;
  if (path === '/terms') return <TermsOfServicePage />;
  if (path === '/privacy') return <PrivacyPolicyPage />;
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
