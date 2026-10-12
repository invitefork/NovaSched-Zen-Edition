const {chromium}=require('playwright-core');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:393,height:800},deviceScaleFactor:2});
  const errs=[];
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text());});
  await page.goto('file:///C:/Users/Administrator/Desktop/NovaSched-v2.2.7-source/%E6%B6%B2%E6%80%81%E7%8E%BB%E7%92%83-%E7%AC%AC%E4%B8%80%E6%AD%A5%E8%B4%A8%E6%84%9F%E9%AA%8C%E8%AF%81.html');
  await page.waitForTimeout(1200);
  console.log('debug:',JSON.stringify(await page.evaluate(()=>window.__glassDebug&&window.__glassDebug())));
  await page.screenshot({path:'ui-preview/demo-dark.png'});
  /* 滚动前后玻璃区域像素对比（折射实时性验收） */
  const clip={x:20,y:240,width:353,height:170};
  const before=await page.screenshot({clip});
  await page.evaluate(()=>{window.scrollTo(0,0);});
  await page.mouse.move(196,700); await page.mouse.down();
  await page.mouse.move(196,560,{steps:6}); await page.mouse.up();
  await page.waitForTimeout(500);
  const after=await page.screenshot({clip});
  console.log('glass region changed after scroll:',!before.equals(after),'bytes:',before.length,'->',after.length);
  await page.screenshot({path:'ui-preview/demo-scrolled.png'});
  /* 主题切换 */
  const dbg=await page.evaluate(()=>window.__glassDebug());
  await page.mouse.click(393-40,29);
  await page.waitForTimeout(600);
  const dbg2=await page.evaluate(()=>window.__glassDebug());
  console.log('theme toggled:',dbg.light,'->',dbg2.light);
  await page.screenshot({path:'ui-preview/demo-light.png'});
  console.log('pageerrors/console:',errs.length?errs:'NONE');
  await browser.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
