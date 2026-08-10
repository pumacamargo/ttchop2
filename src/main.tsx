import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PublicProductPage } from './components/PublicProductPage.tsx'
import { AuthProvider } from './context/AuthContext'
import { db } from './services/databaseService'

if (import.meta.env.DEV) {
  (window as any).__db = db;
}

const publicProductMatch = window.location.pathname.match(/^\/p\/([^/]+)/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicProductMatch ? (
      <PublicProductPage productId={publicProductMatch[1]} />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
