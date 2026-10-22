import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { modal } from './sessionVideoMutations.test.ts';
const url = new URL('../src/utils/sessionUploadWorkflow.ts', import.meta.url);
const transient = () => Object.assign(new Error('secret URL must not escape'), { code: 'storage/retry-limit-exceeded' });

test('transient transfer retries retain the same checkpoint ID and path', async () => {
  assert.ok(existsSync(url), 'phased production upload helper must exist');
  const { runSessionUpload } = await import(url.href);
  const checkpoint = { id: 'vid-stable', path: 'users/u/sessions/s/videos/vid-stable', userId: 'u', sessionId: 's', transferred: false, registered: false };
  const paths: string[] = [];
  const waits: number[] = [];
  await runSessionUpload(checkpoint, {
    async transfer(cp: typeof checkpoint) { paths.push(cp.path); if (paths.length === 1) throw transient(); },
    async getUrl() { return 'private-download-url'; }, async register() {},
    async delay(ms: number) { waits.push(ms); },
  });
  assert.deepEqual(paths, [checkpoint.path, checkpoint.path]);
  assert.equal(checkpoint.id, 'vid-stable');
  assert.equal(checkpoint.transferred, true);
  assert.equal(checkpoint.registered, true);
  assert.deepEqual(waits, [1000]);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- actual TSX hook adapter */
const file = (name: string) => ({ name, type: 'video/mp4', size: 1, lastModified: 12,
  async arrayBuffer() { return new ArrayBuffer(1); },
  slice() { return { async arrayBuffer() { return new ArrayBuffer(1); } }; },
});
const emptySession: any = { id: 's', userId: 'owner', name: 's', productIds: [], videos: [], createdAt: 'now' };
function deferred() {
  let resolve!: (v?: any) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeDb() {
  const calls = { transfers: [] as string[], urls: [] as string[], registrations: [] as string[], ai: [] as any[], enrich: [] as any[] };
  let next = 0;
  return { calls,
    createSessionVideoUpload(sessionId: string) { const id = `vid-${++next}`; return { id, userId: 'owner', sessionId, path: `users/owner/sessions/${sessionId}/videos/${id}`, transferred: false, registered: false }; },
    assertSessionVideoUploadOwner() {},
    async uploadSessionVideoFile() { return 'legacy-url'; },
    async transferSessionVideoFile(cp: any) { calls.transfers.push(cp.id); },
    async getSessionVideoDownloadURL(cp: any) { calls.urls.push(cp.id); return 'private-token-url'; },
    async addSessionVideo(_s: string, video: any) { calls.registrations.push(video.id); return { type: 'add', video }; },
    async enrichSessionVideo(_s: string, id: string, duration: number, thumbnailUrl: string) {
      calls.enrich.push({ id, duration, thumbnailUrl }); return { type: 'enrich', id, duration, thumbnailUrl, initializeTrimEnd: true };
    },
    async uploadSessionThumbnail() { return 'thumb'; },
    async extractVideoMetadata(...args: any[]) { calls.ai.push(args); return {}; },
    async patchSessionVideo(_s: string, id: string, changes: any, options: any) { return { type: 'patch', id, changes, ...options }; },
  };
}
const environment = () => ({ document: {
  addEventListener() {}, removeEventListener() {},
  createElement(tag: string) {
    if (tag === 'canvas') return { getContext: () => ({ drawImage() {} }), toBlob: (cb: any) => cb(new Blob(['thumb'])) };
    const video: any = { duration: 17, videoWidth: 10, videoHeight: 10, pause() {}, removeAttribute() {}, load() {} };
    Object.defineProperty(video, 'src', { set() { queueMicrotask(() => video.onloadedmetadata?.()); } });
    Object.defineProperty(video, 'currentTime', { set() { queueMicrotask(() => video.onseeked?.()); } });
    return video;
  },
} });
const select = (ui: any, files: any[]) => ui.render().find((n: any) => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files } });
const button = (ui: any, text: string) => ui.render().find((n: any) => n.type === 'button' && n.props.children === text);
const text = (ui: any) => JSON.stringify(ui.render().map((n: any) => typeof n.props?.children === 'string' ? n.props.children : ''));

test('actual modal retries only failed registrations without retransfer/reselection and shows sanitized diagnostics', async () => {
  const db = fakeDb();
  const original = db.addSessionVideo;
  let fail = true;
  db.addSessionVideo = async (s, video) => {
    if (video.name === 'bad.mp4' && fail) throw Object.assign(new Error('https://secret?token=SECRET'), { code: 'permission-denied' });
    return original(s, video);
  };
  const ui = await modal(db, emptySession, environment());
  await select(ui, [file('ok.mp4'), file('bad.mp4'), file('ok.mp4')]);
  assert.equal(db.calls.transfers.length, 2, 'same-batch duplicate names skipped');
  assert.ok(text(ui).includes('bytes del video subidos; registro pendiente'));
  assert.ok(text(ui).includes('permission-denied'));
  assert.equal(text(ui).includes('SECRET'), false);
  assert.ok(button(ui, 'Reintentar fallidos'));
  fail = false;
  await button(ui, 'Reintentar fallidos').props.onClick();
  assert.equal(db.calls.transfers.length, 2);
  assert.equal(db.calls.urls.length, 2);
  assert.equal(db.calls.registrations.length, 2);
  assert.equal(db.calls.ai.length, 2, 'successful clips are not analyzed twice');
  assert.equal(button(ui, 'Reintentar fallidos'), undefined);
});

for (const phase of ['download-url', 'registration'] as const) {
  test(`${phase} transient retry never retransfers completed bytes`, async () => {
    const { runSessionUpload } = await import(url.href);
    const cp = fakeDb().createSessionVideoUpload('s');
    let transfers = 0, urls = 0, registrations = 0;
    const events: any[] = [];
    await runSessionUpload(cp, {
      async transfer() { transfers++; },
      async getUrl() { urls++; if (phase === 'download-url' && urls === 1) throw transient(); return 'secret'; },
      async register() { registrations++; if (phase === 'registration' && registrations === 1) throw transient(); },
      async delay() {}, report: (event: any) => events.push(event),
    });
    assert.equal(transfers, 1);
    assert.equal(urls, phase === 'download-url' ? 2 : 1);
    assert.equal(registrations, phase === 'registration' ? 2 : 1);
    assert.ok(events.some(e => e.phase === phase && e.retry && e.attempt === 1));
    assert.equal(JSON.stringify(events).includes('secret'), false);
  });
}
for (const code of ['storage/unauthenticated', 'storage/unauthorized', 'storage/quota-exceeded', 'upload/file-probe-read', 'upload/file-probe-timeout', 'upload/file-copy-read', 'upload/file-copy-timeout', 'storage/unknown']) {
  test(`${code} is attempted once and preserves the original error`, async () => {
    const { runSessionUpload } = await import(url.href);
    const error = Object.assign(new Error('private details'), { code });
    let attempts = 0;
    await assert.rejects(runSessionUpload(fakeDb().createSessionVideoUpload('s'), {
      async transfer() { attempts++; throw error; }, async getUrl() { return 'url'; }, async register() {},
      async delay() { assert.fail('permanent errors must not sleep'); },
    }), e => e === error);
    assert.equal(attempts, 1);
  });
}
test('manual retry after exhausting URL/registration retries reuses the completed checkpoint', async () => {
  const { runSessionUpload } = await import(url.href);
  for (const phase of ['url', 'registration']) {
    const cp = fakeDb().createSessionVideoUpload('s');
    let transfers = 0, urls = 0, registrations = 0, fail = true;
    const waits: number[] = [];
    const ops = {
      async transfer() { transfers++; },
      async getUrl() { urls++; if (fail && phase === 'url') throw transient(); return 'private'; },
      async register() { registrations++; if (fail && phase === 'registration') throw transient(); },
      async delay(ms: number) { waits.push(ms); },
    };
    await assert.rejects(runSessionUpload(cp, ops));
    assert.equal(cp.transferred, true);
    assert.equal(cp.registered, false);
    assert.deepEqual(waits, [1000, 2000]);
    fail = false;
    await runSessionUpload(cp, ops);
    await runSessionUpload(cp, ops);
    assert.equal(transfers, 1);
    assert.equal(urls, phase === 'url' ? 4 : 1);
    assert.equal(registrations, phase === 'registration' ? 4 : 1);
  }
});

test('actual batch lock covers synchronous double selection and thumbnail enrichment but not AI completion', async () => {
  const db = fakeDb();
  const transfer = deferred(), thumbnail = deferred(), ai = deferred();
  db.transferSessionVideoFile = async cp => { db.calls.transfers.push(cp.id); await transfer.promise; };
  db.uploadSessionThumbnail = () => thumbnail.promise;
  db.extractVideoMetadata = (...args: any[]) => { db.calls.ai.push(args); return ai.promise; };
  const ui = await modal(db, emptySession, environment());
  const first = select(ui, [file('one.mp4')]);
  await select(ui, [file('blocked-before-render.mp4')]);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(db.calls.transfers.length, 1);
  assert.ok(text(ui).includes('transfer · intento 1/3'));
  transfer.resolve();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await select(ui, [file('blocked-enrichment.mp4')]);
  assert.equal(db.calls.transfers.length, 1);
  assert.ok(text(ui).includes('Subiendo videos'));
  thumbnail.resolve('thumb');
  await first;
  await select(ui, [file('two.mp4')]);
  assert.equal(db.calls.transfers.length, 2, 'unresolved AI cannot hold the batch lock');
  ai.resolve({});
});

test('thumbnail upload failure still saves duration and passes it to the existing extraction', async () => {
  const db = fakeDb();
  db.uploadSessionThumbnail = async () => { throw new Error('private thumbnail failure'); };
  const ui = await modal(db, emptySession, environment());
  await select(ui, [file('one.mp4')]);
  assert.equal(db.calls.enrich[0].duration, 17);
  assert.equal(db.calls.enrich[0].thumbnailUrl, undefined);
  assert.equal(db.calls.ai[0][4], 17);
  assert.equal(button(ui, 'Reintentar fallidos'), undefined);
});

test('persistent local read failure is bounded, keeps batch usable, and manual retry retains its ID', async () => {
  const db = fakeDb();
  const bad = file('bad.mp4');
  let reads = 0, fail = true;
  bad.slice = () => ({ async arrayBuffer() { reads++; if (fail) throw Object.assign(new Error('https://secret?token=SECRET'), { name: 'NotReadableError' }); return new ArrayBuffer(1); } });
  const ui = await modal(db, emptySession, environment());
  await select(ui, [bad, file('good.mp4')]);
  assert.equal(reads, 3);
  assert.deepEqual(db.calls.transfers, ['vid-2']);
  assert.ok(text(ui).includes('upload/file-probe-read'));
  assert.ok(text(ui).includes('aunque esté guardado en este dispositivo'));
  assert.equal(text(ui).includes('SECRET'), false);
  assert.ok(button(ui, 'Reintentar fallidos'));
  fail = false;
  await button(ui, 'Reintentar fallidos').props.onClick();
  assert.equal(reads, 4);
  assert.deepEqual(db.calls.transfers, ['vid-2', 'vid-1']);
  assert.equal(db.calls.ai.length, 2);
  assert.equal(button(ui, 'Reintentar fallidos'), undefined);
});

test('diagnostics retain at most 80 events and identify the clip without URLs or file names', async () => {
  const db = fakeDb();
  const ui = await modal(db, emptySession, environment());
  await select(ui, Array.from({ length: 16 }, (_, i) => file(`private-name-${i}.mp4`)));
  const pre = ui.render().find((n: any) => n.type === 'pre');
  const events = JSON.parse(pre.props.children);
  assert.equal(events.length, 80);
  assert.ok(events.every((e: any) => e.clipId && e.phase && e.code && e.attempt && typeof e.bytes === 'number'));
  assert.equal(pre.props.children.includes('private'), false);
});


for (const outcome of ['success', 'failure', 'changed-user', 'save-rejected', 'deleted', 'cancelled'] as const) {
  test(`late AI ${outcome} after modal unmount persists only the original eligible clip without UI writes`, async () => {
    const storage = await storageService();
    const db = fakeDb();
    const ai = deferred();
    Object.assign(db, {
      getProducts: async () => [],
      addSessionVideo: storage.db.addSessionVideo.bind(storage.db),
      enrichSessionVideo: storage.db.enrichSessionVideo.bind(storage.db),
      patchSessionVideo: storage.db.patchSessionVideo.bind(storage.db),
      extractVideoMetadata: () => ai.promise,
    });
    const ui = await modal(db, emptySession, environment());
    ui.render();
    const unmount = ui.mountEffects();
    await select(ui, [file('one.mp4')]);
    assert.equal(storage.data.videos[0].metadataStatus, 'processing');
    unmount();
    const localWrites = ui.stateWrites;
    if (outcome === 'changed-user') storage.auth.currentUser = { uid: 'other' };
    if (outcome === 'save-rejected') storage.rejectWrites();
    if (outcome === 'deleted') await storage.db.removeSessionVideo('s', 'vid-1');
    if (outcome === 'cancelled') await storage.db.patchSessionVideo('s', 'vid-1', {}, { clearMetadataStatus: true });
    if (outcome === 'failure') ai.reject(new Error('extraction failed'));
    else ai.resolve({ tag: 'late' });
    for (let i = 0; i < 40; i++) await Promise.resolve();
    const video = storage.data.videos[0];
    if (outcome === 'deleted') assert.equal(video, undefined);
    else if (outcome === 'cancelled') assert.equal(video.metadataStatus, undefined);
    else assert.equal(video.metadataStatus, outcome === 'success' ? 'ready' : outcome === 'failure' ? 'error' : 'processing');
    if (outcome === 'success') assert.deepEqual(video.aiMetadata, { tag: 'late' });
    assert.equal(ui.stateWrites, localWrites, 'no state setter, including saving/error, may run after unmount');
    assert.equal(ui.render().find((n: any) => n.props?.video).props.video.metadataStatus, 'processing');
  });
}

// Compile the real service with Firebase boundary stubs; no network/client initialization.
async function storageService() {
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const ts = createRequire(import.meta.url)('typescript');
  const auth = { currentUser: { uid: 'owner' } as { uid: string } | null };
  const helper = await import('../src/utils/sessionVideoMutations.ts');
  let data = structuredClone(emptySession), rejectWrites = false;
  const timers = new Set<any>();
  const tasks: any[] = [];
  const urls: string[] = [];
  let now = 0, urlFail = false;
  const output = ts.transpileModule(readFileSync(new URL('../src/services/databaseService.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env', '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(output, { exports, console, crypto: { randomUUID: () => `stable-${tasks.length}` },
    Date: { now: () => now },
    setInterval(fn: any) { timers.add(fn); return fn; }, clearInterval(fn: any) { timers.delete(fn); },
    require(id: string) {
      if (id.endsWith('/firebase')) return { auth, firestore: {}, storage: {} };
      if (id === 'firebase/storage') return {
        ref(_storage: any, path: string) { return path; },
        uploadBytesResumable(path: string, file: any) {
          const task: any = { path, snapshot: { bytesTransferred: 0, ref: path }, unsubscribed: 0, canceled: 0,
            cancel() { task.canceled++; task.error?.(Object.assign(new Error('cancel'), { code: 'storage/canceled' })); },
            on(_event: string, progress: any, error: any, complete: any) {
              Object.assign(task, { progress, error, complete }); return () => task.unsubscribed++;
            }, file };
          tasks.push(task); return task;
        },
        async getDownloadURL(path: string) { urls.push(path); if (urlFail) throw transient(); return 'private'; },
      };
      if (id === 'firebase/firestore') return {
        doc(_db: any, _collection: string, sessionId: string) { return sessionId; },
        async runTransaction(_db: any, callback: any) {
          let pending: any;
          const result = await callback({
            async get() { return { exists: () => true, data: () => structuredClone(data) }; },
            update(_ref: any, changes: any) { if (rejectWrites) throw new Error('save rejected'); pending = changes; },
          });
          if (pending) data = { ...data, ...pending };
          return result;
        },
      };
      if (id.endsWith('/sessionVideoMutations')) return helper;
      if (id === 'xlsx' || id.startsWith('../utils/')) return {};
      throw new Error('Unexpected service dependency: ' + id);
    },
  });
  return { db: exports.db, auth, get data() { return data; }, rejectWrites() { rejectWrites = true; }, tasks, timers, urls, advance(ms: number) { now += ms; [...timers].forEach(fn => fn()); },
    failUrl(value: boolean) { urlFail = value; } };
}

test('actual Storage service separates completed transfer from URL retries and cleans task listeners/timers', async () => {
  const storage = await storageService();
  const { runSessionUpload } = await import(url.href);
  const cp = storage.db.createSessionVideoUpload('s');
  storage.failUrl(true);
  const pending = runSessionUpload(cp, {
    transfer: () => storage.db.transferSessionVideoFile(cp, new Blob(['x'])),
    getUrl: () => storage.db.getSessionVideoDownloadURL(cp), async register() {}, async delay() {},
  });
  storage.tasks[0].complete();
  await assert.rejects(pending);
  assert.equal(cp.transferred, true);
  assert.equal(storage.timers.size, 0);
  assert.equal(storage.tasks[0].unsubscribed, 1);
  storage.failUrl(false);
  await runSessionUpload(cp, {
    transfer: () => { assert.fail('completed bytes must not transfer again'); },
    getUrl: () => storage.db.getSessionVideoDownloadURL(cp), async register() {},
  });
  assert.equal(storage.tasks.length, 1);
  assert.ok(storage.urls.every(path => path === cp.path));
  storage.auth.currentUser = { uid: 'other' };
  await assert.rejects(storage.db.getSessionVideoDownloadURL(cp), (e: any) => e.code === 'storage/unauthorized');
  await assert.rejects(storage.db.transferSessionVideoFile(cp, new Blob()), (e: any) => e.code === 'storage/unauthorized');
  assert.equal(storage.tasks.length, 1);
});

test('actual Storage watchdog preserves grace periods and reports stalled rather than cancellation', async () => {
  const storage = await storageService();
  const cp = storage.db.createSessionVideoUpload('s');
  const pending = storage.db.transferSessionVideoFile(cp, new Blob(['x']));
  storage.advance(180_000);
  assert.equal(storage.tasks[0].canceled, 0);
  storage.advance(1);
  await assert.rejects(pending, (e: any) => e.code === 'upload/stalled');
  assert.equal(storage.tasks[0].canceled, 1);
  assert.equal(storage.timers.size, 0);
  assert.equal(storage.tasks[0].unsubscribed, 1);
});

test('actual Storage abort cleans the task and does not turn cancellation into a retry', async () => {
  const storage = await storageService();
  const controller = new AbortController();
  const cp = storage.db.createSessionVideoUpload('s');
  const pending = storage.db.transferSessionVideoFile(cp, new Blob(['x']), undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, (e: any) => e.code === 'upload/canceled');
  assert.equal(storage.tasks[0].canceled, 1);
  assert.equal(storage.tasks[0].unsubscribed, 1);
  assert.equal(storage.timers.size, 0);
});


test('a descriptor/auth failure retains the failed File for explicit retry', async () => {
  const db = fakeDb();
  const create = db.createSessionVideoUpload;
  let fail = true;
  db.createSessionVideoUpload = s => { if (fail) throw Object.assign(new Error('private'), { code: 'storage/unauthenticated' }); return create(s); };
  const ui = await modal(db, emptySession, environment());
  await select(ui, [file('one.mp4')]);
  assert.ok(button(ui, 'Reintentar fallidos'));
  fail = false;
  await button(ui, 'Reintentar fallidos').props.onClick();
  assert.equal(db.calls.registrations.length, 1);
});

test('actual modal exposes automatic retry/attempt text while preserving one ID across transfer attempts', async () => {
  const db = fakeDb();
  db.transferSessionVideoFile = async cp => {
    db.calls.transfers.push(cp.id);
    if (db.calls.transfers.length === 1) throw transient();
  };
  const ui = await modal(db, emptySession, environment());
  let reads = 0;
  const selected = file('one.mp4');
  selected.arrayBuffer = async () => { reads++; return new ArrayBuffer(1); };
  const pending = select(ui, [selected]);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.ok(text(ui).includes('intento 1/3 · reintentando'));
  assert.ok(text(ui).includes('storage/retry-limit-exceeded'));
  await pending;
  assert.deepEqual(db.calls.transfers, ['vid-1', 'vid-1']);
  assert.equal(reads, 1, 'automatic retry reuses the bounded prepared Blob, not another full copy');
  assert.equal(db.calls.registrations.length, 1);
});

test('actual batch cleanup releases late wake locks, removes visibility listener, revokes URLs and clears probe timers', async () => {
  const db = fakeDb();
  const wake = deferred();
  const timers = new Set<any>(), listeners = new Set<any>();
  let releases = 0, creates = 0, revokes = 0;
  const env = environment();
  env.document.addEventListener = (...args: any[]) => { listeners.add(args[1]); };
  env.document.removeEventListener = (...args: any[]) => { listeners.delete(args[1]); };
  const ui = await modal(db, emptySession, { ...env,
    navigator: { wakeLock: { request: () => wake.promise } },
    URL: { createObjectURL() { creates++; return 'blob:test'; }, revokeObjectURL() { revokes++; } },
    setTimeout(fn: any) { timers.add(fn); return fn; }, clearTimeout(fn: any) { timers.delete(fn); },
  });
  await select(ui, [file('one.mp4')]);
  assert.equal(creates, 1);
  assert.equal(revokes, 1);
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  wake.resolve({ async release() { releases++; } });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(releases, 1, 'a wake lock arriving after batch end is immediately released');
});


test('unmount during local metadata releases its timer and object URL without late enrichment', async () => {
  const db = fakeDb();
  Object.assign(db, { getProducts: async () => [] });
  const timers = new Set<any>();
  let creates = 0, revokes = 0, settled = false;
  const env = environment();
  const create = env.document.createElement;
  env.document.createElement = tag => {
    if (tag !== 'video') return create(tag);
    return { pause() {}, removeAttribute() {}, load() {} };
  };
  const ui = await modal(db, emptySession, { ...env,
    URL: { createObjectURL() { creates++; return 'blob:test'; }, revokeObjectURL() { revokes++; } },
    setTimeout(fn: any) { timers.add(fn); return fn; }, clearTimeout(fn: any) { timers.delete(fn); },
  });
  ui.render();
  const unmount = ui.mountEffects();
  const pending = select(ui, [file('one.mp4')]).then(() => { settled = true; });
  for (let i = 0; i < 100 && creates === 0; i++) await Promise.resolve();
  assert.equal(creates, 1);
  assert.equal(timers.size, 1);
  unmount();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(timers.size, 0);
  assert.equal(revokes, 1);
  assert.equal(settled, true);
  assert.equal(db.calls.enrich.length, 0);
  await pending;
});


test('a session owned by another signed-in user cannot begin transferring bytes', async () => {
  const db = fakeDb();
  const create = db.createSessionVideoUpload;
  db.createSessionVideoUpload = s => ({ ...create(s), userId: 'different-user' });
  const ui = await modal(db, emptySession, environment());
  await select(ui, [file('one.mp4')]);
  assert.equal(db.calls.transfers.length, 0);
  assert.ok(text(ui).includes('storage/unauthorized'));
});


test('registration acknowledgement lost after server commit is shown locally after the idempotent retry', async () => {
  const db = fakeDb();
  let committed = false;
  db.addSessionVideo = async () => {
    if (!committed) { committed = true; throw Object.assign(new Error('response lost'), { code: 'upload/unknown' }); }
    return null as any; // Existing stable ID: transactional add acknowledges a no-op.
  };
  const ui = await modal(db, emptySession, environment());
  await select(ui, [file('one.mp4')]);
  assert.equal(ui.render().filter((n: any) => n.props?.video).length, 0);
  await button(ui, 'Reintentar fallidos').props.onClick();
  assert.equal(ui.render().filter((n: any) => n.props?.video).length, 1);
  assert.equal(db.calls.transfers.length, 1);
  assert.equal(db.calls.ai.length, 1);
});


test('retry-failed batches also skip duplicate names within that batch', async () => {
  const storage = await storageService();
  const db = fakeDb();
  const register = db.addSessionVideo;
  let fail = true;
  db.addSessionVideo = async (s, video) => {
    if (fail) throw Object.assign(new Error('pending'), { code: 'permission-denied' });
    await register(s, video);
    return storage.db.addSessionVideo(s, video);
  };
  const ui = await modal(db, emptySession, environment());
  const first = file('same.mp4'), second = { ...file('same.mp4'), lastModified: 13 };
  await select(ui, [first]);
  await select(ui, [second]);
  fail = false;
  const retry = button(ui, 'Reintentar fallidos').props.onClick;
  await retry();
  const retainedRetry = button(ui, 'Reintentar fallidos');
  // Exercise a second retry too, including a stale callback after reconciliation.
  await (retainedRetry?.props.onClick ?? retry)();
  assert.equal(db.calls.registrations.length, 1);
  assert.equal(db.calls.transfers.length, 2);
  assert.equal(db.calls.ai.length, 1);
  assert.deepEqual(storage.data.videos.map((video: any) => video.name), ['same.mp4']);
  assert.deepEqual(ui.render().filter((n: any) => n.props?.video).map((n: any) => n.props.video.name), ['same.mp4']);
  assert.equal(retainedRetry, undefined, 'success releases all same-name failed Files/checkpoints');
  assert.equal(button(ui, 'Reintentar fallidos'), undefined);
});


test('actual modal recovers first failed local probe for EACH sequential file without reselection', async () => {
  const db = fakeDb();
  const reads = [0, 0];
  const files = ['first.mp4', 'second.mp4'].map((name, index) => {
    const selected = file(name);
    selected.slice = () => ({ async arrayBuffer() {
      reads[index]++;
      if (reads[index] === 1) throw Object.assign(new Error('https://secret?token=SECRET'), { name: 'NotReadableError' });
      return new ArrayBuffer(1);
    } });
    return selected;
  });
  const ui = await modal(db, emptySession, environment());
  await select(ui, files);
  assert.deepEqual(db.calls.transfers, ['vid-1', 'vid-2']);
  assert.deepEqual(reads, [2, 2]);
  assert.deepEqual(db.calls.registrations, ['vid-1', 'vid-2']);
  assert.equal(db.calls.ai.length, 2);
  assert.equal(button(ui, 'Reintentar fallidos'), undefined);
  assert.equal(text(ui).includes('SECRET'), false);
});


// Abortable FileReader boundary and deterministic clock; actual helper + actual TSX run unchanged.
function controlledReads(phase: 'file-probe' | 'file-copy', kind: 'read' | 'timeout') {
  const timers = new Map<any, { fn: () => void; ms: number }>();
  const readers: any[] = [];
  const fired: number[] = [];
  const attempts: string[] = [];
  let fail = true, active = 0, maxActive = 0, aborts = 0;
  class Reader {
    result: any = null; readyState = 0; onload: any; onerror: any; onabort: any;
    readAsArrayBuffer(blob: any) {
      assert.equal(active, 0, 'no overlapping uncancellable reads or copies');
      active++; maxActive = Math.max(maxActive, active); this.readyState = 1;
      readers.push(this);
      const current = blob.name ? 'file-copy' : 'file-probe';
      attempts.push(current);
      if (fail && current === phase) {
        if (kind === 'read') queueMicrotask(() => {
          if (this.readyState !== 1) return;
          active--; this.readyState = 2; this.onerror?.({ message: 'https://secret?token=SECRET' });
        });
        return;
      }
      blob.arrayBuffer().then((buffer: ArrayBuffer) => {
        if (this.readyState !== 1) return;
        active--; this.readyState = 2; this.result = buffer; this.onload?.();
      });
    }
    abort() { if (this.readyState === 1) { active--; aborts++; } this.readyState = 2; this.result = null; this.onabort?.(); }
  }
  const env = { ...environment(), FileReader: Reader,
    setTimeout(fn: () => void, ms: number) { const id = {}; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id: any) { timers.delete(id); },
  };
  async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
  async function complete(pending: Promise<any>) {
    let settled = false;
    pending.then(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      await flush();
      if (settled) break;
      const next = timers.entries().next().value;
      assert.ok(next, 'operation must progress or have a bounded timer');
      timers.delete(next[0]); fired.push(next[1].ms); next[1].fn();
    }
    assert.equal(settled, true, 'bounded read operation settles');
    await pending;
  }
  return { env, attempts, timers, readers, fired, flush, complete, recover() { fail = false; },
    get maxActive() { return maxActive; }, get active() { return active; }, get aborts() { return aborts; } };
}
for (const phase of ['file-probe', 'file-copy'] as const) {
  for (const kind of ['read', 'timeout'] as const) {
    test(`actual modal bounds persistent ${phase} ${kind} then manual retry reuses stable checkpoint`, async () => {
      const db = fakeDb(), clock = controlledReads(phase, kind);
      const ui = await modal(db, emptySession, clock.env);
      await clock.complete(select(ui, [file('private.mp4')]));
      assert.equal(clock.attempts.filter(p => p === phase).length, 3);
      assert.equal(db.calls.transfers.length, 0);
      assert.equal(db.calls.ai.length, 0);
      assert.deepEqual(clock.fired, kind === 'timeout' ? [15000, 200, 15000, 400, 15000] : [200, 400]);
      const code = `upload/${phase}-${kind}`;
      const events = JSON.parse(ui.render().find((n: any) => n.type === 'pre').props.children);
      assert.deepEqual(events.filter((e: any) => e.code === code).map((e: any) => [e.phase, e.attempt, e.retry]),
        [[phase, 1, true], [phase, 2, true], [phase, 3, false]]);
      assert.ok(text(ui).includes(kind === 'timeout' ? 'tardó demasiado' : 'aunque esté guardado'));
      assert.equal(JSON.stringify(events).includes('private'), false);
      assert.equal(JSON.stringify(events).includes('SECRET'), false);
      assert.equal(clock.aborts, kind === 'timeout' ? 3 : 0);
      clock.recover();
      await clock.complete(button(ui, 'Reintentar fallidos').props.onClick());
      assert.deepEqual(db.calls.transfers, ['vid-1']);
      assert.deepEqual(db.calls.registrations, ['vid-1']);
      assert.equal(db.calls.ai.length, 1);
      assert.equal(clock.maxActive, 1);
      assert.equal(clock.active, 0);
      assert.equal(clock.timers.size, 0);
      assert.ok(clock.readers.every(r => r.onload === null && r.onerror === null && r.onabort === null));
      assert.equal(button(ui, 'Reintentar fallidos'), undefined);
    });
  }
  for (const stage of ['active-read', 'retry-delay'] as const) {
    test(`unmount during ${phase} ${stage} aborts without continuing reads or next file`, async () => {
      const db = fakeDb(), clock = controlledReads(phase, stage === 'active-read' ? 'timeout' : 'read');
      Object.assign(db, { getProducts: async () => [] });
      const ui = await modal(db, emptySession, clock.env);
      ui.render(); const unmount = ui.mountEffects();
      const pending = select(ui, [file('first.mp4'), file('second.mp4')]);
      await clock.flush();
      assert.equal(clock.timers.size, 1);
      assert.equal([...clock.timers.values()][0].ms, stage === 'active-read' ? 15000 : 200);
      const before = clock.attempts.length;
      unmount(); const writes = ui.stateWrites;
      await clock.complete(pending);
      await clock.flush();
      assert.equal(clock.attempts.length, before);
      assert.equal(clock.active, 0);
      assert.equal(clock.timers.size, 0);
      assert.equal(db.calls.transfers.length, 0);
      assert.equal(db.calls.ai.length, 0);
      assert.equal(ui.stateWrites, writes);
    });
  }
}

test('actual modal probes large files without full copy and prepares bounded copies sequentially', async () => {
  const db = fakeDb();
  let current = 0, max = 0;
  const fullReads: string[] = [], probes: number[] = [];
  const files = [25 * 1024 * 1024, 25 * 1024 * 1024 + 1, 1].map((size, i) => ({
    ...file(`${i}.mp4`), size,
    async arrayBuffer() { fullReads.push(`${i}`); current++; max = Math.max(max, current); await Promise.resolve(); current--; return new ArrayBuffer(1); },
    slice(start: number, end: number) { probes.push(end - start); return { async arrayBuffer() { return new ArrayBuffer(1); } }; },
  }));
  const transferred: any[] = [];
  db.transferSessionVideoFile = async (cp: any, blob?: any) => { db.calls.transfers.push(cp.id); transferred.push(blob); };
  const ui = await modal(db, emptySession, environment());
  await select(ui, files);
  assert.deepEqual(fullReads, ['0', '2']);
  assert.deepEqual(probes, [65536, 65536, 65536]);
  assert.equal(max, 1);
  assert.equal(transferred[1], files[1]);
  assert.ok(transferred[0] instanceof Blob);
  assert.ok(transferred[2] instanceof Blob);
  assert.equal(db.calls.transfers.length, 3);
  assert.equal(db.calls.ai.length, 3);
});


test('actual modal recovers first full-copy read rejection for each sequential file without duplicate transfer or AI', async () => {
  const db = fakeDb(), reads = [0, 0];
  const files = ['first.mp4', 'second.mp4'].map((name, i) => ({ ...file(name),
    async arrayBuffer() {
      if (++reads[i] === 1) throw Object.assign(new Error('private-token'), { name: 'NotReadableError' });
      return new ArrayBuffer(1);
    },
  }));
  const ui = await modal(db, emptySession, environment());
  await select(ui, files);
  assert.deepEqual(reads, [2, 2]);
  assert.deepEqual(db.calls.transfers, ['vid-1', 'vid-2']);
  assert.deepEqual(db.calls.registrations, ['vid-1', 'vid-2']);
  assert.equal(db.calls.ai.length, 2);
  assert.equal(button(ui, 'Reintentar fallidos'), undefined);
});
