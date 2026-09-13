export type Phase = 'menu' | 'playing' | 'paused' | 'upgrade' | 'won' | 'lost';
export type EnemyKind = 'bug' | 'feature' | 'boss';
import type { MoveId, StrikeStyle, SuperId } from './combat.ts';
export type Action = 'attack' | 'heavy' | 'kick' | 'super' | 'dash' | 'pulse' | 'jump' | 'guard-start' | 'guard-end' | 'interact';
export type Upgrade = 'damage' | 'cooldown' | 'heal';
export interface Vec { x: number; y: number }
export interface Player extends Vec {
  previousX:number; previousY:number; elevation:number; previousElevation:number;
  walkDistance:number; previousWalkDistance:number;
  height:number; previousHeight:number; jumpTime:number;
  airHold:number; jumpSpeed:number;
  jumpPhase:'grounded'|'takeoff'|'airborne'|'landing';
  hp: number; maxHp: number; facing: number; moving: boolean;
  attack: number; attackCooldown: number; move:MoveId|null; attackConnected:boolean;
  guardHeld:boolean; guarding:boolean; guardTime:number; guardMeter:number;
  attackDuration:number; attackHit:boolean;
  dash: number; dashCooldown: number; dashX: number; dashY: number;
  pulseCooldown: number; invulnerable: number; hurt: number;
  damageMultiplier: number; cooldownMultiplier: number; lifesteal: number;
}
export interface Enemy extends Vec {
  previousX:number; previousY:number; elevation:number; previousElevation:number;
  height:number; previousHeight:number; verticalSpeed:number; juggleHits:number;
  id: number; kind: EnemyKind; hp: number; maxHp: number; facing: number;
  state: 'chase' | 'windup' | 'attack' | 'recover' | 'airborne' | 'down' | 'dead';
  timer: number; hurt: number; attackId: number; knockback: number;
  targetX: number; targetY: number; variation: number;
}
export interface Particle extends Vec {
  vx: number; vy: number; life: number; maxLife: number;
  size: number; color: string; type: 'spark' | 'mote' | 'code' | 'smoke';
}
export interface FloatText extends Vec { text: string; color: string; life: number; size: number }
export interface Slash extends Vec { life: number; facing: number; type: 'keyboard' | 'pulse'; style?:StrikeStyle; color?:string; finisher?:boolean }
export interface SuperEffect extends Vec {
  id:SuperId; facing:number; elevation:number; age:number; life:number; travelled:number; previousX:number; hitIds:number[];
}
export interface Pickup extends Vec { elevation:number; type: 'shard' | 'health'; life: number; seed: number }
export interface GameSettings { volume: number; particles: boolean; shake: boolean; difficulty: 'normal' | 'story' }
export interface GameStats { kills: number; shards: number; hits: number; time: number; bestCombo: number }
export interface Sector { name: string; subtitle: string; start: number; end: number; enemies: {kind: EnemyKind; x: number; y: number; floor:0|1}[] }
export type SoundName = 'swing' | 'heavy' | 'launch' | 'block' | 'parry' | 'hit' | 'dash' | 'pulse' | 'jump' | 'land' | 'hurt' | 'kill' | 'pickup' | 'win' | 'start';
