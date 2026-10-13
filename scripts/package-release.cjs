#!/usr/bin/env node
/* Node 版打包脚本，复刻 scripts/package-release.py 的全部校验与产物。
 * 先完成 Android ELF 构建（scripts/build.sh 或 Windows 下手动 cargo build）。
 * 用法：node scripts/package-release.cjs [--source-only] */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const {spawnSync} = require("child_process");

const ROOT = path.join(__dirname, "..");
const MODULE = path.join(ROOT, "module-template");
const DIST = path.join(ROOT, "dist");
fs.mkdirSync(DIST, {recursive: true});

const props = Object.fromEntries(
  fs.readFileSync(path.join(MODULE, "module.prop"), "utf8")
    .split("\n").filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
);
const VERSION = props.version.replace(/^v/, "");
const VERSION_CODE = Number(props.versionCode);
const CONFIG_VERSION = Number(
  fs.readFileSync(path.join(ROOT, "native/src/config.rs"), "utf8")
    .match(/PROFILE_VERSION: i64 = (\d+)/)[1]
);
const sourceOnly = process.argv.includes("--source-only");
const LAYOUTS = {
  SM8450: 1, SM8475: 1, SM8550: 1, SM8650: 1, SM8750: 1, SM8850: 1,
  DIMENSITY8350: 1, DIMENSITY9400PLUS: 1, XRING_O3: 1,
};
const SUPPORTED = Object.keys(LAYOUTS);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/* ---- 最小 ZIP 写入器：unix 权限 + deflate ---- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function archive(target, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [source, name, executable] of entries) {
    const data = Buffer.isBuffer(source) ? source : fs.readFileSync(source);
    const deflated = zlib.deflateRawSync(data, {level: 9});
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const mode = (0o100000 | (executable ? 0o755 : 0o644)) << 16;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x2821, 12); /* unix, mode in external attrs */
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, deflated);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x2821, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(deflated.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE(mode >>> 0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBytes]));
    offset += local.length + nameBytes.length + deflated.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(target, Buffer.concat([...chunks, directory, end]));
  const sum = digest(target);
  console.log(path.basename(target), fs.statSync(target).size, sum);
}

/* ---- 一致性校验 ---- */
assert(props.version === `v${VERSION}` && props.versionCode === String(VERSION_CODE), "module.prop identity");
const profileCheck = spawnSync(process.execPath, [path.join(ROOT, "scripts/check-profiles.cjs")], {encoding: "utf8"});
assert(profileCheck.status === 0, `配置与生成器不一致:\n${profileCheck.stdout}\n${profileCheck.stderr}`);
for (const soc of SUPPORTED) {
  const profile = JSON.parse(fs.readFileSync(path.join(MODULE, "config", `${soc}.json`), "utf8"));
  assert(JSON.stringify(Object.keys(profile.modes).sort()) === JSON.stringify(["balance", "fast", "performance", "powersave"]), `${soc} modes`);
  assert(profile.schema === "novasched/2" && profile.module === "NovaSched_Zen_Edition", `${soc} identity`);
  assert(profile.meta.author === "ZenJooo" && profile.meta.version === CONFIG_VERSION, `${soc} meta`);
  assert(profile.meta.soc === soc, `${soc} soc`);
  assert(!("smooth" in profile.features) && !("extreme" in profile.features), `${soc} retired features`);
}
assert(Object.keys(LAYOUTS).length === fs.readdirSync(path.join(MODULE, "config")).filter((name) => name.endsWith(".json")).length, "config file count");
for (const retired of ["profile-references", "profile-migrations"]) {
  assert(!fs.existsSync(path.join(ROOT, retired)) && !fs.existsSync(path.join(MODULE, retired)), "historical template copies must not ship");
}
const powercfg = JSON.parse(fs.readFileSync(path.join(MODULE, "vtools/powercfg.json"), "utf8"));
assert(powercfg.versionCode === VERSION_CODE && powercfg.version === `v${VERSION}`, "powercfg.json identity");
assert(fs.readFileSync(path.join(ROOT, "native/Cargo.toml"), "utf8").includes(`version = "${VERSION}"`), "Cargo.toml version");
assert(fs.readFileSync(path.join(ROOT, "native/Cargo.lock"), "utf8").includes(`version = "${VERSION}"`), "Cargo.lock version");
assert(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version === VERSION, "package.json version");
assert(JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8")).version === VERSION, "package-lock version");
const releaseUi = fs.readFileSync(path.join(MODULE, "webroot/assets/version.js"), "utf8");
assert(releaseUi.includes(`version: "${VERSION}"`) && releaseUi.includes(`versionCode: ${VERSION_CODE}`), "version.js identity");
assert(props.author === "ZenJooo", "author");

const ui = fs.readFileSync(path.join(MODULE, "webroot/assets/app.js"), "utf8");
const html = fs.readFileSync(path.join(MODULE, "webroot/index.html"), "utf8");
const css = fs.readFileSync(path.join(MODULE, "webroot/assets/app.css"), "utf8");
const ws = fs.readFileSync(path.join(ROOT, "native/src/websocket.rs"), "utf8");
const key = ui.match(/const KEY = "([^"]+)"/)[1];
assert(ws.includes(`"${key}"`), "UI and Rust WebSocket keys do not match");
const auth = fs.readFileSync(path.join(ROOT, "native/src/web_auth.rs"), "utf8");
const prefix = ui.match(/const AUTH_PREFIX = "([^"]+)"/)[1];
assert(auth.includes(`"${prefix}"`), "UI and Rust authentication prefixes do not match");
assert(ui.includes("[KEY, AUTH_PREFIX + sessionToken]"), "Authenticated WebSocket setup missing");
assert(ui.includes('moduleCommand("webui-session"'), "Root credential getter missing");
assert(ws.includes("session.accepts(item)"), "Server token verification missing");
assert(ws.includes("web_auth::origin_is_allowed") && ws.includes("origin_allowed(value)"), "Exact dynamic Origin validation missing");
assert(auth.includes("register_origin(Path::new(STATE_DIR), origin)"), "Root Origin registration missing");
assert(ui.includes("--origin ${shellQuote(origin)}"), "Origin-bound root credential request missing");
assert(!fs.existsSync(path.join(MODULE, "webroot/vendor")), "vendored glass library should be removed");
assert(html.includes("assets/liquid-glass.js") && html.includes("assets/host.js") && html.includes("assets/version.js"), "asset scripts");
assert(html.includes(`v${VERSION}`), "html version");
assert(!new RegExp(`v2\\.(?!${VERSION.slice(2).replace(".", "\\.")})\\d+\\.\\d+`).test(html), "stale version string in html");
assert(!html.includes("assets/glass.js") && html.includes("stat-pkg-raw"), "html structure");
for (const page of ["overview", "rules", "logs", "about"]) assert(html.includes(`id="page-${page}"`), `page ${page}`);
assert(!html.includes('id="page-modes"'), "mode grid lives on overview now");
assert(ui.includes("scenePresence"), "scene presence");
assert(ui.includes("data.fasEngine") && ws.includes("fasEngine:{}"), "NovaFAS engine status wiring");

/* ---- 源码包 ---- */
const sourcePaths = new Set();
for (const directory of ["native/src", "native/tests", "module-template", "scripts", "docs", ".github"]) {
  const base = path.join(ROOT, directory);
  if (!fs.existsSync(base)) continue;
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else sourcePaths.add(full);
    }
  };
  visit(base);
}
for (const name of [".gitignore", "README.md", "CHANGELOG.md", "LICENSE", "NOTICE",
  "package.json", "package-lock.json", "native/Cargo.toml", "native/Cargo.lock", "native/games.list"]) {
  const file = path.join(ROOT, name);
  if (fs.existsSync(file)) sourcePaths.add(file);
}
const sourceEntries = [];
for (const file of [...sourcePaths].sort()) {
  const name = path.relative(ROOT, file).split(path.sep).join("/");
  if (name.startsWith("module-template/bin/") || name.includes("__pycache__")
    || name.endsWith(".pyc") || name.endsWith(".log") || name.endsWith("webui.session")
    || name.includes("native/target")) continue;
  sourceEntries.push([file, `NovaSched-Zen-Edition/${name}`, file.endsWith(".sh") || path.basename(file) === "update-binary"]);
}
const sourceZip = path.join(DIST, `NovaSched-v${VERSION}-source.zip`);
archive(sourceZip, sourceEntries);

/* ---- WebUI 更新包 ---- */
const webuiSources = [...sourcePaths]
  .filter((file) => path.relative(ROOT, file).split(path.sep).join("/").startsWith("module-template/webroot/"))
  .concat([path.join(ROOT, "scripts/install-webui.sh"), path.join(ROOT, "docs/fix-v2.7.0.md")]);
const webuiZip = path.join(DIST, `NovaSched-v${VERSION}-webui-update.zip`);
archive(webuiZip, webuiSources.sort().map((file) => [file, path.relative(ROOT, file).split(path.sep).join("/"), file.endsWith(".sh")]));

if (sourceOnly) {
  fs.writeFileSync(path.join(DIST, `NovaSched-v${VERSION}-SHA256SUMS.txt`),
    `${digest(sourceZip)}  ${path.basename(sourceZip)}\n${digest(webuiZip)}  ${path.basename(webuiZip)}\n`);
  console.log("Source and WebUI update only. No Android ELF exists; these archives are not flashable.");
  process.exit(0);
}

/* ---- 可刷入模块包 ---- */
const binary = path.join(MODULE, "bin/novasched");
const builtCandidates = [
  process.env.NOVA_BUILT_ELF,
  path.join(ROOT, "native/target-static/aarch64-linux-android/release/novasched"),
  path.join(ROOT, "native/target/aarch64-linux-android/release/novasched"),
].filter(Boolean);
const built = builtCandidates.find((candidate) => fs.existsSync(candidate));
assert(built, "Android ELF not found; build it first");
assert(Buffer.compare(fs.readFileSync(binary), fs.readFileSync(built)) === 0, "Module ELF differs from build output");
const elf = fs.readFileSync(binary);
assert(elf.subarray(0, 4).toString("binary") === "\x7fELF", "not an ELF");
const readelf = process.env.NOVA_READELF;
if (readelf) {
  const run = (flags) => spawnSync(readelf, [...flags, built], {encoding: "utf8"}).stdout;
  const header = run(["-h"]), programs = run(["-l"]), dynamic = run(["-d"]);
  assert(header.includes("AArch64") && header.includes("EXEC (Executable file)"), "ELF class/machine");
  assert(!programs.includes("INTERP") && !dynamic.includes("NEEDED"), "ELF must be fully static");
  const loadRecords = programs.split("\n").filter((line) => line.trim().startsWith("LOAD"));
  assert(loadRecords.length > 0, "ELF has no readable LOAD program headers");
  for (const record of loadRecords) assert(record.trim().split(/\s+/).at(-1) === "0x4000", "ELF LOAD alignment is not 16KB");
  fs.mkdirSync(path.join(ROOT, "native/target-static"), {recursive: true});
  fs.writeFileSync(path.join(ROOT, "native/target-static/elf-header.txt"), header);
  fs.writeFileSync(path.join(ROOT, "native/target-static/elf-programs.txt"), programs);
  fs.writeFileSync(path.join(ROOT, "native/target-static/elf-dynamic.txt"), dynamic);
}
const isExecutable = (file) => file.endsWith(".sh") || file === binary || path.basename(file) === "update-binary";
const moduleEntries = [];
const visit = (current) => {
  for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (!entry.name.toLowerCase().endsWith(".md")) moduleEntries.push([full, path.relative(MODULE, full).split(path.sep).join("/"), isExecutable(full)]);
  }
};
visit(MODULE);
const flashable = path.join(DIST, `NovaSched-v${VERSION}-release.zip`);
archive(flashable, moduleEntries);
/* 用 zipfile 自校验替代：重读中央目录检查关键条目 */
const verify = spawnSync(process.execPath, ["-e", `
const fs=require('fs'),zlib=require('zlib');
const data=fs.readFileSync(${JSON.stringify(flashable.replace(/\\/g, "/"))});
let off=data.length-22;
while(off>=0&&data.readUInt32LE(off)!==0x06054b50)off--;
const count=data.readUInt16LE(off+10);let ptr=data.readUInt32LE(off+16);
const names=[];
for(let i=0;i<count;i++){
  const nameLen=data.readUInt16LE(ptr+28),extraLen=data.readUInt16LE(ptr+30),commentLen=data.readUInt16LE(ptr+32);
  const mode=(data.readUInt32LE(ptr+38)>>>16)&0o777;
  const offset=data.readUInt32LE(ptr+42);
  const name=data.slice(ptr+46,ptr+46+nameLen).toString('utf8');
  names.push({name,mode,offset,method:data.readUInt16LE(ptr+10),csize:data.readUInt32LE(ptr+20),usize:data.readUInt32LE(ptr+24),crc:data.readUInt32LE(ptr+16)});
  ptr+=46+nameLen+extraLen+commentLen;
}
const assert=require('assert');
const byName=Object.fromEntries(names.map(n=>[n.name,n]));
function read(name){
  const e=byName[name];assert(e,name+' missing');
  const localOff=e.offset,ln=data.readUInt16LE(localOff+26),el=data.readUInt16LE(localOff+28);
  const start=localOff+30+ln+el;
  const raw=data.slice(start,start+e.csize);
  const body=e.method===8?zlib.inflateRawSync(raw):raw;
  const crypto=require('crypto');
  const CRC_TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
  let crc=-1;for(const b of body)crc=CRC_TABLE[(crc^b)&0xff]^(crc>>>8);crc=(crc^-1)>>>0;
  assert(crc===e.crc,'CRC failed '+name);
  return body;
}
assert(read('bin/novasched').subarray(0,4).toString('binary')==='\\x7fELF','shipped ELF magic');
assert(!names.some(n=>n.name.endsWith('webui.session')),'private session included');
assert(read('META-INF/com/google/android/updater-script').toString().trim()==='#MAGISK','updater script');
for(const name of ['bin/novasched','action.sh','service.sh','customize.sh','uninstall.sh','vtools/powercfg.sh','META-INF/com/google/android/update-binary'])
  assert(byName[name]&&(byName[name].mode===0o755),'exec mode '+name);
console.log('Final release archive passed CRC, metadata, executable modes and ELF consistency checks.');
`], {encoding: "utf8"});
if (verify.status !== 0) { console.error(verify.stderr); throw new Error("release zip verification failed"); }
console.log(verify.stdout.trim());

const sums = path.join(DIST, `NovaSched-v${VERSION}-SHA256SUMS.txt`);
fs.writeFileSync(sums, [sourceZip, webuiZip, flashable].map((file) => `${digest(file)}  ${path.basename(file)}`).join("\n") + "\n");
console.log(path.basename(sums));
