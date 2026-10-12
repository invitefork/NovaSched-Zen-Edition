/* Create the GitHub Release for the packaged dist/ artifacts and upload the
 * release + source zips and checksums. The release notes are taken from the
 * top section of CHANGELOG.md. Usage: node create-release.cjs v2.3.0 [--draft]
 * Credentials come from `git credential fill`; the token is never printed. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = 'zeng060812-creator/NovaSched-Zen-Edition';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const VERSION = process.argv[2] || '';
const DRAFT = process.argv.includes('--draft');
if (!/^v\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error('usage: node create-release.cjs v<semver> [--draft]');
  process.exit(1);
}

function token() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const match = out.match(/^password=(.+)$/m);
  if (!match) throw new Error('no stored GitHub credential');
  return match[1].trim();
}
const TOKEN = token();

async function api(endpoint, options = {}, base = `https://api.github.com/repos/${REPO}`) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nova-release',
    ...(options.headers || {}),
  };
  if (options.body && typeof options.body !== 'string') {
    options.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${base}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${endpoint} -> ${response.status}: ${await response.text()}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/* Release notes: the first `## vX.Y.Z` section of CHANGELOG.md, verbatim. */
function releaseNotes() {
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const start = changelog.indexOf(`## ${VERSION} `);
  if (start < 0) throw new Error(`CHANGELOG.md has no ${VERSION} section`);
  const rest = changelog.slice(start);
  const end = rest.indexOf('\n## ', 1);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/* Asset uploads go through curl: undici fails mid-transfer on multi-hundred-KB
 * bodies against uploads.github.com from this network, curl does not. */
function uploadAsset(releaseId, filePath, contentType) {
  const name = path.basename(filePath);
  execFileSync('curl', [
    '-sS', '--fail', '--max-time', '600',
    '-X', 'POST',
    '-H', `Authorization: Bearer ${TOKEN}`,
    '-H', `Content-Type: ${contentType}`,
    '--data-binary', `@${filePath}`,
    `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return { name, size: fs.statSync(filePath).size };
}

async function main() {
  const notes = releaseNotes();
  const existing = await api(`/releases/tags/${VERSION}`).catch(() => null);
  let release;
  if (existing) {
    console.log(`release ${VERSION} exists (${existing.id}), updating notes/draft state`);
    release = await api(`/releases/${existing.id}`, {
      method: 'PATCH',
      body: { body: notes, draft: DRAFT },
    });
  } else {
    release = await api('/releases', {
      method: 'POST',
      body: {
        tag_name: VERSION,
        target_commitish: 'main',
        name: `NovaSched ${VERSION} · Zen Edition`,
        body: notes,
        draft: DRAFT,
      },
    });
    console.log(`created release ${VERSION} (${release.id}) on tag ${VERSION}`);
  }
  const have = new Set((await api(`/releases/${release.id}/assets`)).map(a => a.name));
  const assets = [
    [path.join(DIST, `NovaSched-${VERSION}-release.zip`), 'application/zip'],
    [path.join(DIST, `NovaSched-${VERSION}-source.zip`), 'application/zip'],
    [path.join(DIST, `NovaSched-${VERSION}-SHA256SUMS.txt`), 'text/plain; charset=utf-8'],
  ];
  for (const [file, type] of assets) {
    if (!fs.existsSync(file)) throw new Error(`missing dist artifact: ${file}`);
    if (have.has(path.basename(file))) {
      console.log(`asset already present: ${path.basename(file)}`);
      continue;
    }
    const asset = await uploadAsset(release.id, file, type);
    console.log(`uploaded ${asset.name} (${asset.size} bytes)`);
  }
  console.log(`release URL: ${release.html_url}`);
}

main().catch(error => { console.error(error.message || error); process.exit(1); });
