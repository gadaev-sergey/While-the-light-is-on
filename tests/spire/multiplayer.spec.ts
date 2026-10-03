import {test,expect,type Page,type BrowserContext} from '@playwright/test';

// Несколько вкладок одного контекста соединяются локальным транспортом (BroadcastChannel),
// поэтому тест не зависит от внешних сигнальных реле.
const URL='/player.html?project=games/spire&net=local';
type Spire={mode:string;modal:string;active:any;lobby:any;renderer:any;aimAt(id:string):boolean;setFire(on:boolean):void;forceInput(on:boolean):void};
declare global{interface Window{__SPIRE__:Spire}}

async function open(context:BrowserContext,nick:string,hash=''){
 const page=await context.newPage();await page.goto(URL+hash);
 await expect(page.locator('[data-net]')).toContainText('Локальная сеть');
 // Сеть, а не графика: низкое качество, чтобы шесть вкладок без видеокарты не тормозили обмен сообщениями.
 await page.evaluate(()=>window.__SPIRE__.renderer.setQuality('low'));
 await page.locator('[data-nick]').fill(nick);await page.locator('[data-nick]').dispatchEvent('change');
 return page;
}
async function create(page:Page,name:string,closed=false){
 await page.getByRole('button',{name:/СОЗДАТЬ СЕССИЮ/}).click();
 await page.locator('[data-create] input[name=name]').fill(name);
 if(closed)await page.locator('[data-create] input[name=closed]').check();
 await page.locator('[data-create] button[type=submit]').click();
 await expect.poll(()=>page.evaluate(()=>window.__SPIRE__.mode)).toBe('game');
 await page.evaluate(()=>window.__SPIRE__.forceInput(true));
 return page.evaluate(()=>window.__SPIRE__.active.code as string);
}
const myId=(page:Page)=>page.evaluate(()=>window.__SPIRE__.active.client.id as string);
const roster=(page:Page)=>page.evaluate(()=>[...window.__SPIRE__.active.client.roster.values()].map((r:any)=>r.name).sort());

test('две вкладки: открытая сессия из списка, фраг по сети, закрытая по ссылке, уход хоста',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const host=await open(context,'Аня');
 const code=await create(host,'Арена Ани');
 await expect(host.locator('[data-session]')).toHaveText('Арена Ани');

 // Гость видит сессию в списке и входит.
 const guest=await open(context,'Боря');
 const entry=guest.locator('[data-session-code]',{hasText:'Арена Ани'});
 await expect(entry).toContainText('1/8');await entry.click();
 await expect.poll(()=>guest.evaluate(()=>window.__SPIRE__.mode)).toBe('game');
 await guest.evaluate(()=>window.__SPIRE__.forceInput(true));
 await expect.poll(()=>roster(host)).toEqual(['Аня','Боря']);
 await expect.poll(()=>roster(guest)).toEqual(['Аня','Боря']);
 await expect(guest.locator('[data-invite]')).toContainText(`код ${code}`);

 // Ставим бойцов рядом в нижнем зале: гость сам ведёт свою позицию, хосту сообщаем её напрямую.
 const hostId=await myId(host),guestId=await myId(guest);
 await host.evaluate(({guestId})=>{const a=window.__SPIRE__.active;a.client.body.pos={x:0,y:0,z:20};a.host.game.players.get(a.client.id).pos={x:0,y:0,z:20};a.host.game.players.get(guestId).pos={x:6,y:0,z:20};},{guestId});
 await guest.evaluate(()=>{const c=window.__SPIRE__.active.client;c.body.pos={x:6,y:0,z:20};c.body.vel={x:0,y:0,z:0};});
 await guest.waitForTimeout(400);
 expect(await guest.evaluate(id=>window.__SPIRE__.aimAt(id),hostId)).toBe(true);
 await guest.evaluate(()=>window.__SPIRE__.setFire(true));
 await expect.poll(()=>guest.evaluate(()=>window.__SPIRE__.active.client.frags),{timeout:8000}).toBe(1);
 await guest.evaluate(()=>window.__SPIRE__.setFire(false));
 await expect(host.locator('[data-feed]')).toContainText('Боря');
 await expect(host.locator('[data-death]')).toContainText('ТЕБЯ УБИЛ');
 await expect.poll(()=>host.evaluate(()=>window.__SPIRE__.active.client.alive),{timeout:4000}).toBe(true);
 await guest.keyboard.down('Tab');await expect(guest.locator('[data-board] tr.self')).toContainText('Боря');await guest.keyboard.up('Tab');

 // Присед и наклон гостя доходят до хоста и видны в его снимках (честные хитбоксы).
 const guestPose=()=>host.evaluate(id=>{const p=window.__SPIRE__.active.host.game.players.get(id);return {stance:p.stance,lean:p.lean};},guestId);
 await guest.keyboard.down('KeyC');
 await expect.poll(async()=>(await guestPose()).stance).toBe(1);
 await guest.keyboard.up('KeyC');
 await expect.poll(async()=>(await guestPose()).stance).toBe(0);
 await guest.keyboard.down('KeyE');
 await expect.poll(async()=>(await guestPose()).lean).toBeGreaterThan(.9);
 await expect.poll(()=>host.evaluate(id=>window.__SPIRE__.active.client.views().find((v:any)=>v.id===id)?.lean??0,guestId)).toBeGreaterThan(.9);
 await guest.keyboard.up('KeyE');
 await expect.poll(async()=>(await guestPose()).lean).toBe(0);

 // Автомат гостя: выбор слотом 3 и перезарядка по R — магазин добирает хост.
 await host.evaluate(id=>{const p=window.__SPIRE__.active.host.game.players.get(id);p.loadout.owned[2]=true;p.loadout.mag[2]=5;p.loadout.ammo[2]=40;},guestId);
 await expect.poll(()=>guest.evaluate(()=>window.__SPIRE__.active.client.owned[2])).toBe(true);
 await guest.keyboard.press('Digit3');
 await expect.poll(()=>host.evaluate(id=>window.__SPIRE__.active.host.game.players.get(id).weapon,guestId)).toBe(2);
 await guest.keyboard.press('KeyR');
 await expect(guest.locator('[data-wname]')).toHaveText('ПЕРЕЗАРЯДКА');
 await expect.poll(()=>host.evaluate(id=>{const l=window.__SPIRE__.active.host.game.players.get(id).loadout;return [l.mag[2],l.ammo[2]];},guestId),{timeout:5000}).toEqual([30,15]);
 await expect(guest.locator('[data-ammo]')).toHaveText('30');await expect(guest.locator('[data-reserve]')).toHaveText('/ 15');

 // Закрытая сессия не попадает в список, но открывается по ссылке-приглашению.
 const secret=await open(context,'Вика');const secretCode=await create(secret,'Тайная',true);
 const visitor=await open(context,'Гоша');
 await expect(visitor.locator('[data-session-code]',{hasText:'Арена Ани'})).toBeVisible();
 await visitor.waitForTimeout(3000);
 await expect(visitor.locator('[data-session-code]',{hasText:'Тайная'})).toHaveCount(0);
 await visitor.goto(URL+'#'+secretCode);
 await visitor.locator('[data-action="join-invite"]').click();
 await expect.poll(()=>visitor.evaluate(()=>window.__SPIRE__.mode)).toBe('game');
 await expect.poll(()=>roster(secret)).toEqual(['Вика','Гоша']);

 // Хост закрывает вкладку — у гостя сессия завершается с итоговой таблицей.
 await host.close();
 await expect(guest.getByRole('heading',{name:'Хост покинул игру'})).toBeVisible({timeout:8000});
 await expect(guest.locator('.s-modal .s-table')).toContainText('Боря');
 await guest.getByRole('button',{name:/В МЕНЮ/}).click();
 await expect(guest.locator('.s-menu')).toBeVisible();

 // После сессии список продолжает обновляться: новая сессия видна и в неё можно войти.
 const next=await open(context,'Дима');await create(next,'Вторая арена');
 const again=guest.locator('[data-session-code]',{hasText:'Вторая арена'});await again.click();
 await expect.poll(()=>guest.evaluate(()=>window.__SPIRE__.mode)).toBe('game');
 await expect.poll(()=>roster(next)).toEqual(['Боря','Дима']);
 await context.close();
});
