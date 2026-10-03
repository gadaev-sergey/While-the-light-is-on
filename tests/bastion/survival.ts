import {readFileSync} from 'node:fs';
import {World,readLevel,distance,type Controls,type Upgrade} from '../../games/bastion/scripts/world.ts';
import {validateScene} from '../../src/engine/scene.ts';
const scene=validateScene(JSON.parse(readFileSync(new URL('../../games/bastion/scenes/castle.scene.json',import.meta.url),'utf8')));
export function runSurvival(limit=360){const w=new World(readLevel(scene));w.reset();let route=0;const points=[{x:1380,y:1130},{x:1390,y:800},{x:1010,y:800},{x:1010,y:1140}];let lowestHP=120;const used=new Set<number>();
 for(let i=0;i<limit*60&&w.phase!=='dead';i++){
  if(w.phase==='upgrade'){const priority:Upgrade[]=['leech','vitality','steel','ember','haste','flow','stride','fletching'];w.choose([...w.choices].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b))[0]);}
  const p=w.player;let target=points[route];if(distance(p,target)<38){route=(route+1)%points.length;target=points[route];}
  const nearest=w.enemies.filter(e=>e.birth<=0&&e.hp>0&&w.sight(p,e)).sort((a,b)=>distance(p,a)-distance(p,b))[0],near=nearest?distance(p,nearest):9999;
  const weapon=near<140?0:p.mana>35&&near<650?2:p.arrows>0&&near<780?1:0;used.add(weapon);
  const len=distance(target,p)||1,angle=nearest?Math.atan2(nearest.y-p.y,nearest.x-p.x):p.angle;
  const controls:Controls={x:(target.x-p.x)/len,y:(target.y-p.y)/len,angle,weapon,fire:near<(weapon===0?140:780),dash:near<90&&p.stamina>35,nova:w.enemies.filter(e=>distance(p,e)<200).length>=4&&p.mana>55,interact:p.hp<w.maxHP-35};
  w.step(1/60,controls);lowestHP=Math.min(lowestHP,p.hp);
 }
 return {world:w,summary:{seconds:w.seconds,kills:w.kills,bosses:w.bosses,rank:w.rank,phase:w.phase,health:w.player.hp,lowestHP,weapons:[...used]}};
}
if(process.argv[1]?.endsWith('survival.ts'))console.log(JSON.stringify(runSurvival().summary));
