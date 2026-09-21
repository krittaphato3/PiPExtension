// scripts/pack.mjs — version-gated release zip for FullPiP.
// Uses Node built-ins only (fs / path / child_process / url).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// --- Resolve repo root (scripts/ is one level below root). ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// --- 1. Check manifest.json / package.json / README badge versions match. ---
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

const manifestVer = manifest.version;
const pkgVer = pkg.version;
// README badge looks like: [![Version](https://img.shields.io/badge/Version-1.1.0-...)]
const badgeMatch = readme.match(/Version-([\d.]+)/);
const readmeVer = badgeMatch ? badgeMatch[1] : null;

console.log(`versions: manifest=${manifestVer} package=${pkgVer} readme=${readmeVer}`);

if (!readmeVer) {
  console.error('pack: could not find Version badge (Version-X.Y.Z) in README.md');
  process.exit(1);
}
if (manifestVer !== pkgVer || pkgVer !== readmeVer) {
  console.error(
    `pack: version mismatch — manifest.json=${manifestVer} package.json=${pkgVer} README=${readmeVer}. Keep all three in sync.`
  );
  process.exit(1);
}

// --- 2. Run prettier --check (warn only, never fail the pack). ---
try {
  execSync('npx prettier --check .', { cwd: root, stdio: 'inherit', shell: true });
} catch {
  console.warn('pack: prettier --check reported issues (warning only, continuing).');
}

// --- 3. Zip fullpip-$ver.zip excluding dev-only dirs. ---
const outName = `fullpip-${pkgVer}.zip`;
const outPath = path.join(root, outName);

// Top-level entries to exclude from the release archive.
const EXCLUDED = new Set(['node_modules', 'tests', '.git', '.playwright-mcp', '.kilo']);

// Collect files recursively, skipping excluded top-level dirs and the output zip itself.
function collectFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const top = rel.split('/')[0];
    // Skip the archive we are creating and excluded dirs.
    if (rel === outName || EXCLUDED.has(top)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(abs, rel));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

// Remove a stale archive so the build is reproducible.
if (fs.existsSync(outPath)) fs.rmSync(outPath);

const files = collectFiles(root);
if (files.length === 0) {
  console.error('pack: no files to archive (all excluded?)');
  process.exit(1);
}

try {
  if (process.platform === 'win32') {
    // Windows: Compress-Archive with an explicit file list (honours excludes above).
    // Quote each path for PowerShell; run from repo root.
    const list = files.map((f) => `'./${f}'`).join(',');
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path ${list} -DestinationPath './${outName}' -Force"`,
      { cwd: root, stdio: 'inherit', shell: true }
    );
  } else {
    // Linux/macOS (CI): system zip with -x guards as a second layer of defence.
    // File list is passed explicitly; -x covers nested copies just in case.
    const quoted = files.map((f) => `'${f.replace(/'/g, `'\\''`)}'`).join(' ');
    execSync(
      `zip -r '${outName}' ${quoted} -x 'node_modules/*' 'tests/*' '.git/*' '.playwright-mcp/*' '.kilo/*' '${outName}'`,
      { cwd: root, stdio: 'inherit', shell: true }
    );
  }
  console.log(`pack: created ${outName} (${files.length} files, v${pkgVer})`);
} catch (err) {
  console.error(
    `pack: zip failed — install 'zip' (linux) or use Windows PowerShell 5+. ${err.message}`
  );
  process.exit(1);
}
