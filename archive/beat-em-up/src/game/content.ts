import { OFFICE_LEVELS } from './terrain.ts';
import type { EnemyKind, Sector } from './types.ts';
export const VIEW = { width: 1280, height: 720, minY: 518, maxY: 641, worldWidth: 4140 };
export const ENEMIES: Record<EnemyKind, { name: string; tag: string; hp: number; damage: number; speed: number; range: number; windup: number; recovery: number; color: string; height: number; description: string }> = {
  bug: { name: 'Синтаксический жук', tag: 'SYNTAX_ERROR', hp: 64, damage: 9, speed: 88, range: 79, windup: .72, recovery: 1.15, color: '#ff9d61', height: 130, description: 'Одна пропущенная скобка — и у неё уже шесть лап. Сближается стаей. Перед укусом замирает: лучшее время для рывка.' },
  feature: { name: 'Незапланированная фича', tag: 'FEATURE_CREEP', hp: 124, damage: 15, speed: 68, range: 108, windup: 1, recovery: 1.55, color: '#be9cf5', height: 186, description: '«А можно ещё одну маленькую правку?» Растёт за пределы технического задания. Её тяжёлый выпад оставляет время для контратаки.' },
  boss: { name: 'Регрессия', tag: 'CRITICAL_EXCEPTION', hp: 620, damage: 22, speed: 49, range: 170, windup: 1.25, recovery: 1.8, color: '#ff8156', height: 280, description: 'Древний дефект, пробуждённый последним релизом. Раскалывает землю вокруг себя. Выйди из отмеченной области, перепрыгни волну или пройди через удар рывком.' }
};
export const SECTORS: Sector[] = [
  { name:'Вестибюль',subtitle:'Очистите ресепшен и антресоль',start:0,end:1380,enemies:[{kind:'bug',x:730,y:610,floor:0},{kind:'bug',x:1090,y:596,floor:0},{kind:'bug',x:1060,y:588,floor:1}] },
  { name:'Отдел разработки',subtitle:'Устраните баги в рабочих зонах',start:1380,end:2760,enemies:[{kind:'feature',x:2020,y:605,floor:0},{kind:'bug',x:2400,y:590,floor:0},{kind:'bug',x:1780,y:600,floor:1},{kind:'feature',x:2490,y:585,floor:1}] },
  { name:'Серверный центр',subtitle:'Остановите Регрессию и доберитесь до лифта',start:2760,end:4140,enemies:[{kind:'boss',x:3750,y:611,floor:1},{kind:'bug',x:3440,y:600,floor:0},{kind:'bug',x:3190,y:594,floor:1}] }
];
export const UPGRADES = [
  { id: 'damage', icon: 'keyboard', title: 'Чистый код', tag: 'REFACTOR', description: 'Каждый удар наносит на 25% больше урона.', value: '+25% УРОН' },
  { id: 'cooldown', icon: 'bolt', title: 'Горячая перезагрузка', tag: 'HOT_RELOAD', description: 'Рывок и импульс восстанавливаются на 25% быстрее.', value: '−25% ОТКАТ' },
  { id: 'heal', icon: 'heart', title: 'Сборщик мусора', tag: 'GARBAGE_COLLECTOR', description: 'Восстановите 40 HP. За устранение врага: +5 HP.', value: '+40 HP · ВАМПИРИЗМ' }
] as const;
/** Dedicated foreground cutouts remain below ankle height; tall room furniture
 * lives in the back-wall illustration, never between the camera and combat. */
export const PROPS=OFFICE_LEVELS.flatMap(level=>[
  {frame:0,x:level.start+175,y:665,h:51,elevation:0},
  {frame:1,x:level.start+440,y:659,h:42,elevation:0},
  {frame:3,x:level.start+1080,y:671,h:52,elevation:0},
  {frame:4,x:level.start+1260,y:676,h:56,elevation:0},
  {frame:2,x:level.start+290,y:648,h:39,elevation:280},
  {frame:5,x:level.start+1090,y:648,h:36,elevation:280},
]);
