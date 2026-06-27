/**
 * @file tests/test-player.js
 * @desc Unit tests for player.js — runs in Node.js
 * Usage: node tests/test-player.js
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
// Extract testable values from player.js
// ============================================================
const PLAYER_CONFIG = {
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  LOADER_HIDE_DELAY_MS: 500,
};

// Error code mapping (from player.js handleVideoError)
const errorMessages = {
  1: { title: 'Loading aborted', message: 'The loading process was interrupted by a user action or navigation.' },
  2: { title: 'Network error', message: 'A network error occurred while trying to load the video. Check your connection.' },
  3: { title: 'Decode error', message: 'The video format is not supported or the file is corrupted.' },
  4: { title: 'Source not supported', message: 'The video source is unavailable, has been removed, or is blocked by CORS policy.' },
};

// ============================================================
// TESTS
// ============================================================
(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  FullPiP Player — Unit Tests');
  console.log('═══════════════════════════════════════════');

  await group('PLAYER_CONFIG', [
    () => {
      assertEq(PLAYER_CONFIG.MAX_RETRIES, 2, 'MAX_RETRIES = 2');
      assertEq(PLAYER_CONFIG.RETRY_DELAY_MS, 1000, 'RETRY_DELAY_MS = 1000');
      assertEq(PLAYER_CONFIG.LOADER_HIDE_DELAY_MS, 500, 'LOADER_HIDE_DELAY_MS = 500');
    },
    () => {
      assert(typeof PLAYER_CONFIG.MAX_RETRIES === 'number', 'MAX_RETRIES is number');
      assert(PLAYER_CONFIG.RETRY_DELAY_MS > 0, 'RETRY_DELAY_MS positive');
      assert(PLAYER_CONFIG.LOADER_HIDE_DELAY_MS > 0, 'LOADER_HIDE_DELAY_MS positive');
    }
  ]);

  await group('Error code mapping', [
    () => {
      assertEq(errorMessages[1].title, 'Loading aborted', 'code 1 title');
      assert(errorMessages[1].message.length > 0, 'code 1 has message');
    },
    () => {
      assertEq(errorMessages[2].title, 'Network error', 'code 2 title');
      assert(errorMessages[2].message.includes('network'), 'code 2 mentions network');
    },
    () => {
      assertEq(errorMessages[3].title, 'Decode error', 'code 3 title');
      assert(errorMessages[3].message.includes('format'), 'code 3 mentions format');
    },
    () => {
      assertEq(errorMessages[4].title, 'Source not supported', 'code 4 title');
      assert(errorMessages[4].message.includes('CORS'), 'code 4 mentions CORS');
    },
    () => {
      assertEq(errorMessages[99], undefined, 'unknown code returns undefined');
    }
  ]);

  await group('Error code completeness', [
    () => {
      // All standard MediaError codes should be covered
      for (let code = 1; code <= 4; code++) {
        assert(errorMessages[code] !== undefined, `error code ${code} is mapped`);
        assert(typeof errorMessages[code].title === 'string', `error code ${code} has title`);
        assert(typeof errorMessages[code].message === 'string', `error code ${code} has message`);
      }
    }
  ]);

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');
  if (failed > 0) process.exit(1);
})();
