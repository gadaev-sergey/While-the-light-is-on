import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// This process serves copies of the published files only. It imports no engine service.
const results=await Promise.all(['a','b'].map(async key=>({key,...JSON.parse(await fs.readFile(`artifacts/engine/project-${key}-result.json`,'utf8'))})));
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-web-only-'));
for(const result of results)await fs.cp(result.output,path.join(directory,result.key),{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.svg':'image/svg+xml'};
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={browser:await browser.version(),date:new Date().toISOString(),copiedBuilds:directory,checks:[]};
try{
 for(const {key} of results){const base=path.join(directory,key);const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1'),prefix=url.pathname.startsWith('/nested/game/')?'/nested/game/':'/',relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html',file=path.resolve(base,relative);if(!file.startsWith(base+path.sep))throw new Error('Path');const buffer=await fs.readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(buffer);}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{for(const prefix of ['/','/nested/game/']){const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),failures=[],requests=[];
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['data:','blob:'].includes(url.protocol)&&url.origin!==origin){failures.push('External dependency: '+url.href);return route.abort();}return route.continue();});
   page.on('pageerror',error=>failures.push(error.message));page.on('requestfailed',request=>failures.push(request.url()));page.on('request',request=>requests.push(request.url()));
   await page.goto(origin+prefix,{waitUntil:'networkidle'});await expect(page.locator('#app')).not.toContainText('Не удалось');await expect(page.locator('canvas').first()).toBeVisible();
   expect(await page.evaluate(()=>Object.keys(localStorage).length)).toBe(0);expect(await page.evaluate(()=>('__EDITOR__' in window)||('__BASE__' in window)||('__RUNTIME__' in window))).toBe(false);
   if(key==='a'){await expect(page.locator('#base-loading')).toBeHidden();await page.locator('#base-canvas').focus();const previous=await page.locator('#flashlight').getAttribute('aria-pressed');await page.keyboard.press('KeyF');await expect(page.locator('#flashlight')).not.toHaveAttribute('aria-pressed',previous);await page.keyboard.press('KeyM');await expect(page.getByRole('heading',{name:'План дома',exact:true})).toBeVisible();await expect(page.locator('.plan-room')).toHaveCount(6);await page.getByRole('button',{name:'Закрыть',exact:true}).click();}
   await page.screenshot({path:`artifacts/engine/standalone-${key}-${prefix==='/'?'root':'nested'}.png`});
   if(key==='b'){await page.getByRole('button',{name:'Следующая сцена',exact:true}).click();await expect(page.getByRole('button',{name:'Следующая сцена',exact:true})).toBeHidden();await expect(page.locator('canvas')).toBeVisible();await page.screenshot({path:'artifacts/engine/standalone-b-gallery.png'});}
   expect(requests.some(url=>/\/@vite\/|\/api\/|\/src\/|localhost:517[34]|127\.0\.0\.1:517[34]/.test(url))).toBe(false);expect(failures).toEqual([]);report.checks.push({project:key,path:prefix,requests:requests.length,errors:failures,result:'passed'});await context.close();
  }}finally{await new Promise(resolve=>server.close(resolve));}
 }
 await fs.writeFile('artifacts/engine/standalone-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
