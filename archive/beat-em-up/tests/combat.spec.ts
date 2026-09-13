import { test, expect, type Page } from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>(window as any).__NULLPOINT__.snapshot());
async function training(page:Page){await page.goto('/');await expect(page.locator('.menu-overlay')).toBeVisible();await page.getByRole('button',{name:'Тренировка комбинаций',exact:true}).click();}
async function idle(page:Page){await expect.poll(async()=>(await snapshot(page)).combat.canAttack,{intervals:[20]}).toBe(true);}
async function combo(page:Page,keys:string[]){for(const key of keys){await idle(page);await page.keyboard.press(key);await expect.poll(async()=>(await snapshot(page)).player.attack,{intervals:[20]}).toBeGreaterThan(0);await idle(page);}}

test('Early and simultaneous keyboard presses are discarded; completed JJK unlocks a distinct R attack',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await training(page);
  await page.keyboard.down('KeyJ');await page.keyboard.down('KeyK');await page.keyboard.down('KeyL');
  await page.waitForTimeout(900);await page.keyboard.up('KeyJ');await page.keyboard.up('KeyK');await page.keyboard.up('KeyL');
  expect((await snapshot(page)).combat.hits).toBe(1);expect((await snapshot(page)).combat.readySuper).toBeNull();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Начать заново',exact:true}).click();
  await combo(page,['KeyJ','KeyJ','KeyK']);let s=await snapshot(page);
  expect(s.player.move).toBe('heavy');expect(s.combat.damage).toBe(78);expect(s.combat.readySuper).toBe('delete');
  await expect(page.locator('#super-ability')).toHaveClass(/charged/);await expect(page.locator('#input-history')).toHaveText('JJK');
  await page.screenshot({path:'test-results/super-ready.png'});
  await page.keyboard.press('KeyR');await expect.poll(async()=>(await snapshot(page)).combat.hits,{intervals:[20]}).toBe(4);
  s=await snapshot(page);expect(s.player.move).toBe('delete');expect(s.combat.damage).toBe(193);expect(s.combat.readySuper).toBeNull();
  await page.screenshot({path:'test-results/super-shockwave.png'});
  await page.locator('[data-do="combos"]').first().click();await expect(page.locator('.combo-list article')).toHaveCount(3);
  await page.screenshot({path:'test-results/combat-manual.png'});
  await page.getByRole('button',{name:'Все клавиши управления',exact:true}).click();await expect(page.getByRole('heading',{name:'Как выжить в офисе'})).toBeVisible();
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();expect((await snapshot(page)).phase).toBe('playing');expect(errors).toEqual([]);
});

test('JLK releases code pillars, launches the dummy and permits an actual aerial punch',async({page})=>{
  await training(page);await combo(page,['KeyJ','KeyL','KeyK']);expect((await snapshot(page)).combat.readySuper).toBe('overflow');
  await page.keyboard.press('KeyR');await expect.poll(async()=>(await snapshot(page)).enemies[0].height,{intervals:[20]}).toBeGreaterThan(60);
  await page.screenshot({path:'test-results/super-pillars.png'});await idle(page);await page.keyboard.press('Space');
  await expect.poll(async()=>(await snapshot(page)).player.height,{intervals:[15]}).toBeGreaterThan(28);await page.keyboard.press('KeyJ');
  await expect.poll(async()=>(await snapshot(page)).combat.hits,{intervals:[15]}).toBe(5);
  const s=await snapshot(page);expect(s.player.move).toBe('air-jab');expect(s.player.attackConnected).toBe(true);
  await page.screenshot({path:'test-results/aerial-combo.png'});
});

test('Mobile KJL, separate super button and held guard work without overlapping movement controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await training(page);
  for(const action of ['heavy','attack','kick']){await idle(page);await page.locator(`[data-action="${action}"]`).tap();await expect.poll(async()=>(await snapshot(page)).player.attack,{intervals:[20]}).toBeGreaterThan(0);await idle(page);}
  expect((await snapshot(page)).combat.readySuper).toBe('hotfix');await page.locator('#super-ability').tap();
  await expect.poll(async()=>(await snapshot(page)).combat.hits,{intervals:[20]}).toBe(4);await page.screenshot({path:'test-results/mobile-super.png',fullPage:true});await idle(page);
  const guard=page.locator('[data-guard]'),box=(await guard.boundingBox())!,touch=await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await expect.poll(async()=>(await snapshot(page)).player.guarding).toBe(true);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await snapshot(page)).player.guarding).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const movement=await page.locator('.touch-movement').boundingBox(),abilities=await page.locator('.abilities').boundingBox();expect(movement!.x+movement!.width).toBeLessThan(abilities!.x);
  await page.locator('.moves-ability').tap();await page.screenshot({path:'test-results/mobile-combat-manual.png',fullPage:true});await context.close();
});

test('Walking through the stairwell climbs a full office floor and descends without a jump',async({page})=>{
  await training(page);
  await page.keyboard.down('KeyD');await expect.poll(async()=>(await snapshot(page)).player.x,{intervals:[20]}).toBeGreaterThan(510);await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');await expect.poll(async()=>(await snapshot(page)).player.y,{intervals:[20]}).toBeLessThan(548);await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');await expect.poll(async()=>(await snapshot(page)).player.elevation,{intervals:[30]}).toBe(280);await page.keyboard.up('KeyD');
  expect((await snapshot(page)).player.height).toBe(0);expect((await snapshot(page)).player.jumpPhase).toBe('grounded');
  await page.screenshot({path:'test-results/office-upper-floor.png'});
  await page.keyboard.down('KeyA');await expect.poll(async()=>(await snapshot(page)).player.elevation,{intervals:[30]}).toBe(0);await page.keyboard.up('KeyA');
  expect((await snapshot(page)).player.height).toBe(0);
});
