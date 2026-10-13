'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('module-template/webroot/index.html');
const ui = read('module-template/webroot/assets/app.js');
const css = read('module-template/webroot/assets/app.css');
const glass = read('module-template/webroot/assets/liquid-glass.js');
const ws = read('native/src/websocket.rs');
let count=0;
function check(name,fn) { fn();count++;console.log('PASS:',name); }
check('liquid glass renderer ships the refraction shader with no vendored copy',()=>{
  for(const marker of ['sdRoundedRect','gradSdRoundedRect','circleMap','refractContent','dispersionIntensity','recordScene','getTexture'])
    assert.ok(glass.includes(marker),'shader marker missing: '+marker);
  assert.ok(glass.includes('Apache-2.0'),'upstream attribution missing');
  assert.ok(!fs.existsSync(path.join(root,'module-template/webroot/vendor')),'vendor directory should be gone');
});
check('all five pages, foreground package and Scene diagnostics present',()=>{
  for(const page of ['overview','modes','rules','logs','about']) assert(html.includes(`id="page-${page}"`));
  for(const id of ['stat-pkg-raw','scene-diagnose','auto-switch','dialog-layer','glass-level','glass-canvas']) assert(html.includes(`id="${id}"`));
});
check('no remote assets needed for the live UI',()=>{
  assert(!/<(?:script|link)[^>]+(?:src|href)="https?:/.test(html));
  assert(!/url\(\s*https?:/.test(css));
});
check('authenticated protocol and root fallback still match native core',()=>{
  const key=ui.match(/const KEY = "([^"]+)"/)[1];
  assert(ws.includes(`"${key}"`));
  assert(ui.includes('[KEY, AUTH_PREFIX + sessionToken]'));
  assert(ui.includes('moduleCommand("webui-session"'));
  assert(ui.includes('moduleCommand("webui-rpc"'));
  assert(ui.includes('s.discovered = true;\n            bindSocket'));
});
check('Scene priority and unknown detection reflected in UI',()=>{
  assert(ui.includes('autoSwitch.disabled = !editable() || !!s.pending || s.linked'));
  assert(ui.includes('s.scenePresence === "unknown"'));
  assert(ws.includes('scenePresence:{}'));
});
check('dialog accessibility, motion preference and safe areas',()=>{
  assert(ui.includes('dialogFocus'));
  assert(ui.includes('event.key !== "Tab"'));
  assert(css.includes('prefers-reduced-motion'));
  assert(css.includes('safe-area-inset-bottom'));
});
check('glass renderer degrades without WebGL and honours reduced motion',()=>{
  assert(glass.includes('glass-flat'));
  assert(glass.includes('prefers-reduced-motion'));
  assert(glass.includes('webglcontextlost'));
});
for(const mode of ['powersave','balance','performance','fast'])
  check('mode '+mode,()=>assert(html.includes(`data-mode="${mode}"`)));
for(const file of fs.readdirSync(path.join(root,'module-template/config'))){
  check('profile '+file,()=>{
    const cfg=JSON.parse(fs.readFileSync(path.join(root,'module-template/config',file),'utf8'));
    assert.equal(cfg.meta.author,'ZenJooo');
    assert.deepEqual(Object.keys(cfg.modes).sort(),['balance','fast','performance','powersave']);
  });
}
console.log(`${count} checks passed`);
