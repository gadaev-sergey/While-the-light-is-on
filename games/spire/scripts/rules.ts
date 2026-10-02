import type {ItemKind} from './arena.ts';

export type WeaponId=0|1|2;
export type Weapon={id:WeaponId;name:string;kind:string;interval:number;damage:number;pellets:number;spread:number;ammoMax:number};
/** 0 — бластер (бесконечный), 1 — дробовик, 2 — ракетница. */
export const WEAPONS:Weapon[]=[
 {id:0,name:'Бластер',kind:'Стартовое',interval:.1,damage:8,pellets:1,spread:.012,ammoMax:Infinity},
 {id:1,name:'Дробовик',kind:'Ближний бой',interval:1,damage:7,pellets:11,spread:.075,ammoMax:30},
 {id:2,name:'Ракетница',kind:'Урон по площади',interval:.8,damage:100,pellets:1,spread:0,ammoMax:25},
];
export const ROCKET_SPEED=24;
export const ROCKET_RADIUS=.15;
export const SPLASH_RADIUS=3.2;
export const SPLASH_DAMAGE=90;
export const SELF_DAMAGE=.5;
export const KNOCKBACK=.12;
export const MAX_HEALTH=100;
export const MEGA_HEALTH=200;
export const MAX_ARMOR=100;
export const ARMOR_ABSORB=2/3;
export const RESPAWN_DELAY=2;
export const INTERMISSION=10;
export const TIME_LIMIT=600;
export const FRAG_LIMITS=[10,20,30] as const;
export const MAX_PLAYERS=8;
export const LAG_COMPENSATION=.2;
export const PICKUP_RADIUS=1.1;

export type ItemRule={respawn:number;name:string};
export const ITEMS:Record<ItemKind,ItemRule>={
 mega:{respawn:30,name:'Мега-бонус'},rocket:{respawn:20,name:'Ракетница'},shotgun:{respawn:20,name:'Дробовик'},armor:{respawn:25,name:'Броня'},
 health:{respawn:20,name:'Аптечка'},shells:{respawn:20,name:'Патроны дробовика'},rockets:{respawn:20,name:'Ракеты'},
};

/** Запас бойца, которым управляет хост. */
export type Loadout={health:number;armor:number;owned:[boolean,boolean,boolean];ammo:[number,number,number]};
export const freshLoadout=():Loadout=>({health:MAX_HEALTH,armor:0,owned:[true,false,false],ammo:[Infinity,0,0]});

/** Подбор бонуса. Возвращает false, если бонус сейчас бесполезен и остаётся лежать. */
export function applyItem(l:Loadout,kind:ItemKind):boolean{
 const give=(w:1|2,n:number)=>{const before=l.ammo[w];l.ammo[w]=Math.min(WEAPONS[w].ammoMax,l.ammo[w]+n);return l.ammo[w]>before;};
 switch(kind){
  case 'health':if(l.health>=MAX_HEALTH)return false;l.health=Math.min(MAX_HEALTH,l.health+25);return true;
  case 'mega':l.health=Math.min(MEGA_HEALTH,l.health+100);return true;
  case 'armor':if(l.armor>=MAX_ARMOR)return false;l.armor=Math.min(MAX_ARMOR,l.armor+50);return true;
  case 'shotgun':{const had=l.owned[1];l.owned[1]=true;return give(1,10)||!had;}
  case 'rocket':{const had=l.owned[2];l.owned[2]=true;return give(2,8)||!had;}
  case 'shells':return give(1,10);
  case 'rockets':return give(2,5);
 }
}

/** Урон с учётом брони: броня поглощает 2/3, пока не кончится. */
export function applyDamage(l:Loadout,amount:number){
 const absorbed=Math.min(l.armor,Math.round(amount*ARMOR_ABSORB));l.armor-=absorbed;l.health-=amount-absorbed;return amount-absorbed;
}

/** Урон по площади убывает линейно от центра взрыва до края радиуса. */
export const splashDamage=(distance:number)=>distance>=SPLASH_RADIUS?0:Math.round(SPLASH_DAMAGE*(1-distance/SPLASH_RADIUS));

/** Детерминированный разброс дроби: хост и стрелок получают одинаковые лучи из одного seed. */
export function pelletOffsets(seed:number,count:number,spread:number):[number,number][]{
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const list:[number,number][]=[];
 for(let i=0;i<count;i++){const a=rnd()*Math.PI*2,r=(count>1&&i===0?0:Math.sqrt(rnd()))*spread;list.push([Math.cos(a)*r,Math.sin(a)*r]);}
 return list;
}

export type Ranked={id:string;frags:number};
/** Лидер матча, если он единственный; при равенстве — undefined. */
export function soleLeader(players:Ranked[]):string|undefined{
 if(!players.length)return undefined;
 const sorted=[...players].sort((a,b)=>b.frags-a.frags);
 return sorted.length===1||sorted[0].frags>sorted[1].frags?sorted[0].id:undefined;
}

/** Уникальный ник в сессии: повтор получает суффикс «(2)», «(3)»… */
export function uniqueName(name:string,taken:string[]):string{
 const base=cleanName(name);if(!taken.includes(base))return base;
 for(let i=2;;i++){const candidate=`${base} (${i})`;if(!taken.includes(candidate))return candidate;}
}
export function cleanName(name:string){return name.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,16)||'Боец';}

export const PLAYER_COLORS=['#ff6b3d','#3dc8ff','#9cff3d','#ff3df0','#ffd23d','#7a5cff','#3dffb0','#ff3d6e'];
