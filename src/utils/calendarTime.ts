// Shared calendar time-zone helpers. Split out from CalendarView.tsx so non-component
// code (used by CalendarStrategyPanel.tsx too) doesn't live in a component file —
// keeps react-refresh happy and avoids duplicating this logic.

export function scheduledAtUTC(dateStr: string, timeStr: string, tz: string): string {
  // dateStr = 'YYYY-MM-DD', timeStr = 'HH:MM'
  // Strategy: treat the input as UTC, then correct by the actual tz offset using formatToParts.
  // This avoids parsing locale strings with new Date() which is unreliable across browsers.
  const [y, mo, day] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);

  const guess = new Date(Date.UTC(y, mo - 1, day, h, min, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(guess);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
  const tzH   = get('hour') % 24; // hour12:false can return 24 for midnight
  const tzMin = get('minute');
  const tzDay = get('day');
  const tzMo  = get('month');
  const tzY   = get('year');

  // How far off is our guess (in tz) from what we actually want?
  const wantedMs = Date.UTC(y, mo - 1, day, h, min, 0);
  const gotMs    = Date.UTC(tzY, tzMo - 1, tzDay, tzH, tzMin, 0);

  return new Date(guess.getTime() + (wantedMs - gotMs)).toISOString();
}
