/**
 * @file tests/test-popup-utils.js
 * @desc Unit tests for popup.js utility functions — runs in Node.js
 * Usage: node tests/test-popup-utils.js
 */

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
// Extract testable data from popup.js
// ============================================================

const KEYS = {
  THEME: 'themePref',
  PIP_MODE: 'pipMode',
  AUTO_PIP: 'autoPipEnabled',
  SHOW_NOTIFICATIONS: 'showNotifications',
  SCALE_MODE: 'pipScaleMode',
  BG_COLOR: 'pipBackgroundColor',
  LOCK_PAN: 'pipLockPan',
  EDGE_LOCK: 'pipEdgeLock',
  ZOOM_SMART_LIMIT: 'pipZoomSmartLimit',
  ZOOM_SPEED: 'pipZoomSpeed',
  MAX_PIP_WINDOWS: 'maxPipWindows',
  TOAST_DURATION: 'toastDuration',
  HIGHLIGHT_ON_HOVER: 'highlightOnHover',
  AUTO_SCROLL_TO_MEDIA: 'autoScrollToMedia',
  CACHE_MEDIA_LIST: 'cacheMediaList',
};

const DEFAULTS = {
  [KEYS.THEME]: 'dark',
  [KEYS.PIP_MODE]: 'hybrid',
  [KEYS.AUTO_PIP]: false,
  [KEYS.SHOW_NOTIFICATIONS]: true,
  [KEYS.SCALE_MODE]: 'normal',
  [KEYS.BG_COLOR]: 'auto',
  [KEYS.LOCK_PAN]: false,
  [KEYS.EDGE_LOCK]: false,
  [KEYS.ZOOM_SMART_LIMIT]: true,
  [KEYS.ZOOM_SPEED]: 1.0,
  [KEYS.MAX_PIP_WINDOWS]: 3,
  [KEYS.TOAST_DURATION]: 2.5,
  [KEYS.HIGHLIGHT_ON_HOVER]: true,
  [KEYS.AUTO_SCROLL_TO_MEDIA]: true,
  [KEYS.CACHE_MEDIA_LIST]: true,
};

const MODE_DESCRIPTIONS = {
  api: '<strong>PiP API Mode:</strong>',
  popup: '<strong>Popup Mode:</strong>',
  hybrid: '<strong>Hybrid Mode:</strong>',
};

// formatTime (from popup.js)
function formatTime(seconds) {
  if (!seconds) return '0:00';
  if (seconds === Infinity) return 'Live';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ============================================================
// TESTS
// ============================================================
(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  FullPiP Popup Utils — Unit Tests');
  console.log('═══════════════════════════════════════════');

  await group('KEYS consistency', [
    () => {
      // Every key should be a non-empty string
      for (const [name, value] of Object.entries(KEYS)) {
        assert(typeof value === 'string' && value.length > 0, `KEYS.${name} is non-empty string`);
      }
    },
    () => {
      // No duplicate values
      const values = Object.values(KEYS);
      const unique = new Set(values);
      assertEq(values.length, unique.size, 'no duplicate KEYS values');
    }
  ]);

  await group('DEFAULTS consistency', [
    () => {
      // Every KEYS entry should have a DEFAULTS entry
      for (const [name, key] of Object.entries(KEYS)) {
        assert(key in DEFAULTS, `DEFAULTS has entry for KEYS.${name}`);
      }
    },
    () => {
      // Boolean defaults
      assertEq(DEFAULTS[KEYS.AUTO_PIP], false, 'autoPip defaults false');
      assertEq(DEFAULTS[KEYS.SHOW_NOTIFICATIONS], true, 'showNotifications defaults true');
      assertEq(DEFAULTS[KEYS.LOCK_PAN], false, 'lockPan defaults false');
      assertEq(DEFAULTS[KEYS.EDGE_LOCK], false, 'edgeLock defaults false');
      assertEq(DEFAULTS[KEYS.ZOOM_SMART_LIMIT], true, 'zoomSmartLimit defaults true');
      assertEq(DEFAULTS[KEYS.HIGHLIGHT_ON_HOVER], true, 'highlightOnHover defaults true');
      assertEq(DEFAULTS[KEYS.AUTO_SCROLL_TO_MEDIA], true, 'autoScrollToMedia defaults true');
      assertEq(DEFAULTS[KEYS.CACHE_MEDIA_LIST], true, 'cacheMediaList defaults true');
    },
    () => {
      // String defaults
      assertEq(DEFAULTS[KEYS.THEME], 'dark', 'theme defaults dark');
      assertEq(DEFAULTS[KEYS.PIP_MODE], 'hybrid', 'pipMode defaults hybrid');
      assertEq(DEFAULTS[KEYS.SCALE_MODE], 'normal', 'scaleMode defaults normal');
      assertEq(DEFAULTS[KEYS.BG_COLOR], 'auto', 'bgColor defaults auto');
    },
    () => {
      // Number defaults
      assertEq(DEFAULTS[KEYS.ZOOM_SPEED], 1.0, 'zoomSpeed defaults 1.0');
      assertEq(DEFAULTS[KEYS.MAX_PIP_WINDOWS], 3, 'maxPipWindows defaults 3');
      assertEq(DEFAULTS[KEYS.TOAST_DURATION], 2.5, 'toastDuration defaults 2.5');
    }
  ]);

  await group('MODE_DESCRIPTIONS', [
    () => {
      assertEq(typeof MODE_DESCRIPTIONS.api, 'string', 'api mode has description');
      assertEq(typeof MODE_DESCRIPTIONS.popup, 'string', 'popup mode has description');
      assertEq(typeof MODE_DESCRIPTIONS.hybrid, 'string', 'hybrid mode has description');
    },
    () => {
      assert(MODE_DESCRIPTIONS.api.includes('PiP API'), 'api mentions PiP API');
      assert(MODE_DESCRIPTIONS.popup.includes('Popup'), 'popup mentions Popup');
      assert(MODE_DESCRIPTIONS.hybrid.includes('Hybrid'), 'hybrid mentions Hybrid');
    }
  ]);

  await group('formatTime', [
    () => {
      assertEq(formatTime(0), '0:00', 'zero');
      assertEq(formatTime(null), '0:00', 'null');
      assertEq(formatTime(undefined), '0:00', 'undefined');
      assertEq(formatTime(Infinity), 'Live', 'live');
    },
    () => {
      assertEq(formatTime(5), '0:05', '5 seconds');
      assertEq(formatTime(59), '0:59', '59 seconds');
      assertEq(formatTime(60), '1:00', '1 minute');
      assertEq(formatTime(61), '1:01', '1 min 1 sec');
      assertEq(formatTime(125), '2:05', '2 min 5 sec');
      assertEq(formatTime(3600), '60:00', '1 hour');
    },
    () => {
      // Floating point seconds
      assertEq(formatTime(65.7), '1:05', 'rounds down seconds');
      assertEq(formatTime(0.9), '0:00', 'sub-second');
    }
  ]);

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');
  if (failed > 0) process.exit(1);
})();
