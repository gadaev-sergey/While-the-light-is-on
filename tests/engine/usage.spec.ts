import {test,expect} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Project statistics show real stored totals, model shares and an honest empty state',async({page,request})=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'shelter-usage-ui-'));
 const created=await request.post('/api/create',{data:{directory:folder,name:'Учёт разработки',template:'empty-3d'}});expect(created.ok()).toBeTruthy();const session=await created.json();
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?project='+encodeURIComponent(session.path));await expect(page.locator('#editor-canvas')).toBeVisible();
  await page.locator('[data-menu=project]').click();await page.getByRole('button',{name:'ИИ · статистика разработки',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Расход пока не зафиксирован');
  const source={threadId:'11111111-1111-4111-8111-111111111111',turnId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  const entries=[{model:'model-a',inputTokens:700,outputTokens:100,cachedInputTokens:600,reasoningOutputTokens:40,totalTokens:800},{model:'model-b',inputTokens:150,outputTokens:50,cachedInputTokens:100,reasoningOutputTokens:20,totalTokens:200}].map((e,i)=>({...e,id:String(i).repeat(64),source:source.threadId+':'+source.turnId,timestamp:'2026-10-01T12:00:00Z'}));
  await mkdir(path.join(session.path,'settings'),{recursive:true});await writeFile(path.join(session.path,'settings/ai-usage.json'),JSON.stringify({schemaVersion:1,projectId:session.manifest.projectId,sources:[source],entries,warnings:[]}));
  await dialog.getByRole('button',{name:'Обновить',exact:true}).click();await expect(dialog.locator('.usage-total strong')).toHaveText('1 000');
  await expect(dialog.locator('.usage-model')).toHaveCount(2);await expect(dialog.locator('.usage-model').first()).toContainText('80%');await expect(dialog.locator('.usage-model').last()).toContainText('20%');
  await expect(dialog.locator('.usage-warning')).toContainText('недоступен');await page.screenshot({path:'artifacts/engine/usage-dialog.png'});
  await page.setViewportSize({width:600,height:800});await expect(dialog.getByRole('button',{name:'Обновить',exact:true})).toBeVisible();expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();
  const invalid=await request.post('/api/usage',{data:{token:'invalid'}});expect(invalid.ok()).toBeFalsy();
  expect(errors).toEqual([]);
 }finally{await page.goto('/');await rm(folder,{recursive:true,force:true});}
});
