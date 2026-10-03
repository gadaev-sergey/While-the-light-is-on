import {chromium,expect} from '@playwright/test';
import * as fs from 'node:fs/promises';
const {projectPath}=JSON.parse(await fs.readFile('artifacts/engine/project-b-result.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:5174/?project='+encodeURIComponent(projectPath));
 await page.waitForFunction(()=>!!window.__EDITOR__);
 const settled=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const read=()=>page.evaluate(()=>({scene:window.__EDITOR__.snapshot(),memory:window.__EDITOR__.diagnostics(),progress:Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.includes(':progress:')||key==='shelter-base-v1'))}));
 await settled();const before=await read();const cycles=[];
 for(let index=0;index<10;index++){
  await page.getByRole('button',{name:'▶ Играть',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Пробная игра');
  await expect(page.locator('iframe.play-session')).toHaveCount(1);
  await page.getByRole('button',{name:'■ Стоп',exact:true}).click();await settled();
  const after=await read();expect(after).toEqual(before);
  expect(page.frames()).toHaveLength(1);await expect(page.locator('iframe.play-session')).toHaveCount(0);
  cycles.push({index:index+1,frames:page.frames().length,memory:after.memory});
 }
 const report={browser:browser.version(),cycles,authoringSceneUnchanged:true,progressUnchanged:true};
 await fs.writeFile('artifacts/engine/lifecycle-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
