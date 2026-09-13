import { sampleClip, blendPoses, smoothstep, type PoseLayer } from './animation.ts';

export type AttackInput='attack'|'heavy'|'kick';
export type SuperId='hotfix'|'delete'|'overflow';
export type MoveId='jab'|'heavy'|'kick'|'air-jab'|'air-heavy'|'air-kick'|SuperId;
export type StrikeStyle='jab'|'heavy'|'kick'|'uppercut'|'slam';
export interface Move {
  name:string; damage:number; duration:number; impact:number;
  reach:number; depth:number; knockback:number; stun:number; lunge:number;
  style:StrikeStyle; color:string; sheet:'punch'|'attack'|'kick'; poses:readonly number[]; contact:number;
  launch?:number; knockdown?:number; finisher?:boolean; armorBreak?:boolean;
}
const jab:Move={name:'Удар рукой',damage:20,duration:.34,impact:.12,reach:148,depth:57,knockback:10,stun:.63,lunge:32,style:'jab',color:'#adf5db',sheet:'punch',poses:[0,1,2,3,4,5,6,7],contact:4};
const heavy:Move={...jab,name:'Удар клавиатурой',damage:38,duration:.64,impact:.30,reach:178,depth:72,knockback:32,stun:.8,lunge:45,style:'heavy',color:'#ffbd82',sheet:'attack',poses:[0,2,3,4,5,7],contact:3};
const kick:Move={...jab,name:'Удар ногой',damage:28,duration:.48,impact:.21,reach:184,depth:61,knockback:28,stun:.75,lunge:24,style:'kick',color:'#bcabff',sheet:'kick',poses:[0,1,2,3,4,5,6,7,8]};
export const MOVES:Record<MoveId,Move>={
  jab,heavy,kick,
  'air-jab':{...jab,name:'Воздушный кулак',damage:18},
  'air-heavy':{...heavy,name:'Сброс клавиатуры',damage:38,knockdown:.65,style:'slam'},
  'air-kick':{...kick,name:'Воздушный пинок',damage:30,knockback:80},
  hotfix:{...heavy,name:'HOTFIX',damage:130,duration:.88,impact:.38,reach:840,depth:70,knockback:155,stun:.8,finisher:true,armorBreak:true,color:'#a9ffe0',poses:[0,2,3,4,5,7],lunge:0},
  delete:{...heavy,name:'CTRL · ALT · DEL',damage:115,duration:1.05,impact:.46,reach:350,depth:105,knockback:175,knockdown:1,finisher:true,armorBreak:true,style:'slam',color:'#ffca8b',lunge:0},
  overflow:{...heavy,name:'STACK OVERFLOW',damage:96,duration:.98,impact:.40,reach:240,depth:85,knockback:0,launch:650,finisher:true,armorBreak:true,style:'uppercut',color:'#c7aeff',poses:[0,5,4,2,3,0],contact:4,lunge:0},
};
export const ATTACK_KEYS:Record<AttackInput,string>={attack:'J',heavy:'K',kick:'L'};
export const COMBOS:{id:SuperId;inputs:AttackInput[];description:string}[]=[
  {id:'delete',inputs:['attack','attack','heavy'],description:'Клавиатура раскалывает землю: широкая ударная волна сбивает толпу и пробивает броню.'},
  {id:'overflow',inputs:['attack','kick','heavy'],description:'Из земли вырываются столбы кода. Подбрасывают врагов для атаки в прыжке.'},
  {id:'hotfix',inputs:['heavy','attack','kick'],description:'Выпускает огромную электрическую клавишу, которая пронзает всех врагов на пути.'},
];
export const CHAIN_WINDOW=.9;
export const SUPER_WINDOW=14;
export const isAttackInput=(input:string):input is AttackInput=>input==='attack'||input==='heavy'||input==='kick';
export function resolveMove(input:AttackInput,air:boolean):MoveId {
  return input==='attack'?(air?'air-jab':'jab'):input==='heavy'?(air?'air-heavy':'heavy'):(air?'air-kick':'kick');
}
export const matchingCombo=(chain:readonly AttackInput[])=>COMBOS.find(c=>c.inputs.length===chain.length&&chain.every((v,i)=>v===c.inputs[i]));
export const hasContinuation=(chain:readonly AttackInput[])=>COMBOS.some(c=>c.inputs.length>chain.length&&chain.every((v,i)=>v===c.inputs[i]));
export const comboBaseDamage=(combo:(typeof COMBOS)[number])=>combo.inputs.reduce((sum,input)=>sum+MOVES[resolveMove(input,false)].damage,0);

/** Each attack has its own atlas, with contact synchronized to simulation impact.
 * The complete recovery plays before a new press can start another attack. */
export function attackPose(move:Move,time:number):PoseLayer[]{
  const frames=move.poses.map(i=>`${move.sheet}:${i}`);
  if(time<move.impact)return sampleClip({frames:frames.slice(0,move.contact+1),duration:move.impact},time);
  return sampleClip({frames:frames.slice(move.contact),duration:move.duration-move.impact},time-move.impact);
}
export function blendAttack(from:PoseLayer[],move:Move,time:number){
  return blendPoses(from,attackPose(move,time),smoothstep(time/.065));
}
