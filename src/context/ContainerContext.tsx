// Container context — tracks which "container" (see PLAN.md: general vs. per-TikTok-account
// data) is currently active, and the list of connected TikTok accounts a user can switch to.
// Connecting TikTok is entirely optional: with zero accounts connected this always resolves to
// the general container, so every existing view keeps behaving exactly as it does today.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../services/databaseService';
import { getTikTokAccounts } from '../services/tiktokService';
import type { TikTokAccount } from '../services/tiktokService';

// Fuente ÚNICA de "qué cuenta está activa". Decide a la vez qué datos se ven (productos, clips,
// renders...) y a qué cuenta se sube un video. Tener dos preferencias distintas para eso sería una
// trampa: el usuario cambia de contenedor a la cuenta A y sus subidas seguirían yendo a la B sin
// que nada se lo indique. Para el usuario es un solo concepto y así se modela.
const ACTIVE_CONTAINER_PREF_KEY = 'activeAccountId';
// Key anterior, usada solo para heredar la elección de quien ya había escogido cuenta de subida.
const LEGACY_UPLOAD_TARGET_PREF_KEY = 'activeTiktokAccountId';

interface ContainerContextValue {
  /** null = general/shared container. Otherwise a connected account's TikTok openId. */
  activeAccountId: string | null;
  /** Full account info for the active container; null when the general container is active. */
  activeAccount: TikTokAccount | null;
  /** Every TikTok account connected to this user, regardless of which is active. */
  accounts: TikTokAccount[];
  loading: boolean;
  error: string;
  switchContainer: (accountId: string | null) => Promise<void>;
  refreshAccounts: () => Promise<void>;
}

const ContainerContext = createContext<ContainerContextValue | undefined>(undefined);

export const ContainerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      setActiveAccountId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [list, saved, legacy] = await Promise.all([
        getTikTokAccounts(),
        db.getUserPref(ACTIVE_CONTAINER_PREF_KEY),
        db.getUserPref(LEGACY_UPLOAD_TARGET_PREF_KEY),
      ]);
      if (!mountedRef.current) return;
      setAccounts(list);
      // Si el usuario ya había elegido cuenta de subida antes de que existieran los contenedores,
      // esa elección se hereda para no perderla al unificar ambos conceptos en uno.
      const pref = saved || legacy || '';
      if (pref && !list.some(a => a.openId === pref)) {
        // The saved container points at an account the user has since disconnected — fall back
        // to general and clear the stale pref so we don't keep trying to resolve it.
        setActiveAccountId(null);
        db.setUserPref(ACTIVE_CONTAINER_PREF_KEY, '').catch(() => {});
      } else {
        setActiveAccountId(pref || null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // Connecting TikTok is optional — if this call fails for any reason (network hiccup,
      // function cold start, etc.) the app must still behave exactly as it does with zero
      // accounts connected: fall back to the general container instead of surfacing a hard error.
      setAccounts([]);
      setActiveAccountId(null);
      setError(err instanceof Error ? err.message : 'Failed to load TikTok accounts.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const switchContainer = useCallback(async (accountId: string | null) => {
    setActiveAccountId(accountId);
    try {
      await db.setUserPref(ACTIVE_CONTAINER_PREF_KEY, accountId ?? '');
    } catch (err) {
      console.error('Failed to persist the active container:', err);
    }
  }, []);

  const activeAccount = accounts.find(a => a.openId === activeAccountId) ?? null;

  return (
    <ContainerContext.Provider
      value={{ activeAccountId, activeAccount, accounts, loading, error, switchContainer, refreshAccounts: load }}
    >
      {children}
    </ContainerContext.Provider>
  );
};

export const useContainer = () => {
  const context = useContext(ContainerContext);
  if (context === undefined) {
    throw new Error('useContainer must be used within a ContainerProvider');
  }
  return context;
};
