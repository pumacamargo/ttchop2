import type { UploadDiagnostic } from './sessionUploadWorkflow';

type ReadPhase = 'file-probe' | 'file-copy';
type ReadEvent = Omit<UploadDiagnostic, 'clipId' | 'bytes'>;
const canceled = () => Object.assign(new Error('File read canceled'), { code: 'upload/canceled' });

// FileReader is deliberately abortable: a timed-out attempt must stop before another starts.
function readOnce(blob: Blob, phase: ReadPhase, signal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(canceled()); return; }
    const reader = new FileReader();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reader.onload = reader.onerror = reader.onabort = null;
      const result = reader.result;
      if (reader.readyState === 1) reader.abort();
      if (error) reject(error);
      else resolve(result as ArrayBuffer);
    };
    const abort = () => finish(canceled());
    const failed = () => finish(Object.assign(new Error('File read failed'), { code: `upload/${phase}-read` }));
    const timer = setTimeout(() => finish(Object.assign(new Error('File read timed out'), {
      code: `upload/${phase}-timeout`,
    })), 15_000);
    reader.onload = () => finish();
    reader.onerror = failed;
    reader.onabort = abort;
    signal.addEventListener('abort', abort, { once: true });
    try { reader.readAsArrayBuffer(blob); } catch { failed(); }
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(canceled()); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(canceled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function prepareSessionUploadFile(file: File, signal: AbortSignal,
  report: (event: ReadEvent) => void): Promise<File | Blob> {
  async function read(blob: Blob, phase: ReadPhase): Promise<ArrayBuffer> {
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw canceled();
      report({ phase, attempt, code: 'upload/running', retry: false });
      try {
        const buffer = await readOnce(blob, phase, signal);
        report({ phase, attempt, code: 'upload/complete', retry: false });
        return buffer;
      } catch (error) {
        const originalCode = (error as { code?: unknown })?.code;
        const code = originalCode === 'upload/canceled' || originalCode === `upload/${phase}-timeout`
          ? originalCode : `upload/${phase}-read`;
        const retry = code !== 'upload/canceled' && attempt < 3;
        report({ phase, attempt, code, retry });
        if (!retry) throw Object.assign(new Error('File read unavailable'), { code });
        await pause(attempt * 200, signal);
      }
    }
  }
  await read(file.slice(0, 65536), 'file-probe');
  if (file.size > 25 * 1024 * 1024) return file;
  return new Blob([await read(file, 'file-copy')], { type: file.type || 'video/mp4' });
}
