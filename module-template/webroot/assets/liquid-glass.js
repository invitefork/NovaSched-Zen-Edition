/* NovaSched liquid glass renderer · ZenJooo.
 * 移植自 LiquidGlassView（AndroidLiquidGlassView → WebGL 单文件版，基于
 * QmDeve/AndroidLiquidGlassView，MIT 许可）：
 * AGSL 圆角矩形折射着色器保留（SDF 折射、深度渐变、光谱色散、线性 sRGB 饱和度），
 * 改为单一全屏画布渲染所有注册的玻璃表面。
 * 背景支持两种来源：程序化光斑（无壁纸）或用户壁纸（主体采样预模糊纹理、
 * 折射边缘采样清晰纹理，对应 SleepDown 的 backdrop blur + lens 结构）。
 * 无纹理上传热路径：壁纸仅在设置/尺寸变化时重新上传一次。
 * 无 WebGL 时退回 CSS 毛玻璃（body.glass-flat）。 */
(() => {
  "use strict";
  if (window.NovaGlass) return;

  const MAX_RECTS = 26;
  const MAX_BLOBS = 7;
  const PIXEL_BUDGET = 2300000;   // 画布像素上限，约 2.3MP
  const FPS_CAP = 30;
  const FRAME_MS = 1000 / FPS_CAP;

  const canvas = document.getElementById("glass-canvas");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ||
    { matches: false, addEventListener() {} };

  /* ---------------- 主题配色（对应 SleepDown 的玻璃材质常量） ---------------- */
  const THEMES = {
    dark: {
      baseA: [0.055, 0.065, 0.115], baseB: [0.145, 0.100, 0.215],
      tint: [0.071, 0.071, 0.071], tintAlpha: 0.40,     // #121212
      sat: 1.12, rim: 0.50,
      blobs: [
        [0.20, 0.44, 0.80], [0.42, 0.24, 0.72], [0.08, 0.46, 0.55],
        [0.52, 0.20, 0.42], [0.16, 0.28, 0.62], [0.68, 0.72, 0.92], [0.30, 0.55, 0.85],
      ],
      blobR: [0.62, 0.55, 0.42, 0.38, 0.50, 0.16, 0.30],
      blobI: [0.85, 0.80, 0.70, 0.62, 0.66, 0.50, 0.72],
    },
    light: {
      baseA: [0.925, 0.945, 0.985], baseB: [0.845, 0.875, 0.965],
      tint: [0.949, 0.957, 0.973], tintAlpha: 0.46,     // #F2F4F8
      sat: 1.06, rim: 0.58,
      blobs: [
        [0.58, 0.74, 1.0], [0.96, 0.78, 0.87], [0.70, 0.90, 0.83],
        [0.80, 0.76, 1.0], [1.0, 0.87, 0.76], [0.70, 0.84, 1.0], [0.86, 0.92, 1.0],
      ],
      blobR: [0.60, 0.50, 0.46, 0.42, 0.40, 0.20, 0.34],
      blobI: [0.90, 0.85, 0.80, 0.78, 0.76, 0.72, 0.68],
    },
  };
  const ACCENT_TINTS = {
    blue:   [0.039, 0.518, 1.0],   /* #0A84FF */
    indigo: [0.369, 0.361, 0.902],
    purple: [0.749, 0.353, 0.949],
    rose:   [1.0, 0.216, 0.373],
    amber:  [1.0, 0.624, 0.039],
    green:  [0.188, 0.820, 0.345],
  };
  const BLOB_POS = [
    [0.18, 0.14], [0.86, 0.20], [0.10, 0.62], [0.90, 0.78], [0.52, 0.46], [0.34, 0.06], [0.70, 0.60],
  ];
  const BLOB_DRIFT = [
    [0.055, 0.043], [0.048, 0.060], [0.040, 0.052], [0.062, 0.038],
    [0.035, 0.047], [0.070, 0.058], [0.045, 0.036],
  ];

  let themeName = "dark";
  let accentName = "blue";
  let level = 55;

  /* ---------------- 壁纸（清晰 + 预模糊两层，cover 适配画布） ---------------- */
  const wallSharp = document.createElement("canvas");
  const wallBlur = document.createElement("canvas");
  const wallCtx = wallSharp.getContext("2d");
  const wallBlurCtx = wallBlur.getContext("2d");
  let wallImage = null;
  let wallBlurPercent = 0;
  let wallBrightness = 1;
  let wallDirty = false;
  let wallGlReady = false;

  function drawWallLayers() {
    if (!wallImage) return;
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    const scale = Math.min(1, Math.sqrt(1600000 / (w * h)));
    const pw = Math.max(2, Math.round(w * scale));
    const ph = Math.max(2, Math.round(h * scale));
    for (const [target, ctx] of [[wallSharp, wallCtx], [wallBlur, wallBlurCtx]]) {
      if (target.width !== pw || target.height !== ph) { target.width = pw; target.height = ph; }
      ctx.clearRect(0, 0, pw, ph);
    }
    /* cover 适配 */
    const iw = wallImage.naturalWidth || wallImage.width;
    const ih = wallImage.naturalHeight || wallImage.height;
    if (!iw || !ih) return;
    const cover = Math.max(pw / iw, ph / ih);
    const dw = iw * cover, dh = ih * cover;
    wallCtx.drawImage(wallImage, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
    const blurPx = Math.round(wallBlurPercent * 0.004 * Math.max(pw, ph));
    wallBlurCtx.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";
    wallBlurCtx.drawImage(wallSharp, 0, 0);
    wallBlurCtx.filter = "none";
    wallDirty = true;
  }

  /* ---------------- 表面注册表 ---------------- */
  const surfaces = new Map();
  let rectsDirty = true;
  let staleAll = true;
  let observer = null;
  if (typeof ResizeObserver === "function") {
    observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const record = surfaces.get(entry.target);
        if (record) record.stale = true;
      }
      rectsDirty = true;
    });
  }
  function measure(el, record) {
    let rect;
    try { rect = el.getBoundingClientRect(); } catch (_) { return; }
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    record.x = Math.round((rect.left + scrollX) * dpr);
    record.y = Math.round((rect.top + scrollY) * dpr);
    record.w = Math.round(rect.width * dpr);
    record.h = Math.round(rect.height * dpr);
    const requested = Number(el.dataset.radius ?? record.radius ?? 24);
    record.r = Math.min(requested * dpr, Math.min(record.w, record.h) / 2);
    record.stale = false;
  }
  function scan(root) {
    const scope = root || document;
    for (const el of scope.querySelectorAll(".g")) {
      if (surfaces.has(el)) continue;
      const record = { x: 0, y: 0, w: 0, h: 0, r: 0, stale: true, radius: Number(el.dataset.radius ?? 24), ro: null };
      surfaces.set(el, record);
      if (observer) { try { observer.observe(el); } catch (_) {} }
      rectsDirty = true;
    }
    for (const [el, record] of surfaces) {
      if (!el.isConnected || !el.classList.contains("g")) {
        if (record.ro) { try { observer.unobserve(el); } catch (_) {} }
        surfaces.delete(el);
        rectsDirty = true;
      }
    }
  }
  function refresh() {
    for (const [el, record] of surfaces) {
      if (record.stale || staleAll) measure(el, record);
    }
    staleAll = false;
    rectsDirty = true;
  }

  /* ---------------- 可调参数 ---------------- */
  const params = { refH: 20, refO: 60, disp: 0.55 };
  function setLevel(value) {
    level = Math.max(0, Math.min(100, Number(value) || 0));
    params.refH = 15 + level * 0.06;
    params.refO = 30 + level * 0.32;
    params.disp = 0.32 + level * 0.004;
    paramsDirty = true;
  }
  let paramsDirty = true;

  /* ---------------- WebGL ---------------- */
  let gl = null, prog = null, uni = null, failed = false;
  let wallTexBlur = null, wallTexSharp = null;

  const VERT_SRC =
    "attribute vec2 aPos;" +
    "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  const FRAG_SRC = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;",
    "#else", "precision mediump float;", "#endif",
    "uniform vec2 uRes;",
    "uniform vec3 uBaseA;",
    "uniform vec3 uBaseB;",
    "uniform vec4 uBlobs[" + MAX_BLOBS + "];",
    "uniform vec3 uBlobCol[" + MAX_BLOBS + "];",
    "uniform vec4 uRects[" + MAX_RECTS + "];",
    "uniform float uRadii[" + MAX_RECTS + "];",
    "uniform float uCount;",
    "uniform float uRefH;",
    "uniform float uRefO;",
    "uniform float uDisp;",
    "uniform vec4 uTint;",
    "uniform vec3 uAccent;",
    "uniform float uSat;",
    "uniform float uRim;",
    "uniform sampler2D uWallBlurTex;",
    "uniform sampler2D uWallSharpTex;",
    "uniform vec4 uWallMeta;",   /* has, brightness, 0, 0 */
    "const vec3 rgbToY = vec3(0.2126, 0.7152, 0.0722);",
    "vec3 toLinearSrgb(vec3 c) {",
    "  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));",
    "}",
    "vec3 fromLinearSrgb(vec3 c) {",
    "  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));",
    "}",
    "vec3 saturateColor(vec3 c, float amount) {",
    "  vec3 lin = toLinearSrgb(c);",
    "  float y = dot(lin, rgbToY);",
    "  return fromLinearSrgb(mix(vec3(y), lin, amount));",
    "}",
    "float sdRoundedRect(vec2 cd, vec2 halfSize, float radius) {",
    "  vec2 cornerCoord = abs(cd) - (halfSize - vec2(radius));",
    "  float outside = length(max(cornerCoord, 0.0)) - radius;",
    "  float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);",
    "  return outside + inside;",
    "}",
    "vec2 gradSdRoundedRect(vec2 cd, vec2 halfSize, float radius) {",
    "  vec2 cornerCoord = abs(cd) - (halfSize - vec2(radius));",
    "  if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {",
    "    vec2 outv = max(cornerCoord, 0.0);",
    "    float outLen = length(outv);",
    "    if (outLen > 0.001) return sign(cd) * (outv / outLen);",
    "    float useX = step(cornerCoord.y, cornerCoord.x);",
    "    return vec2(useX * sign(cd.x), (1.0 - useX) * sign(cd.y));",
    "  } else {",
    "    float gradX = step(cornerCoord.y, cornerCoord.x);",
    "    return sign(cd) * vec2(gradX, 1.0 - gradX);",
    "  }",
    "}",
    "float circleMap(float x) { return 1.0 - sqrt(max(1.0 - x * x, 0.0)); }",
    "vec2 safeNormalize(vec2 value, vec2 fallback) {",
    "  float len = length(value);",
    "  if (len > 0.001) return value / len;",
    "  return fallback;",
    "}",
    "vec3 wallpaper(vec2 p, float sharp) {",
    "  vec2 uv = p / uRes;",
    "  vec3 c = mix(texture2D(uWallBlurTex, uv).rgb, texture2D(uWallSharpTex, uv).rgb, sharp);",
    "  return c * uWallMeta.y;",
    "}",
    "vec3 background(vec2 p) {",
    "  if (uWallMeta.x > 0.5) return wallpaper(p, 0.0);",
    "  vec2 uv = p / uRes;",
    "  vec3 col = mix(uBaseA, uBaseB, clamp(uv.y * 0.85 + uv.x * 0.30, 0.0, 1.0));",
    "  for (int i = 0; i < " + MAX_BLOBS + "; i++) {",
    "    vec4 b = uBlobs[i];",
    "    if (b.z <= 0.5) continue;",
    "    float d = distance(p, b.xy);",
    "    float fall = 1.0 - smoothstep(b.z * 0.22, b.z, d);",
    "    col = mix(col, uBlobCol[i], fall * fall * b.w);",
    "  }",
    "  return col;",
    "}",
    "vec3 backgroundEdge(vec2 p) {",
    "  if (uWallMeta.x > 0.5) return wallpaper(p, 1.0);",
    "  return background(p);",
    "}",
    "void main() {",
    "  vec2 coord = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);",
    "  vec4 bestRect = vec4(0.0);",
    "  float bestSd = 1e9;",
    "  float bestR = 0.0;",
    "  for (int i = 0; i < " + MAX_RECTS + "; i++) {",
    "    if (float(i) >= uCount) break;",
    "    vec4 rect = uRects[i];",
    "    if (rect.z < 1.0 || rect.w < 1.0) continue;",
    "    vec2 halfSize = rect.zw * 0.5;",
    "    vec2 cd = coord - (rect.xy + halfSize);",
    "    float sd = sdRoundedRect(cd, halfSize, uRadii[i]);",
    "    if (sd < bestSd) { bestSd = sd; bestRect = rect; bestR = uRadii[i]; }",
    "  }",
    "  vec3 col;",
    "  if (bestRect.z < 1.0 || bestSd >= 0.0) {",
    "    col = background(coord);",
    "  } else {",
    "    vec2 halfSize = bestRect.zw * 0.5;",
    "    vec2 centeredCoord = coord - (bestRect.xy + halfSize);",
    "    vec3 base;",
    "    if (-bestSd >= uRefH) {",
    "      base = background(coord);",
    "    } else {",
    "      float d = circleMap(1.0 + bestSd / uRefH) * uRefO;",
    "      float smoothRadius = max(bestR * 1.5, 30.0);",
    "      float gradRadius = min(smoothRadius, min(halfSize.x, halfSize.y));",
    "      vec2 shapeGrad = gradSdRoundedRect(centeredCoord, halfSize, gradRadius);",
    "      vec2 depthGrad = safeNormalize(centeredCoord, shapeGrad);",
    "      vec2 grad = safeNormalize(shapeGrad + 0.3 * depthGrad, shapeGrad);",
    "      vec2 refracted = coord + d * grad;",
    "      float dispIntensity = uDisp * ((centeredCoord.x * centeredCoord.y) / (halfSize.x * halfSize.y));",
    "      vec2 dispVec = d * grad * dispIntensity * 2.0;",
    "      vec3 refr = vec3(",
    "        backgroundEdge(refracted + dispVec).r,",
    "        backgroundEdge(refracted).g,",
    "        backgroundEdge(refracted - dispVec).b);",
    "      base = refr;",
    "      float rimBand = 1.0 - smoothstep(0.0, uRefH, -bestSd);",
    "      vec2 lightDir = vec2(-0.55, -0.835);",
    "      float lit = pow(max(dot(grad, lightDir), 0.0), 3.0);",
    "      float dark = pow(max(dot(grad, -lightDir), 0.0), 3.0);",
    "      base += mix(vec3(1.0), uAccent, 0.25) * (rimBand * lit * uRim);",
    "      base *= 1.0 - 0.14 * rimBand * dark;",
    "    }",
    "    col = saturateColor(clamp(base, 0.0, 1.0), uSat);",
    "    col = mix(col, uTint.rgb, uTint.a);",
    "  }",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function makeTexture(unit) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }
  function initGL() {
    if (failed || !canvas) return false;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }) ||
           canvas.getContext("experimental-webgl", { alpha: false });
    } catch (_) { gl = null; }
    if (!gl || typeof gl.createShader !== "function") { gl = null; return false; }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, VERT_SRC));
      gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FRAG_SRC));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      const names = ["uRes","uBaseA","uBaseB","uBlobs","uBlobCol","uRects","uRadii","uCount",
        "uRefH","uRefO","uDisp","uTint","uAccent","uSat","uRim","uWallBlurTex","uWallSharpTex","uWallMeta"];
      uni = {};
      for (const name of names) uni[name] = gl.getUniformLocation(prog, name);
      gl.uniform1i(uni.uWallBlurTex, 0);
      gl.uniform1i(uni.uWallSharpTex, 1);
      wallTexBlur = makeTexture(0);
      wallTexSharp = makeTexture(1);
      /* 空纹理占位，避免采样未绑定纹理时的未定义行为 */
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.activeTexture(gl.TEXTURE0);
      canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); gl = null; applyFallback(); }, false);
      canvas.addEventListener("webglcontextrestored", () => { gl = null; failed = false; if (initGL()) bootGL(); }, false);
      return true;
    } catch (_) { gl = null; failed = true; return false; }
  }

  function applyFallback() {
    document.body.classList.add("glass-flat");
    if (canvas && canvas.parentNode) canvas.style.display = "none";
  }

  /* ---------------- 帧循环 ---------------- */
  let dpr = 1, cssW = 0, cssH = 0;
  const rectData = new Float32Array(MAX_RECTS * 4);
  const radiusData = new Float32Array(MAX_RECTS);
  const blobData = new Float32Array(MAX_BLOBS * 4);
  const blobColData = new Float32Array(MAX_BLOBS * 3);
  let animId = 0, lastFrame = 0, visible = !document.hidden;
  let motionless = false;

  function resizeCanvas() {
    if (!gl || !canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    const scale = Math.min(1, Math.sqrt(PIXEL_BUDGET / (cssW * cssH * dpr * dpr)));
    const w = Math.max(1, Math.round(cssW * dpr * scale));
    const h = Math.max(1, Math.round(cssH * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    dpr *= scale;
    staleAll = true;
    rectsDirty = true;
    if (wallImage) drawWallLayers();
  }

  function uploadWallpaper() {
    if (!gl || !wallImage) return;
    const source = wallBlurPercent > 0 ? wallBlur : wallSharp;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, wallTexBlur);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, wallTexSharp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, wallSharp);
    gl.activeTexture(gl.TEXTURE0);
    wallGlReady = true;
    wallDirty = false;
  }

  function pushUniforms(time) {
    const theme = THEMES[themeName] || THEMES.dark;
    const accent = ACCENT_TINTS[accentName] || ACCENT_TINTS.blue;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uni.uRes, canvas.width, canvas.height);
    gl.uniform3fv(uni.uBaseA, theme.baseA);
    gl.uniform3fv(uni.uBaseB, theme.baseB);
    const t = time / 1000;
    for (let i = 0; i < MAX_BLOBS; i++) {
      const drift = BLOB_DRIFT[i];
      const dx = motionless ? 0 : Math.sin(t * drift[0] * 6.283 + i * 1.7) * 0.09;
      const dy = motionless ? 0 : Math.cos(t * drift[1] * 6.283 + i * 2.3) * 0.09;
      const pulse = motionless ? 1 : 1 + Math.sin(t * 0.35 + i) * 0.06;
      const color = i === 5 ? accent : (theme.blobs[i] || theme.blobs[0]);
      blobData[i * 4] = (BLOB_POS[i][0] + dx) * canvas.width;
      blobData[i * 4 + 1] = (BLOB_POS[i][1] + dy) * canvas.height;
      blobData[i * 4 + 2] = Math.max(theme.blobR[i], theme.blobR[i] * pulse) * Math.max(canvas.width, canvas.height);
      blobData[i * 4 + 3] = theme.blobI[i];
      blobColData[i * 3] = color[0]; blobColData[i * 3 + 1] = color[1]; blobColData[i * 3 + 2] = color[2];
    }
    gl.uniform4fv(uni.uBlobs, blobData);
    gl.uniform3fv(uni.uBlobCol, blobColData);
    /* 表面记录的是文档坐标；画布固定于视口，必须减去滚动量才是屏幕位置 */
    const scrollX = (window.scrollX || window.pageXOffset || 0) * dpr;
    const scrollY = (window.scrollY || window.pageYOffset || 0) * dpr;
    let count = 0;
    for (const record of surfaces.values()) {
      if (count >= MAX_RECTS || record.w < 2 || record.h < 2) continue;
      rectData[count * 4] = record.x - scrollX; rectData[count * 4 + 1] = record.y - scrollY;
      rectData[count * 4 + 2] = record.w; rectData[count * 4 + 3] = record.h;
      radiusData[count] = record.r;
      count++;
    }
    for (let i = count; i < MAX_RECTS; i++) rectData[i * 4 + 2] = 0;
    gl.uniform4fv(uni.uRects, rectData);
    gl.uniform1fv(uni.uRadii, radiusData);
    gl.uniform1f(uni.uCount, count);
    gl.uniform1f(uni.uRefH, params.refH * dpr);
    gl.uniform1f(uni.uRefO, -params.refO * dpr);
    gl.uniform1f(uni.uDisp, params.disp);
    /* 壁纸模式下减弱 tint，让玻璃更透（对应 SleepDown 的 PanelTintAlpha 0.15 一档） */
    const wallActive = wallGlReady && wallImage ? 1 : 0;
    const tintAlpha = wallActive
      ? Math.max(0.16, theme.tintAlpha - 0.16 - level * 0.001)
      : Math.max(0.24, theme.tintAlpha - level * 0.0012);
    gl.uniform4f(uni.uTint, theme.tint[0], theme.tint[1], theme.tint[2], tintAlpha);
    gl.uniform3f(uni.uAccent, accent[0], accent[1], accent[2]);
    gl.uniform1f(uni.uSat, theme.sat + level * 0.001);
    gl.uniform1f(uni.uRim, theme.rim);
    gl.uniform4f(uni.uWallMeta, wallActive, wallBrightness, 0, 0);
  }

  function render(time) {
    if (!gl) return;
    if (staleAll || rectsDirty) refresh();
    if (wallDirty) uploadWallpaper();
    pushUniforms(time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rectsDirty = false;
    paramsDirty = false;
  }

  function tick(now) {
    animId = 0;
    if (!gl || !visible) return;
    if (now - lastFrame >= FRAME_MS - 1) {
      lastFrame = now;
      render(now);
    }
    if (!motionless) animId = requestAnimationFrame(tick);
  }
  function ensureLoop() {
    if (!animId && gl && visible && !motionless) animId = requestAnimationFrame(tick);
  }
  function renderNow() {
    if (gl && visible) render(performance.now());
  }

  /* ---------------- 对外接口与事件 ---------------- */
  window.NovaGlass = {
    scan,
    refresh() { staleAll = true; rectsDirty = true; renderNow(); ensureLoop(); },
    setLevel,
    setTheme(name, accent) {
      if (name === "light" || name === "dark") themeName = name;
      if (accent && ACCENT_TINTS[accent]) accentName = accent;
      paramsDirty = true;
      renderNow(); ensureLoop();
    },
    setWallpaper(image) {
      wallImage = image && (image.naturalWidth || image.width) ? image : null;
      if (wallImage) drawWallLayers();
      wallGlReady = !!wallImage && wallGlReady;
      if (!wallImage) { wallGlReady = false; }
      paramsDirty = true;
      renderNow(); ensureLoop();
    },
    setWallOptions({ blur, brightness } = {}) {
      if (Number.isFinite(blur)) wallBlurPercent = Math.max(0, Math.min(100, blur));
      if (Number.isFinite(brightness)) wallBrightness = Math.max(0.3, Math.min(1.2, brightness));
      if (wallImage) drawWallLayers();
      paramsDirty = true;
      renderNow(); ensureLoop();
    },
  };

  window.addEventListener("resize", () => { resizeCanvas(); refresh(); renderNow(); ensureLoop(); });
  window.addEventListener("orientationchange", () => setTimeout(() => { resizeCanvas(); refresh(); renderNow(); }, 120));
  /* 滚动只改变视口偏移（渲染时已减去 scroll），文档坐标不变，无需重新测量 */
  window.addEventListener("scroll", () => renderNow(), { passive: true });
  window.addEventListener("nova:page", () => { staleAll = true; rectsDirty = true; renderNow(); ensureLoop(); });
  window.addEventListener("nova:dialog", () => { staleAll = true; rectsDirty = true; renderNow(); });
  reducedMotion.addEventListener?.("change", event => {
    motionless = event.matches;
    if (motionless) { if (animId) cancelAnimationFrame(animId); animId = 0; renderNow(); }
    else ensureLoop();
  });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) { lastFrame = 0; ensureLoop(); }
    else if (animId) { cancelAnimationFrame(animId); animId = 0; }
  });

  function bootGL() {
    motionless = reducedMotion.matches;
    resizeCanvas();
    scan(document);
    refresh();
    render(performance.now());
    ensureLoop();
  }

  setLevel(level);
  if (initGL()) bootGL();
  else applyFallback();
})();
