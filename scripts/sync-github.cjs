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
      if (['node_modules', 'target', 'target-static', 'dist', 'validation', 'ui-preview', '__pycache__', 'bin', 'build', '.gradle', '.kotlin', '.idea'].includes(entry.name)) continue;
      if (rel === 'native/target' || rel === 'native/target-static' || rel === 'module-template/bin') continue;
      if (entry.isFile() && entry.name === 'local.properties') continue;
      out.push(...walk(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

const COMMIT_MESSAGE = [
  'Release v2.5.0 (350): rebuild the app on AndroidLiquidGlass + miuix',
  '',
  "Ports the bundled Compose client to the reference app's own stack:",
  'Kyant0/AndroidLiquidGlass 2.0.1 for the liquid-glass pipeline (Backdrop +',
  'lens + highlight), Kyant0 Shapes 1.2.1 for G2 continuous corners, miuix',
  '0.9.4 for HyperOS switch/slider, shiguang_warehouse bundled under assets,',
  'and a user-supplied adaptive launcher icon. Toolchain moves to AGP 9.3.2',
  '(built-in Kotlin) + Kotlin 2.4.10 + Gradle 9.8.1 + compileSdk 37 as',
  'required by the dependency tree. Versions track v2.5.0 - 350; config',
  'schema unchanged (CONFIG_VERSION 320).',
].join('\n');

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
  const commit = await api('/git/commits', {
    method: 'POST',
    body: { message: COMMIT_MESSAGE, tree: newTree.sha, parents: [baseCommitSha] },
  });
  await api('/git/refs/heads/main', {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  console.log(`\ncommit ${commit.sha} pushed to main`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
