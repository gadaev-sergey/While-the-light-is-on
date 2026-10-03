import {World,noControls,clamp,type Vec,type Controls} from '../../games/perimeter/scripts/world.ts';
import {readFileSync} from 'node:fs';
const scenes=['dock','foundry','core'].map(id=>JSON.parse(readFileSync(new URL(`../../games/perimeter/scenes/${id}.scene.json`,import.meta.url),'utf8')));
export function waypoint(w:World,target:Vec):Vec{
 const cell=48,sx=Math.floor(w.hero.x/cell),sy=Math.floor(w.hero.y/cell),gx=Math.floor(target.x/cell),gy=Math.floor(target.y/cell),queue=[[gx,gy]],cost=new Map([[gx+','+gy,0]]),cols=Math.ceil(w.level.width/cell),rows=Math.ceil(w.level.height/cell);
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(x===sx&&y===sy)break;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny,px=(nx+.5)*cell,py=(ny+.5)*cell;if(nx<1||ny<1||nx>=cols-1||ny>=rows-1||cost.has(k))continue;if(w.level.cover.some(r=>Math.abs(px-r.x)<r.w/2+24&&Math.abs(py-r.y)<r.h/2+24))continue;cost.set(k,cost.get(x+','+y)!+1);queue.push([nx,ny]);}}
 let best=Infinity,result=target;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const p={x:(sx+dx+.5)*cell,y:(sy+dy+.5)*cell},v=cost.get((sx+dx)+','+(sy+dy));if(v!==undefined&&v<best&&w.sight(w.hero,p,20)){best=v;result=p;}}return result;
}
export function runCampaign(difficulty=1,maxSeconds=1100){const w=new World(scenes,'dock');w.newGame(difficulty);let input=noControls(),lastDecision=-1,lastScene='',way:Vec=w.hero;const trace:string[]=[];
 for(let frame=0;frame<maxSeconds*60;frame++){
  if(w.level.id!==lastScene){trace.push(`enter ${w.level.id} at ${w.stats.seconds.toFixed(1)}s, hp ${w.hero.hp}`);lastScene=w.level.id;}
  if(w.phase==='upgrade'){const priority=['damage','repair','cadence','shield','vitality','pulse','pierce','mobility'];const choice=[...w.choices].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b))[0];trace.push(`wave ${w.wave} clear @ ${w.stats.seconds.toFixed(1)}s, hp ${w.hero.hp.toFixed(0)}, upgrade ${choice}`);w.choose(choice);}
  if(w.phase==='won')return {won:true,stats:w.stats,trace,world:w};
  if(w.phase==='dead')return {won:false,stats:w.stats,trace:[...trace,`dead in ${w.level.id} wave ${w.wave}; enemies ${w.enemies.map(e=>e.kind+':'+e.hp.toFixed(0)).join(',')}`],world:w};
  if(frame-lastDecision>=4){lastDecision=frame;const h=w.hero;const active=w.enemies.filter(e=>e.birth<=0);const enemies=[...active].sort((a,b)=>(Math.hypot(a.x-h.x,a.y-h.y)+(w.sight(h,a)?0:1500))-(Math.hypot(b.x-h.x,b.y-h.y)+(w.sight(h,b)?0:1500)));const target=enemies[0];let goal:Vec=target||{x:w.level.width/2,y:w.level.height*.65};if(w.phase==='cleared')goal=w.level.gate;
   if(w.phase==='cleared'||target&&!w.sight(h,target,24))way=waypoint(w,goal);else way=goal;
   let best=-Infinity,bestX=0,bestY=0;const nearBullet=w.bullets.some(b=>b.enemy&&Math.hypot(b.x-h.x,b.y-h.y)<130),needHeal=h.hp<w.maxHP*.7;const health=w.pickups.filter(p=>p.kind==='health').sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y))[0];
   for(let i=0;i<17;i++){const angle=i/16*Math.PI*2,x=i===16?0:Math.cos(angle),y=i===16?0:Math.sin(angle),p={x:h.x,y:h.y};w.move(p,x*w.speed*.16,y*w.speed*.16,19);let score=0;const actual=Math.hypot(p.x-h.x,p.y-h.y);if(i<16&&actual<12)score-=100;
    if(w.phase==='cleared')score-=Math.hypot(p.x-way.x,p.y-way.y)*1.5;
    else if(target){const distance=Math.hypot(p.x-target.x,p.y-target.y),los=w.sight(p,target);if(!w.sight(h,target,24))score-=Math.hypot(p.x-way.x,p.y-way.y)*.7;else {score-=Math.abs(distance-(target.kind==='boss'?430:target.kind==='runner'?310:360))*.1;score+=los?20:0;score+=(x*(-Math.sin(Math.atan2(h.y-target.y,h.x-target.x)))+y*Math.cos(Math.atan2(h.y-target.y,h.x-target.x)))*12;}}
    if(needHeal&&health&&w.sight(h,health,22))score-=Math.hypot(p.x-health.x,p.y-health.y)*.18;
    for(const e of active){const d=Math.hypot(p.x-e.x,p.y-e.y);if(d<200)score-=(200-d)*(e.kind==='runner'?.7:.3);if(e.charge>0&&e.kind!=='boss'){const ex=Math.cos(e.locked),ey=Math.sin(e.locked),ahead=(p.x-e.x)*ex+(p.y-e.y)*ey,off=Math.abs((p.x-e.x)*ey-(p.y-e.y)*ex);if(ahead>0&&off<45)score-=(45-off)*2;}}
    for(const b of w.bullets){if(!b.enemy)continue;for(const t of [.12,.25,.38]){const px=h.x+x*w.speed*t,py=h.y+y*w.speed*t,d=Math.hypot(px-(b.x+b.vx*t),py-(b.y+b.vy*t));if(d<85)score-=(85-d)*.9;}}
    for(const z of w.hazards)if(!z.fired){const d=Math.hypot(p.x-z.x,p.y-z.y);if(d<z.r+45)score-=(z.r+45-d)*2;}
    if(score>best){best=score;bestX=x;bestY=y;}
   }
   const distance=target?Math.hypot(target.x-h.x,target.y-h.y):0;input={...noControls(),x:bestX,y:bestY,aimX:target?.x??h.x,aimY:target?.y??h.y-100,fire:!!target&&w.sight(h,target),weapon:target?.kind==='boss'?0:distance<230?1:distance>480?2:0,dash:nearBullet&&h.dashCD<=0,emp:h.empCD<=0&&(active.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<240).length>1||nearBullet&&h.shield<20),interact:w.phase==='cleared'};
  }
  w.step(1/60,input);input={...input,dash:false,emp:false};
 }
 return {won:false,stats:w.stats,trace:[...trace,`timeout ${w.level.id} wave ${w.wave} remaining ${w.remaining} hero ${w.hero.x},${w.hero.y}`],world:w};}
if(process.argv[1]?.endsWith('campaign.ts')){const result=runCampaign(Number(process.argv[2]??1));console.log(JSON.stringify({won:result.won,stats:result.stats,trace:result.trace},null,2));process.exitCode=result.won?0:1;}
