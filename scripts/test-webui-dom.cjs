/* Exercise the shipped UI against a synthetic service; no phone is contacted. */
'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {setTimeout:nativeTimeout, clearTimeout:nativeClearTimeout} = require('node:timers');
const root = path.resolve(__dirname,'..');
const mockHost = require('./webui-fixture.cjs');
const web = path.join(root,'module-template/webroot');
async function main() {
const {parseHTML} = await import('./test-support/linkedom.mjs');
function fixture(options) {
  const {window:domWindow, document:d} = parseHTML(fs.readFileSync(path.join(web,'index.html'),'utf8'));
  const w=Object.create(domWindow);
  Object.defineProperties(w,{window:{value:w},self:{value:w},globalThis:{value:w},document:{value:d}});
  const timers=new Set(), storage=new Map();
  const later=(fn,ms=0)=>{const id=nativeTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
  const cancel=id=>{nativeClearTimeout(id);timers.delete(id);};
  Object.defineProperty(w,"navigator",{value:{},configurable:true,writable:true});
  Object.assign(w,{console, URL, TextEncoder, TextDecoder, AbortController, performance, Date, Promise,
    location:{href:'http://127.0.0.1:8765/',origin:'http://127.0.0.1:8765',protocol:'http:',host:'127.0.0.1:8765',hostname:'127.0.0.1',pathname:'/'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    navigator:{vibrate(){},clipboard:{async writeText(text){w.copied=text;}}},
    innerWidth:393,innerHeight:852,devicePixelRatio:1,scrollY:0,scrollX:0,
    matchMedia:query=>({matches:query.includes('prefers-reduced-motion'),addEventListener(){}}),
    setTimeout:later,clearTimeout:cancel,setInterval,clearInterval,
    requestAnimationFrame:fn=>later(()=>fn(performance.now()),16),cancelAnimationFrame:cancel,
    scrollTo(options){w.scrollY=options.top||0;},
    Image:class {constructor(){this.naturalWidth=941;this.naturalHeight=1672;}set src(value){this._src=value;later(()=>this.onload?.());}get src(){return this._src;}},
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}}
  });
  const states=[];let cursor=-1;
  w.history={get state(){return states[cursor];},replaceState(state){states[cursor=Math.max(0,cursor)]=state;},pushState(state){states.splice(cursor+1);states[++cursor]=state;},back(){if(cursor<=0)return;cursor--;const event=new w.Event('popstate');event.state=states[cursor];later(()=>w.dispatchEvent(event));}};
  Object.defineProperty(d,'visibilityState',{value:'visible'});Object.defineProperty(d,'hidden',{value:false});d.activeElement=d.body;
  w.HTMLElement.prototype.focus=function(){d.activeElement=this;};
  w.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=this.closest('.page'),dialog=this.closest('.dialog-layer,.appearance-layer');
    const visible=(!page||page.classList.contains('active'))&&(!dialog||dialog.classList.contains('open'))&&!this.closest('[hidden]');
    return {x:0,y:0,left:0,top:0,right:visible?320:0,bottom:visible?100:0,width:visible?320:0,height:visible?100:0};
  };
  w.HTMLElement.prototype.getClientRects=function(){const r=this.getBoundingClientRect();return r.width?[r]:[];};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLCanvasElement.prototype.getContext=function(kind){
    if(kind==='webgl')return null;
    return {save(){},restore(){},clearRect(){},fillRect(){},drawImage(){},scale(){},fillText(){},getImageData:()=>({data:new Uint8ClampedArray(4096)})};
  };
  w.NovaGlass=undefined;
  const context=vm.createContext(w);
  vm.runInContext(`(${mockHost.toString()})(${JSON.stringify(options)})`,context);
  for(const file of ['liquid-glass.js','app.js'])vm.runInContext(fs.readFileSync(path.join(web,'assets',file),'utf8'),context,{filename:file});
  return {w,d,cleanup:()=>timers.forEach(nativeClearTimeout)};
}
async function until(fn){const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw new Error('Timed out waiting for UI state');await new Promise(resolve=>nativeTimeout(resolve,10));}}
const pause=()=>new Promise(resolve=>nativeTimeout(resolve,30));
function click(d,query){const node=d.querySelector(query);assert(node,query+' missing');assert(!node.disabled,query+' disabled');node.click();}
for(const options of [{linked:true,automatic:true,presence:'available'},{presence:'absent'},{presence:'unknown'},{external:true,presence:'available'},{root:true,presence:'absent'},{labels:false,presence:'absent'}]) {
  const {w,d,cleanup}=fixture(options);
  try {
    await until(()=>['已连接','外部接管'].includes(d.querySelector('#nav-cta-text').textContent));
    await until(()=>d.querySelectorAll('.rule-row').length===1);
    assert.equal(d.querySelectorAll('.dock button[data-page]').length,3);
    assert.equal(d.querySelector('#stat-pkg-raw').textContent,'com.omarea.vtools');
    if(options.linked)assert(d.querySelector('#auto-switch').disabled);
    if(options.presence==='unknown')assert.equal(d.querySelector('#stat-scene').textContent,'Scene 检测暂不可用');
    if(options.presence==='absent')assert.equal(d.querySelector('#stat-scene').textContent,'WebUI 接管');
    click(d,'.dock [data-page="about"]');click(d,'#appearance-settings');
    assert(d.querySelector('#appearance-layer').classList.contains('open'));
    click(d,'[data-theme-choice="dark"]');assert.equal(d.documentElement.dataset.theme,'dark');
    for(const [id,value,label,expected] of [['glass-level','90','glass-value','90'],['wall-bright','35','wall-bright-val','35%'],['card-alpha','18','card-alpha-val','18%'],['card-radius','34','card-radius-val','34']]){
      const slider=d.querySelector('#'+id);slider.value=value;slider.dispatchEvent(new w.Event('input'));slider.dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('#'+label).textContent,expected);
    }
    click(d,'[data-card-color="#ffbfd1"]');assert.equal(d.querySelector('[data-color-mode="solid"]').getAttribute('aria-pressed'),'true');
    click(d,'#dispersion-switch');assert.equal(d.querySelector('#dispersion-switch').getAttribute('aria-checked'),'false');
    click(d,'#personalize-close');await pause();
    click(d,'.dock [data-page="modes"]');
    if(options.external)assert(d.querySelector('[data-mode="fast"]').disabled);
    else {click(d,'[data-mode="fast"]');await until(()=>d.querySelector('[data-mode="fast"]').dataset.state==='active');assert.equal(w.fixture.effective,'fast');}
    click(d,'.dock [data-page="about"]');click(d,'.settings-group [data-page="rules"]');assert.equal(d.querySelector('.page.active').id,'page-rules');assert(d.querySelector('#dock-wrap').classList.contains('hidden'));
    if(!options.external){
      click(d,'#add-rule');const input=d.querySelector('#dialog-input');input.value='invalid name';click(d,'#dialog-save');assert(!d.querySelector('#dialog-error').hidden);
      input.value='com.example.test';click(d,'[data-chip="performance"]');click(d,'#dialog-save');await until(()=>!d.querySelector('#dialog-layer').classList.contains('open'));await pause();assert.equal(d.querySelectorAll('.rule-row').length,2);
      const search=d.querySelector('#rule-search');search.value='com.example.test';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.rule-row').length,1);
      click(d,'[data-edit="com.example.test"]');click(d,'#dialog-delete');click(d,'#dialog-confirm');await until(()=>!d.querySelector('#dialog-layer').classList.contains('open'));await pause();
      search.value='';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.rule-row').length,1);
    }
    click(d,'#detail-back');await until(()=>d.querySelector('.page.active').id==='page-about');
    click(d,'.dock [data-page="overview"]');click(d,'#scene-diagnose');assert(d.querySelector('main').inert);click(d,'#dialog-run');await until(()=>!d.querySelector('#dialog-report').hidden);assert(d.querySelector('#dialog-report').textContent.includes('scene_presence=available'));
    click(d,'#dialog-close');await pause();
    click(d,'.dock [data-page="about"]');click(d,'.settings-group [data-page="logs"]');await until(()=>d.querySelectorAll('#log-list article').length>=2);
    click(d,'#detail-back');await until(()=>d.querySelector('.page.active').id==='page-about');
    click(d,'#about-license');assert(d.querySelector('#dialog-body').textContent.includes('RuntimeShader'));click(d,'#dialog-close');
    assert(d.body.classList.contains('glass-flat'));
    console.log('PASS',JSON.stringify(options),'navigation, preferences, rules, diagnostics, logs, controller guards');
  } finally {cleanup();}
}

console.log('PASS: six service scenarios. DOM geometry and Canvas are synthetic; this is not pixel verification.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
