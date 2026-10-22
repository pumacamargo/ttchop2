// Mounted-modal checkpoints only: no reload/background recovery is promised.
export type UploadPhase = 'transfer' | 'download-url' | 'registration';
export interface UploadCheckpoint {
  id: string;
  path: string;
  userId: string;
  sessionId: string;
  transferred: boolean;
  downloadUrl?: string;
  registered: boolean;
}
export interface UploadDiagnostic {
  clipId: string;
  phase: UploadPhase | 'file-probe' | 'file-copy';
  attempt: number;
  code: string;
  bytes: number;
  retry: boolean;
}
interface UploadOperations {
  transfer: (checkpoint: UploadCheckpoint) => Promise<void>;
  getUrl: (checkpoint: UploadCheckpoint) => Promise<string>;
  register: (checkpoint: UploadCheckpoint) => Promise<void>;
  delay?: (ms: number) => Promise<void>;
  report?: (event: UploadDiagnostic) => void;
  bytes?: () => number;
}
export function uploadErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/.test(code) && code.length <= 80
    ? code : 'upload/unknown';
}
const transientCodes = new Set(['storage/retry-limit-exceeded', 'storage/network-request-failed',
  'upload/stalled', 'unavailable', 'deadline-exceeded', 'aborted',
  'firestore/unavailable', 'firestore/deadline-exceeded', 'firestore/aborted']);
export async function runSessionUpload(cp: UploadCheckpoint, ops: UploadOperations): Promise<void> {
  const delay = ops.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  async function phase<T>(name: UploadPhase, action: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const report = (code: string, retry: boolean) => ops.report?.({ clipId: cp.id, phase: name, attempt, code,
        bytes: Math.max(0, ops.bytes?.() ?? 0), retry });
      report('upload/running', false);
      try { const result = await action(); report('upload/complete', false); return result; }
      catch (error) {
        const code = uploadErrorCode(error);
        const retry = attempt < 3 && transientCodes.has(code);
        report(code, retry);
        if (!retry) throw error; // Preserve SDK error identity/code; never log its raw details.
        await delay(attempt * 1000);
      }
    }
  }
  if (!cp.transferred) {
    await phase('transfer', () => ops.transfer(cp));
    cp.transferred = true;
  }
  if (!cp.downloadUrl) cp.downloadUrl = await phase('download-url', () => ops.getUrl(cp));
  if (!cp.registered) {
    await phase('registration', () => ops.register(cp));
    cp.registered = true;
  }
}
