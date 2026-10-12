/* NovaSched Zen Edition v2.2.1 — WebUI structural checks.
 *
 * The UI is a DOM + CSS liquid-glass single page whose visual language is
 * ported from the SleepDown schedule site. These checks assert the shipped
 * contract statically: design tokens and glass components present, protocol
 * constants in sync with the Rust service, no canvas-engine leftovers, and
 * per-SoC mode tables that keep 省电 capped and balance no longer unlimited.
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

const html = read(path.join(web, 'index.html'));
const css = read(path.join(web, 'assets', 'app.css'));
const ui = read(path.join(web, 'assets', 'app.js'));
const ws = read(path.join(native, 'websocket.rs'));
const auth = read(path.join(native, 'web_auth.rs'));
const scheduler = read(path.join(native, 'scheduler.rs'));
const daemon = read(path.join(native, 'daemon.rs'));
const config = read(path.join(native, 'config.rs'));

/* ---- 1. Design language ported from the reference site ---- */
check('design: SleepDown tokens ported verbatim', () => {
  for (const token of ['--brand: #007aff', '--ink: #090b10', '--paper: #f5f7fa',
    'cubic-bezier(.16,1,.3,1)', 'backdrop-filter: blur(30px) saturate(1.65)',
    'border-radius: 999px', '#ffffffd6', 'letter-spacing: -.035em'])
    assert(css.includes(token), `missing design token: ${token}`);
});
check('design: glass nav with sliding indicator', () => {
  assert(css.includes('.global-nav') && css.includes('.nav-indicator'), 'glass nav missing');
  assert(css.includes('translate3d(calc(var(--nav-index, 0)'), 'indicator slide missing');
  assert(html.includes('class="nav-indicator"'), 'nav indicator element missing');
});
check('design: hero copy, badges and gallery control', () => {
  assert(html.includes('把性能，'), 'hero headline missing');
  assert(html.includes('class="tab-bar"') && html.includes('tab-indicator'), 'bottom tab bar missing');
  assert(css.includes('.page.active') && css.includes('translateX(calc(var(--tab-index, 0)'), 'page switching missing');
  assert(html.includes('id="page-logs"') && html.includes('id="page-about"'), 'five pages missing');
});
check('design: reveal scroll animations', () => {
  assert(css.includes('.reveal') && css.includes('.reveal.visible'), 'reveal animation missing');
  assert(css.includes('translate3d(0, 62px, 0) scale(.975)'), 'reveal transform missing');
});
check('design: light + dark themes and reduced motion', () => {
  assert(css.includes('[data-theme="dark"]'), 'dark theme missing');
  assert(html.includes('data-theme-choice="system"'), 'theme picker missing');
  assert(css.includes('prefers-reduced-motion'), 'reduced motion missing');
});

/* ---- 2. Control surface completeness ---- */
check('sections: overview / modes / rules / logs / about / footer', () => {
  for (const id of ['id="overview"', 'id="modes"', 'id="rules"', 'id="logs"', 'id="about"', '<footer>'])
    assert(html.includes(id), `missing ${id}`);
});
check('modes: four cards with active/pending states', () => {
  for (const mode of ['powersave', 'balance', 'performance', 'fast'])
    assert(html.includes(`data-mode="${mode}"`), `mode card missing: ${mode}`);
  assert(css.includes('.mode-card[data-state="active"]') && css.includes('.mode-card[data-state="pending"]'), 'mode states missing');
  assert(html.includes('id="auto-switch"'), 'automatic switch missing');
});
check('rules: list, editor dialog with mode chips and delete', () => {
  assert(html.includes('id="rule-list"') && html.includes('id="add-rule"'), 'rules surface missing');
  assert(ui.includes('showRuleEditor') && ui.includes('showDeleteConfirm'), 'rule dialogs missing');
  assert(ui.includes('data-chip'), 'mode chips missing');
});
check('logs: level filter, follow switch, copy, detail dialog', () => {
  for (const marker of ['data-level="error"', 'id="log-follow"', 'id="log-copy"', 'renderLogs'])
    assert(ui.includes(marker) || html.includes(marker), `logs feature missing: ${marker}`);
});
check('interactions: snackbar, dialog layer, smooth anchors', () => {
  assert(html.includes('id="snackbar"') && html.includes('id="dialog-layer"'), 'feedback surfaces missing');
  assert(css.includes('scroll-behavior: smooth'), 'smooth scrolling missing');
  assert(ui.includes('IntersectionObserver'), 'scroll observers missing');
});

/* ---- 3. Protocol stays in sync with the Rust service ---- */
check('protocol: WebSocket key matches websocket.rs', () => {
  const key = ui.match(/const KEY = "([^"]+)"/);
  assert(key, 'KEY missing in app.js');
  assert(ws.includes(`"${key[1]}"`), 'UI and Rust WebSocket keys differ');
});
check('protocol: auth prefix matches web_auth.rs', () => {
  const prefix = ui.match(/const AUTH_PREFIX = "([^"]+)"/);
  assert(prefix, 'AUTH_PREFIX missing in app.js');
  assert(auth.includes(`"${prefix[1]}"`), 'UI and Rust auth prefixes differ');
});
check('protocol: authenticated endpoints and root bridge', () => {
  assert(ui.includes('[KEY, AUTH_PREFIX + sessionToken]'), 'authenticated WS setup missing');
  assert(ui.includes('moduleCommand("webui-session"'), 'root credential getter missing');
  assert(ui.includes('moduleCommand("webui-rpc"'), 'root fallback RPC missing');
  assert(ws.includes('session.accepts(item)'), 'server token verification missing');
  assert(auth.includes('register_origin(Path::new(STATE_DIR), origin)'), 'root origin registration missing');
  assert(ui.includes('fasAvailable'), 'UI does not read fasAvailable');
  assert(ws.includes('fasAvailable:{}'), 'modes payload lacks fasAvailable');
});

/* ---- 4. Canvas engine fully retired ---- */
check('retired: no liquid-glass canvas engine leftovers', () => {
  for (const banned of ['FS_GLASS', 'SpringFloat', '__ytblDebug', 'getContext(\'webgl2', 'assets/zen'])
    assert(!html.includes(banned) && !css.includes(banned) && !ui.includes(banned), `leftover: ${banned}`);
  assert(!fs.existsSync(path.join(web, 'assets', 'app.css.bak')), 'stale backup shipped');
});

/* ---- 5. FAS integration (Scene N1) ---- */
check('FAS: scheduler follows Scene N1 fas-rs mode node', () => {
  assert(scheduler.includes('/dev/fas_rs/mode') && scheduler.includes('fn apply_fas_mode'), 'FAS follow missing');
  assert(scheduler.includes('util::write_node(&path, mode)'), 'FAS write must not go through the snapshot');
});
check('FAS: powercfg manifest declares Scene feature flags', () => {
  const manifest = JSON.parse(read(path.join(root, 'module-template', 'vtools', 'powercfg.json')));
  assert(manifest.features.fas === true && manifest.features.pedestal === true, 'feature flags missing');
});

/* ---- 6. Mode tables: 省电到底 / balance capped / fast open ---- */
const EXPECTED_POLICIES = {
  SM8450: [0, 4, 7, -1], SM8475: [0, 4, 7, -1], SM8550: [0, 3, 7, -1], SM8650: [0, 2, 5, 7],
  SM8750: [0, 6, -1, -1], SM8850: [0, 6, -1, -1],
  DIMENSITY8350: [0, 4, 7, -1], DIMENSITY9400PLUS: [0, 4, 7, -1], XRING_O3: [4, 0, 1, -1],
};
for (const soc of Object.keys(EXPECTED_POLICIES)) {
  check(`config ${soc}: capped powersave/balance, open fast`, () => {
    const profile = JSON.parse(read(path.join(root, 'module-template', 'config', `${soc}.json`)));
    assert(JSON.stringify(profile.policies) === JSON.stringify(EXPECTED_POLICIES[soc]), 'policies changed');
    for (let slot = 0; slot < 4; slot++) {
      if (EXPECTED_POLICIES[soc][slot] < 0) continue;
      const cap = mode => parseInt(profile.modes[mode].max[slot], 10);
      assert(cap('powersave') <= 62, `powersave c${slot} not fully capped`);
      assert(cap('balance') <= 88, `balance c${slot} still unlimited`);
      assert(cap('fast') === 100, `fast c${slot} must stay open`);
    }
  });
}
check('schema: PROFILE_VERSION tracks the config generation', () => {
  assert(config.includes('pub const PROFILE_VERSION: i64 = 320;'), 'PROFILE_VERSION must be 320');
});

/* ---- 7. No thermal / charging control writes ---- */
check('safety: scheduler never writes thermal or charger nodes', () => {
  assert(!scheduler.includes('/sys/class/thermal'), 'scheduler references thermal class nodes');
  assert(scheduler.includes('不能停用温控、电池或充电服务'), 'perf service guard missing');
  for (const banned of ['thermal_core', 'thermal-engine', '/proc/thermal', 'battery/charging', 'charge_control']) {
    assert(!scheduler.includes(banned), `forbidden node reference: ${banned}`);
  }
});

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
