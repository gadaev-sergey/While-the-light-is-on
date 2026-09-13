export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, (a.y-b.y)*1.5);
export const meleeInRange = (source: {x:number;y:number;facing:number}, target: {x:number;y:number}, reach: number, lane = 58) => Math.abs(target.y-source.y) < lane && Math.abs(target.x-source.x) < reach && (target.x-source.x)*source.facing > -28;
export function normalize(x: number, y: number) { const d = Math.hypot(x,y); return d ? {x:x/d,y:y/d} : {x:0,y:0}; }
export function seededRandom(seed: number) { let value = seed; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
