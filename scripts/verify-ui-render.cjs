/* Browser regression checks use mock local state; they do not contact a phone. */
'use strict';
const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'), web=path.join(root,'module-template/webroot'), output=path.join(root,'ui-preview');
const mockHost=require('./webui-fixture.cjs');

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    const file=path.resolve(web,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(web+path.sep))return response.writeHead(403).end();
    const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
    try{response.setHeader('Content-Type',mime);response.end(fs.readFileSync(file));}catch{response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const address=`http://127.0.0.1:${server.address().port}/`;
    async function pageFor(options,width=393){
      const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:1,reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(mockHost,options);await page.goto(address);
      await page.waitForFunction(()=>document.querySelector('#nav-cta-text').textContent==='已连接'||document.querySelector('#nav-cta-text').textContent==='外部接管');
      await page.waitForTimeout(100);
      return {page,errors};
    }
    for(const width of [320,393,768]){
      const {page,errors}=await pageFor({presence:'available',linked:true,automatic:true},width);
      assert.equal(await page.locator('#stat-pkg').textContent(),'Scene');
      assert.equal(await page.locator('#stat-pkg-raw').textContent(),'com.omarea.vtools');
      assert.equal(await page.locator('#stat-scene').textContent(),'Scene 联动中');
      await page.screenshot({path:path.join(output,`overview-${width}.png`),fullPage:true});
      for(const tab of ['modes','rules','logs','about']){
        await page.locator(`.dock button[data-page="${tab}"]`).click();
        await page.waitForTimeout(60);
        assert.equal(await page.locator('.page.active').getAttribute('id'),'page-'+tab);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+tab+' overflow');
        if(tab==='modes')assert(await page.locator('#auto-switch').isDisabled());
        if(tab==='rules')assert.equal(await page.locator('.rule-row').count(),1);
        if(tab==='logs'){/* WebGL 截图回读会拖慢事件循环，等待日志到达而不是固定睡眠 */
          await page.waitForFunction(()=>document.querySelectorAll('#log-list article').length>=2);
          assert.equal(await page.locator('#log-list article').count(),2);
        }
        await page.screenshot({path:path.join(output,`${tab}-${width}.png`),fullPage:true});
      }
      await page.locator('[data-theme-choice="dark"]').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      await page.locator('#glass-level').fill('90');
      assert.equal(await page.locator('#glass-value').textContent(),'90');
      await page.screenshot({path:path.join(output,`about-dark-${width}.png`),fullPage:true});
      /* 玻璃渲染器在无 GPU 的 headless 下允许退回 CSS 毛玻璃，但两条路径都不能报错 */
      const glassState=await page.evaluate(()=>({
        canvas:!!document.querySelector('#glass-canvas'),
        fallback:document.body.classList.contains('glass-flat'),
        dock:!!document.querySelector('.dock button[data-page="about"]'),
      }));
      assert(glassState.canvas && glassState.dock);
      assert.deepEqual(errors,[]);await page.close();console.log(`PASS: ${width}px, five pages, light/dark, Scene priority, glass ${glassState.fallback?'css-fallback':'webgl'}`);
    }
    for(const options of [{labels:false,presence:'available'},{root:true,presence:'absent'},{presence:'unknown'},{external:true,presence:'available'}]){
      const {page,errors}=await pageFor(options);
      if(options.labels===false)assert.equal(await page.locator('#stat-pkg').textContent(),'Scene');
      if(options.root)assert.equal(await page.locator('#stat-scene').textContent(),'WebUI 接管');
      if(options.presence==='unknown')assert.equal(await page.locator('#stat-scene').textContent(),'Scene 检测暂不可用');
      await page.locator('.dock button[data-page="modes"]').click();
      if(options.external)assert(await page.locator('[data-mode="fast"]').isDisabled());
      else{
        await page.locator('[data-mode="fast"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-mode="fast"]').dataset.state==='active');
        await page.locator('.dock button[data-page="rules"]').click();
        await page.locator('#add-rule').click();await page.locator('#dialog-input').fill('com.example.test');
        await page.locator('[data-chip="performance"]').click();await page.locator('#dialog-save').click();
        await page.waitForFunction(()=>!document.querySelector('#dialog-layer').classList.contains('open'));
        assert.equal(await page.locator('.rule-row').count(),2);
        await page.locator('[data-edit="com.example.test"]').click();await page.locator('#dialog-delete').click();await page.locator('#dialog-confirm').click();
        await page.waitForFunction(()=>!document.querySelector('#dialog-layer').classList.contains('open'));
        assert.equal(await page.locator('.rule-row').count(),1);
      }
      await page.locator('.dock button[data-page="overview"]').click();await page.locator('#scene-diagnose').click();
      await page.locator('#dialog-run').click();await page.waitForFunction(()=>!document.querySelector('#dialog-report').hidden);
      assert((await page.locator('#dialog-report').textContent()).includes('scene_presence=available'));
      await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog-layer').getAttribute('aria-hidden'),'true');
      assert.deepEqual(errors,[]);await page.close();console.log('PASS:',JSON.stringify(options),'state, mutations, diagnostics');
    }
    const {page,errors}=await pageFor({presence:'absent',labels:false});
    await page.evaluate(()=>{fixture.pkg='com.example.no_label';fixturePush();});
    await page.waitForFunction(()=>document.querySelector('#stat-pkg').textContent==='com.example.no_label');
    assert.equal(await page.locator('#stat-pkg-raw').textContent(),'com.example.no_label');
    assert.deepEqual(errors,[]);await page.close();
    console.log('PASS: unknown application retains its exact foreground package');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
