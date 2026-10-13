/* ZenJooo. WebGL adapter for Kyant Backdrop's AGSL lens, Apache-2.0.
 * Native reference: SleepDown beta5, 5ed891bc4563d9a0dd56edb63902bcfaf5d88a2c.
 * This is a Web renderer; it does not load Android Compose or RuntimeShader.
 */
(() => {
  "use strict";
  if (window.NovaGlass) return;
  const background = document.getElementById("glass-canvas");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const stage = document.createElement("canvas");
  const source = document.createElement("canvas");
  const scene = document.createElement("canvas");
  const lensSource = document.createElement("canvas");
  const textSource = document.createElement("canvas");
  const textureScratch = document.createElement("canvas");
  const textContext = textSource.getContext("2d");
  const textureContext = textureScratch.getContext("2d");
  const lensContext = lensSource.getContext("2d");
  const sourceContext = source.getContext("2d");
  const sceneContext = scene.getContext("2d");
  const backgroundContext = background?.getContext("2d");
  const gl = stage.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
  let available = !!(gl?.createShader && sourceContext?.drawImage && backgroundContext?.drawImage);
  let theme = "light", accent = [10 / 255, 132 / 255, 1], image = null;
  let wall = { blur: 6, brightness: .93, centerX: .5, centerY: .5, scale: 1 };
  let settings = { level: 50, cardBlur: 24, cardAlpha: 73, cardRadius: 22, chromeBlur: 100, dispersion: true, material: true, colorMode: "colorful", cardColor: "#d6e9ff", palette: ["#64b5f6", "#f48fb1", "#81c784", "#ffd166", "#b39ddb", "#4dd0e1"] };
  let width = 0, height = 0, ratio = 1, sourceEpoch = 0, sceneEpoch = 0;
  let sourceDirty = true, sceneDirty = true, textDirty = true;
  let frame = 0, until = 0, hidden = false, materialRevision = 0, nextSurfaceId = 0;
  let settingsKey = JSON.stringify(settings);
  const SAMPLE_PIXELS = 600000;
  const TEXTURE_BYTES = 24 * 1024 * 1024;
  const counters = { frames: 0, draws: 0, stageResizes: 0, textureUploads: 0, lensRecords: 0, sceneRecords: 0, textRecords: 0, glyphReads: 0 };
  let program, buffer;
  const surfaces = new Map(), textures = new Map();
  const ACCENTS = { blue: [10 / 255, 132 / 255, 1], indigo: [94 / 255, 92 / 255, 230 / 255], purple: [191 / 255, 90 / 255, 242 / 255], rose: [1, 55 / 255, 95 / 255], amber: [1, 159 / 255, 10 / 255], green: [48 / 255, 209 / 255, 87 / 255] };
  const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D content;
uniform vec2 screen;
uniform vec4 rect;
uniform float radius;
uniform vec4 material;
uniform vec4 tint;
uniform float gradientTint;
uniform float highlightAlpha;
float sdRoundedRect(vec2 p, vec2 halfSize, float r){
  vec2 cornerCoord=abs(p)-(halfSize-vec2(r));
  return length(max(cornerCoord,0.))-r+min(max(cornerCoord.x,cornerCoord.y),0.);
}
vec2 gradSdRoundedRect(vec2 p,vec2 halfSize,float r){
  vec2 cornerCoord=abs(p)-(halfSize-vec2(r));
  if(cornerCoord.x>=0.||cornerCoord.y>=0.)return sign(p)*normalize(max(cornerCoord,0.)+vec2(.000001));
  float gradX=step(cornerCoord.y,cornerCoord.x);
  return sign(p)*vec2(gradX,1.-gradX);
}
float circleMap(float x){return 1.-sqrt(max(0.,1.-x*x));}
vec4 sampleContent(vec2 p){return texture2D(content,clamp(p/screen,vec2(.00001),vec2(.99999)));}
vec4 refractContent(vec2 coord,vec2 p,vec2 halfSize,float sd){
  float refractionHeight=material.x;
  if(refractionHeight<=0.||-sd>=refractionHeight)return sampleContent(rect.xy+coord);
  float d=circleMap(1.-clamp(-min(sd,0.)/refractionHeight,0.,1.))*material.y;
  float gradRadius=min(radius*1.5,min(halfSize.x,halfSize.y));
  vec2 grad=normalize(gradSdRoundedRect(p,halfSize,gradRadius)+material.z*(p/max(length(p),.00001)));
  vec2 refractedCoord=rect.xy+coord+d*grad;
  float dispersionIntensity=material.w*((p.x*p.y)/max(halfSize.x*halfSize.y,.00001));
  vec2 dispersedCoord=d*grad*dispersionIntensity;
  if(material.w==0.)return sampleContent(refractedCoord);
  vec4 color=vec4(0.);
  vec4 red=sampleContent(refractedCoord+dispersedCoord);
  color.r+=red.r/3.5; color.a+=red.a/7.;
  vec4 orange=sampleContent(refractedCoord+dispersedCoord*(2./3.));
  color.r+=orange.r/3.5; color.g+=orange.g/7.; color.a+=orange.a/7.;
  vec4 yellow=sampleContent(refractedCoord+dispersedCoord*(1./3.));
  color.r+=yellow.r/3.5; color.g+=yellow.g/3.5; color.a+=yellow.a/7.;
  vec4 green=sampleContent(refractedCoord);
  color.g+=green.g/3.5; color.a+=green.a/7.;
  vec4 cyan=sampleContent(refractedCoord-dispersedCoord*(1./3.));
  color.g+=cyan.g/3.5; color.b+=cyan.b/3.; color.a+=cyan.a/7.;
  vec4 blue=sampleContent(refractedCoord-dispersedCoord*(2./3.));
  color.b+=blue.b/3.; color.a+=blue.a/7.;
  vec4 purple=sampleContent(refractedCoord-dispersedCoord);
  color.r+=purple.r/7.; color.b+=purple.b/3.; color.a+=purple.a/7.;
  return color;
}
void main(){
  vec2 coord=vec2(uv.x,1.-uv.y)*rect.zw;
  vec2 halfSize=rect.zw*.5, p=coord-halfSize;
  float sd=sdRoundedRect(p,halfSize,radius);
  float coverage=1.-smoothstep(-.75,.5,sd);
  if(coverage==0.){gl_FragColor=vec4(0.);return;}
  vec4 c=refractContent(coord,p,halfSize,sd);
  float alpha=tint.a*(gradientTint>.5?mix(.22,1.,coord.y/max(rect.w,1.)):1.);
  c.rgb=mix(c.rgb,tint.rgb,alpha);
  vec2 grad=gradSdRoundedRect(p,halfSize,min(radius*1.5,min(halfSize.x,halfSize.y)));
  float directional=pow(abs(dot(grad,normalize(vec2(-1.,-1.)))),1.);
  float rim=(1.-smoothstep(0.,1.2,abs(sd)))*directional*highlightAlpha;
  c.rgb=mix(c.rgb,vec3(1.),rim);
  gl_FragColor=vec4(c.rgb,coverage);
}`;
  function compile(kind, code) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, code); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error("Shader compile failed"); }
    return shader;
  }
  function initialize() {
    if (!available) return;
    try {
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader link failed");
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      document.documentElement.dataset.renderer = "webgl-kyant-port";
    } catch (_) { fallback(); }
  }
  function fallback() {
    available = false;
    document.body.classList.add("glass-flat");
    document.documentElement.dataset.renderer = "css-backdrop";
    if (!backgroundContext?.drawImage && background) background.style.display = "none";
    until = 0;
    for (const [element, record] of surfaces) {
      element.classList.remove("glass-ready");
      record.canvas.style.display = "none";
      record.renderKey = "";
    }
  }
  function motionAllowed() {
    return available && !reduced?.matches && document.documentElement.dataset.motion !== "reduce";
  }
  function invalidate(duration = 0) {
    if (hidden) return;
    if (motionAllowed()) until = Math.max(until, performance.now() + duration);
    else until = 0;
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function dimensions() {
    const nextWidth = Math.max(1, window.innerWidth || 360), nextHeight = Math.max(1, window.innerHeight || 800);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth; height = nextHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1200000 / (width * height)));
    for (const canvas of [source, scene, lensSource, textSource, background]) { if (!canvas) continue; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    sourceDirty = sceneDirty = textDirty = true;
  }
  function wallTransform(w, h) {
    if (!image) return null;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    if (!iw || !ih) return null;
    const scale = Math.max(w / iw, h / ih) * wall.scale;
    return { x: Math.max(w - iw * scale, Math.min(0, w / 2 - wall.centerX * iw * scale)), y: Math.max(h - ih * scale, Math.min(0, h / 2 - wall.centerY * ih * scale)), w: iw * scale, h: ih * scale };
  }
  function drawWallpaper(context, w, h, options = wall) {
    if (!context?.fillRect) return;
    context.save(); context.clearRect(0,0,w,h);
    context.fillStyle = theme === "dark" ? "#121212" : "#f2f4f8"; context.fillRect(0,0,w,h);
    const transform = wallTransform(w,h);
    if (transform) {
      const px = options.blur * .32 * (w / Math.max(1,width));
      context.filter = `blur(${px}px) brightness(${options.brightness})`;
      const pad = Math.ceil(px * 3);
      if (pad) {
        context.drawImage(image,transform.x-pad,transform.y-pad,transform.w+pad*2,transform.h+pad*2);
      } else context.drawImage(image,transform.x,transform.y,transform.w,transform.h);
    }
    context.restore();
  }
  function rebuildSource() {
    if (!sourceDirty) return;
    drawWallpaper(sourceContext, source.width, source.height);
    if (backgroundContext?.drawImage) { backgroundContext.clearRect(0,0,background.width,background.height); backgroundContext.drawImage(source,0,0); }
    sourceEpoch++; sourceDirty = false; sceneDirty = true;
    // Existing texture objects are refreshed lazily against the new source epoch.
  }
  function parseColor(value) {
    const match = /^#([\da-f]{6})$/i.exec(value || "");
    return match ? [parseInt(match[1].slice(0,2),16)/255,parseInt(match[1].slice(2,4),16)/255,parseInt(match[1].slice(4),16)/255] : accent;
  }
  function materialFor(element) {
    const role = element.dataset.role || "pill", dark = theme === "dark";
    const neutral = dark ? [18/255,18/255,18/255] : [242/255,244/255,248/255];
    const strength = settings.level === 0 ? 0 : .5 + settings.level / 100;
    const data = { role, blur: 2.375 * settings.chromeBlur / 100, height: 11.4, amount: 22.8, depth: .1, dispersion: settings.dispersion ? .05 : 0, tint: neutral, alpha: dark ? .45 : .54, highlight: .055, gradient: 0 };
    if (role === "course") {
      data.highlight=.045; data.blur = settings.cardBlur; data.height = 10 * strength; data.amount = 20 * strength;
      data.tint = parseColor(settings.colorMode === "colorful" ? settings.palette[(Number(element.dataset.colorIndex)||0) % settings.palette.length] : settings.cardColor);
      data.alpha = settings.cardAlpha / 100 * .52;
      data.gradient = settings.colorMode === "gradient" ? 1 : 0;
      if (!settings.material) { data.height = data.amount = data.dispersion = 0; data.alpha = Math.max(.35,data.alpha); }
    } else if (role === "assistant") {
      data.blur=16; data.height=4; data.amount=8; data.alpha=dark ? .60 : .80;
    } else if (role === "dock") {
      data.blur=1.3*settings.chromeBlur/100; data.height=10; data.amount=40; data.depth=0; data.highlight=.07;
    } else if (role === "lens") {
      data.blur=0; data.height=12; data.amount=17; data.alpha=.1; data.depth=0; data.highlight=.07;
    } else if (role === "popup" || role === "panel") {
      data.blur=8; data.height=12; data.amount=24; data.alpha=role === "popup" ? .15 : .34;
    } else if (role === "dialog") {
      data.blur=16; data.height=4; data.amount=8; data.alpha=dark ? .74 : .65;
    } else if (role === "settings") {
      data.blur=16; data.height=0; data.amount=0; data.alpha=dark ? .8 : .73;
    } else if (role === "accent") {
      data.tint=accent; data.alpha=.58; data.height=12; data.amount=24;
    }
    if (settings.level===0) data.height=data.amount=data.dispersion=0;
    return data;
  }
  function scan(root = document) {
    const found = [...root.querySelectorAll(".g")];
    if (root instanceof Element && root.matches(".g")) found.unshift(root);
    for (const element of found) {
      if (surfaces.has(element)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      canvas.className = "glass-surface";
      canvas.setAttribute("aria-hidden", "true");
      const context = available ? canvas.getContext("2d") : null;
      if (available) element.prepend(canvas);
      surfaces.set(element, {
        id: ++nextSurfaceId, canvas, context, role: element.dataset.role || "pill",
        page: element.closest(".page"),
        portal: element.closest(".appearance-layer,.dialog-layer,.popover-layer"),
        dock: element.closest(".dock-wrap"),
        materialKey: "", renderKey: "", serial: 0, rect: null,
      });
    }
    for (const [element, record] of surfaces) {
      if (element.isConnected) continue;
      record.canvas.remove();
      surfaces.delete(element);
      removeTextures("lens:" + record.id);
    }
    invalidate();
  }
  function removeTextures(domain) {
    for (const [key, record] of textures) {
      if (record.domain !== domain) continue;
      gl?.deleteTexture?.(record.texture);
      textures.delete(key);
    }
  }
  function textureBytes() {
    let total = 0;
    for (const record of textures.values()) total += record.width * record.height * 4;
    return total;
  }
  function getTexture(base, blur, epoch, domain) {
    const key = domain + ":" + blur.toFixed(1);
    let record = textures.get(key);
    if (record && record.epoch === epoch) {
      textures.delete(key);
      textures.set(key, record);
      return record.texture;
    }
    const bitmap = typeof base === "function" ? base() : base;
    const scale = Math.min(1, Math.sqrt(SAMPLE_PIXELS / (bitmap.width * bitmap.height)));
    const w = Math.max(1, Math.floor(bitmap.width * scale));
    const h = Math.max(1, Math.floor(bitmap.height * scale));
    if (textureScratch.width !== w) textureScratch.width = w;
    if (textureScratch.height !== h) textureScratch.height = h;
    textureContext.clearRect(0, 0, w, h);
    textureContext.filter = blur > 0 ? `blur(${blur * w / width}px)` : "none";
    textureContext.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, w, h);
    textureContext.filter = "none";
    if (!record) {
      record = { texture: gl.createTexture(), domain, width: 0, height: 0, epoch: null };
      gl.bindTexture(gl.TEXTURE_2D, record.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else gl.bindTexture(gl.TEXTURE_2D, record.texture);
    if (record.width === w && record.height === h) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureScratch);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureScratch);
    }
    counters.textureUploads++;
    record.width = w;
    record.height = h;
    record.epoch = epoch;
    textures.delete(key);
    textures.set(key, record);
    while (textures.size > 12 || textureBytes() > TEXTURE_BYTES) {
      const oldest = textures.keys().next().value;
      if (oldest === key && textures.size === 1) break;
      gl.deleteTexture(textures.get(oldest).texture);
      textures.delete(oldest);
    }
    return record.texture;
  }
  const locationCache = new Map();
  function uniform(name) { if (!locationCache.has(name)) locationCache.set(name,gl.getUniformLocation(program,name)); return locationCache.get(name); }
  function releaseSurface(element, record) {
    record.rect = null;
    record.renderKey = "";
    if (record.canvas.width > 1 || record.canvas.height > 1) record.canvas.width = record.canvas.height = 1;
    if (element.classList.contains("glass-ready")) element.classList.remove("glass-ready");
  }
  function measure(element, record) {
    if (record.page && !record.page.classList.contains("active") ||
        record.portal && (record.portal.hidden || !record.portal.classList.contains("popover-layer") && !record.portal.classList.contains("open")) ||
        record.dock?.classList.contains("hidden") || element.closest("[hidden]")) {
      releaseSurface(element, record);
      return null;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) {
      releaseSurface(element, record);
      return null;
    }
    record.rect = rect;
    return rect;
  }
  function ensureStage(w, h) {
    let resized = false;
    if (stage.width < w) { stage.width = Math.ceil(w / 64) * 64; resized = true; }
    if (stage.height < h) { stage.height = Math.ceil(h / 64) * 64; resized = true; }
    if (resized) counters.stageResizes++;
  }
  function drawSurface(element, record, rect, base = source, epoch = sourceEpoch, domain = "wall") {
    const materialKey = [materialRevision, element.dataset.role, element.dataset.colorIndex, element.dataset.radius, element.dataset.state].join(":");
    if (record.materialKey !== materialKey) {
      record.material = materialFor(element);
      record.materialKey = materialKey;
      const drawKey = JSON.stringify(record.material);
      if (record.materialDrawKey !== drawKey) {
        record.materialDrawKey = drawKey;
        element.style.setProperty("--role-blur", record.material.blur + "px");
        element.style.setProperty("--surface-color", `rgba(${record.material.tint.map(x => Math.round(x * 255)).join(",")},${record.material.alpha})`);
      }
    }
    const material = record.material;
    const radius = material.role === "course" ? Math.min(settings.cardRadius, rect.width / 2, rect.height / 2) :
      Math.min(Number(element.dataset.radius) || 22, rect.width / 2, rect.height / 2);
    if (record.radius !== radius) { element.style.setProperty("--radius", radius + "px"); record.radius = radius; }
    if (!available || !record.context?.drawImage) return false;
    const key = [domain, epoch, record.materialDrawKey, rect.left, rect.top, rect.width, rect.height, radius, ratio].join("|");
    if (record.renderKey === key && element.classList.contains("glass-ready")) return false;
    const w = Math.max(1, Math.round(rect.width * ratio)), h = Math.max(1, Math.round(rect.height * ratio));
    ensureStage(w, h);
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, getTexture(base, material.blur, epoch, domain));
    gl.uniform1i(uniform("content"), 0);
    gl.uniform2f(uniform("screen"), width, height);
    gl.uniform4f(uniform("rect"), rect.left, rect.top, rect.width, rect.height);
    gl.uniform1f(uniform("radius"), radius);
    gl.uniform4f(uniform("material"), material.height, material.amount, material.depth, material.dispersion);
    gl.uniform4f(uniform("tint"), ...material.tint, material.alpha);
    gl.uniform1f(uniform("gradientTint"), material.gradient);
    gl.uniform1f(uniform("highlightAlpha"), material.highlight);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    counters.draws++;
    if (record.canvas.width !== w) record.canvas.width = w;
    if (record.canvas.height !== h) record.canvas.height = h;
    record.context.clearRect(0, 0, w, h);
    // WebGL's viewport starts at the bottom-left of the reusable draw buffer.
    record.context.drawImage(stage, 0, stage.height - h, w, h, 0, 0, w, h);
    record.renderKey = key;
    record.serial++;
    element.classList.add("glass-ready");
    return true;
  }
  function clipMain(context, top) {
    context.beginPath();
    context.rect(0, top, width, Math.max(0, height - top));
    context.clip();
  }
  function mainClipTop() {
    const header = document.querySelector(".detail-bar:not([hidden]),.top-bar:not([hidden])");
    return header ? Math.max(0, Math.min(height, header.getBoundingClientRect().bottom)) : 0;
  }
  function recordText(clipTop) {
    if (!textDirty || !textContext?.drawImage) return;
    textContext.clearRect(0, 0, textSource.width, textSource.height);
    if (document.createRange && window.getComputedStyle) {
      const root = document.getElementById("app-scene");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node, glyphs = 0;
      textContext.save();
      textContext.scale(ratio, ratio);
      while ((node = walker.nextNode()) && glyphs < 2400) {
        const parent = node.parentElement, text = node.textContent;
        if (!parent || !text.trim() || parent.closest("[hidden],canvas,script,style")) continue;
        const insideMain = !!parent.closest("#main");
        const visibleTop = insideMain ? clipTop : 0;
        if (![...parent.getClientRects()].some(rect => rect.width > 0 && rect.bottom > visibleTop && rect.top < height && rect.right > 0 && rect.left < width)) continue;
        const style = getComputedStyle(parent);
        if (style.visibility === "hidden" || style.display === "none") continue;
        textContext.fillStyle = style.color;
        textContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        textContext.textBaseline = "alphabetic";
        textContext.save();
        if (insideMain) clipMain(textContext, clipTop);
        const range = document.createRange();
        for (let index = 0; index < text.length && glyphs < 2400; index++) {
          range.setStart(node, index); range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          counters.glyphReads++;
          if (rect.width < .1 || rect.bottom < 0 || rect.top > height) continue;
          textContext.fillText(text[index], rect.left, rect.top + parseFloat(style.fontSize) * .86);
          glyphs++;
        }
        range.detach?.();
        textContext.restore();
      }
      textContext.restore();
    }
    counters.textRecords++;
    textDirty = false;
  }
  // The portal samples only its lower domain; text is recorded separately from glass.
  function recordScene(main) {
    if (!sceneDirty || !sceneContext?.drawImage) return;
    sceneContext.clearRect(0, 0, scene.width, scene.height);
    sceneContext.drawImage(source, 0, 0);
    const clipTop = mainClipTop();
    for (const [element, record, rect] of main) {
      if (!element.classList.contains("glass-ready")) continue;
      sceneContext.save();
      sceneContext.scale(ratio, ratio);
      if (record.page) clipMain(sceneContext, clipTop);
      sceneContext.drawImage(record.canvas, rect.left, rect.top, rect.width, rect.height);
      sceneContext.restore();
    }
    recordText(clipTop);
    sceneContext.drawImage(textSource, 0, 0);
    sceneEpoch++;
    counters.sceneRecords++;
    sceneDirty = false;
  }
  function paint(time) {
    frame = 0;
    if (hidden) return;
    counters.frames++;
    dimensions(); rebuildSource();
    try {
      const main = [], lenses = [], portals = [];
      for (const [element, record] of surfaces) {
        const rect = measure(element, record);
        if (!rect) continue;
        const group = record.portal ? portals : record.role === "lens" ? lenses : main;
        group.push([element, record, rect]);
      }
      let geometryChanged = false;
      for (const [element, record, rect] of main) {
        const geometry = [rect.left, rect.top, rect.width, rect.height].join(":");
        if (record.geometry !== geometry) { geometryChanged = true; record.geometry = geometry; }
        if (drawSurface(element, record, rect)) sceneDirty = true;
      }
      if (geometryChanged) textDirty = true;
      for (const [element, record, rect] of lenses) {
        const parent = surfaces.get(element.parentElement);
        if (!available || !parent?.rect || !lensContext?.drawImage) { drawSurface(element, record, rect); continue; }
        const epoch = sourceEpoch + ":" + parent.serial;
        const base = () => {
          lensContext.clearRect(0, 0, lensSource.width, lensSource.height);
          lensContext.drawImage(source, 0, 0);
          const r = parent.rect;
          lensContext.drawImage(parent.canvas, r.left * ratio, r.top * ratio, r.width * ratio, r.height * ratio);
          counters.lensRecords++;
          return lensSource;
        };
        if (drawSurface(element, record, rect, base, epoch, "lens:" + parent.id)) sceneDirty = true;
      }
      if (portals.length && available) {
        recordScene([...main, ...lenses]);
        for (const [element, record, rect] of portals) drawSurface(element, record, rect, scene, sceneEpoch, "scene");
      } else if (!available) {
        for (const [element, record, rect] of portals) drawSurface(element, record, rect);
      }
    } catch (_) { fallback(); }
    if (time < until && motionAllowed()) invalidate();
  }
  function setTheme(value, name) {
    const next = value === "dark" ? "dark" : "light", color = ACCENTS[name] || ACCENTS.blue;
    if (theme === next && color === accent) return;
    const themeChanged = theme !== next;
    theme = next; accent = color; materialRevision++;
    if (themeChanged) sourceDirty = true;
    sceneDirty = textDirty = true;
    invalidate();
  }
  function setLevel(value) {
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    if (settings.level === next) return;
    settings.level = next;
    settingsKey = JSON.stringify(settings);
    materialRevision++; sceneDirty = true;
    invalidate();
  }
  function setWallOptions(options) {if(Object.entries(options).every(([key,value])=>wall[key]===value))return;wall={...wall,...options};wall.blur=Math.max(0,Math.min(100,Number(wall.blur)||0));wall.brightness=Math.max(.35,Math.min(1,Number(wall.brightness)||1));wall.scale=Math.max(1,Math.min(4,Number(wall.scale)||1));sourceDirty=true;invalidate();}
  function setWallpaper(value) {if(image===value)return;image=value;sourceDirty=true;if(!backgroundContext?.drawImage) {document.body.style.backgroundImage=value?`url("${value.src}")`:"none";document.body.style.backgroundSize="cover";document.body.style.backgroundAttachment="fixed";}invalidate();}
  function configure(options) {
    const next = { ...settings, ...options }, key = JSON.stringify(next);
    if (settingsKey === key) return;
    settings = next; settingsKey = key;
    materialRevision++; sceneDirty = true;
    invalidate();
  }
  function paletteFromWallpaper() {
    if (!image || !sourceContext?.getImageData) return settings.palette.slice();
    const tiny=document.createElement("canvas");tiny.width=32;tiny.height=32;const c=tiny.getContext("2d");c.drawImage(image,0,0,32,32);
    const data=c.getImageData(0,0,32,32).data,buckets=new Map();
    for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(Math.max(r,g,b)<45||Math.min(r,g,b)>235)continue;const key=[r>>5,g>>5,b>>5].join(",");const old=buckets.get(key)||{count:0,r:0,g:0,b:0};old.count++;old.r+=r;old.g+=g;old.b+=b;buckets.set(key,old);}
    const colors=[...buckets.values()].sort((a,b)=>b.count-a.count).slice(0,6).map(x=>"#"+[x.r,x.g,x.b].map(v=>Math.round(v/x.count*.72+255*.28).toString(16).padStart(2,"0")).join(""));
    return colors.length ? colors : settings.palette.slice();
  }
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    sceneDirty = textDirty = true;
    invalidate();
  }) : null;
  const mutationObserver = typeof MutationObserver === "function" ? new MutationObserver(records => {
    let structural = false, dirty = false, underlay = false;
    for (const record of records) {
      if (record.target instanceof Element && record.target.matches("canvas")) continue;
      if (record.type === "childList") {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length && nodes.every(node => node instanceof Element && node.matches("canvas.glass-surface"))) continue;
        if (nodes.some(node => node instanceof Element && (node.matches(".g") || node.querySelector(".g")))) structural = true;
      }
      dirty = true;
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest("#app-scene,.dock-wrap")) underlay = true;
    }
    if (!dirty) return;
    if (structural) scan();
    if (underlay) sceneDirty = textDirty = true;
    invalidate();
  }) : null;
  initialize(); if (!available) fallback(); scan();
  resizeObserver?.observe(document.documentElement);
  for (const id of ["app-scene", "dock-wrap", "appearance-layer", "dialog-layer", "quick-layer"]) {
    mutationObserver?.observe(document.getElementById(id), {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ["hidden", "aria-pressed", "aria-checked", "data-state", "data-role", "data-color-index"],
    });
  }
  for (const name of ["resize", "orientationchange"]) window.addEventListener(name, () => {
    sourceDirty = sceneDirty = textDirty = true;
    invalidate(500);
  }, { passive: true });
  document.addEventListener("scroll", () => {
    sceneDirty = textDirty = true;
    invalidate();
  }, { passive: true, capture: true });
  window.addEventListener("scroll", () => {
    sceneDirty = textDirty = true;
    invalidate();
  }, { passive: true });
  window.addEventListener("nova:page", event => {
    scan(); sceneDirty = textDirty = true;
    invalidate(event.detail?.animate ? 560 : 0);
  });
  for (const name of ["nova:dialog", "nova:overlay"]) window.addEventListener(name, () => {
    scan();
    invalidate();
  });
  document.addEventListener("visibilitychange", () => {
    hidden = document.visibilityState === "hidden";
    if (hidden) { cancelAnimationFrame(frame); frame = 0; until = 0; }
    else { sceneDirty = textDirty = true; invalidate(); }
  });
  stage.addEventListener("webglcontextlost", event => { event.preventDefault(); fallback(); });
  stage.addEventListener("webglcontextrestored", () => {
    available = !!gl;
    locationCache.clear(); textures.clear();
    initialize();
    if (available) {
      document.body.classList.remove("glass-flat");
      materialRevision++;
      for (const [element, record] of surfaces) {
        if (!record.canvas.isConnected) element.prepend(record.canvas);
        record.context = record.canvas.getContext("2d"); record.canvas.style.display = ""; record.renderKey = "";
      }
      sourceDirty = sceneDirty = textDirty = true;
      invalidate();
    }
  });
  window.NovaGlass = {
    scan, refresh: () => { sceneDirty = textDirty = true; invalidate(); }, invalidate,
    setTheme, setLevel, setWallOptions, setWallpaper, configure, paletteFromWallpaper, drawWallpaper,
    getWallpaper: () => image, reference: "kyant/backdrop · SleepDown 1.2.7_beta5",
    runtime: () => available ? "WebGL" : "CSS", materials: materialFor,
    stats: () => ({ ...counters, surfaces: surfaces.size, textureBytes: textureBytes() }),
  };
})();
