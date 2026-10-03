// Сетевые сообщения «Шпиля». Все сообщения — JSON с полем k.
// Гость → хост: hello, pose, fire, reload, ping. Хост → гости: welcome, reject, roster, snap, ev, pong.
import type {WeaponId} from './rules.ts';
import type {Stance} from './physics.ts';

export const PROTOCOL=5;
export type V3=[number,number,number];

export type SessionInfo={code:string;name:string;host:string;players:number;max:number;fragLimit:number;protocol:number};
export type SessionOptions={name:string;fragLimit:number;timeLimit:number;maxPlayers:number;closed:boolean};
export type RosterEntry={id:string;name:string;color:string};
export type MatchPhase='playing'|'sudden'|'over';

export type Hello={k:'hello';name:string;protocol:number};
/** life — номер жизни: позы из прошлой жизни (до респауна) хост отбрасывает. s — стойка, l — наклон от −1 до 1 (без них — стоя, без наклона), a — 1, если смотрит в оптику винтовки. */
export type Pose={k:'pose';life:number;p:V3;v:V3;yaw:number;pitch:number;w:WeaponId;s?:Stance;l?:number;a?:0|1};
/** lag — сколько секунд назад стрелок видел соперников (полпинга + задержка интерполяции). */
export type Fire={k:'fire';w:WeaponId;o:V3;d:V3;seed:number;lag:number;seq:number};
/** Перезарядка оружия w: хост добирает магазин из запаса, когда она закончится. */
export type Reload={k:'reload';w:WeaponId};
export type Ping={k:'ping';t:number};
export type GuestMessage=Hello|Pose|Fire|Reload|Ping;

/** Состояние игрока в снимке: id, x, y, z, yaw, pitch, оружие, здоровье, броня, жив, фраги, смерти, запас патронов оружия 1–4, магазины автомата и винтовки, владение (битовая маска), подтверждённый выстрел, жизнь, стойка, наклон, в оптике. */
export type PlayerSnap=[string,number,number,number,number,number,WeaponId,number,number,0|1,number,number,[number,number,number,number],[number,number],number,number,number,Stance,number,0|1];
export type Snapshot={k:'snap';t:number;phase:MatchPhase;left:number;winner:string|null;restart:number;items:string;players:PlayerSnap[]};

export type GameEvent=
 |{e:'shot';by:string;w:WeaponId;o:V3;d:V3;seed:number}
 |{e:'rocket';id:number;by:string;o:V3;d:V3}
 |{e:'boom';id:number;p:V3;by:string}
 |{e:'hurt';to:string;by:string;amount:number;knock:V3;from:V3}
 |{e:'hit';by:string;to:string;amount:number;head?:1}
 |{e:'kill';killer:string;victim:string;w:WeaponId|'lava'|'fall';head?:1}
 |{e:'reload';id:string;w:WeaponId}
 |{e:'spawn';id:string;p:V3;yaw:number;life:number}
 |{e:'pick';id:string;item:number}
 |{e:'match';phase:MatchPhase;winner:string|null};

export type Welcome={k:'welcome';id:string;name:string;color:string;options:SessionOptions};
export type Reject={k:'reject';reason:'full'|'protocol'};
export type Roster={k:'roster';players:RosterEntry[]};
export type Events={k:'ev';list:GameEvent[]};
export type Pong={k:'pong';t:number};
export type HostMessage=Welcome|Reject|Roster|Snapshot|Events|Pong;

export const r2=(v:number)=>Math.round(v*100)/100;
export const toV3=(v:{x:number;y:number;z:number}):V3=>[r2(v.x),r2(v.y),r2(v.z)];
export const fromV3=(v:V3)=>({x:v[0],y:v[1],z:v[2]});
export const isV3=(v:unknown):v is V3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e4);
