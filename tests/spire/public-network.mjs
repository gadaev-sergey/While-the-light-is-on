// Ручная проверка публичной сети (Nostr-реле + WebRTC) несколькими сессиями подряд.
// node tests/spire/public-network.mjs [адрес]   — по умолчанию опубликованная игра.
// Флаги поддельного микрофона нужны, если маршрут по умолчанию идёт через VPN: с разрешением
// на медиа Chrome предлагает для WebRTC все сетевые интерфейсы. Сама игра микрофон не запрашивает.
import {chromium} from '@playwright/test';
const base=process.argv[2]||'https://gadaev-sergey.github.io/spire/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const t0=Date.now(),log=(...x)=>console.log(((Date.now()-t0)/1000).toFixed(1)+'s',...x);
const mk=async(name)=>{const c=await browser.newContext();const p=await c.newPage();p.on('pageerror',e=>log(name,'pageerror',e.message));await p.goto(base);await p.waitForTimeout(1200);await p.goto(base);
 await p.evaluate(async()=>(await navigator.mediaDevices.getUserMedia({audio:true})).getTracks().forEach(t=>t.stop()));await p.locator('[data-net]').filter({hasText:/В сети|Локальная/}).waitFor();await p.locator('[data-nick]').fill(name);await p.locator('[data-nick]').dispatchEvent('change');return p;};
async function create(p,name){await p.getByRole('button',{name:/СОЗДАТЬ СЕССИЮ/}).click();await p.locator('[data-create] input[name=name]').fill(name);await p.locator('[data-create] button[type=submit]').click();await p.locator('.s-hud').waitFor();}
async function joinFromList(p,name,ms=45000){const item=p.locator('[data-session-code]',{hasText:name});const seen=await item.waitFor({timeout:ms}).then(()=>true,()=>false);if(!seen)return 'NOT LISTED';await item.click();return p.locator('.s-hud').waitFor({timeout:ms}).then(()=>'joined',async()=>'JOIN FAILED: '+(await p.locator('.s-panel h2').textContent().catch(()=>'')));}
async function leave(p){await p.evaluate(()=>document.pointerLockElement?document.exitPointerLock():null);await p.waitForTimeout(200);if(!(await p.locator('[data-action="leave"]').count()))await p.keyboard.press('Escape');await p.locator('[data-action="leave"]').click();await p.locator('.s-menu').waitFor();}
const hud=p=>p.locator('[data-invite]').textContent();
const a=await mk('A'),b=await mk('B');
await create(a,'Первая');log('1 B → Первая:',await joinFromList(b,'Первая'));await b.waitForTimeout(6000);
await leave(a);await b.getByRole('heading',{name:'Хост покинул игру'}).waitFor({timeout:40000});log('2 B saw host leave');await b.waitForTimeout(1500);await b.getByRole('button',{name:/В МЕНЮ/}).click();
await a.waitForTimeout(2000);await create(a,'Вторая');log('3 B → Вторая (тот же хост, та же вкладка):',await joinFromList(b,'Вторая'));await b.waitForTimeout(5000);
await leave(b);log('4 B вышел; снова → Вторая:',await joinFromList(b,'Вторая'));await b.waitForTimeout(4000);log('  A hud',await hud(a));
await leave(b);await leave(a);await b.waitForTimeout(2000);await create(b,'Третья');log('5 A → Третья (хост B):',await joinFromList(a,'Третья'));
const c=await mk('C');log('6 C (новая вкладка) → Третья:',await joinFromList(c,'Третья'));await b.waitForTimeout(3000);log('  B hud',await hud(b));
await browser.close();
