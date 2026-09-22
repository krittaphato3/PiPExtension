/**
 * @file tests/test-content-utils.js
 * @desc Unit tests for content.js utility functions — runs in Node.js
 * Usage: node tests/test-content-utils.js
 */

// ============================================================
// Test Runner
// ============================================================
let passed = 0,
  failed = 0,
  total = 0;

function assert(condition, name) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

function assertEq(actual, expected, name) {
  total++;
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(
      `  ❌ ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

async function group(name, tests) {
  console.log(`\n📦 ${name}`);
  for (const t of tests) await t();
}

// ============================================================
// Extract pure functions from content.js for testing
// ============================================================

// Debounce (re-implement for testing since it's an IIFE)
const Debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};

// generateId
let uniquePipId = 0;
const generateId = () => `fullpip-${++uniquePipId}-${Date.now()}`;

// pruneMediaMap
function pruneMediaMap(mediaMap) {
  for (const [id, el] of mediaMap.entries()) {
    if (!el.isConnected) mediaMap.delete(id);
  }
}

// extractBgImage
function extractBgImage(node) {
  const bg = node.backgroundImage || '';
  const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
  return match ? match[1] : '';
}

// formatTime (from popup.js)
function formatTime(seconds) {
  if (!seconds) return '0:00';
  if (seconds === Infinity) return 'Live';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// ============================================================
// TESTS
// ============================================================
(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  FullPiP Content Utils — Unit Tests');
  console.log('═══════════════════════════════════════════');

  await group('Debounce', [
    () => {
      let called = false;
      const fn = Debounce(() => {
        called = true;
      }, 10);
      fn();
      assert(!called, 'not called immediately');
    },
    async () => {
      let value = 0;
      const fn = Debounce((v) => {
        value = v;
      }, 10);
      fn(1);
      fn(2);
      fn(3);
      await new Promise((r) => setTimeout(r, 30));
      assertEq(value, 3, 'only last call executed');
    },
    async () => {
      let count = 0;
      const fn = Debounce(() => {
        count++;
      }, 10);
      fn();
      fn();
      await new Promise((r) => setTimeout(r, 25));
      assertEq(count, 1, 'single execution after settle');
    }
  ]);

  await group('generateId', [
    () => {
      const id1 = generateId();
      const id2 = generateId();
      assert(id1.startsWith('fullpip-'), 'has prefix');
      assert(id1 !== id2, 'unique IDs');
      assertEq(typeof id1, 'string', 'returns string');
    }
  ]);

  await group('pruneMediaMap', [
    () => {
      const map = new Map();
      // Connected element (mock)
      map.set('keep', { isConnected: true });
      // Disconnected element (mock)
      map.set('remove', { isConnected: false });

      pruneMediaMap(map);

      assertEq(map.size, 1, 'pruned disconnected');
      assert(map.has('keep'), 'kept connected');
      assert(!map.has('remove'), 'removed disconnected');
    },
    () => {
      const map = new Map();
      // All connected
      map.set('a', { isConnected: true });
      map.set('b', { isConnected: true });
      pruneMediaMap(map);
      assertEq(map.size, 2, 'all connected kept');
    },
    () => {
      const map = new Map();
      // Empty map
      pruneMediaMap(map);
      assertEq(map.size, 0, 'empty map stays empty');
    }
  ]);

  await group('extractBgImage', [
    () => {
      assertEq(
        extractBgImage({ backgroundImage: "url('https://example.com/img.png')" }),
        'https://example.com/img.png',
        'extracts URL from single quotes'
      );
    },
    () => {
      assertEq(
        extractBgImage({ backgroundImage: 'url("https://example.com/img.png")' }),
        'https://example.com/img.png',
        'extracts URL from double quotes'
      );
    },
    () => {
      assertEq(
        extractBgImage({ backgroundImage: 'url(https://example.com/img.png)' }),
        'https://example.com/img.png',
        'extracts URL without quotes'
      );
    },
    () => {
      assertEq(extractBgImage({ backgroundImage: 'none' }), '', 'returns empty for no background');
    },
    () => {
      assertEq(extractBgImage({ backgroundImage: '' }), '', 'returns empty for empty string');
    }
  ]);

  await group('formatTime', [
    () => {
      assertEq(formatTime(0), '0:00', 'zero seconds');
      assertEq(formatTime(null), '0:00', 'null');
      assertEq(formatTime(undefined), '0:00', 'undefined');
      assertEq(formatTime(Infinity), 'Live', 'live stream');
    },
    () => {
      assertEq(formatTime(30), '0:30', '30 seconds');
      assertEq(formatTime(60), '1:00', '1 minute');
      assertEq(formatTime(90), '1:30', '1 min 30 sec');
    },
    () => {
      assertEq(formatTime(3661), '61:01', '1 hour 1 min 1 sec');
      assertEq(formatTime(59), '0:59', '59 seconds');
    }
  ]);

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');
  if (failed > 0) process.exit(1);
})();
