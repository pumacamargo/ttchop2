// Client-side parsing for the TikTok Shop order export (.xlsx / .csv).
//
// Three data traps in the source file, handled here:
// 1. Dates are DAY-FIRST ("30/06/2026 18:20:31" = June 30). `new Date(str)` on that
//    string is Invalid Date, so we split on '/' and ':' and build the Date manually.
//    Empty values arrive as the literal string "/".
// 2. Numbers carry thousands separators ("9,510") — parseFloat on that string yields 9,
//    so commas are stripped before parsing. Empty cells are treated as 0.
// 3. `Order ID` is NOT unique — a multi-SKU order produces one row per SKU sharing the
//    same Order ID. The real unique key is `Order ID` + `SKU ID`.
import * as XLSX from 'xlsx';

export const REQUIRED_COLUMNS = [
  'Order ID',
  'SKU ID',
  'Product name',
  'Product ID',
  'Items sold',
  'Items refunded',
  'GMV',
  'Total final earned amount',
  'Content Type',
  'Content ID',
  'Order type',
  'Order settlement status',
  'Currency',
  'Order date',
  'Commission settlement date',
] as const;

const REQUIRED_SHEET = 'Sheet1';

export type AnalyticsImportErrorReason = 'corrupt' | 'missing_sheet' | 'missing_columns' | 'empty';

export class AnalyticsImportError extends Error {
  reason: AnalyticsImportErrorReason;
  missingColumns?: string[];

  constructor(reason: AnalyticsImportErrorReason, message: string, missingColumns?: string[]) {
    super(message);
    this.reason = reason;
    this.missingColumns = missingColumns;
  }
}

export interface ParsedAnalyticsOrder {
  orderId: string;
  skuId: string;
  compositeKey: string; // `${orderId}_${skuId}` — the Firestore doc id
  productId: string;
  productName: string;
  itemsSold: number;
  itemsRefunded: number;
  gmv: number;
  totalFinalEarnedAmount: number;
  contentType: string;
  contentId: string;
  orderType: string;
  settlementStatus: string;
  currency: string;
  orderDate: string | null; // ISO string, local time
  commissionSettlementDate: string | null; // ISO string, local time
}

export interface AnalyticsParseResult {
  totalRows: number;
  orders: ParsedAnalyticsOrder[];
  discardedCount: number;
  discardedSamples: string[]; // human-readable reasons, capped
}

/** Strips thousands separators and treats blanks as 0. "9,510" -> 9510, "" -> 0. */
export function parseTikTokNumber(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  const s = String(raw).trim();
  if (s === '' || s === '/') return 0;
  const cleaned = s.replace(/,/g, '').replace(/%$/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses the day-first "DD/MM/YYYY HH:mm:ss" TikTok Shop date format into an ISO
 * string. Returns null for blank cells (the literal "/" or "") or anything malformed.
 */
export function parseTikTokDate(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === '' || s === '/') return null;

  const [datePart, timePart] = s.split(' ');
  if (!datePart) return null;
  const dateSegs = datePart.split('/');
  if (dateSegs.length !== 3) return null;

  const dd = parseInt(dateSegs[0], 10);
  const mm = parseInt(dateSegs[1], 10);
  const yyyy = parseInt(dateSegs[2], 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;

  let hh = 0, min = 0, ss = 0;
  if (timePart) {
    const timeSegs = timePart.split(':');
    hh = parseInt(timeSegs[0], 10) || 0;
    min = parseInt(timeSegs[1], 10) || 0;
    ss = parseInt(timeSegs[2], 10) || 0;
  }

  // Se interpreta como UTC a propósito. El export de TikTok trae una hora de pared sin zona, así
  // que construirla con `new Date(y, m, d, ...)` la anclaría a la zona de QUIEN importa: el mismo
  // archivo subido desde México y desde Japón guardaría instantes distintos, y como el id del
  // documento es el mismo (orderId_skuId) un reimport sobrescribiría el histórico con otras fechas.
  // Con Date.UTC el resultado es estable y la fecha mostrada coincide con la del archivo.
  const ms = Date.UTC(yyyy, mm - 1, dd, hh, min, ss);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function readRawRows(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.toLowerCase().split('.').pop();
  let workbook: XLSX.WorkBook;

  try {
    if (ext === 'csv') {
      const text = await file.text();
      workbook = XLSX.read(text, { type: 'string' });
    } else {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array' });
    }
  } catch {
    throw new AnalyticsImportError('corrupt', 'This file could not be read — it may be corrupted or in an unsupported format.');
  }

  if (!workbook.SheetNames.includes(REQUIRED_SHEET)) {
    throw new AnalyticsImportError('missing_sheet', `No sheet named "${REQUIRED_SHEET}" was found in this file.`);
  }

  const sheet = workbook.Sheets[REQUIRED_SHEET];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows;
}

/** Parses a TikTok Shop order export file into typed, deduplication-ready rows. */
export async function parseAnalyticsFile(file: File): Promise<AnalyticsParseResult> {
  const rawRows = await readRawRows(file);

  if (rawRows.length === 0) {
    throw new AnalyticsImportError('empty', 'This file has no data rows.');
  }

  const presentColumns = new Set(Object.keys(rawRows[0]));
  const missingColumns = REQUIRED_COLUMNS.filter(col => !presentColumns.has(col));
  if (missingColumns.length > 0) {
    throw new AnalyticsImportError(
      'missing_columns',
      `This file is missing required columns: ${missingColumns.join(', ')}`,
      missingColumns
    );
  }

  const orders: ParsedAnalyticsOrder[] = [];
  const discardedSamples: string[] = [];
  let discardedCount = 0;

  rawRows.forEach((row, idx) => {
    const orderId = String(row['Order ID'] ?? '').trim();
    const skuId = String(row['SKU ID'] ?? '').trim();

    if (!orderId || !skuId) {
      discardedCount++;
      if (discardedSamples.length < 5) {
        discardedSamples.push(`Row ${idx + 2}: missing Order ID or SKU ID`);
      }
      return;
    }

    orders.push({
      orderId,
      skuId,
      compositeKey: `${orderId}_${skuId}`,
      productId: String(row['Product ID'] ?? '').trim(),
      productName: String(row['Product name'] ?? '').trim(),
      itemsSold: parseTikTokNumber(row['Items sold']),
      itemsRefunded: parseTikTokNumber(row['Items refunded']),
      gmv: parseTikTokNumber(row['GMV']),
      totalFinalEarnedAmount: parseTikTokNumber(row['Total final earned amount']),
      contentType: String(row['Content Type'] ?? '').trim(),
      contentId: String(row['Content ID'] ?? '').trim(),
      orderType: String(row['Order type'] ?? '').trim(),
      settlementStatus: String(row['Order settlement status'] ?? '').trim(),
      currency: String(row['Currency'] ?? '').trim(),
      orderDate: parseTikTokDate(row['Order date']),
      commissionSettlementDate: parseTikTokDate(row['Commission settlement date']),
    });
  });

  return {
    totalRows: rawRows.length,
    orders,
    discardedCount,
    discardedSamples,
  };
}
