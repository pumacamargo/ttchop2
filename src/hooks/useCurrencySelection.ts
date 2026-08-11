// Shared currency-selection logic for AnalyticsView and DashboardView. Orders are grouped
// by currency and amounts are never summed across currencies — the user picks one to view
// its totals, defaulting to whichever currency has the largest GMV.
import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsOrder } from '../services/databaseService';

export function useCurrencySelection(orders: AnalyticsOrder[]) {
  const [selectedCurrency, setSelectedCurrency] = useState('');

  const currencies = useMemo(() => Array.from(new Set(orders.map(o => o.currency).filter(Boolean))), [orders]);

  const dominantCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    orders.forEach(o => totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.gmv));
    let best = '';
    let bestVal = -Infinity;
    totals.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
    return best;
  }, [orders]);

  useEffect(() => {
    if (currencies.length === 0) { setSelectedCurrency(''); return; }
    if (!currencies.includes(selectedCurrency)) setSelectedCurrency(dominantCurrency);
  }, [currencies, dominantCurrency, selectedCurrency]);

  const currencyOrders = useMemo(
    () => (selectedCurrency ? orders.filter(o => o.currency === selectedCurrency) : orders),
    [orders, selectedCurrency]
  );

  return { currencies, selectedCurrency, setSelectedCurrency, currencyOrders };
}
