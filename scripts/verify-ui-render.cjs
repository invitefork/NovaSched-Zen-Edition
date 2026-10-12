/* Optional desktop rendering check for the liquid-glass WebUI.
 *
 * The v2.2.0 UI renders everything on one WebGL2 canvas, so instead of DOM
 * snapshots this check loads the page in headless Chromium, fails on any
 * page/console error, exercises the engine debug hook, and captures one
 * screenshot per width. Mock state only; it never opens a phone session.
 * Requires CHROME to point at a Chromium/Edge binary.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'module-template/webroot');
const output = path.join(root, 'ui-preview');

async function main() {
  fs.mkdirSync(output, {recursive:true});
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filename = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(web + path.sep)) { response.writeHead(403).end(); return; }
    const type = {'.html':'text/html'}[path.extname(filename)] || 'application/octet-stream';
    try { response.setHeader('Content-Type',type); response.end(fs.readFileSync(filename)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROME,headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
    for (const width of [320,393,768]) {
      const page = await browser.newPage({viewport:{width,height:852},deviceScaleFactor:1});
      const problems = [];
      page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForTimeout(1500);
      const state = await page.evaluate(() => {
        const canvas = document.querySelector('#cv');
        if (!canvas) throw new Error('liquid glass canvas missing');
        if (!window.__ytblDebug) throw new Error('engine debug hook missing');
        if (document.querySelector('#fallback').style.display === 'flex')
          throw new Error('WebGL2 fallback engaged: ' + document.querySelector('#fallback').textContent);
        return window.__ytblDebug();
      });
      if (typeof state.dialogVisible !== 'boolean') throw new Error(`debug hook shape changed: ${JSON.stringify(state)}`);
      // Connection probes fail on a desktop host; page must stay honest, not crash.
      await page.screenshot({path:path.join(output,`glass-${width}.png`)});
      const fatal = problems.filter(text => !/WebSocket|net::|Failed to (load|fetch)|favicon/.test(text));
      if (fatal.length) throw new Error(`${width}px: ${fatal.join('; ')}`);
      await page.close();
      console.log(`ok ${width}px — canvas live, no JS errors`);
    }
    console.log('PASS: liquid-glass WebUI renders headlessly at 320/393/768px');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error('BLOCKED:',error.message); process.exitCode=1; });
