import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {PublishResult} from '../../src/engine/publishing.ts';

test('Publishing saves the project, sends the selected repository, tracks deployment and restores its result',async({page,request})=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'shelter-publish-ui-'));
 const created=await request.post('/api/create',{data:{directory:folder,name:'Публикация игры',template:'empty-3d'}});expect(created.ok()).toBeTruthy();const session=await created.json();
 let last:PublishResult|undefined,statusCalls=0;const events:string[]=[],submitted:any[]=[];
 page.on('request',r=>{if(['/api/save','/api/publish'].some(p=>new URL(r.url()).pathname===p))events.push(new URL(r.url()).pathname);});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/publish-info',route=>route.fulfill({json:{repository:'gadaev-sergey/While-the-light-is-on',connected:true,last}}));
 await page.route('**/api/publish',async route=>{
  submitted.push(route.request().postDataJSON());last={id:'publication',status:'running',stage:'Сборка сохранённой игры для Web',progress:25,log:['Проверка доступа'],repository:'gadaev-sergey/Test-game',url:'https://gadaev-sergey.github.io/Test-game/',actionsUrl:'https://github.com/gadaev-sergey/Test-game/actions',settingsUrl:'https://github.com/gadaev-sergey/Test-game/settings/pages'};
  await route.fulfill({json:last});
 });
 await page.route('**/api/publish-status',async route=>{
  statusCalls++;last={...last!,status:'success',progress:100,stage:'Игра опубликована',commit:'test-commit'};await route.fulfill({json:last});
 });
 try{
  await page.goto('/?project='+encodeURIComponent(session.path));await expect(page.locator('#editor-canvas')).toBeVisible();
  await page.getByRole('button',{name:'Опубликовать ↗',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Репозиторий GitHub')).toHaveValue('gadaev-sergey/While-the-light-is-on');
  await expect(dialog.locator('[data-connection]')).toHaveText('GitHub подключён на этом компьютере.');
  await dialog.getByLabel('Репозиторий GitHub').fill('https://github.com/gadaev-sergey/Test-game.git');
  await expect(dialog.locator('[data-url]')).toHaveText('https://gadaev-sergey.github.io/Test-game/');
  await page.screenshot({path:'artifacts/engine/publish-dialog.png'});
  await dialog.getByRole('button',{name:'Опубликовать игру',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'Открыть игру ↗',exact:true})).toHaveAttribute('href','https://gadaev-sergey.github.io/Test-game/');
  expect(submitted).toHaveLength(1);expect(submitted[0].repository).toBe('gadaev-sergey/Test-game');expect(submitted[0].token).toBe(session.token);expect(submitted[0].revision).toBeTruthy();expect(submitted[0].githubToken).toBeUndefined();
  expect(events.indexOf('/api/save')).toBeGreaterThanOrEqual(0);expect(events.indexOf('/api/save')).toBeLessThan(events.indexOf('/api/publish'));expect(statusCalls).toBeGreaterThan(0);
  await expect(dialog.getByRole('button',{name:'Опубликовать игру',exact:true})).toBeEnabled();await page.screenshot({path:'artifacts/engine/publish-success.png'});
  await dialog.getByRole('button',{name:'Закрыть окно'}).click();await page.locator('[data-menu=build]').click();await page.getByRole('button',{name:'Опубликовать на GitHub Pages',exact:true}).click();
  await expect(page.getByRole('link',{name:'Открыть игру ↗',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{await page.goto('/');await rm(folder,{recursive:true,force:true});}
});

test('Publishing validates destinations, hides secrets and recovers after failed save or denied access',async({page,request})=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'shelter-publish-ui-error-'));
 const created=await request.post('/api/create',{data:{directory:folder,name:'Проверка ошибок',template:'empty-3d'}});expect(created.ok()).toBeTruthy();const session=await created.json();
 let sends=0;const secret='test-ui-secret';
 await page.route('**/api/publish-info',route=>route.fulfill({json:{repository:'owner/game',connected:false}}));
 await page.route('**/api/publish',async route=>{sends++;expect(route.request().postDataJSON().githubToken).toBe(secret);await route.fulfill({status:400,json:{error:'GitHub не принял токен.'}});});
 try{
  await page.goto('/?project='+encodeURIComponent(session.path));await page.getByRole('button',{name:'Опубликовать ↗',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Токен GitHub')).toBeVisible();await expect(dialog.getByLabel('Токен GitHub')).toHaveAttribute('type','password');
  await dialog.getByLabel('Репозиторий GitHub').fill('https://evil.test/owner/game');await dialog.getByRole('button',{name:'Опубликовать игру',exact:true}).click();await expect(dialog.locator('.dialog-error')).toContainText('Укажите владелец/репозиторий');expect(sends).toBe(0);
  await dialog.getByLabel('Репозиторий GitHub').fill('owner/game');await dialog.getByLabel('Токен GitHub').fill(secret);
  await page.route('**/api/save',route=>route.fulfill({status:400,json:{error:'Проект изменён в другом окне.'}}));
  await dialog.getByRole('button',{name:'Опубликовать игру',exact:true}).click();await expect(dialog.locator('.dialog-error')).toContainText('Не удалось сохранить');expect(sends).toBe(0);
  await page.unroute('**/api/save');await dialog.getByRole('button',{name:'Опубликовать игру',exact:true}).click();await expect(dialog.locator('.dialog-error')).toHaveText('GitHub не принял токен.');expect(sends).toBe(1);
  await expect(dialog.getByLabel('Токен GitHub')).toHaveValue('');await expect(dialog.getByRole('button',{name:'Опубликовать игру',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(secret);await expect(dialog).not.toContainText(secret);
  await page.setViewportSize({width:600,height:800});await expect(dialog.getByRole('button',{name:'Опубликовать игру',exact:true})).toBeVisible();await page.screenshot({path:'artifacts/engine/publish-narrow.png'});
 }finally{await page.goto('/');await rm(folder,{recursive:true,force:true});}
});
