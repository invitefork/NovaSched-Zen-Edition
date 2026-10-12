/* NovaSched Zen Edition WebUI v2.2.2.
 * 视觉设计照搬 SleepDown 课程表官网的液态玻璃语言（见 app.css）。
 * 连接协议沿用守护进程的既有契约：认证 WebSocket（/modes /app-modes /logs）
 * 与宿主 root 备用通道；渲染永远反映实际读回，不把“已发送”当“已生效”。
 */
(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const KEY = "!TcsEUQ#Be8bk4bk!dcf341Bo4NwXdQi8hik2_l3BXOJ2$hQOeHKDAUL1jrQUnkx";
  const AUTH_PREFIX = "novasched-auth.";
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  let MODULE = "/data/adb/modules/NovaSched_Zen_Edition";
  const MODULE_ID = "NovaSched_Zen_Edition";
  const MODULE_CANDIDATES = [MODULE, "/data/adb/ap/modules/" + MODULE_ID];
  try {
    const path = decodeURIComponent(new URL(location.href).pathname);
    const match = path.match(/^(\/data\/adb\/(?:modules|ap\/modules)\/NovaSched_Zen_Edition)(?:\/|$)/);
    if (match) { MODULE = match[1]; MODULE_CANDIDATES.unshift(MODULE); }
  } catch (_) {}
  const STORAGE = "novasched.zen.ui.v2";

  const MODES = {
    powersave:   { name: "省电", copy: "一省到底：进一步压低各簇频率上限" },
    balance:     { name: "均衡", copy: "日用默认：保留流畅度的同时压住功耗" },
    performance: { name: "性能", copy: "响应优先：适度抬高最低频率" },
    fast:        { name: "极速", copy: "开放完整频率范围，跟随 FAS 全力响应" },
  };
  const THEME_NAMES = { system: "跟随系统", light: "浅色", dark: "深色" };
  const SYSTEM_NAMES = {
    "com.android.systemui": "系统界面", "com.android.settings": "系统设置",
    "com.google.android.webview": "Android 系统 WebView", "com.miui.home": "系统桌面",
  };

  const s = {
    page: "home", online: false, connecting: true, phase: "", error: "", connectionError: "", version: "",
    mode: "", effective: "", pkg: "", controller: "", external: false, linked: false,
    heartbeat: null, soc: "", socId: "", configProfile: "", fasAvailable: false, sceneInstalled: false,
    automatic: false, automaticActive: false, appKind: "", classificationSource: "",
    rules: [], rulesLoaded: false, overrides: {},
    pending: null, sockets: {}, suspended: false, retry: 0, epoch: 0, probes: new Set(),
    transport: "", rootTimer: 0, rootJob: null, rootOrigin: "", rootGeneration: 0, logCursor: "",
    discovered: false, logConnected: false, logConnecting: false, logs: [], logTail: "", level: "all", follow: true,
    logReceived: false,
  };
  const ui = { theme: "system" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    if (own(THEME_NAMES, saved.theme)) ui.theme = saved.theme;
  } catch (_) { /* 宿主 WebView 可能禁用存储 */ }
  const saveUI = () => { try { localStorage.setItem(STORAGE, JSON.stringify(ui)); } catch (_) {} };

  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  /* ---------------- 小工具 ---------------- */
  let snackbarTimer = 0;
  let pendingTimer = 0;
  let bridgeCounter = 0;
  let sessionToken = "";
  let authRequest = null;
  let bridgeSignature = 0;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const basePackage = (raw) => String(raw || "").split(":", 1)[0];
  const validPackage = (raw) => typeof raw === "string" && raw.length <= 255 && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+(?::[A-Za-z0-9_.]+)?$/.test(raw);
  const editable = () => s.online && !s.external;
  const present = (id, text) => { const node = $(id); if (node && node.textContent !== String(text)) node.textContent = String(text); };

  function toast(message, timeout = 3800) {
    const bar = $("#snackbar");
    bar.textContent = message;
    bar.classList.add("show");
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => bar.classList.remove("show"), timeout);
  }
  function modeNote(message, error = false) {
    const node = $("#mode-note");
    node.textContent = message;
    node.dataset.error = error ? "1" : "0";
  }
  async function copyText(text, message = "已复制") {
    if (!text) return toast("没有可复制的内容");
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return toast(message); }
    } catch (_) { /* 部分 WebView 拒绝剪贴板权限 */ }
    let field;
    try {
      field = document.createElement("textarea"); field.value = text;
      Object.assign(field.style, { position:"fixed", opacity:"0", pointerEvents:"none" });
      document.body.append(field); field.select();
      toast(document.execCommand("copy") ? message : "当前 WebView 未允许复制，请长按选择文本");
    } catch (_) { toast("当前 WebView 未允许复制"); }
    finally { field?.remove(); }
  }
  function appInfo(raw) {
    const pkg = basePackage(raw);
    const info = labels.get(pkg);
    const name = info?.appLabel || SYSTEM_NAMES[pkg] || "未知应用";
    return { package: String(raw || ""), base: pkg, name,
      initial: name === "未知应用" ? "?" : Array.from(name)[0] };
  }
  const avatarColor = (name) => {
    let hue = 7;
    for (const ch of String(name)) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${hue}, 44%, 46%)`;
  };

  /* ---------------- 应用名查询（宿主元数据桥） ---------------- */
  const labels = new Map();
  const queried = new Set();
  const bridges = () => [window.ksu, window.magisk, window.apatch, window.KSU, window.mmrl].filter(Boolean);
  const bridge = () => bridges().find(api => typeof api.exec === "function") || bridges()[0];
  const metadataBridge = () => bridges().find(api => typeof api.getPackagesInfo === "function") || bridge();
  function loadLabels(packages) {
    const api = metadataBridge();
    if (typeof api?.getPackagesInfo !== "function") return;
    const needed = [...new Set(packages.map(basePackage))].filter(pkg => validPackage(pkg) && !queried.has(pkg));
    if (!needed.length) return;
    for (let index = 0; index < needed.length; index += 48) {
      const batch = needed.slice(index, index + 48);
      try {
        const result = JSON.parse(api.getPackagesInfo(JSON.stringify(batch)));
        if (Array.isArray(result)) {
          for (const info of result) {
            if (batch.includes(info.packageName) && typeof info.appLabel === "string" && info.appLabel.trim()) {
              labels.set(info.packageName, { ...info, appLabel: info.appLabel.trim().slice(0, 300) });
              queried.add(info.packageName);
            }
          }
        }
        batch.forEach(pkg => queried.add(pkg));
      } catch (_) { batch.forEach(pkg => queried.add(pkg)); }
    }
  }

  /* ---------------- 连接协议（与守护进程契约一致） ---------------- */
  function parseStatus(text) {
    const result = {};
    for (const part of String(text).split(",")) { const i = part.indexOf(":"); if (i > 0) result[part.slice(0,i)] = part.slice(i+1); }
    return result;
  }
  function goodStatus(data) {
    const age = Number(data.heartbeatMs);
    return own(MODES, data.mode) && ["ready","degraded","suspended"].includes(data.phase)
      && data.heartbeatMs !== "" && Number.isFinite(age) && age >= 0;
  }
  function stopSocket(kind) {
    const slot = s.sockets[kind];
    if (!slot) return;
    delete s.sockets[kind]; clearTimeout(slot.deadline); clearTimeout(slot.retry);
    try { slot.ws.onopen = slot.ws.onmessage = slot.ws.onclose = slot.ws.onerror = null; slot.ws.close(); } catch (_) {}
  }
  function cancelProbes() {
    for (const probe of s.probes) { clearTimeout(probe.timer); probe.ws.onmessage = probe.ws.onclose = probe.ws.onerror = null; try { probe.ws.close(); } catch (_) {} }
    s.probes.clear();
  }
  function cancelAuthentication() {
    const request = authRequest; authRequest = null;
    if (request) { request.completed = true; clearTimeout(request.timer); delete window[request.name]; }
    sessionToken = "";
  }
  function normalizeReply(args) {
    const code = value => typeof value === "number" && Number.isInteger(value)
      || typeof value === "string" && /^-?\d+$/.test(value);
    if (args.length === 1) {
      let value = args[0];
      if (typeof value === "string") {
        try { const object = JSON.parse(value); if (object && typeof object === "object" && (own(object,"stdout") || own(object,"exitCode") || own(object,"errno"))) value = object; } catch (_) {}
      }
      if (value && typeof value === "object") {
        const exit = value.errno ?? value.exitCode ?? value.exit_code ?? value.code ?? 0;
        return [code(exit) ? Number(exit) : 1, String(value.stdout ?? value.output ?? ""), String(value.stderr ?? value.error ?? "")];
      }
      return [0, String(value ?? ""), ""];
    }
    if (code(args[0])) return [Number(args[0]),String(args[1] ?? ""),String(args[2] ?? "")];
    if (code(args[2])) return [Number(args[2]),String(args[0] ?? ""),String(args[1] ?? "")];
    if (code(args[1])) return [Number(args[1]),String(args[0] ?? ""),String(args[2] ?? "")];
    return [0,String(args[0] ?? ""),String(args[1] ?? "")];
  }
  function rootRead(command, callback, finish, negotiate = true) {
    const api = bridge();
    if (typeof api?.exec !== "function") throw new Error("当前宿主没有提供 root 命令接口");
    const received = (...args) => finish(...normalizeReply(args));
    window[callback] = received;
    const receive = value => { if (typeof value === "string" || value && typeof value === "object") received(value); };
    const first = bridgeSignature || (api.exec.length === 1 ? 1 : api.exec.length === 2 ? 2 : 3);
    for (let count = first; count >= 1; count--) {
      try {
        const result = count === 3 ? api.exec(command, "{}", callback)
          : count === 2 ? api.exec(command, callback) : api.exec(command + " 2>&1");
        bridgeSignature = count;
        if (result && typeof result.then === "function") result.then(receive, () => finish(1, "", "宿主执行失败，请检查 root 授权"));
        else receive(result);
        return;
      } catch (error) {
        if (!negotiate || count === 1 || !/argument|overload|signature|parameter/i.test(String(error?.message || error))) throw error;
      }
    }
  }
  function shellQuote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
  function moduleCommand(command, suffix = "") {
    const candidates = [...new Set([MODULE, ...MODULE_CANDIDATES])].map(shellQuote).join(" ");
    return `for NOVA_PATH in ${candidates}; do if [ -x "$NOVA_PATH/bin/novasched" ] && grep -q '^id=${MODULE_ID}$' "$NOVA_PATH/module.prop"; then exec "$NOVA_PATH/bin/novasched" ${command} --module-dir "$NOVA_PATH" ${suffix}; fi; done; printf '%s\\n' 'novasched: 未找到本模块的可执行文件'; exit 1`;
  }
  function publicError(value) {
    return String(value || "").replace(/[a-f0-9]{64}/gi, "[凭据已隐藏]")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, 900);
  }
  function extractCredentials(text) {
    const raw = String(text || "").trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) {
      const match = raw.match(/\{[^{}]*"port"\s*:\s*\d+[^{}]*"token"\s*:\s*"[a-f0-9]{64}"[^{}]*"origin"\s*:\s*"[^"]*"[^{}]*\}/);
      try { parsed = match ? JSON.parse(match[0]) : null; } catch (_) { parsed = null; }
    }
    return parsed && typeof parsed === "object" ? parsed : null;
  }
  function usableCredentials(value, origin) {
    return !!value && Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535
      && typeof value.token === "string" && /^[a-f0-9]{64}$/.test(value.token) && value.origin === origin;
  }
  function isAllowedOrigin(value) {
    try {
      const url = new URL(value);
      if (url.origin !== value || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
      if (url.protocol === "https:") return true;
      if (url.protocol !== "http:") return false;
      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
    } catch (_) { return false; }
  }
  function loadAuthentication(epoch, ready) {
    const api = bridge();
    const failed = (message, retry = true) => {
      if (epoch !== s.epoch || s.suspended) return;
      sessionToken = ""; s.connectionError = message;
      s.online = false; s.connecting = false; render();
      clearTimeout(s.retry); if (retry) s.retry = setTimeout(discover, 5000);
    };
    let origin = "";
    try { origin = new URL(location.href).origin; } catch (_) {}
    s.rootOrigin = origin;
    if (origin === "null" && /^(file|content):/.test(location.href) && typeof api?.exec === "function") {
      startRootBridge(); return;
    }
    if (!isAllowedOrigin(origin)) {
      failed("当前页面来源不安全。请使用管理器本地 WebUI，或使用 HTTPS 页面。", false); return;
    }
    if (typeof api?.exec !== "function") {
      failed("当前宿主没有开放 root 命令接口。请允许宿主的 root／Shell 权限；管理器没有 WebUI 入口时，可用 KsuWebUI 独立版打开本模块。", false); return;
    }
    const name = `nova_auth_${Date.now()}_${++bridgeCounter}`;
    const request = { name, timer:0, completed:false }; authRequest = request;
    const finish = (errno, stdout, stderr) => {
      if (request.completed) return;
      request.completed = true; clearTimeout(request.timer); delete window[name];
      if (authRequest === request) authRequest = null;
      if (epoch !== s.epoch || s.suspended) return;
      const credentials = extractCredentials(stdout);
      if (credentials && !usableCredentials(credentials, origin)) {
        failed("连接凭据格式或页面来源不匹配，请完整安装同一版本的模块后重启。"); return;
      }
      if (!credentials && Number(errno) !== 0) {
        failed("无法读取守护连接状态：" + (publicError(stderr) || publicError(stdout) || `命令退出码 ${errno}，请检查宿主 root 授权并读取启动诊断。`)); return;
      }
      if (!credentials) {
        const detail = /^novasched:|Permission denied|not found/.test(String(stdout || "")) ? publicError(stdout) : "宿主返回格式无效，请读取启动诊断。";
        failed("未取得有效连接凭据：" + detail); return;
      }
      if (typeof credentials.moduleDir === "string" && /^\/data\/adb\/(?:modules|ap\/modules)\/NovaSched_Zen_Edition$/.test(credentials.moduleDir)) MODULE = credentials.moduleDir;
      sessionToken = credentials.token;
      s.connectionError = ""; ready(credentials.port);
    };
    request.timer = setTimeout(() => finish(1, "", "等待宿主响应超过 30 秒，请完成 root 授权后重新连接。"), 30000);
    window[name] = finish;
    try { rootRead(moduleCommand("webui-session", `--origin ${shellQuote(origin)}`), name, finish); }
    catch (_) { finish(1, "", "宿主命令接口执行失败，请检查 root／Shell 授权。"); }
  }
  function cancelRootBridge() {
    clearTimeout(s.rootTimer); s.rootTimer = 0; s.rootJob = null; s.rootGeneration++;
  }
  function rootExec(command, timeout = 30000, negotiate = true) {
    return new Promise((resolve, reject) => {
      const api = bridge();
      if (typeof api?.exec !== "function") return reject(new Error("当前管理器没有提供命令接口"));
      const name = `nova_exec_${Date.now()}_${++bridgeCounter}`;
      let completed = false;
      const finish = (err, result) => { if (completed) return; completed = true; clearTimeout(timer); delete window[name]; err ? reject(err) : resolve(result); };
      const timer = setTimeout(() => finish(new Error("只读诊断未在限定时间内完成")), timeout);
      window[name] = (errno, stdout, stderr) => finish(null, { errno:Number(errno), stdout:String(stdout || ""), stderr:String(stderr || "") });
      try { rootRead(command, name, window[name], negotiate); } catch (err) { finish(err); }
    });
  }
  function rootRequest(request) {
    const command = moduleCommand("webui-rpc", `--origin ${shellQuote(s.rootOrigin)} --request ${shellQuote(JSON.stringify(request))}`);
    return rootExec(command, 30000, !own(request, "message")).then(result => {
      let reply;
      try { reply = JSON.parse(result.stdout); } catch (_) {
        if (result.errno !== 0) throw new Error(publicError(result.stderr) || publicError(result.stdout) || `宿主返回退出码 ${result.errno}`);
        throw new Error("宿主备用通道未返回有效状态，请完整安装同一版本后重启。");
      }
      if (!reply || typeof reply !== "object" || typeof reply.modes !== "string" || typeof reply.apps !== "string"
          || typeof reply.logs !== "string" || typeof reply.cursor !== "string") throw new Error("备用通道状态格式无效");
      return reply;
    });
  }
  function receiveRootSnapshot(reply) {
    if (reply.modes) {
      const status = parseStatus(reply.modes);
      if (!goodStatus(status)) throw new Error("守护心跳或状态未就绪");
      if (Number(status.heartbeatMs) >= 30000) throw new Error("守护心跳已过期");
      s.discovered = true;
      receiveModes(status);
      modeNote("");
    }
    if (reply.apps) receiveApps(reply.apps);
    if (logsActive()) {
      if (reply.logsReset) { s.logTail = ""; if (!s.logCursor) s.logs = []; }
      s.logCursor = reply.cursor;
      s.logConnected = true; s.logConnecting = false;
      if (reply.logs) receiveLogs(reply.logs); else renderLogs();
    }
  }
  function pollRootBridge(epoch) {
    if (epoch !== s.epoch || s.suspended || s.transport !== "root" || s.rootJob) return;
    const job = {}, generation = s.rootGeneration; s.rootJob = job;
    rootRequest({endpoint:"snapshot", logs:logsActive(), cursor:s.logCursor}).then(reply => {
      if (epoch !== s.epoch || s.suspended || generation !== s.rootGeneration) return;
      receiveRootSnapshot(reply);
    }).catch(error => {
      if (epoch !== s.epoch || s.suspended || generation !== s.rootGeneration) return;
      offline("root"); s.connectionError = "宿主备用通道失败：" + publicError(error.message); render();
    }).finally(() => {
      if (s.rootJob === job) s.rootJob = null;
      if (epoch === s.epoch && !s.suspended && s.transport === "root")
        s.rootTimer = setTimeout(() => pollRootBridge(epoch), 2000);
    });
  }
  function startRootBridge() {
    const epoch = ++s.epoch;
    clearTimeout(s.retry); cancelProbes(); cancelAuthentication(); cancelRootBridge();
    ["modes","apps","logs"].forEach(stopSocket);
    s.transport = "root"; s.online = false; s.connecting = true; s.discovered = false;
    s.connectionError = ""; s.logConnected = false; s.logConnecting = logsActive();
    render(); pollRootBridge(epoch);
  }
  function offline(reason, retry = true) {
    if (retry && s.transport !== "root" && !s.suspended && typeof bridge()?.exec === "function"
        && (reason === "handshake" || reason === "connection")) { startRootBridge(); return; }
    s.epoch++; cancelRootBridge(); s.transport = "";
    cancelAuthentication();
    s.online = false; s.connecting = false; s.discovered = false;
    s.connectionError = reason === "handshake"
      ? "已取得守护凭据，但 WebSocket 未连通。请读取启动诊断，并检查宿主是否允许本地连接。"
      : "本地连接已中断，请重新连接；若持续失败，请读取启动诊断。";
    stopSocket("modes"); stopSocket("apps"); stopSocket("logs"); s.logConnected = false; s.logConnecting = false;
    if (s.pending) finishPending(false, "连接中断，请重新连接后确认结果");
    render(); renderLogs();
    if (retry && !s.suspended) { clearTimeout(s.retry); s.retry = setTimeout(discover, 4000); }
  }
  function discover() {
    if (s.suspended) return;
    const epoch = ++s.epoch; clearTimeout(s.retry); cancelProbes(); cancelAuthentication();
    cancelRootBridge(); s.transport = "websocket";
    ["modes","apps","logs"].forEach(stopSocket);
    s.online = false; s.connecting = true; s.discovered = false; render();
    loadAuthentication(epoch, port => {
      const targets = [{ host:"127.0.0.1", port }];
      let index = 0, active = 0, chosen = false;
      const launch = () => {
        if (epoch !== s.epoch || s.suspended || chosen) return;
        while (active < 3 && index < targets.length) {
          const target = targets[index++]; let ws;
          try { ws = new WebSocket(`ws://${target.host}:${target.port}/modes`, [KEY, AUTH_PREFIX + sessionToken]); }
          catch (_) { continue; }
          active++;
          const probe = { ws, timer:0 }; s.probes.add(probe);
          let ended = false;
          const fail = () => {
            if (ended) return; ended = true; active--; clearTimeout(probe.timer); s.probes.delete(probe);
            ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (_) {}
            if (epoch === s.epoch && !chosen) {
              if (index >= targets.length && active === 0) { offline("handshake"); }
              else launch();
            }
          };
          probe.timer = setTimeout(fail, 5000);
          ws.onerror = ws.onclose = fail;
          ws.onmessage = event => {
            if (ended || chosen || epoch !== s.epoch) return;
            const status = parseStatus(event.data);
            if (!goodStatus(status)) return fail();
            ended = true; chosen = true; active--; clearTimeout(probe.timer); s.probes.delete(probe); cancelProbes();
            bindSocket("modes", ws); receiveModes(status);
            openEndpoint("apps"); if (logsActive()) openEndpoint("logs");
          };
        }
        if (!active && index >= targets.length && !chosen) { offline("handshake"); }
      };
      launch();
    });
  }
  function bindSocket(kind, ws) {
    stopSocket(kind);
    const slot = {ws,deadline:0,retry:0}; s.sockets[kind] = slot;
    const current = () => s.sockets[kind] === slot && !s.suspended;
    const fail = () => {
      if (!current()) return;
      if (kind === "modes") return offline("connection");
      stopSocket(kind);
      if (kind === "logs") { s.logConnected = false; s.logConnecting = false; renderLogs(); }
      if (kind === "apps" && (["rule", "delete"].includes(s.pending?.kind))) finishPending(false, "应用规则连接中断，请重试");
      if (s.discovered && !s.suspended) {
        const epoch = s.epoch;
        const retrySlot = { ws, deadline:0, retry:setTimeout(() => { if (epoch === s.epoch && !s.suspended) openEndpoint(kind); }, 2200) };
        s.sockets[kind] = retrySlot;
      }
    };
    const arm = () => { clearTimeout(slot.deadline); if (kind !== "logs") slot.deadline = setTimeout(fail, 33000); };
    ws.onopen = () => { if (!current()) return; if (kind === "logs") { s.logConnected = true; s.logConnecting = false; renderLogs(); } arm(); };
    ws.onmessage = event => {
      if (!current()) return;
      if (kind === "modes") { const parsed = parseStatus(event.data); if (goodStatus(parsed)) receiveModes(parsed); }
      else if (kind === "apps") receiveApps(event.data);
      else receiveLogs(event.data);
      arm();
    };
    ws.onerror = ws.onclose = fail;
    if (ws.readyState === WebSocket.OPEN) arm();
    else slot.deadline = setTimeout(fail,8000);
  }
  function openEndpoint(kind) {
    if (s.transport === "root") {
      if (!s.rootJob) { clearTimeout(s.rootTimer); pollRootBridge(s.epoch); }
      return;
    }
    if (!s.discovered || !sessionToken || s.suspended || (kind === "logs" && !logsActive())) return;
    if (s.sockets[kind]?.ws?.readyState === WebSocket.OPEN || s.sockets[kind]?.ws?.readyState === WebSocket.CONNECTING) return;
    stopSocket(kind);
    const path = kind === "apps" ? "/app-modes" : "/logs";
    if (kind === "logs") { s.logConnecting = true; renderLogs(); }
    try { bindSocket(kind, new WebSocket(`ws://${s.host || "127.0.0.1"}:${s.port || 31415}${path}`, [KEY, AUTH_PREFIX + sessionToken])); }
    catch (_) { if (kind === "logs") { s.logConnecting = false; renderLogs(); } }
  }
  function receiveModes(data) {
    s.connectionError = "";
    s.mode = data.mode; s.effective = own(MODES, data.effective) ? data.effective : "";
    s.pkg = data.package || ""; s.controller = data.controller || "NovaSched";
    s.external = data.sceneActive === "true"; s.linked = data.sceneLinked === "true";
    s.phase = data.phase; s.heartbeat = Number(data.heartbeatMs);
    s.online = s.heartbeat < 30000; s.connecting = false;
    s.soc = data.socName || ""; s.socId = data.socId || ""; s.configProfile = data.configProfile || "";
    s.fasAvailable = data.fasAvailable === "true";
    s.sceneInstalled = data.sceneInstalled === "true";
    s.automatic = data.automaticEnabled === "true";
    s.automaticActive = data.automaticActive === "true";
    s.appKind = ["game", "daily", "unknown"].includes(data.appKind) ? data.appKind : "";
    s.classificationSource = data.classificationSource || "";
    if (Number(data.port) >= 1024) { s.port = Number(data.port); s.host = "127.0.0.1"; }
    loadLabels([s.pkg]); confirmPending(); render();
  }
  function receiveApps(text) {
    try {
      const data = JSON.parse(text);
      if (data.type !== "app-modes" || !Array.isArray(data.rules)) return;
      s.rules = data.rules.filter(r => r && validPackage(r.package) && own(MODES, r.mode));
      s.rulesLoaded = true;
      if (data.classificationOverrides && typeof data.classificationOverrides === "object" && !Array.isArray(data.classificationOverrides)) {
        s.overrides = Object.fromEntries(Object.entries(data.classificationOverrides).filter(([pkg, kind]) => validPackage(pkg) && !pkg.includes(":") && ["game", "daily"].includes(kind)));
      }
      s.error = typeof data.error === "string" ? data.error : "";
      s.version = typeof data.version === "string" ? data.version : s.version;
      if (own(MODES, data.defaultMode)) s.mode = data.defaultMode;
      loadLabels([...s.rules.map(r => r.package), ...Object.keys(s.overrides)]); confirmPending(); render();
    } catch (_) { toast("应用规则数据无法解析，请重连后再试"); }
  }
  function parseLog(line) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(信息|错误|警告|调试|INFO|ERROR|WARN|DEBUG)\s*(?:->|→|:)?\s*(.*)$/);
    const level = match ? /错误|ERROR/.test(match[2]) ? "error" : /警告|WARN/.test(match[2]) ? "warn" : "info" : /\bERROR\b|错误\s*->/.test(line) ? "error" : /\bWARN\b|警告\s*->/.test(line) ? "warn" : "info";
    return { time:match?.[1] || "", level, message:match?.[3] ?? line, raw:line };
  }
  function receiveLogs(data) {
    s.logReceived = true;
    const chunk = s.logTail + String(data);
    const lines = chunk.split(/\r?\n/); s.logTail = lines.pop() || "";
    for (const line of lines) if (line.trim()) s.logs.push(parseLog(line));
    if (s.logTail.length > 12000) { s.logs.push(parseLog(s.logTail.slice(0,12000))); s.logTail = ""; }
    if (s.logs.length > 1200) s.logs.splice(0, s.logs.length - 1000);
    renderLogs();
  }
  const visibleLogs = () => s.logs.filter(line => s.level === "all" || line.level === s.level);
  function send(kind, message) {
    if (!editable()) { toast(s.external ? "Scene 外部调度器接管中，请先在 Scene 停用它的调度" : "请先连接本地守护进程"); return false; }
    if (s.transport === "root") {
      const epoch = s.epoch, generation = ++s.rootGeneration;
      clearTimeout(s.rootTimer);
      rootRequest({endpoint:kind === "apps" ? "apps" : "modes", message}).then(reply => {
        if (epoch === s.epoch && generation === s.rootGeneration && !s.suspended) receiveRootSnapshot(reply);
      }).catch(error => {
        if (epoch === s.epoch && generation === s.rootGeneration) finishPending(false, "操作未确认：" + publicError(error.message));
      }).finally(() => {
        if (epoch === s.epoch && !s.suspended) { clearTimeout(s.rootTimer); s.rootTimer = setTimeout(() => pollRootBridge(epoch), 100); }
      });
      return true;
    }
    const ws = s.sockets[kind]?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) { toast("控制通道尚未连接，请稍后重试"); return false; }
    try { ws.send(message); return true; }
    catch (_) { toast("发送失败，请重连后确认状态"); return false; }
  }
  function beginPending(kind, value, pkg = "") {
    if (s.pending || !["mode", "rule", "delete", "auto"].includes(kind)) return false;
    const endpoint = ["rule", "delete"].includes(kind) ? "apps" : "modes";
    const message = kind === "mode" ? value : kind === "auto" ? `auto\t${value}` : kind === "rule" ? `set\t${pkg}\t${value}` : `delete\t${pkg}`;
    s.pending = { kind, value, pkg };
    if (!send(endpoint, message)) { s.pending = null; render(); return false; }
    if (kind === "mode") modeNote(`正在请求${MODES[value].name}档，等待守护进程反馈…`);
    if (kind === "auto") modeNote("正在切换自动调度，等待守护进程确认…");
    pendingTimer = setTimeout(() => {
      if (!s.pending) return;
      const p = s.pending;
      finishPending(false, p.kind === "mode" && s.mode === p.value ? "默认档位已保存，但尚未确认实际生效；请查看概览或诊断" : "未收到确认，状态未标记为成功，请重连后检查");
    }, s.transport === "root" ? 30000 : 10000);
    render(); return true;
  }
  function confirmPending() {
    const p = s.pending;
    if (!p) return;
    if (s.external) return finishPending(false, "Scene 外部调度器接管中，档位请以 Scene 为准");
    if (!s.online) return;
    if (p.kind === "auto") {
      if (s.automatic === (p.value === "on") && s.automaticActive === s.automatic && s.phase === "ready" && (p.value === "off" || s.effective === (s.appKind === "game" ? "fast" : "powersave"))) return finishPending(true, p.value === "on" ? "自动调度已开启" : "已返回手动调度");
    } else if (p.kind === "mode") {
      if (s.automatic || s.automaticActive) return;
      if (s.phase === "degraded" && s.mode === p.value) return finishPending(false, s.error || "策略下发失败，已保留最后成功档位");
      if (s.phase === "ready" && s.mode === p.value && s.effective === p.value) return finishPending(true, `${MODES[p.value].name}档已生效`);
      const rule = s.rules.find(r => r.package === basePackage(s.pkg));
      if (s.mode === p.value && rule && rule.mode === s.effective && s.effective !== p.value && s.phase === "ready") return finishPending(true, `${MODES[p.value].name}已设为默认；当前应用规则优先，仍使用${MODES[s.effective].name}档`);
    } else if (p.kind === "rule" && s.rules.some(r => r.package === p.pkg && r.mode === p.value)) finishPending(true, "应用规则已保存");
    else if (p.kind === "delete" && !s.rules.some(r => r.package === p.pkg)) finishPending(true, "应用规则已删除，今后沿用默认档位");
  }
  function finishPending(success, message) {
    const p = s.pending; clearTimeout(pendingTimer); pendingTimer = 0; s.pending = null;
    if (p?.kind === "mode" || p?.kind === "auto") modeNote(message, !success);
    if (success && ["rule", "delete"].includes(p?.kind)) closeDialog();
    if (!success && ["rule", "delete"].includes(p?.kind)) {
      const err = $("#dialog-error");
      if (err && $("#dialog-layer").classList.contains("open")) { err.hidden = false; err.textContent = message; }
    }
    toast(message, 4300); render();
  }

  /* ---------------- 视图渲染 ---------------- */
  function stateLabel() {
    return !s.online ? s.connecting ? "连接中" : "未连接" : s.phase === "degraded" ? "需检查" : s.external ? "外部接管" : "调度正常";
  }
  function sourceLabel() {
    if (!s.online) return "等待本地服务";
    if (s.external) return "Scene 外部调度器";
    if (s.linked) return "Scene 联动";
    return "WebUI 接管";
  }
  function render() {
    /* 导航 CTA */
    const cta = $("#nav-cta");
    const ctaState = !s.online ? (s.connecting ? "connecting" : "offline") : s.phase === "degraded" ? "degraded" : s.external ? "external" : "ready";
    cta.dataset.state = ctaState;
    present("#nav-cta-text", ctaState === "connecting" ? "连接中" : ctaState === "offline" ? "离线" : ctaState === "degraded" ? "需检查" : ctaState === "external" ? "外部接管" : "已连接");

    /* Hero */
    const sub = !s.online
      ? (s.connecting ? "正在寻找本机守护进程，连接成功后这里显示真实调度状态。" : "连接暂时不可用，会自动重试；也可以点下方按钮手动重连。")
      : s.external ? "Scene 当前选用其他调度器，NovaSched 暂停节点写入并保持只读。"
      : s.phase === "degraded" ? "部分策略下发失败，守护进程正在重试；详情见日志。"
      : `守护进程心跳正常，当前实际生效「${MODES[s.effective]?.name || "…"}」档。`;
    present("#hero-sub", sub);
    const badges = [];
    badges.push(`<span data-tone="${!s.online ? (s.connecting ? "brand" : "err") : s.phase === "degraded" ? "warn" : "ok"}"><i class="dot"></i>${stateLabel()}</span>`);
    if (s.online && Number.isFinite(s.heartbeat)) badges.push(`<span><i class="dot"></i>心跳 ${(Math.round(s.heartbeat / 100) / 10).toFixed(1)}s</span>`);
    if (s.online && s.soc) badges.push(`<span><i class="dot"></i>${esc(s.soc)}</span>`);
    if (s.fasAvailable) badges.push(`<span data-tone="ok"><i class="dot"></i>Scene FAS 已就绪</span>`);
    if (s.external) badges.push(`<span data-tone="warn"><i class="dot"></i>外部调度器接管</span>`);
    const badgesNode = $("#hero-badges");
    const badgesKey = badges.join("|");
    if (badgesNode.dataset.key !== badgesKey) { badgesNode.dataset.key = badgesKey; badgesNode.innerHTML = badges.join(""); }

    const autoButton = $("#hero-auto");
    autoButton.disabled = !editable() || !!s.pending;
    autoButton.textContent = !s.online ? "自动调度 · 等待连接"
      : (s.pending?.kind === "auto" || s.automatic !== s.automaticActive) ? "自动调度 · 确认中…"
      : s.automatic ? "自动调度 · 已开启（点按关闭）" : "自动调度 · 已关闭（点按开启）";

    const heartbeat = s.online && Number.isFinite(s.heartbeat) ? `${(Math.round(s.heartbeat / 100) / 10).toFixed(1)}s` : "—";
    present("#hero-compat", `NovaSched ${s.version ? "v" + s.version.replace(/^v/, "") : "v2.2.2"} · 守护心跳 ${heartbeat} · ${sourceLabel()}`);

    /* Shot 卡 1：当前档位 */
    present("#shot-mode-name", s.online ? (s.external ? "外部控制" : MODES[s.effective]?.name || "待确认") : "待确认");
    present("#shot-mode-desc", !s.online ? "连接后显示实际生效的调度档位与说明。"
      : s.external ? "Scene 决定档位，本地策略已暂停。"
      : MODES[s.effective]?.copy || "等待实际策略反馈");
    present("#shot-mode-effective", s.online ? (s.external ? "由外部调度器控制" : MODES[s.effective]?.name || "待确认") : "等待心跳");
    present("#shot-mode-phase", s.online ? ({ ready: "正常", degraded: "部分失败，重试中", suspended: "外部接管" })[s.phase] || s.phase : "—");
    present("#shot-mode-pkg", s.online && s.pkg ? appInfo(s.pkg).name : "—");

    /* Shot 卡 3：FAS */
    present("#shot-fas-title", s.fasAvailable ? "FAS 已就绪" : "FAS 未检测到");
    present("#shot-fas-desc", s.fasAvailable
      ? "Scene N1 的 FAS（fas-rs）正在运行，档位切换会自动同步到它的模式节点。"
      : "未检测到 /dev/fas_rs/mode。安装 Scene N1 并启用 FAS 后，档位切换将自动联动。");
    present("#shot-fas-node", s.fasAvailable ? "已就绪" : "待检测");
    present("#shot-fas-ctrl", sourceLabel());

    /* 概览三卡 */
    present("#stat-mode", s.online ? (s.external ? "外部控制" : MODES[s.effective]?.name || "待确认") : "—");
    present("#stat-mode-note", !s.online ? "连接后显示守护进程最后成功下发的档位。"
      : s.external ? "Scene 决定档位，本地策略已暂停。"
      : MODES[s.effective]?.copy || "等待实际策略反馈");
    const pkgName = s.online && s.pkg ? appInfo(s.pkg).name : "—";
    present("#stat-pkg", pkgName);
    present("#stat-pkg-note", s.online && s.pkg
      ? (s.appKind === "game" ? "识别为游戏 · 自动模式使用极速" : s.appKind === "daily" ? "识别为日用 · 自动模式使用省电" : "暂未识别，自动模式先用省电")
      : "自动调度依据前台活动实时切换档位。");
    present("#stat-ctrl", s.online ? s.controller : "—");
    present("#stat-ctrl-note", !s.online ? "NovaSched、Scene 联动或外部调度器接管，这里永远如实显示。"
      : s.external ? "切换档位和修改规则暂不可用，请在 Scene 操作。"
      : s.automatic ? "自动模式跟随前台：游戏极速，其余省电。"
      : s.linked ? "档位与应用规则与 Scene 双向同步。" : "本地默认档位与应用规则共同生效。");

    /* Scene 联动四态：联动中 / 外部接管 / 已安装待接管 / 未安装由 WebUI 接管 */
    let sceneState, sceneNote;
    if (!s.online) {
      sceneState = "等待连接"; sceneNote = "连接守护进程后显示 Scene 的接管状态。";
    } else if (s.external) {
      sceneState = "外部调度器接管";
      sceneNote = "Scene 当前选用其它调度器，本模块暂停写入保持只读；在 Scene 停用它后自动恢复。";
    } else if (s.linked) {
      sceneState = "Scene 联动中";
      sceneNote = "NovaSched 是 Scene 的调度回调：在 Scene 里切换档位由本模块执行下发，应用规则双向同步。";
    } else if (s.sceneInstalled) {
      sceneState = "Scene 已安装 · 待接管";
      sceneNote = "在 Scene 的「性能调节 → 配置源」里选择 NovaSched Zen Edition，即可把调度交给本模块。";
    } else {
      sceneState = "WebUI 接管";
      sceneNote = "未检测到 Scene（N1 及以上，识别 com.omarea 全系包名）。本页档位与自动调度直接生效。";
    }
    present("#stat-scene", sceneState);
    present("#stat-scene-note", sceneNote);

    /* 档位区 */
    $$("#mode-grid .mode-card").forEach(button => {
      const mode = button.dataset.mode;
      const actual = s.online && !s.external && mode === s.effective;
      const pending = s.pending?.kind === "mode" && s.pending.value === mode;
      button.dataset.state = pending ? "pending" : actual ? "active" : "";
      $(".badge", button).hidden = !actual || !!(s.automatic || s.automaticActive);
      button.disabled = !editable() || !!s.pending;
    });
    const autoSwitch = $("#auto-switch");
    autoSwitch.disabled = !editable() || !!s.pending;
    autoSwitch.setAttribute("aria-checked", String(!!s.automatic));
    autoSwitch.setAttribute("aria-busy", String(s.pending?.kind === "auto"));

    /* 规则区 */
    renderRules();
    $("#add-rule").disabled = !editable() || !!s.pending;

    /* 关于 */
    present("#about-version", s.version ? "v" + s.version.replace(/^v/, "") : "v2.2.2");
    present("#about-soc", s.online && s.soc ? s.soc : "待识别");
    present("#about-profile", s.online && s.configProfile ? s.configProfile : "待识别");
    present("#about-fas", s.fasAvailable ? "已就绪 · 档位联动" : "未检测到（可选）");
    present("#footer-version", (s.version ? "v" + s.version.replace(/^v/, "") : "v2.2.2") + " · ZenJooo");
  }
  function renderRules() {
    const root = $("#rule-list");
    if (!s.rulesLoaded) {
      root.innerHTML = `<div class="rule-empty">等待应用规则<br><small>成功连接后，这里会显示守护进程保存的应用策略。</small></div>`;
      return;
    }
    if (!s.rules.length) {
      root.innerHTML = `<div class="rule-empty">还没有应用规则<br><small>点下方「添加应用规则」，为游戏或视频应用设定独立档位。</small></div>`;
      return;
    }
    root.innerHTML = s.rules.map(rule => {
      const a = appInfo(rule.package);
      return `<button class="rule-row" type="button" data-edit="${esc(rule.package)}" aria-label="${esc(a.name)}，${esc(MODES[rule.mode]?.name || "未知")}档">
        <span class="rule-avatar" style="background:${avatarColor(a.name)}">${esc(a.initial)}</span>
        <span class="row-copy"><b>${esc(a.name)}</b><small>${esc(rule.package)}</small></span>
        <span class="mode-badge">${esc(MODES[rule.mode]?.name || "未知")}</span>
        <svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </button>`;
    }).join("");
  }
  const LV_TAG = { error: "错误", warn: "警告", info: "信息", debug: "调试" };
  function renderLogs() {
    const lines = visibleLogs();
    const errors = s.logs.filter(l => l.level === "error").length;
    present("#log-count", `${lines.length} / ${s.logs.length} 条${errors ? ` · ${errors} 错误` : ""}${s.logConnected ? " · 实时" : s.logConnecting ? " · 连接中" : ""}`);
    const output = $("#log-list");
    const oldScroll = output.scrollTop;
    const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 60;
    const key = JSON.stringify([s.level, lines.length, lines[0]?.raw, lines[lines.length - 1]?.raw]);
    if (key !== output.dataset.key) {
      output.dataset.key = key;
      output.innerHTML = lines.length ? lines.map(line =>
        `<article data-raw="${esc(line.raw)}"><time>${esc(line.time || "本地记录")}</time><span class="lv" data-lv="${line.level}">${LV_TAG[line.level]}</span><span class="msg">${esc(line.message)}</span></article>`
      ).join("") : `<div class="log-empty">${s.logReceived ? "暂时没有匹配的记录<br><small>可清除级别筛选，或等待新的日志。</small>" : "进入日志页后按需连接，不在后台持续订阅。<br><small>连接成功后新日志会实时出现在这里。</small>"}</div>`;
    }
    if (s.follow || nearBottom) output.scrollTop = output.scrollHeight;
    else output.scrollTop = oldScroll;
  }
  const logsActive = () => window.location.hash === "#logs" || logSectionVisible;

  /* ---------------- Hero 轮播（照搬参考站的 1/3 指示 + 左右切换） ---------------- */
  const shotPositions = ["active", "right", "left"];
  let shotIndex = 0;
  function layoutShots() {
    const cards = $$("#shot-stack .shot-card");
    cards.forEach((card, i) => {
      card.dataset.pos = shotPositions[(i - shotIndex + shotPositions.length) % shotPositions.length];
    });
    present("#shot-index", `${shotIndex + 1} / ${cards.length}`);
  }
  $("#shot-prev").onclick = () => { shotIndex = (shotIndex + 1) % 3; layoutShots(); };
  $("#shot-next").onclick = () => { shotIndex = (shotIndex + 2) % 3; layoutShots(); };
  let touchX = null;
  $("#shot-stack").addEventListener("pointerdown", e => { touchX = e.clientX; }, { passive: true });
  $("#shot-stack").addEventListener("pointerup", e => {
    if (touchX === null) return;
    const dx = e.clientX - touchX; touchX = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) { shotIndex = (shotIndex + 1) % 3; } else { shotIndex = (shotIndex + 2) % 3; }
    layoutShots();
  }, { passive: true });
  layoutShots();

  /* ---------------- 导航：指示器 / compact / 锚点观察 ---------------- */
  const sectionIds = ["overview", "modes", "rules", "logs"];
  const navLinks = $$(".nav-dots a");
  function setNavIndex(index) {
    $("#nav").style.setProperty("--nav-index", String(index));
    navLinks.forEach((link, i) => link.classList.toggle("active", i === index));
  }
  setNavIndex(0);
  const sectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = sectionIds.indexOf(entry.target.id);
      if (index >= 0) setNavIndex(index);
    }
  }, { rootMargin: "-40% 0px -50% 0px" });
  sectionIds.forEach(id => { const el = document.getElementById(id); if (el) sectionObserver.observe(el); });
  window.addEventListener("scroll", () => {
    $("#nav").classList.toggle("compact", window.scrollY > 24);
  }, { passive: true });

  /* 日志区按需连接：进入视口才连，离开即断 */
  let logSectionVisible = false;
  const logObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      logSectionVisible = entry.isIntersecting;
      if (entry.isIntersecting) openEndpoint("logs");
      else { stopSocket("logs"); s.logConnected = false; s.logConnecting = false; renderLogs(); }
    }
  }, { threshold: .08 });
  logObserver.observe($("#logs"));

  /* reveal 滚动入场（照搬参考站动效） */
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add("visible"); revealObserver.unobserve(entry.target); }
    }
  }, { threshold: .12 });
  $$(".reveal").forEach(node => revealObserver.observe(node));
  if (motionQuery?.matches) document.body.classList.add("no-motion");

  /* ---------------- 主题 ---------------- */
  function applyTheme() {
    const dark = ui.theme === "dark" || (ui.theme === "system" && !!darkQuery?.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("meta[name=theme-color]").content = dark ? "#0a0d13" : "#f5f7fa";
    $$(".theme-picker button").forEach(button => button.classList.toggle("active", button.dataset.themeChoice === ui.theme));
  }
  $$(".theme-picker button").forEach(button => button.onclick = () => {
    ui.theme = button.dataset.themeChoice; saveUI(); applyTheme();
    toast("外观已切换为" + THEME_NAMES[ui.theme]);
  });
  darkQuery?.addEventListener?.("change", applyTheme);

  /* ---------------- 弹窗 ---------------- */
  function openDialog(bodyHtml) {
    $("#dialog-body").innerHTML = bodyHtml;
    $("#dialog-layer").classList.add("open");
    const input = $("#dialog-input");
    if (input) setTimeout(() => input.focus(), 60);
  }
  function closeDialog() {
    $("#dialog-layer").classList.remove("open");
  }
  $("#dialog-layer").addEventListener("click", event => {
    if (event.target === $("#dialog-layer")) closeDialog();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeDialog(); });

  function showRuleEditor(pkg = "") {
    if (!editable() || s.pending) return;
    const existing = s.rules.find(rule => rule.package === pkg);
    const a = pkg ? appInfo(pkg) : null;
    let selected = existing?.mode || s.mode || "balance";
    if (!own(MODES, selected)) selected = "balance";
    openDialog(`
      <p class="eyebrow">${existing ? "编辑规则" : "新建规则"}</p>
      <h3 id="dialog-title">${existing ? esc(a.name) : "添加应用规则"}</h3>
      <p class="dialog-sub">关闭自动调度后，应用规则优先于默认档位。</p>
      <label for="dialog-input">应用包名</label>
      <input type="text" id="dialog-input" value="${esc(pkg)}" placeholder="com.example.app" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="255" ${existing ? "readonly" : ""}>
      <p class="input-error" id="dialog-error" hidden></p>
      <label>目标档位</label>
      <div class="mode-chips" role="group" aria-label="目标档位">
        ${Object.entries(MODES).map(([mode, info]) => `<button type="button" data-chip="${mode}" class="${mode === selected ? "active" : ""}">${info.name}</button>`).join("")}
      </div>
      <div class="dialog-actions">
        <button class="button text-button" type="button" id="dialog-cancel">取消</button>
        <button class="button primary" type="button" id="dialog-save">保存规则</button>
      </div>
      ${existing ? '<button class="danger-link" type="button" id="dialog-delete">删除这条规则</button>' : ""}
    `);
    let mode = selected;
    $$("#dialog-body [data-chip]").forEach(button => button.onclick = () => {
      mode = button.dataset.chip;
      $$("#dialog-body [data-chip]").forEach(node => node.classList.toggle("active", node === button));
    });
    $("#dialog-cancel").onclick = closeDialog;
    $("#dialog-save").onclick = () => {
      const value = $("#dialog-input").value.trim();
      const error = $("#dialog-error");
      if (!validPackage(value)) {
        error.hidden = false;
        error.textContent = "请输入有效的主应用包名，例如 com.example.app。";
        return;
      }
      if (beginPending("rule", mode, value)) { error.hidden = true; }
    };
    if (existing) $("#dialog-delete").onclick = () => showDeleteConfirm(pkg);
  }
  function showDeleteConfirm(pkg) {
    const a = appInfo(pkg);
    openDialog(`
      <p class="eyebrow">删除规则</p>
      <h3 id="dialog-title">删除「${esc(a.name)}」的规则？</h3>
      <p class="dialog-sub">删除后，这个应用沿用默认档位。其他应用规则保留。</p>
      <p class="dialog-sub" style="font-family:ui-monospace,monospace;font-size:11px;">${esc(pkg)}</p>
      <div class="dialog-actions">
        <button class="button text-button" type="button" id="dialog-cancel">返回编辑</button>
        <button class="button primary" type="button" id="dialog-confirm" style="background:var(--err);box-shadow:0 14px 34px #ff453a55;">删除规则</button>
      </div>
    `);
    $("#dialog-cancel").onclick = () => showRuleEditor(pkg);
    $("#dialog-confirm").onclick = () => { if (beginPending("delete", null, pkg)) $("#dialog-confirm").disabled = true; };
  }
  $("#rule-list").addEventListener("click", event => {
    const row = event.target.closest("[data-edit]");
    if (row) showRuleEditor(row.dataset.edit);
  });
  $("#add-rule").onclick = () => showRuleEditor("");

  async function showDiagnostics() {
    const diagnostic = s.online ? "game-diagnose" : "diagnose";
    const diagnosticError = s.connectionError || s.error;
    openDialog(`
      <p class="eyebrow">诊断信息</p>
      <h3 id="dialog-title">只读诊断</h3>
      <p class="dialog-sub">${s.online ? "采样约 10 秒，读取实际节点与温度，仅诊断不改变调度参数。" : "读取开机入口、进程身份与启动失败记录。"}</p>
      ${diagnosticError ? `<pre class="report">${esc(diagnosticError)}</pre>` : ""}
      <div class="dialog-actions">
        <button class="button text-button" type="button" id="dialog-copy">复制命令</button>
        <button class="button primary" type="button" id="dialog-run" ${typeof bridge()?.exec === "function" ? "" : "disabled"}>读取诊断</button>
      </div>
      <pre class="report" id="dialog-report" hidden></pre>
      <p class="dialog-sub" style="margin-top:12px;font-family:ui-monospace,monospace;font-size:10.5px;word-break:break-all;">su -c ${esc(MODULE)}/bin/novasched ${diagnostic}</p>
    `);
    $("#dialog-copy").onclick = () => copyText(`su -c ${MODULE}/bin/novasched ${diagnostic}`, "诊断命令已复制");
    $("#dialog-run").onclick = async () => {
      const button = $("#dialog-run");
      button.disabled = true; button.textContent = "读取中…";
      try {
        const result = await rootExec(moduleCommand(diagnostic), 40000);
        const report = $("#dialog-report");
        report.hidden = false;
        report.textContent = result.stdout + (result.stderr ? "\n" + result.stderr : "") || `诊断退出码：${result.errno}`;
      } catch (error) {
        const report = $("#dialog-report");
        report.hidden = false;
        report.textContent = error.message;
      } finally { button.disabled = false; button.textContent = "重新读取诊断"; }
    };
  }

  /* ---------------- 控件事件 ---------------- */
  $$("#mode-grid .mode-card").forEach(button => button.onclick = () => {
    if (s.automatic || s.automaticActive) { beginPending("mode", button.dataset.mode); return; }
    if (!s.automatic && button.dataset.mode === s.mode && button.dataset.mode === s.effective) { toast("当前档位已生效"); return; }
    beginPending("mode", button.dataset.mode);
  });
  /* switch 是 button[role=switch]，没有原生 change 事件；统一用 click 翻转 */
  $("#auto-switch").onclick = event => {
    const on = event.currentTarget.getAttribute("aria-checked") !== "true";
    beginPending("auto", on ? "on" : "off");
    render();
  };
  $("#hero-auto").onclick = () => {
    beginPending("auto", s.automatic ? "off" : "on");
    render();
  };
  $("#hero-reconnect").onclick = () => { if (!s.suspended) { clearTimeout(s.retry); discover(); toast("正在重新发现本地服务"); } };
  $("#hero-diagnose").onclick = showDiagnostics;
  $("#about-diagnose").onclick = event => { event.preventDefault(); showDiagnostics(); };
  $("#about-license").onclick = event => { event.preventDefault(); toast("GPL-3.0-only · 许可文本见模块内 LICENSE"); };
  $("#nav-cta").onclick = () => { if (!s.online && !s.connecting) { clearTimeout(s.retry); discover(); } };
  $$(".log-tools [data-level]").forEach(button => button.onclick = () => {
    s.level = button.dataset.level;
    $$(".log-tools [data-level]").forEach(node => node.classList.toggle("active", node === button));
    renderLogs();
  });
  $("#log-follow").onclick = event => {
    const on = event.currentTarget.getAttribute("aria-checked") !== "true";
    event.currentTarget.setAttribute("aria-checked", String(on));
    s.follow = on;
    if (on) { const output = $("#log-list"); output.scrollTop = output.scrollHeight; }
  };
  $("#log-copy").onclick = () => copyText(visibleLogs().map(l => l.raw).join("\n"), "筛选后的日志已复制");
  $("#log-list").addEventListener("click", event => {
    const row = event.target.closest("article[data-raw]");
    if (!row) return;
    const line = parseLog(row.dataset.raw);
    openDialog(`
      <p class="eyebrow">日志详情</p>
      <h3 id="dialog-title">${esc(line.time || "本地记录")} · ${LV_TAG[line.level]}</h3>
      <pre class="report">${esc(line.raw)}</pre>
      <div class="dialog-actions">
        <button class="button primary" type="button" id="dialog-cancel">关闭</button>
      </div>
    `);
    $("#dialog-cancel").onclick = closeDialog;
  });

  /* ---------------- 页面可见性 ---------------- */
  function suspend() {
    cancelRootBridge();
    if (s.suspended) return;
    s.suspended = true; s.epoch++; clearTimeout(s.retry); cancelProbes(); cancelAuthentication();
    ["modes","apps","logs"].forEach(stopSocket);
    s.online = false; s.connecting = false; s.discovered = false;
    if (s.pending) finishPending(false, "页面进入后台，返回后请确认操作结果");
  }
  function resume() { if (s.suspended) { s.suspended = false; discover(); } }
  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : resume());
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", resume);

  applyTheme();
  render();
  renderLogs();
  discover();
})();
