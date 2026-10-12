/* NovaSched Zen Edition v2.2.0 — liquid-glass WebUI structural checks.
 *
 * The v2.2.0 WebUI is a single-file WebGL2 canvas app: the liquid glass
 * engine ships verbatim and the control layer reuses its components. DOM
 * snapshots cannot observe a canvas, so these checks assert the contract
 * statically: engine markers present, protocol constants in sync with the
 * Rust service, no retired DOM-UI leftovers, and per-SoC mode tables that
 * keep 省电 capped and balance no longer unlimited.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const web = path.join(root, 'module-template', 'webroot');
const native = path.join(root, 'native', 'src');
let failures = 0, checks = 0;
function check(name, fn) {
  checks++;
  try { fn(); console.log(`ok   ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function read(p) { return fs.readFileSync(p, 'utf8'); }

const ui = read(path.join(web, 'index.html'));
const ws = read(path.join(native, 'websocket.rs'));
const auth = read(path.join(native, 'web_auth.rs'));
const scheduler = read(path.join(native, 'scheduler.rs'));
const hardware = read(path.join(native, 'hardware.rs'));
const daemon = read(path.join(native, 'daemon.rs'));
const config = read(path.join(native, 'config.rs'));

/* ---- 1. Liquid glass engine is shipped verbatim ---- */
check('glass engine: spring physics classes present', () => {
  for (const marker of ['class SpringFloat', 'class DampedDragAnimation', 'class InteractiveHighlight'])
    assert(ui.includes(marker), `missing ${marker}`);
});
check('glass engine: AGSL-ported fragment shader present', () => {
  assert(ui.includes('const FS_GLASS'), 'FS_GLASS missing');
  assert(ui.includes('sdRoundedRect') && ui.includes('circleMap'), 'refraction SDF helpers missing');
});
check('glass engine: all original components retained', () => {
  for (const marker of ['const btn = {', 'const toggle = {', 'const slider = {', 'const tabs = {', 'const openBtn = {', 'const dialog = {'])
    assert(ui.includes(marker), `component missing: ${marker}`);
});
check('glass engine: demo debug hook retained', () => {
  assert(ui.includes('window.__ytblDebug'), 'debug hook missing');
});
check('glass engine: WebGL2 context with fallback', () => {
  assert(ui.includes("getContext('webgl2'"), 'webgl2 context missing');
  assert(ui.includes('showFallback'), 'fallback path missing');
});

/* ---- 2. Control layer reuses the engine components ---- */
check('control layer: instantiates engine components', () => {
  assert(ui.includes('Object.assign({}, btn,'), 'mode buttons must clone the engine glass button');
  assert(ui.includes('tabs.labels = ["概览", "规则", "日志", "设置"]'), 'bottom tab bar missing');
  assert(ui.includes('toggle.selected = nova.automatic'), 'automatic switch must drive the engine toggle');
  assert(ui.includes('slider.value = novaUi.ref'), 'settings slider must drive the engine slider');
});
check('control layer: four pages wired', () => {
  assert(ui.includes('drawHome') && ui.includes('drawRules') && ui.includes('drawLogs') && ui.includes('drawSettings'), 'page drawers missing');
});
check('control layer: rule sheet follows dialog glass parameters', () => {
  assert(ui.includes('const sheet = {') && ui.includes('sheet.draw(cssW, cssH, dt)'), 'sheet missing');
});

/* ---- 3. Protocol constants stay in sync with the Rust service ---- */
check('protocol: WebSocket key matches websocket.rs', () => {
  const key = ui.match(/const NOVA_KEY = "([^"]+)"/);
  assert(key, 'NOVA_KEY missing in UI');
  assert(ws.includes(`"${key[1]}"`), 'UI and Rust WebSocket keys differ');
});
check('protocol: auth prefix matches web_auth.rs', () => {
  const prefix = ui.match(/const AUTH_PREFIX = "([^"]+)"/);
  assert(prefix, 'AUTH_PREFIX missing in UI');
  assert(auth.includes(`"${prefix[1]}"`), 'UI and Rust auth prefixes differ');
});
check('protocol: authenticated endpoints and root bridge', () => {
  assert(ui.includes('[NOVA_KEY, AUTH_PREFIX + sessionToken]'), 'authenticated WS setup missing');
  assert(ui.includes('moduleCommand("webui-session"'), 'root credential getter missing');
  assert(ui.includes('moduleCommand("webui-rpc"'), 'root fallback RPC missing');
  assert(ws.includes('session.accepts(item)'), 'server token verification missing');
  assert(auth.includes('register_origin(Path::new(STATE_DIR), origin)'), 'root origin registration missing');
});
check('protocol: credential hygiene', () => {
  assert(ui.includes('publicError'), 'error scrubbing missing');
  assert(!/token\s*[:=]\s*"[a-f0-9]{64}"/.test(ui), 'hardcoded credential-like token in UI');
});
check('protocol: FAS availability surfaced to the UI', () => {
  assert(ui.includes('fasAvailable'), 'UI does not read fasAvailable');
  assert(ws.includes('fasAvailable:{}'), 'modes payload lacks fasAvailable');
  assert(daemon.includes('set_fas_available'), 'daemon never reports FAS availability');
});

/* ---- 4. Retired DOM UI must not linger ---- */
check('retired files: no zen.js/zen.css references anywhere shipped', () => {
  for (const file of ['module-template/webroot/index.html', 'module-template/webroot/config.mmrl.json',
    'scripts/package-release.py', 'module-template/customize.sh', 'module-template/uninstall.sh']) {
    const text = read(path.join(root, file));
    assert(!/assets\/zen(\.|-)/.test(text), `${file} still references the retired DOM UI`);
  }
  assert(!fs.existsSync(path.join(web, 'assets', 'zen.js')), 'zen.js still shipped');
  assert(!fs.existsSync(path.join(web, 'assets', 'zen.css')), 'zen.css still shipped');
});
check('webroot: single-entry index with mmrl config', () => {
  assert(fs.existsSync(path.join(web, 'index.html')));
  assert(fs.existsSync(path.join(web, 'config.mmrl.json')));
  const csp = JSON.parse(read(path.join(web, 'config.mmrl.json'))).contentSecurityPolicy;
  assert(csp.includes("'unsafe-inline'") && csp.includes('ws://127.0.0.1:*'), 'CSP must allow inline scripts and local WS');
});

/* ---- 5. FAS integration (Scene N1) ---- */
check('FAS: scheduler follows Scene N1 fas-rs mode node', () => {
  assert(scheduler.includes('/dev/fas_rs/mode'), 'FAS node missing in scheduler');
  assert(scheduler.includes('fn apply_fas_mode'), 'apply_fas_mode missing');
  assert(scheduler.includes('util::write_node(&path, mode)'), 'FAS write must not go through the snapshot');
});
check('FAS: powercfg manifest declares Scene feature flags', () => {
  const manifest = JSON.parse(read(path.join(root, 'module-template', 'vtools', 'powercfg.json')));
  assert(manifest.features.fas === true, 'features.fas missing');
  assert(manifest.features.pedestal === true, 'features.pedestal missing');
  assert(manifest.state === '/data/adb/novasched/mode.txt', 'state path changed');
});
check('FAS: foreign scheduler takeover suspends writes', () => {
  assert(scheduler.includes('controls_locked'), 'takeover gate missing');
  assert(daemon.includes('scene.controls_locked()') && daemon.includes('scheduler.clear_pending()'), 'suspension path missing');
});

/* ---- 6. Mode tables: 省电到底 / balance capped / fast open ---- */
const EXPECTED_POLICIES = {
  SM8450: [0, 4, 7, -1], SM8475: [0, 4, 7, -1], SM8550: [0, 3, 7, -1], SM8650: [0, 2, 5, 7],
  SM8750: [0, 6, -1, -1], SM8850: [0, 6, -1, -1],
  DIMENSITY8350: [0, 4, 7, -1], DIMENSITY9400PLUS: [0, 4, 7, -1], XRING_O3: [4, 0, 1, -1],
};
for (const soc of Object.keys(EXPECTED_POLICIES)) {
  check(`config ${soc}: v320 tables with capped balance`, () => {
    const profile = JSON.parse(read(path.join(root, 'module-template', 'config', `${soc}.json`)));
    assert(profile.meta.version === 320, 'meta.version must be 320');
    assert(JSON.stringify(profile.policies) === JSON.stringify(EXPECTED_POLICIES[soc]), 'policies changed');
    const cap = (mode, slot) => parseInt(profile.modes[mode].max[slot], 10);
    for (let slot = 0; slot < 4; slot++) {
      if (EXPECTED_POLICIES[soc][slot] < 0) continue;
      assert(cap('powersave', slot) <= 62, `powersave c${slot} not fully capped (${profile.modes.powersave.max[slot]})`);
      assert(cap('balance', slot) <= 88, `balance c${slot} still unlimited (${profile.modes.balance.max[slot]})`);
      assert(cap('fast', slot) === 100, `fast c${slot} must stay open (${profile.modes.fast.max[slot]})`);
    }
  });
}
check('profile generator matches shipped configs', () => {
  const generator = read(path.join(root, 'scripts', 'generate-profiles.py'));
  assert(generator.includes("'balance': {'max': ['85%', '80%', '78%', '82%']}"), 'generator balance caps missing');
  assert(generator.includes("'version': 320"), 'generator version stale');
});
check('schema: PROFILE_VERSION tracks the release', () => {
  assert(config.includes('pub const PROFILE_VERSION: i64 = 320;'), 'PROFILE_VERSION must be 320');
});

/* ---- 7. No thermal / charging control writes ---- */
check('safety: scheduler never writes thermal or charger nodes', () => {
  const thermalWrite = /write[^"]*"[^"]*thermal|"[^"]*thermal[^"]*"\s*,|thermal[^"]*".*write/i;
  assert(!/\/sys\/class\/thermal/.test(scheduler), 'scheduler references thermal class nodes');
  assert(scheduler.includes('不能停用温控、电池或充电服务'), 'perf service guard missing');
  for (const banned of ['thermal_core', 'thermal-engine', '/proc/thermal', 'battery/charging', 'charge_control']) {
    assert(!scheduler.includes(banned), `forbidden node reference: ${banned}`);
  }
});
check('safety: diagnostics only read thermal values', () => {
  const diag = read(path.join(native, 'game_diagnostics.rs'));
  assert(diag.includes('sys/class/thermal'), 'diagnostics should read temperatures');
  const writes = diag.match(/write_node|atomic_write/g) || [];
  assert(writes.length === 0, 'diagnostics must be read-only');
});

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
