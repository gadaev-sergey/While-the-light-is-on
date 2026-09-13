import { test, expect, type Page } from '@playwright/test';
import { stairApproach } from '../src/game/terrain.ts';
const snapshot=(page:Page)=>page.evaluate(()=>(window as any).__NULLPOINT__.snapshot());
async function ready(page:Page){await page.goto('/');await expect(page.locator('.menu-overlay')).toBeVisible();}

test('Space jumps while movement continues, pause freezes the arc and holding Space does not repeat',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'Начать экспедицию',exact:true}).click();
  const before=await snapshot(page);
  await page.keyboard.down('KeyD');await page.keyboard.down('Space');
  await expect.poll(async()=>(await snapshot(page)).player.height,{intervals:[30]}).toBeGreaterThan(70);
  await page.keyboard.up('KeyD');const airborne=await snapshot(page);
  expect(airborne.player.x).toBeGreaterThan(before.player.x+40);
  expect(airborne.player.y).toBe(before.player.y);expect(airborne.player.dashCooldown).toBe(0);
  await page.screenshot({path:'test-results/jump-in-motion.png'});
  await page.keyboard.press('Escape');const paused=await snapshot(page);
  await page.waitForTimeout(200);expect((await snapshot(page)).player.height).toBe(paused.player.height);
  await page.keyboard.press('Escape');await page.keyboard.up('Space');
  await expect.poll(async()=>(await snapshot(page)).player.jumpPhase).toBe('grounded');
  await page.keyboard.down('Space');await expect.poll(async()=>(await snapshot(page)).player.height,{intervals:[30]}).toBeGreaterThan(50);
  await page.waitForTimeout(1100);expect((await snapshot(page)).player.jumpPhase).toBe('grounded');
  await page.keyboard.up('Space');
});

test('Keyboard combat, pause, archive, settings persistence and restart',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
  await page.getByRole('button',{name:'Начать экспедицию',exact:true}).click();
  await page.keyboard.down('KeyD');await page.waitForTimeout(650);await page.keyboard.up('KeyD');
  expect((await snapshot(page)).player.x).toBeGreaterThan(360);
  await page.keyboard.press('KeyE');await page.waitForTimeout(100);expect((await snapshot(page)).player.pulseCooldown).toBeGreaterThan(6);
  await page.keyboard.press('ShiftLeft');await expect.poll(async()=>(await snapshot(page)).player.dashCooldown).toBeGreaterThan(0);
  await page.keyboard.press('Escape');expect((await snapshot(page)).phase).toBe('paused');
  const paused=await snapshot(page);await page.waitForTimeout(400);expect((await snapshot(page)).stats.time).toBe(paused.stats.time);
  await page.getByRole('button',{name:'Архив',exact:true}).click();await expect(page.getByRole('heading',{name:'Архив мира'})).toBeVisible();
  await expect(page.locator('canvas.enemy-art')).toHaveCount(3);
  await page.getByRole('button',{name:'Ассеты',exact:true}).click();await expect(page.locator('.asset-card')).toHaveCount(10);
  await page.getByRole('button',{name:'История',exact:true}).click();await expect(page.locator('.lore')).toBeVisible();
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('#particles').uncheck();await page.locator('#difficulty').selectOption('story');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.reload();await expect(page.locator('.menu-overlay')).toBeVisible();
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.locator('#particles')).not.toBeChecked();await expect(page.locator('#difficulty')).toHaveValue('story');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.getByRole('button',{name:'Начать экспедицию',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Начать заново',exact:true}).click();const reset=await snapshot(page);expect(reset.phase).toBe('playing');expect(reset.player.hp).toBe(120);expect(reset.stats.kills).toBe(0);
  expect(errors).toEqual([]);
});

test('All three office levels can be completed through stairs and elevators using keyboard input',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'Начать экспедицию',exact:true}).click();
  const held=new Set<string>();
  async function keys(next:Set<string>){for(const k of held)if(!next.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of next)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}}
  let state=await snapshot(page),iterations=0,bossCaptured=false;
  while(state.phase!=='won' && state.phase!=='lost' && iterations++<1450){
    if(state.phase==='upgrade'){
      await keys(new Set());const upgrade=state.player.hp<85?'heal':'damage';
      await page.locator(`[data-upgrade="${upgrade}"]`).click();
    }else if(state.phase==='paused')await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    else{
      const p=state.player;
      const targets=state.enemies.filter((e:any)=>e.hp>0).sort((a:any,b:any)=>Math.hypot(a.x-p.x,(a.y-p.y)*2)-Math.hypot(b.x-p.x,(b.y-p.y)*2));
      const enemy=targets[0];const next=new Set<string>();
      if(enemy){
        const dx=enemy.x-p.x,dy=enemy.y-p.y,turn=Math.sign(dx)!==p.facing;
        const sameLevel=Math.abs(p.elevation-enemy.elevation)<10;
        const target=stairApproach(p.x,p.y,p.elevation,enemy.x,enemy.y,enemy.elevation);
        const tx=target.x-p.x,ty=target.y-p.y;
        if(Math.abs(tx)>(sameLevel?105:10)||sameLevel&&turn)next.add(tx>0?'KeyD':'KeyA');
        if(Math.abs(ty)>12)next.add(ty>0?'KeyS':'KeyW');
        const inRange=!turn&&sameLevel&&Math.abs(dx)<150&&Math.abs(dy)<55;
        const threat=targets.some((e:any)=>e.state==='windup'&&e.timer<.3&&Math.abs(e.x-p.x)<220&&Math.abs(e.y-p.y)<95);
        await keys(next);
        if(state.combat.readySuper&&state.combat.canAttack&&p.jumpPhase==='grounded'&&Math.abs(dx)<300)await page.keyboard.press('KeyR');
        else if(inRange&&state.combat.canAttack)await page.keyboard.press(state.combat.chain.length===2?'KeyK':'KeyJ');
        if(threat&&sameLevel&&!p.dashCooldown)await page.keyboard.press('ShiftLeft');
        else if(sameLevel&&!p.pulseCooldown&&Math.abs(dx)<235)await page.keyboard.press('KeyE');
        if(state.sector===2&&!bossCaptured&&Math.abs(dx)<330){await page.screenshot({path:'test-results/boss-encounter.png'});bossCaptured=true;}
      }else{
        const target=stairApproach(p.x,p.y,p.elevation,state.lift.x,state.lift.y,state.lift.elevation);
        if(Math.abs(target.x-p.x)>10)next.add(target.x>p.x?'KeyD':'KeyA');
        if(Math.abs(target.y-p.y)>10)next.add(target.y>p.y?'KeyS':'KeyW');
        await keys(next);
        if(state.lift.canUse){
          await keys(new Set());await page.screenshot({path:`test-results/office-lift-${state.sector+1}.png`});
          await page.keyboard.press('KeyF');await page.waitForTimeout(1400);
        }
      }
    }
    await page.waitForTimeout(80);state=await snapshot(page);
  }
  await keys(new Set());console.log('Full run:',JSON.stringify(state.stats),`HP=${state.player.hp}`,`phase=${state.phase}`);
  await page.screenshot({path:'test-results/completed-run.png'});
  expect(state.phase).toBe('won');expect(state.stats.kills).toBe(10);expect(state.sector).toBe(2);
  await page.getByRole('button',{name:'Новая экспедиция',exact:true}).click();expect((await snapshot(page)).stats.kills).toBe(0);
});

test('Mobile layout stays inside the viewport and touch controls move the player',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/mobile-menu.png',fullPage:true});
  await page.getByRole('button',{name:'Начать экспедицию',exact:true}).tap();
  await expect(page.locator('.touch-movement')).toBeVisible();const before=await snapshot(page);
  const right=page.locator('[data-key="KeyD"]');await right.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch'});await page.waitForTimeout(400);await right.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});
  expect((await snapshot(page)).player.x).toBeGreaterThan(before.player.x);
  const moveBox=await page.locator('.touch-movement').boundingBox(),abilityBox=await page.locator('.abilities').boundingBox();
  expect(moveBox!.x+moveBox!.width).toBeLessThan(abilityBox!.x);
  await page.locator('[data-action="jump"]').tap();
  await expect.poll(async()=>(await snapshot(page)).player.height,{intervals:[30]}).toBeGreaterThan(50);
  await page.screenshot({path:'test-results/mobile-jump.png',fullPage:true});
  await page.locator('[data-action="pulse"]').tap();await page.waitForTimeout(120);expect((await snapshot(page)).player.pulseCooldown).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/mobile-combat.png',fullPage:true});await context.close();
});
