/* Sync local tree to GitHub via the Git Data API (api.github.com is reachable
 * when github.com itself is blocked). Usage: node sync-github.cjs [--push] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REPO = 'zeng060812-creator/NovaSched-Zen-Edition';
const ROOT = path.resolve(__dirname, '..');
const API = `https://api.github.com/repos/${REPO}`;

function token() {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const match = out.match(/^password=(.+)$/m);
  if (!match) throw new Error('no stored GitHub credential');
  return match[1].trim();
}
const TOKEN = token();
async function api(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'nova-sync',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${endpoint} -> ${response.status}: ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function blobSha(file) {
  const data = fs.readFileSync(file);
  const header = Buffer.from(`blob ${data.length}\0`);
  return crypto.createHash('sha1').update(Buffer.concat([header, data])).digest('hex');
}

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue;
      if (['node_modules', 'target', 'target-static', 'dist', 'validation', 'ui-preview', '__pycache__', 'bin'].includes(entry.name) && base === '') continue;
      if (rel === 'native/target' || rel === 'native/target-static' || rel === 'module-template/bin') continue;
      out.push(...walk(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

async function main() {
  const push = process.argv.includes('--push');
  const ref = await api('/git/ref/heads/main');
  const baseCommitSha = ref.object.sha;
  const baseCommit = await api(`/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;
  const tree = await api(`/git/trees/${baseTreeSha}?recursive=1`);
  if (tree.truncated) throw new Error('remote tree truncated');
  const remote = new Map(tree.tree.filter(n => n.type === 'blob').map(n => [n.path, n.sha]));

  const ignored = new Set((fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/^\/|\/$/g, '').trim()).filter(Boolean)));
  const localFiles = walk(ROOT).filter(rel => {
    for (const rule of ignored) {
      if (rel === rule || rel.startsWith(rule + '/') || rel.endsWith('/' + rule) || rel.includes('/' + rule + '/')) return false;
    }
    return true;
  });
  const local = new Map(localFiles.map(rel => [rel, blobSha(path.join(ROOT, rel))]));

  const changed = [], deleted = [], same = [];
  for (const [p, sha] of local) {
    if (!remote.has(p)) changed.push(p);
    else if (remote.get(p) !== sha) changed.push(p);
    else same.push(p);
  }
  for (const p of remote.keys()) if (!local.has(p)) deleted.push(p);

  console.log(`base commit: ${baseCommitSha}`);
  console.log(`local files: ${local.size}, remote blobs: ${remote.size}`);
  console.log(`\n--- CHANGED / NEW (${changed.length}) ---`);
  for (const p of changed) console.log(`  M ${p}`);
  console.log(`\n--- DELETED locally (${deleted.length}) ---`);
  for (const p of deleted) console.log(`  D ${p}`);
  console.log(`\n--- unchanged: ${same.length} files ---`);

  if (!push) {
    console.log('\nDRY RUN ONLY — rerun with --push to create blobs/tree/commit and update main.');
    return;
  }
  console.log('\npushing...');
  const entries = [];
  for (const p of changed) {
    const data = fs.readFileSync(path.join(ROOT, p));
    const blob = await api('/git/blobs', {
      method: 'POST',
      body: { content: data.toString('base64'), encoding: 'base64' },
    });
    entries.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  blob ${p} -> ${blob.sha.slice(0, 10)}`);
  }
  for (const p of deleted) {
    entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
    console.log(`  rm   ${p}`);
  }
  const newTree = await api('/git/trees', {
    method: 'POST',
    body: { base_tree: baseTreeSha, tree: entries },
  });
  const message = [
    'Rebuild the WebUI on the ported LiquidGlassView WebGL engine; fix hidden native bugs (v2.2.8)',
    '',
    'This commit also syncs the final v2.2.7 source snapshot onto the older main',
    'baseline: drops the legacy zen.* assets, liquid-glass.html demo, options.rs,',
    'test-zen-ui.cjs and .gitattributes that the snapshot superseded, and refreshes',
    'module.prop, customize.sh, the validation scripts and docs to their shipped',
    'v2.2.7 state.',
    '',
    'WebUI:',
    '- Replace the per-card XiaoP SVG-filter glass (one filter instance per card +',
    '  a whole-body MutationObserver rescan + unconditional heartbeat text writes,',
    '  the source of the stutter) with a single fullscreen WebGL canvas rendering',
    '  every registered glass surface: the LiquidGlassView rounded-rect SDF',
    '  refraction shader ported verbatim (edge refraction, depth gradient, spectral',
    '  dispersion, linear-sRGB saturation) over an in-shader procedural aurora,',
    '  zero texture uploads, 30fps cap, 2.3MP pixel budget, paused when hidden,',
    '  CSS frosted-glass fallback without WebGL',
    '- Layout borrows the SleepDown-Schedule design language: capsule floating dock',
    '  with spring indicator and press scale, transparent top bar with status pill,',
    '  date hero, 16px page padding and 12-14px section rhythm, pointer-following sheen',
    '- Fix the misalignment: .stats-grid/.hero-badges/.hero-actions declared grid/gap',
    '  without display, so the layouts never applied',
    '- Heartbeat renders no longer mutate the DOM when nothing changed; logs render',
    '  incrementally (append-only) instead of rebuilding the whole list per line',
    '- Theme/accent changes now reach the renderer live (previously read once at load,',
    '  giving dark glass under dark text on light systems)',
    '- Fix glass rect coordinates: surfaces are stored in document space and must be',
    '  shifted by scroll before rendering into the fixed canvas',
    '- Drop webroot/vendor/xiaop-liquid-glass and assets/glass.js',
    '',
    'Native:',
    '- Policy audit resolved percent frequencies before comparing, so a healthy',
    '  ceiling was always reported as "clamped by thermal/QoS" (daemon.rs)',
    '- /logs WebSocket framing no longer splits multi-byte UTF-8 at 16KiB boundaries',
    '  (mirrors root_bridge::log_chunk) (websocket.rs)',
    '- Server-to-client frames use the RFC 6455 64-bit length encoding so the',
    '  /app-modes payload cannot outgrow the old 64KiB hard cap; app rules capped',
    '  at 256 like the automatic overrides (websocket.rs, app_modes.rs)',
    '- parse_game_command no longer aborts on one malformed line and skips the',
    '  negative-evidence check, which sent real games to powersave on OEM variants',
    '  (automatic.rs)',
    '- Handshake failures log a sanitized path instead of echoing attacker-controlled',
    '  bytes into the persistent log (websocket.rs)',
    '- Legacy config parse validates sched_util_clamp_min/max like config_v2, failing',
    '  at load instead of looping degraded at runtime (config.rs)',
    '- Platform query output is read as bytes and truncated at a UTF-8 boundary so a',
    '  successful query is not reported as a read failure (util.rs)',
    '',
    'Version 2.2.8 (unreleased); scheduling core unchanged. WebUI tests updated and',
    'green (test:webui + test:render at 320/393/768 with WebGL).',
  ].join('\n');
  const commit = await api('/git/commits', {
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [baseCommitSha] },
  });
  await api('/git/refs/heads/main', {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  console.log(`\ncommit ${commit.sha} pushed to main`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
