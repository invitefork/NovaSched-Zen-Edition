/* Render scheduling tests. Canvas/WebGL calls are counted, not timed as phone FPS. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {setTimeout: nativeTimeout} = require('node:timers');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'module-template/webroot');

async function main() {
  const {parseHTML} = await import('./test-support/linkedom.mjs');
  function host(code) {
    const {window: domWindow, document} = parseHTML(fs.readFileSync(path.join(web, 'index.html'), 'utf8'));
    const window = Object.create(domWindow);
    Object.defineProperties(window, {window:{value:window}, self:{value:window}, globalThis:{value:window}, document:{value:document}, NovaGlass:{value:undefined,writable:true,configurable:true}});
    const frames = new Map(), offsets = new Map();
    let time = 0, nextFrame = 0, nextTexture = 0, currentTexture = null, stage = null;
    const metrics = {draws:0, uploads:0, creates:0, resizes:0, glyphReads:0, cropCopies:0};
    const texSize = new Map();
    function rect(x,y,width,height) { return {x,y,left:x,top:y,width,height,right:x+width,bottom:y+height}; }
    window.HTMLElement.prototype.getBoundingClientRect = function() {
      const page = this.closest('.page'), portal = this.closest('.appearance-layer,.dialog-layer,.popover-layer');
      if (this.closest('[hidden]') || page && !page.classList.contains('active') || portal && !portal.classList.contains('popover-layer') && !portal.classList.contains('open')) return rect(0,0,0,0);
      let r;
      const role = this.dataset.role;
      if (this.classList.contains('top-bar')) r = rect(0,0,393,66);
      else if (this.classList.contains('dock')) r = rect(60,790,210,54);
      else if (this.classList.contains('dock-indicator')) r = rect(64,794,67.3,46);
      else if (this.id === 'dock-add') r = rect(278,790,54,54);
      else if (this.id === 'nav-cta') r = rect(145,82,100,32);
      else if (role === 'assistant') r = rect(16,130,361,148);
      else if (role === 'course') r = rect(16,340+(Number(this.dataset.colorIndex)||0)*160,361,130);
      else if (role === 'pill') r = this.classList.contains('chrome-btn') ? rect(290,12,42,42) : rect(16,310,145,34);
      else if (role === 'popup') r = rect(149,90,228,248);
      else if (role === 'dialog') r = rect(54,240,286,250);
      else r = rect(16,100,361,100);
      if (this.closest('#main')) r = rect(r.x, r.y-window.scrollY, r.width, r.height);
      return rect(r.x+(offsets.get(this)||0), r.y, r.width, r.height);
    };
    window.HTMLElement.prototype.getClientRects = function() {const r=this.getBoundingClientRect();return r.width?[r]:[];};
    document.createRange = () => {
      let node, index;
      return {setStart(value,offset){node=value;index=offset;},setEnd(){},detach(){},getBoundingClientRect(){metrics.glyphReads++;const p=node.parentElement.getBoundingClientRect();return rect(p.x+index*7,p.y,7,14);}};
    };
    const twoD = canvas => ({
      save(){},restore(){},clearRect(){},fillRect(){},scale(){},fillText(){},beginPath(){},rect(){},clip(){},
      drawImage(source,...args) {
        if (source !== stage || args.length !== 8) return;
        const [x,y,w,h,dx,dy,dw,dh] = args;
        assert(x>=0 && y>=0 && x+w<=stage.width && y+h<=stage.height, 'copy lies outside shared draw buffer');
        assert.equal(dw,canvas.width); assert.equal(dh,canvas.height); assert.equal(dx,0);assert.equal(dy,0);
        metrics.cropCopies++;
      },
      getImageData:()=>({data:new Uint8ClampedArray(4096)}),
    });
    const gl = {
      VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,
      UNPACK_FLIP_Y_WEBGL:8,TEXTURE_2D:9,TEXTURE_MIN_FILTER:10,TEXTURE_MAG_FILTER:11,TEXTURE_WRAP_S:12,TEXTURE_WRAP_T:13,
      LINEAR:14,CLAMP_TO_EDGE:15,RGBA:16,UNSIGNED_BYTE:17,TEXTURE0:18,TRIANGLES:19,
      createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
      createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
      createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},pixelStorei(){},
      getUniformLocation:()=>0,uniform1i(){},uniform1f(){},uniform2f(){},uniform4f(){},activeTexture(){},texParameteri(){},viewport(){},
      createTexture(){metrics.creates++;return ++nextTexture;},
      bindTexture(target,texture){currentTexture=texture;},deleteTexture(texture){texSize.delete(texture);},
      texImage2D(...args){metrics.uploads++;const source=args.at(-1);texSize.set(currentTexture,source.width*source.height*4);},
      texSubImage2D(...args){metrics.uploads++;const source=args.at(-1);texSize.set(currentTexture,source.width*source.height*4);},
      drawArrays(){metrics.draws++;},
    };
    window.HTMLCanvasElement.prototype.getContext = function(kind) {
      if (kind !== 'webgl') return twoD(this);
      stage=this;
      let w=300,h=150;
      Object.defineProperties(stage,{width:{configurable:true,get:()=>w,set:value=>{w=value;metrics.resizes++;}},height:{configurable:true,get:()=>h,set:value=>{h=value;metrics.resizes++;}}});
      return gl;
    };
    const bindings = {
      console, performance:{now:()=>time}, innerWidth:393, innerHeight:852, devicePixelRatio:2, scrollY:0,
      NodeFilter:{SHOW_TEXT:4},
      matchMedia:()=>({matches:false,addEventListener(){}}),
      requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
      getComputedStyle:()=>({color:'#111',fontSize:'14px',fontFamily:'sans-serif',fontWeight:'500',visibility:'visible',display:'block'}),
      ResizeObserver:class {observe(){}},
    };
    for (const [name,value] of Object.entries(bindings)) Object.defineProperty(window,name,{value,writable:true,configurable:true});
    let visibility='visible';
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
    const context=vm.createContext(window);
    vm.runInContext(code,context,{filename:'liquid-glass.js'});
    function step(count=1) {
      for(let n=0;n<count;n++){
        time+=16;
        const callbacks=[...frames.values()];frames.clear();
        callbacks.forEach(fn=>fn(time));
      }
    }
    async function flush(count=1) {await new Promise(resolve=>nativeTimeout(resolve,0));step(count);}
    return {window,document,frames,metrics,offsets,stage:()=>stage,step,flush,bytes:()=>[...texSize.values()].reduce((a,b)=>a+b,0),visibility(value){visibility=value;document.dispatchEvent(new window.Event('visibilitychange'));}};
  }
  const code=fs.readFileSync(path.join(web,'assets/liquid-glass.js'),'utf8');
  const h=host(code), g=h.window.NovaGlass;
  await h.flush(2);
  assert.equal(g.runtime(),'WebGL');
  const cold={...h.metrics};
  g.invalidate(720); h.step(50);
  assert.equal(h.metrics.draws,cold.draws,'static animation ticks must reuse existing surfaces');
  assert.equal(h.metrics.uploads,cold.uploads,'static ticks must retain textures');
  assert.equal(h.metrics.resizes,cold.resizes,'static ticks must retain the draw buffer');
  assert.equal(h.frames.size,0,'idle renderer must stop scheduling frames');
  console.log('PASS static frames: zero additional draws, texture uploads or draw-buffer resizes');

  const indicator=h.document.querySelector('.dock-indicator');
  const movingStart={...h.metrics}, lensStart=g.stats().lensRecords;
  for(let i=1;i<=12;i++){h.offsets.set(indicator,i*3);g.invalidate();h.step();}
  assert.equal(h.metrics.draws-movingStart.draws,12);
  assert.equal(h.metrics.uploads,movingStart.uploads,'moving lens uses existing parent texture');
  assert.equal(g.stats().lensRecords,lensStart,'moving lens must not recapture viewport');
  assert.equal(h.metrics.resizes,movingStart.resizes,'moving lens must not resize the shared draw buffer');
  console.log('PASS moving indicator: one changed surface per tick, no backdrop re-recording');

  const changedStart={...h.metrics};
  const visibleCourses=h.document.querySelectorAll('.page.active .g[data-role=course]').length;
  assert(visibleCourses>0,'overview must show course surfaces');
  g.configure({cardAlpha:60});h.step();
  const tintDraws=h.metrics.draws-changedStart.draws;
  assert(tintDraws>0 && tintDraws<=visibleCourses,'card tint must repaint only course surfaces (simulated viewport culls some) and leave controls cached');
  assert.equal(h.metrics.uploads,changedStart.uploads,'tint-only updates must retain blurred textures');
  console.log('PASS card tint: only visible course surfaces repainted, no texture upload');

  h.document.querySelector('#appearance-layer').classList.add('open');
  h.window.dispatchEvent(new h.window.Event('nova:overlay'));
  await h.flush(2);
  const popupStart={...h.metrics}, textStart=g.stats().textRecords;
  const popup=h.document.querySelector('#personal-panel');
  for(let i=1;i<=12;i++){h.offsets.set(popup,i);g.invalidate();h.step();}
  assert.equal(h.metrics.draws-popupStart.draws,12);
  assert.equal(h.metrics.glyphReads,popupStart.glyphReads,'portal motion must retain underlay text');
  assert.equal(g.stats().textRecords,textStart);
  assert.equal(h.metrics.uploads,popupStart.uploads);
  h.document.querySelector('#personal-panel .personal-title h2').textContent='面板文本已更新';
  await h.flush(2);
  assert.equal(g.stats().textRecords,textStart,'portal-local text cannot dirty underlay');
  console.log('PASS popup motion and local edits: cached underlay text and texture reused');

  const beforeWall={...h.metrics};
  g.setWallOptions({brightness:.8});h.step();
  assert(h.metrics.uploads>beforeWall.uploads);
  assert.equal(h.metrics.creates,beforeWall.creates,'new backdrop pixels must reuse existing texture objects');
  assert(g.stats().textureBytes<=24*1024*1024);
  assert.equal(h.metrics.glyphReads,popupStart.glyphReads,'wall brightness cannot dirty text layout');
  console.log('PASS wallpaper update: texture objects reused, cache stays within byte budget');

  const sameStart={...h.metrics};
  g.setWallOptions({brightness:.8});g.configure({cardAlpha:60});g.invalidate();h.step();
  assert.equal(h.metrics.draws,sameStart.draws,'unchanged settings must retain painted surfaces');
  assert.equal(h.metrics.uploads,sameStart.uploads,'unchanged settings must retain backdrop pixels');
  for(let blur=1;blur<=18;blur++){
    g.configure({cardBlur:blur});h.step();
    assert(g.stats().textureBytes<=24*1024*1024,'blur slider must respect texture byte budget');
    assert.equal(g.stats().textureBytes,h.bytes(),'texture accounting must match live allocations');
  }
  console.log('PASS unchanged settings and repeated blur changes: no redundant draw, bounded texture cache');

  h.visibility('hidden');g.invalidate(720);h.step(5);
  assert.equal(h.frames.size,0);
  h.visibility('visible');await h.flush(2);assert.equal(g.runtime(),'WebGL');
  const lost=new h.window.Event('webglcontextlost');
  h.stage().dispatchEvent(lost);assert.equal(g.runtime(),'CSS');
  h.stage().dispatchEvent(new h.window.Event('webglcontextrestored'));await h.flush(2);
  assert.equal(g.runtime(),'WebGL');assert(!h.document.body.classList.contains('glass-flat'));
  assert(h.metrics.cropCopies>0);
  console.log('PASS visibility, context restoration and bounded region copies');

  const comparison=process.argv.indexOf('--compare');
  if(comparison>=0){
    const old=host(fs.readFileSync(path.resolve(process.argv[comparison+1]),'utf8'));
    await old.flush(2);old.window.NovaGlass.invalidate(720);old.step(50);
    const newer=host(code);await newer.flush(2);newer.window.NovaGlass.invalidate(720);newer.step(50);
    assert(old.metrics.draws>0 && newer.metrics.draws>0,'both comparison engines must render');
    console.log('BENCH simulated initial frame + static 720ms window:',JSON.stringify({before:old.metrics,after:newer.metrics}));
  }
  console.log('PASS scheduling regression; counts describe simulated WebGL calls, not real-device FPS.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
