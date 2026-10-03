import type {ItemKind} from './arena.ts';

export type WeaponId=0|1|2|3|4;
export const BLASTER=0,SHOTGUN=1,AUTO=2,RIFLE=3,ROCKET=4;
export const WEAPON_IDS:WeaponId[]=[BLASTER,SHOTGUN,AUTO,RIFLE,ROCKET];
/**
 * mag — магазин (только у автомата и винтовки: они перезаряжаются), ammoMax — предел запаса вне магазина.
 * pickup — патроны, которые даёт подобранное оружие. spread — разброс в радианах (для одиночных пуль — базовый, см. spreadOf).
 */
export type Weapon={id:WeaponId;name:string;kind:string;interval:number;damage:number;pellets:number;spread:number;ammoMax:number;mag:number;reload:number;pickup:number};
export const WEAPONS:Weapon[]=[
 {id:0,name:'Бластер',kind:'Стартовое',interval:.1,damage:8,pellets:1,spread:.012,ammoMax:Infinity,mag:0,reload:0,pickup:0},
 {id:1,name:'Дробовик',kind:'Ближний бой',interval:1,damage:7,pellets:11,spread:.075,ammoMax:30,mag:0,reload:0,pickup:10},
 {id:2,name:'Автомат',kind:'Средняя дистанция',interval:.1,damage:12,pellets:1,spread:.006,ammoMax:90,mag:30,reload:2,pickup:60},
 {id:3,name:'Винтовка',kind:'Дальняя дистанция',interval:1.3,damage:75,pellets:1,spread:0,ammoMax:15,mag:5,reload:2.6,pickup:10},
 {id:4,name:'Ракетница',kind:'Урон по площади',interval:.8,damage:100,pellets:1,spread:0,ammoMax:25,mag:0,reload:0,pickup:8},
];
/** Попадание в голову из мгновенного оружия удваивает урон. */
export const HEAD_MULTIPLIER=2;
export const usesMagazine=(w:WeaponId)=>WEAPONS[w].mag>0;
/** Прицеливание по правой кнопке — только у автомата и винтовки (оптика ×5); во сколько раз сужается обзор. */
export const AIM_ZOOM:Partial<Record<WeaponId,number>>={2:1.3,3:5};
export const AIM_TIME=.2;

// Перегрев бластера: каждый выстрел греет, ствол остывает постоянно; около 3 с огня — пауза на остывание до нуля.
export const HEAT_PER_SHOT=.09;
export const HEAT_COOLING=.6;

/** Состояние стрелка, от которого зависит разброс одиночной пули. aim — доля прицеливания от 0 до 1. */
export type Steadiness={airborne:boolean;aim:number;crouch:boolean};
/** Разброс одиночной пули: у новых стволов он растёт в воздухе, а винтовка точна только в прицеле. */
export function spreadOf(w:WeaponId,s:Steadiness):number{
 if(w===AUTO){const base=WEAPONS[AUTO].spread*(1-.5*s.aim)*(s.crouch?.8:1);return s.airborne?base+.05:base;}
 if(w===RIFLE){const scoped=s.aim>.9;return (scoped?0:.08)+(s.airborne?.12:0);}
 return WEAPONS[w].spread;
}
/**
 * Паттерн отдачи автомата, как в CS: n-я пуля очереди уходит вверх, затем в стороны — [вверх, вправо] в радианах.
 * Одинаковый у всех: его можно выучить и гасить мышью.
 */
export function recoilOf(w:WeaponId,n:number):[number,number]{
 if(w!==AUTO||n<=0)return [0,0];
 const up=Math.min(n,9)*.0068+Math.max(0,n-9)*.0012;
 const side=n<9?Math.sin(n*.9)*.0012:n<18?(n-9)*.0026:(9*.0026)-(n-18)*.0034;
 return [up,side];
}
/** Пауза очереди, после которой паттерн отдачи начинается сначала. */
export const RECOIL_RESET=.35;

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
 mega:{respawn:30,name:'Мега-бонус'},rocket:{respawn:20,name:'Ракетница'},shotgun:{respawn:20,name:'Дробовик'},auto:{respawn:20,name:'Автомат'},rifle:{respawn:30,name:'Винтовка'},
 armor:{respawn:25,name:'Броня'},health:{respawn:20,name:'Аптечка'},shells:{respawn:20,name:'Патроны дробовика'},bullets:{respawn:20,name:'Патроны автомата'},
 rounds:{respawn:25,name:'Патроны винтовки'},rockets:{respawn:20,name:'Ракеты'},
};

export type Ammo=[number,number,number,number,number];
/** Запас бойца, которым управляет хост. ammo — патроны вне магазина, mag — в магазине (у автомата и винтовки). */
export type Loadout={health:number;armor:number;owned:[boolean,boolean,boolean,boolean,boolean];ammo:Ammo;mag:Ammo};
export const freshLoadout=():Loadout=>({health:MAX_HEALTH,armor:0,owned:[true,false,false,false,false],ammo:[Infinity,0,0,0,0],mag:[0,0,0,0,0]});
/** Сколько патронов у оружия всего — для выбора оружия и сообщения «пусто». */
export const totalAmmo=(l:Pick<Loadout,'ammo'|'mag'>,w:WeaponId)=>l.ammo[w]+l.mag[w];
/** Перезарядка: магазин добирается из запаса. Возвращает false, если нечего или некуда. */
export function reloadMagazine(l:Pick<Loadout,'ammo'|'mag'>,w:WeaponId){
 const need=WEAPONS[w].mag-l.mag[w],take=Math.min(need,l.ammo[w]);if(!usesMagazine(w)||take<=0)return false;
 l.mag[w]+=take;l.ammo[w]-=take;return true;
}
export const canReload=(l:Pick<Loadout,'ammo'|'mag'>,w:WeaponId)=>usesMagazine(w)&&l.mag[w]<WEAPONS[w].mag&&l.ammo[w]>0;

/** Подбор бонуса. Возвращает false, если бонус сейчас бесполезен и остаётся лежать. */
export function applyItem(l:Loadout,kind:ItemKind):boolean{
 const give=(w:WeaponId,n:number)=>{const before=l.ammo[w];l.ammo[w]=Math.min(WEAPONS[w].ammoMax,l.ammo[w]+n);return l.ammo[w]>before;};
 // Новое оружие приходит заряженным: магазин наполняется из подобранных патронов.
 const weapon=(w:WeaponId)=>{const had=l.owned[w];l.owned[w]=true;
  if(!had&&usesMagazine(w)){l.mag[w]=Math.min(WEAPONS[w].mag,WEAPONS[w].pickup);return give(w,WEAPONS[w].pickup-l.mag[w])||true;}
  return give(w,WEAPONS[w].pickup)||!had;};
 switch(kind){
  case 'health':if(l.health>=MAX_HEALTH)return false;l.health=Math.min(MAX_HEALTH,l.health+25);return true;
  case 'mega':l.health=Math.min(MEGA_HEALTH,l.health+100);return true;
  case 'armor':if(l.armor>=MAX_ARMOR)return false;l.armor=Math.min(MAX_ARMOR,l.armor+50);return true;
  case 'shotgun':return weapon(SHOTGUN);
  case 'auto':return weapon(AUTO);
  case 'rifle':return weapon(RIFLE);
  case 'rocket':return weapon(ROCKET);
  case 'shells':return give(SHOTGUN,10);
  case 'bullets':return give(AUTO,30);
  case 'rounds':return give(RIFLE,5);
  case 'rockets':return give(ROCKET,5);
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
