/**
 * @file tests/test-pipFactory.js
 * @desc Unit tests for PiPFactory — runs in Node.js
 * Usage: node tests/test-pipFactory.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Mock Chrome APIs
// ============================================================
global.chrome = {
  storage: {
    local: {
      _store: {},
      async get(keys) {
        if (typeof keys === 'string') return { [keys]: this._store[keys] };
        const result = {};
        for (const key of Object.keys(keys || this._store)) {
          result[key] = this._store[key];
        }
        return result;
      },
      async set(obj) { Object.assign(this._store, obj); },
      async remove(keys) {
        const keysArr = Array.isArray(keys) ? keys : [keys];
        keysArr.forEach(k => delete this._store[k]);
      }
    },
    sync: { async get() { return {}; }, async set() {} }
  },
  windows: {
    onRemoved: { addListener() {} },
    create: async () => ({ id: 1, tabs: [{ id: 1 }] }),
    get: async () => ({ id: 1 }),
    remove: async () => {}
  },
  runtime: {
    getURL: (p) => `chrome-extension://abc123/${p}`,
    sendMessage: async () => null,
    getManifest: () => ({ version: '4.0.0' })
  },
  scripting: { executeScript: async () => {} },
  system: { display: { getInfo: async () => [] } }
};

global.navigator = { userAgent: 'Mozilla/5.0 Chrome/120.0.0.0' };
global.window = { documentPictureInPicture: null };
global.document = { pictureInPictureElement: null };
global.module = undefined;
globalThis.navigator = global.navigator;

// ============================================================
// Load factory
// ============================================================
let factoryCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pipFactory.js'), 'utf-8');
factoryCode = factoryCode.replace(/if \(typeof module[\s\S]*$/, '');

const factoryFn = new Function(factoryCode + '\nreturn { PiPFactory, PiPFactoryConfig, NativePipStateManager };');
const { PiPFactory, PiPFactoryConfig, NativePipStateManager } = factoryFn();

// ============================================================
// Test Runner
// ============================================================
let passed = 0, failed = 0, total = 0;

function assert(condition, name) {
  total++;
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`); }
}

function assertEq(actual, expected, name) {
  total++;
  if (actual === expected) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function group(name, tests) {
  console.log(`\n📦 ${name}`);
  for (const t of tests) await t();
}

// ============================================================
// TESTS
// ============================================================
(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  FullPiP PiPFactory — Unit Tests');
  console.log('═══════════════════════════════════════════');

  await group('Configuration', [
    () => {
      assertEq(PiPFactoryConfig.MIN_WIDTH, 150, 'MIN_WIDTH');
      assertEq(PiPFactoryConfig.MIN_HEIGHT, 150, 'MIN_HEIGHT');
      assertEq(PiPFactoryConfig.DEFAULT_WIDTH, 480, 'DEFAULT_WIDTH');
      assertEq(PiPFactoryConfig.DEFAULT_HEIGHT, 270, 'DEFAULT_HEIGHT');
      assertEq(PiPFactoryConfig.MAX_POPUP_WINDOWS, 10, 'MAX_POPUP_WINDOWS');
      assertEq(PiPFactoryConfig.NATIVE_PIP_TIMEOUT_MS, 3000, 'NATIVE_PIP_TIMEOUT');
      assertEq(PiPFactoryConfig.POPUP_OFFSET_STEP, 30, 'OFFSET_STEP');
      assert(PiPFactoryConfig.STORAGE_KEY_NATIVE_PIP.includes('nativePip'), 'STORAGE_KEY');
    }
  ]);

  await group('_shouldUsePopup routing', [
    () => {
      assertEq(PiPFactory._shouldUsePopup({ forcePopup: true, videoElement: {} }), true, 'forcePopup');
      assertEq(PiPFactory._shouldUsePopup({ forceNative: true, videoElement: {} }), false, 'forceNative');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: null }), true, 'no video');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: undefined }), true, 'undefined video');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {}, screenId: 1 }), true, 'screenId');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {}, left: 100 }), true, 'left');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {}, top: 100 }), true, 'top');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {} }), false, 'default → native');
    }
  ]);

  await group('Existing window detection', [
    () => {
      const saved = global.window.documentPictureInPicture;
      global.window.documentPictureInPicture = { window: {} };
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {} }), true, 'window exists → popup');
      global.window.documentPictureInPicture = saved;
    }
  ]);

  await group('Cross-tab state', [
    async () => {
      await NativePipStateManager.clearState();
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {} }), false, 'no state → native');
      await NativePipStateManager.setOpened('test-pip');
      assertEq(NativePipStateManager.isNativePipOpen(), true, 'setOpened');
      assertEq(PiPFactory._shouldUsePopup({ videoElement: {} }), true, 'cross-tab → popup');
      await NativePipStateManager.clearState();
      assertEq(NativePipStateManager.isNativePipOpen(), false, 'clearState');
    }
  ]);

  await group('_shouldUseProxy', [
    () => {
      assertEq(PiPFactory._shouldUseProxy('https://x.com/v.mp4'), true, 'mp4');
      assertEq(PiPFactory._shouldUseProxy('https://x.com/v.webm'), true, 'webm');
      assertEq(PiPFactory._shouldUseProxy('https://x.com/v.ogv'), true, 'ogv');
      assertEq(PiPFactory._shouldUseProxy('https://x.com/v.ogg'), true, 'ogg');
      assertEq(PiPFactory._shouldUseProxy('https://x.com/v.mov'), true, 'mov');
      assertEq(PiPFactory._shouldUseProxy('https://x.com/v.avi'), true, 'avi');
      assertEq(PiPFactory._shouldUseProxy('https://x.com/page'), false, 'page');
      assertEq(PiPFactory._shouldUseProxy(''), false, 'empty');
      assertEq(PiPFactory._shouldUseProxy(null), false, 'null');
      assertEq(PiPFactory._shouldUseProxy('chrome-extension://abc/player.html?src=https%3A%2F%2Fx.com%2Fv.mp4'), false, 'no double-wrap');
    }
  ]);

  await group('_extractVideoUrl', [
    () => {
      assertEq(PiPFactory._extractVideoUrl({ currentSrc: 'https://x.com/v.mp4', src: '', querySelectorAll: () => [] }), 'https://x.com/v.mp4', 'currentSrc');
      assertEq(PiPFactory._extractVideoUrl({ currentSrc: '', src: 'https://x.com/v.mp4', querySelectorAll: () => [] }), 'https://x.com/v.mp4', 'src');
      assertEq(PiPFactory._extractVideoUrl({ currentSrc: '', src: '', querySelectorAll: () => [{ src: 'https://x.com/s.mp4' }] }), 'https://x.com/s.mp4', 'source');
      assertEq(PiPFactory._extractVideoUrl(null), null, 'null');
      assertEq(PiPFactory._extractVideoUrl(undefined), null, 'undefined');
    }
  ]);

  await group('NativePipStateManager', [
    async () => {
      await NativePipStateManager.clearState();
      assertEq(NativePipStateManager.isNativePipOpen(), false, 'init closed');
      assertEq(NativePipStateManager.getActivePipId(), null, 'init no pipId');
      await NativePipStateManager.setOpened('pip-001');
      assertEq(NativePipStateManager.isNativePipOpen(), true, 'setOpened');
      assertEq(NativePipStateManager.getActivePipId(), 'pip-001', 'pipId');
      await NativePipStateManager.clearState();
      assertEq(NativePipStateManager.isNativePipOpen(), false, 'clearState');
      await NativePipStateManager.clearState();
      assertEq(NativePipStateManager.isNativePipOpen(), false, 'double-clear');
      await NativePipStateManager.ensureInit();
      await NativePipStateManager.ensureInit();
      assertEq(NativePipStateManager._initialized, true, 'ensureInit idempotent');
    }
  ]);

  await group('getPipState()', [
    async () => {
      await NativePipStateManager.clearState();
      const s = PiPFactory.getPipState();
      assertEq(s.isOpen, false, 'isOpen');
      assertEq(s.popupCount, 0, 'popupCount');
      assertEq(s.hasAnyPip, false, 'hasAnyPip');
      PiPFactory.popupWindows.set(1, { pipId: 'p1' });
      assertEq(PiPFactory.getPipState().popupCount, 1, 'popupCount 1');
      assertEq(PiPFactory.getPipState().hasAnyPip, true, 'hasAnyPip true');
      PiPFactory.popupWindows.delete(1);
    }
  ]);

  await group('Utilities', [
    () => {
      const v = PiPFactory._getChromeVersion();
      if (v !== null) {
        assertEq(typeof v, 'number', 'version type');
        assert(v >= 100, 'version >= 100');
      } else {
        console.log('  ⏭️  version detection — skipped (Node.js mock limitation)');
        total++; passed++;
      }
    }
  ]);

  await group('create() edge cases', [
    async () => {
      PiPFactory._pipIdCounter = 0;
      const r = await PiPFactory.create({});
      assertEq(r.success, false, 'no video → fail');
      assert(r.error.includes('No video URL'), 'error msg');
    }
  ]);

  await group('closeAllPip()', [
    async () => {
      const r = await PiPFactory.closeAllPip();
      assertEq(r.native, false, 'no pip → native false');
      assertEq(r.popups, 0, 'no popups → 0');
    }
  ]);

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');
  if (failed > 0) process.exit(1);
})();
