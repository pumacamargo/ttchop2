import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import type { SessionVideoMutation } from '../src/utils/sessionVideoMutations.ts';
import type { Session, SessionVideo } from '../src/services/databaseService.ts';

const helperUrl = new URL('../src/utils/sessionVideoMutations.ts', import.meta.url);
const clip = (id: string): SessionVideo => ({ id, name: id, downloadUrl: id, duration: 0,
  source: 'recorded', trimStart: 0, trimEnd: 0, createdAt: 'now', metadataStatus: 'processing' });
const session = (videos = [clip('a')]): Session => ({ id: 's', userId: 'owner', name: 's',
  productIds: [], videos, createdAt: 'now' });

// The adapter models Firestore optimistic retries: each callback reads a snapshot;
// conflicting commits re-run the real production callback against the newest state.
function store(initial: Session | undefined = session()) {
  let data = structuredClone(initial);
  let version = 0;
  let reads = 0;
  return {
    get data() { return data; },
    get reads() { return reads; },
    async run(mutation: SessionVideoMutation, uid = 'owner', id = 's') {
      const { mutateSessionVideoTransaction } = await import(helperUrl.href);
      for (;;) {
        const observed = version;
        let pending: SessionVideo[] | undefined;
        const result = await mutateSessionVideoTransaction({
          async read() { reads++; return structuredClone(data); },
          write(videos: SessionVideo[]) { pending = videos; },
        }, uid, id, mutation);
        if (observed !== version) continue;
        if (pending) { data = { ...data!, videos: pending }; version++; }
        return result;
      }
    },
  };
}

test('concurrent add and metadata retain both clips and the metadata', async () => {
  assert.ok(existsSync(helperUrl), 'transactional per-video implementation must exist');
  const db = store();
  await Promise.all([
    db.run({ type: 'add', video: clip('b') }),
    db.run({ type: 'patch', id: 'a', changes: { metadataStatus: 'ready', aiMetadata: { tag: 'ok' } } }),
  ]);
  assert.deepEqual(db.data!.videos.map(v => v.id), ['a', 'b']);
  assert.equal(db.data!.videos[0].metadataStatus, 'ready');
  assert.ok(db.reads >= 3, 'conflict must retry against a fresh snapshot');
});

test('delete racing metadata never resurrects a missing clip', async () => {
  const db = store();
  await Promise.all([
    db.run({ type: 'remove', id: 'a' }),
    db.run({ type: 'patch', id: 'a', changes: { metadataStatus: 'ready' } }),
  ]);
  assert.deepEqual(db.data!.videos, []);
  assert.equal(await db.run({ type: 'patch', id: 'a', changes: { name: 'resurrected' } }), null);
});

test('thumbnail enrichment racing a trim preserves edited bounds', async () => {
  for (const trimFirst of [true, false]) {
    const db = store();
    const trim: SessionVideoMutation = { type: 'patch', id: 'a', changes: { trimStart: 2, trimEnd: 7 } };
    const thumbnail: SessionVideoMutation = { type: 'enrich', id: 'a', duration: 12, thumbnailUrl: 'thumb' };
    await Promise.all((trimFirst ? [trim, thumbnail] : [thumbnail, trim]).map(m => db.run(m)));
    assert.equal(db.data!.videos[0].trimStart, 2);
    assert.equal(db.data!.videos[0].trimEnd, 7);
    assert.equal(db.data!.videos[0].duration, 12);
    assert.equal(db.data!.videos[0].thumbnailUrl, 'thumb');
  }
});

test('enrichment initializes only pending zero bounds and does not resurrect', async () => {
  const db = store();
  await db.run({ type: 'enrich', id: 'a', duration: 12 });
  assert.equal(db.data!.videos[0].trimEnd, 12);
  await db.run({ type: 'enrich', id: 'a', duration: 20 });
  assert.equal(db.data!.videos[0].trimEnd, 12);
  await db.run({ type: 'remove', id: 'a' });
  assert.equal(await db.run({ type: 'enrich', id: 'a', duration: 20 }), null);
});

test('transaction rejects missing, mismatched and unowned sessions before writing', async () => {
  for (const [data, uid, id] of [
    [undefined, 'owner', 's'], [session(), '', 's'],
    [session(), 'intruder', 's'], [session(), 'owner', 'wrong'],
  ] as const) {
    let writes = 0;
    const { mutateSessionVideoTransaction } = await import(helperUrl.href);
    await assert.rejects(mutateSessionVideoTransaction({
      async read() { return data; }, write() { writes++; },
    }, uid, id, { type: 'add', video: clip('b') }));
    assert.equal(writes, 0);
  }
});

test('cancel deletes metadataStatus instead of persisting undefined; late completion is ignored', async () => {
  const db = store();
  await db.run({ type: 'patch', id: 'a', changes: {}, clearMetadataStatus: true });
  assert.equal(Object.hasOwn(db.data!.videos[0], 'metadataStatus'), false);
  assert.equal(await db.run({ type: 'patch', id: 'a', changes: { metadataStatus: 'ready' },
    ifMetadataStatus: 'processing' }), null);
  assert.equal(Object.hasOwn(db.data!.videos[0], 'metadataStatus'), false);
});

test('two concurrent adds and registration retries keep unique IDs without overwriting existing clips', async () => {
  const db = store();
  await Promise.all(['b', 'c'].map(id => db.run({ type: 'add', video: clip(id) })));
  assert.deepEqual(db.data!.videos.map(v => v.id).sort(), ['a', 'b', 'c']);
  assert.equal(await db.run({ type: 'add', video: { ...clip('b'), name: 'stale retry' } }), null);
  assert.equal(db.data!.videos.find(v => v.id === 'b')!.name, 'b');
});

test('metadata racing a trim preserves both intentional edits', async () => {
  const db = store();
  await Promise.all([
    db.run({ type: 'patch', id: 'a', changes: { trimStart: 2, trimEnd: 7 } }),
    db.run({ type: 'patch', id: 'a', changes: { metadataStatus: 'ready', aiMetadata: { tag: 'ok' } } }),
  ]);
  assert.equal(db.data!.videos[0].trimStart, 2);
  assert.equal(db.data!.videos[0].trimEnd, 7);
  assert.deepEqual(db.data!.videos[0].aiMetadata, { tag: 'ok' });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a rejected save cannot mark the local clip ready or register an unsaved clip', async () => {
  const helper = await import(helperUrl.href);
  assert.equal(typeof helper.commitSessionVideoMutation, 'function', 'commit only after persistence succeeds');
  for (const mutation of [
    { type: 'patch', id: 'a', changes: { metadataStatus: 'ready' } },
    { type: 'add', video: clip('b') },
  ] as SessionVideoMutation[]) {
    let local = [clip('a')];
    const save = deferred<SessionVideoMutation | null>();
    const pending = helper.commitSessionVideoMutation(save.promise, (m: SessionVideoMutation) => {
      local = helper.applySessionVideoMutation(local, m);
    });
    assert.equal(local[0].metadataStatus, 'processing');
    save.reject(new Error(mutation.type + ': permission denied'));
    await assert.rejects(pending, /permission denied/);
    assert.deepEqual(local, [clip('a')]);
  }
});

test('out-of-order save completions merge only their intent into current local state', async () => {
  const helper = await import(helperUrl.href);
  assert.equal(typeof helper.commitSessionVideoMutation, 'function');
  let local = [clip('a')];
  const apply = (m: SessionVideoMutation) => { local = helper.applySessionVideoMutation(local, m); };
  const metadata = deferred<SessionVideoMutation | null>();
  const pending = helper.commitSessionVideoMutation(metadata.promise, apply);
  await helper.commitSessionVideoMutation(Promise.resolve({ type: 'add', video: clip('b') }), apply);
  await helper.commitSessionVideoMutation(Promise.resolve({ type: 'patch', id: 'a', changes: { trimStart: 2, trimEnd: 7 } }), apply);
  metadata.resolve({ type: 'patch', id: 'a', changes: { metadataStatus: 'ready' } });
  await pending;
  assert.deepEqual(local.map(v => v.id), ['a', 'b']);
  assert.equal(local[0].trimEnd, 7);
  assert.equal(local[0].metadataStatus, 'ready');
  apply({ type: 'remove', id: 'a' });
  apply({ type: 'patch', id: 'a', changes: { metadataStatus: 'ready' } });
  apply({ type: 'enrich', id: 'a', duration: 50 });
  assert.deepEqual(local.map(v => v.id), ['b']);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic transpiled JSX/hook test adapter */
// Exercise the actual component callbacks, not a copy of their persistence logic.
// JSX is a plain element tree and hooks retain slots across explicit re-renders.
export async function modal(database: any, initial = session(), environment: any = {}) {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const helper = await import(helperUrl.href);
  const workflowUrl = new URL('../src/utils/sessionUploadWorkflow.ts', import.meta.url);
  const workflow = existsSync(workflowUrl) ? await import(workflowUrl.href) : {};
  const readExports: any = {};
  const Reader = environment.FileReader ?? class {
    result: any; onload: any; onerror: any; onabort: any; readyState = 0;
    readAsArrayBuffer(blob: any) {
      this.readyState = 1;
      Promise.resolve().then(() => blob.arrayBuffer()).then(result => {
        if (this.readyState !== 1) return;
        this.readyState = 2; this.result = result; this.onload?.();
      }, () => { if (this.readyState === 1) { this.readyState = 2; this.onerror?.(); } });
    }
    abort() { this.readyState = 2; this.result = null; this.onabort?.(); }
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/prepareSessionUploadFile.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: readExports, Blob, FileReader: Reader,
    setTimeout(fn: any, ms: number) { if (ms <= 500) queueMicrotask(fn); return fn; }, clearTimeout() {}, ...environment });
  let cursor = 0;
  const slots: any[] = [];
  const effects: any[] = [];
  let stateWrites = 0;
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v: any) => { stateWrites++; slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(effect: any) { effects.push(effect); }, useMemo(fn: any) { return fn(); }, useCallback(fn: any) { return fn; },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const source = readFileSync(new URL('../src/components/SessionDetailModal.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports: any = {};
  vm.runInNewContext(output, { exports, console, Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    navigator: {}, document: { addEventListener() {}, removeEventListener() {} },
    setTimeout() { return 0; }, clearTimeout() {}, AbortController,
    ...environment,
    require(id: string) {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (id.endsWith('/databaseService')) return { db: database, REGION_LABELS: {} };
    if (id.endsWith('/sessionVideoMutations')) return helper;
    if (id.endsWith('/sessionUploadWorkflow')) return workflow;
    if (id.endsWith('/prepareSessionUploadFile')) return readExports;
    if (id === 'lucide-react') return {};
    if (id.endsWith('/LanguageContext')) return { useT: () => ({}) };
    throw new Error('Unexpected component dependency: ' + id);
  } });
  function render() {
    cursor = 0;
    const tree = exports.SessionDetailModal({ session: initial, onClose() {}, onDeleted() {} });
    const nodes: any[] = [];
    function walk(node: any) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(tree);
    return nodes;
  }
  return { render, get stateWrites() { return stateWrites; }, card: () => render().find(n => n.props?.video?.id === 'a'),
    mountEffects() { const cleanups = effects.splice(0).map(effect => effect()); return () => cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test('actual retry callback waits for processing persistence and does not call AI on rejection', async () => {
  let extractionCalls = 0;
  let legacyWrites = 0;
  const ui = await modal({
    async updateSession() { legacyWrites++; },
    async patchSessionVideo() { throw new Error('processing save rejected'); },
    async extractVideoMetadata() { extractionCalls++; return {}; },
  }, session([{ ...clip('a'), metadataStatus: 'error' }]));
  await ui.card().props.onRetry();
  assert.equal(extractionCalls, 0);
  assert.equal(legacyWrites, 0);
  assert.equal(ui.card().props.video.metadataStatus, 'error');
  assert.ok(ui.render().some(n => String(n.props?.children).includes('processing save rejected')));
});

test('actual metadata completion never shows ready after its persistence rejects', async () => {
  const ui = await modal({
    async updateSession() {},
    async patchSessionVideo(_s: string, id: string, changes: any, options: any) {
      if (changes.metadataStatus === 'ready') throw new Error('ready save rejected');
      return { type: 'patch', id, changes, ...options };
    },
    async extractVideoMetadata() { return { tag: 'ok' }; },
  }, session([{ ...clip('a'), metadataStatus: 'error' }]));
  await ui.card().props.onRetry();
  assert.notEqual(ui.card().props.video.metadataStatus, 'ready');
  assert.ok(ui.render().some(n => String(n.props?.children).includes('ready save rejected')));
});

test('actual cancel, trim and remove use scoped APIs, with no full-array updateSession calls', async () => {
  const db = store();
  let legacyWrites = 0;
  const ui = await modal({
    async updateSession() { legacyWrites++; },
    patchSessionVideo(_s: string, id: string, changes: any, options: any) {
      return db.run({ type: 'patch', id, changes, ...options });
    },
    removeSessionVideo(_s: string, id: string) { return db.run({ type: 'remove', id }); },
  });
  await ui.card().props.onCancel();
  assert.equal(Object.hasOwn(db.data!.videos[0], 'metadataStatus'), false);
  assert.equal(Object.hasOwn(ui.card().props.video, 'metadataStatus'), false);
  await ui.card().props.onTrimSave(2, 7);
  assert.equal(db.data!.videos[0].trimEnd, 7);
  await ui.card().props.onRemove();
  assert.deepEqual(db.data!.videos, []);
  assert.equal(ui.card(), undefined);
  assert.equal(legacyWrites, 0);
});


test('actual Analyze All persists each clip first and skips AI for rejected saves', async () => {
  const db = store(session([{ ...clip('a'), metadataStatus: 'error' }, { ...clip('b'), metadataStatus: 'error' }]));
  const extracted: string[] = [];
  const ui = await modal({
    async patchSessionVideo(_s: string, id: string, changes: any, options: any) {
      if (id === 'b') throw new Error('b save rejected');
      return db.run({ type: 'patch', id, changes, ...options });
    },
    async extractVideoMetadata(_s: string, id: string) { extracted.push(id); return { tag: id }; },
  }, db.data);
  const button = ui.render().find(n => Array.isArray(n.props?.children) && n.props.children.includes(' Analyze All'));
  assert.ok(button);
  await button.props.onClick();
  assert.deepEqual(extracted, ['a']);
  assert.equal(db.data!.videos[0].metadataStatus, 'ready');
  assert.equal(db.data!.videos[1].metadataStatus, 'error');
  assert.ok(ui.render().some(n => String(n.props?.children).includes('b save rejected')),
    'successful background saves must not clear another clip persistence error');
});

test('actual upload registration failure is reported, not shown as uploaded or locally added', async () => {
  let aiCalls = 0;
  const ui = await modal({
    createSessionVideoUpload(sessionId: string) { return { id: 'new', sessionId, userId: 'owner', path: 'stable', transferred: false, registered: false }; },
    assertSessionVideoUploadOwner() {},
    async transferSessionVideoFile() {},
    async getSessionVideoDownloadURL() { return 'storage-url'; },
    async addSessionVideo() { throw new Error('registration rejected'); },
    async extractVideoMetadata() { aiCalls++; return {}; },
  });
  const file = { name: 'new.mp4', type: 'video/mp4', size: 1,
    async arrayBuffer() { return new ArrayBuffer(1); },
    slice() { return { async arrayBuffer() { return new ArrayBuffer(1); } }; },
  };
  await ui.render().find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file] } });
  const nodes = ui.render();
  assert.equal(nodes.filter(n => n.props?.video).length, 1);
  assert.equal(aiCalls, 0);
  assert.ok(nodes.some(n => String(n.props?.children).includes('bytes del video subidos; registro pendiente')));
  assert.equal(nodes.some(n => String(n.props?.children).includes('✓ Subidos')), false);
});

test('late local thumbnail result cannot undo a trim or other registration', async () => {
  const helper = await import(helperUrl.href);
  let local = [clip('a')];
  const apply = (m: SessionVideoMutation) => { local = helper.applySessionVideoMutation(local, m); };
  const enrichment = deferred<SessionVideoMutation | null>();
  const pending = helper.commitSessionVideoMutation(enrichment.promise, apply);
  apply({ type: 'add', video: clip('b') });
  apply({ type: 'patch', id: 'a', changes: { trimStart: 2, trimEnd: 7 } });
  enrichment.resolve({ type: 'enrich', id: 'a', duration: 20, thumbnailUrl: 'thumb', initializeTrimEnd: true });
  await pending;
  assert.deepEqual(local.map(v => v.id), ['a', 'b']);
  assert.equal(local[0].trimStart, 2);
  assert.equal(local[0].trimEnd, 7);
  assert.equal(local[0].duration, 20);
});
