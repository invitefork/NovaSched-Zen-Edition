/* Exercise real app and vendor scripts against a synthetic service, without a phone. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const mockHost=require('./webui-fixture.cjs');
const web=path.resolve(__dirname,'../module-template/webroot');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const scripts=['assets/liquid-glass.js','assets/app.js'].map(file=>fs.readFileSync(path.join(web,file),'utf8'));
async function until(condition){
  const end=Date.now()+3000;
  while(!condition()){if(Date.now()>end)throw new Error('Timed out waiting for DOM state');await new Promise(r=>setTimeout(r,10));}
}
async function fixture(options){
  const errors=[];const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{url:'http://127.0.0.1:8765/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;
  w.matchMedia=query=>({matches:query.includes('prefers-reduced-motion'),addEventListener(){}});
  w.scrollTo=()=>{};
  const frames=new Set(); let closed=false;
  w.requestAnimationFrame=callback=>{if(closed)return 0;const id=setTimeout(()=>{frames.delete(id);if(!closed)callback(Date.now());},16);frames.add(id);return id;};
  w.cancelAnimationFrame=id=>{clearTimeout(id);frames.delete(id);};
  const cleanup=()=>{closed=true;frames.forEach(clearTimeout);dom.window.close();};
  w.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=this.closest('.page'),dialog=this.closest('#dialog-layer');
    const visible=(!page||page.classList.contains('active'))&&(!dialog||dialog.classList.contains('open'));
    return {x:0,y:0,left:0,top:0,right:visible?320:0,bottom:visible?100:0,width:visible?320:0,height:visible?100:0};
  };
  w.HTMLElement.prototype.getClientRects=function(){return this.getBoundingClientRect().width?[this.getBoundingClientRect()]:[];};
  w.HTMLCanvasElement.prototype.getContext=function(){return {createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData(){}};};
  w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  w.eval(`(${mockHost.toString()})(${JSON.stringify(options)});`);
  scripts.forEach(script=>w.eval(script));
  await until(()=>['已连接','外部接管'].includes(w.document.querySelector('#nav-cta-text').textContent));
  await until(()=>w.document.querySelectorAll('#rule-list .rule-row').length===1);
  return {dom,w,d:w.document,errors,cleanup};
}
function click(d,selector){const node=d.querySelector(selector);assert(node,selector+' missing');assert(!node.disabled,selector+' disabled');node.click();}
async function main(){
  for(const options of [{linked:true,automatic:true,presence:'available'},{presence:'absent'},{presence:'unknown'},{external:true,presence:'available'},{root:true,presence:'absent'},{labels:false,presence:'absent'}]){
    const {dom,w,d,errors,cleanup}=await fixture(options);
    try{
      assert.equal(d.querySelector('#stat-pkg-raw').textContent,'com.omarea.vtools');
      if(options.linked){assert.equal(d.querySelector('#stat-scene').textContent,'Scene 联动中');assert(d.querySelector('#auto-switch').disabled);assert.equal(d.querySelector('#hero-auto').textContent,'Scene 正在控制档位');}
      if(options.presence==='unknown')assert.equal(d.querySelector('#stat-scene').textContent,'Scene 检测暂不可用');
      if(options.presence==='absent')assert.equal(d.querySelector('#stat-scene').textContent,'WebUI 接管');
      for(const tab of ['modes','rules','logs','about']){click(d,`.dock button[data-page="${tab}"]`);assert.equal(d.querySelector('.page.active').id,'page-'+tab);if(tab==='logs')await until(()=>d.querySelectorAll('#log-list article').length>=2);}
      click(d,'[data-theme-choice="dark"]');assert.equal(d.documentElement.dataset.theme,'dark');
      const slider=d.querySelector('#glass-level');slider.value='90';slider.dispatchEvent(new w.Event('input'));slider.dispatchEvent(new w.Event('change'));
      assert.equal(d.querySelector('#glass-value').textContent,'90');assert.equal(d.documentElement.style.getPropertyValue('--glass-blur'),'44.4px');
      click(d,'.dock button[data-page="modes"]');
      if(options.external)assert(d.querySelector('[data-mode="fast"]').disabled);
      else{
        click(d,'[data-mode="fast"]');await until(()=>d.querySelector('[data-mode="fast"]').dataset.state==='active');
        assert.equal(w.fixture.effective,'fast');
        click(d,'.dock button[data-page="rules"]');click(d,'#add-rule');
        const input=d.querySelector('#dialog-input');input.value='invalid name';click(d,'#dialog-save');assert(!d.querySelector('#dialog-error').hidden);
        input.value='com.example.test';click(d,'[data-chip="performance"]');click(d,'#dialog-save');
        await until(()=>!d.querySelector('#dialog-layer').classList.contains('open'));assert.equal(d.querySelectorAll('.rule-row').length,2);
        click(d,'[data-edit="com.example.test"]');click(d,'#dialog-delete');click(d,'#dialog-confirm');
        await until(()=>!d.querySelector('#dialog-layer').classList.contains('open'));assert.equal(d.querySelectorAll('.rule-row').length,1);
      }
      click(d,'.dock button[data-page="overview"]');click(d,'#scene-diagnose');
      assert(d.querySelector('main').inert);click(d,'#dialog-run');await until(()=>!d.querySelector('#dialog-report').hidden);
      assert(d.querySelector('#dialog-report').textContent.includes('scene_presence=available'));
      click(d,'#scene-register');await until(()=>!d.querySelector('#scene-register').disabled);
      assert(w.fixture.commands.some(command=>command.includes('scene-install --module-dir')));
      d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.querySelector('#dialog-layer').getAttribute('aria-hidden'),'true');assert.equal(d.querySelector('main').inert,false);
      if(options.labels===false){w.fixture.pkg='com.example.no_label';w.fixturePush();await until(()=>d.querySelector('#stat-pkg').textContent==='com.example.no_label');assert.equal(d.querySelector('#stat-pkg-raw').textContent,'com.example.no_label');}
      await new Promise(r=>setTimeout(r,30));
      /* jsdom 没有 WebGL：渲染器必须安静退回 CSS 毛玻璃，页面零报错 */
      assert(d.body.classList.contains('glass-flat'));
      assert.equal(d.querySelector('#glass-canvas').style.display,'none');
      assert.deepEqual(errors,[]);console.log('PASS: DOM',JSON.stringify(options));
    }finally{cleanup();}
  }
  console.log('PASS: navigation, Scene priority, full package fallback, mode changes, rule CRUD, diagnostics, themes, original glass script integration');
  console.log('Geometry/canvas are synthetic; this is interaction verification, not a pixel rendering check.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
