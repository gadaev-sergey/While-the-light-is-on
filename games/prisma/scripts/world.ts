import type {SceneDocument} from '@shelter/scene.ts';

export type Color = 'amber' | 'cyan';
export type Kind = 'source' | 'target' | 'mirror' | 'splitter' | 'wall';
export interface Piece {id:string;x:number;y:number;kind:Kind;color:Color;direction:number;angle:number}
export interface Level {id:string;name:string;size:number;chapter:number;caption:string;lesson:string;pieces:Piece[]}
export interface Segment {x1:number;y1:number;x2:number;y2:number;color:Color}
export interface Trace {segments:Segment[];lit:Set<string>;touched:Set<string>;wrong:Set<string>;won:boolean}
export const DIRECTIONS = [[1,0],[0,1],[-1,0],[0,-1]] as const;
export const COLORS = {amber:'#ffca83',cyan:'#79e5de'};
export const rotatable = (p:Piece)=>p.kind==='mirror'||p.kind==='splitter';
export const reflect = (direction:number,angle:number)=>angle===0?[3,2,1,0][direction]:[1,0,3,2][direction];

export function readLevel(scene:SceneDocument):Level {
 const meta=scene.moduleData?.prisma as {size:number;chapter:number;caption:string;lesson:string}|undefined;
 if(!meta||!Number.isInteger(meta.size)||meta.size<5||meta.size>9||!Number.isInteger(meta.chapter)||meta.chapter<0||meta.chapter>2||typeof meta.caption!=='string'||typeof meta.lesson!=='string')throw new Error('Некорректная оптическая сцена: '+scene.name);
 const pieces:Piece[]=scene.nodes.map(n=>{const v=n.components?.find(c=>c.type==='prisma.optic')?.values;if(!v)throw new Error('Отсутствует оптический компонент');return {id:n.id,x:n.transform.position[0],y:n.transform.position[2],kind:v.kind as Kind,color:v.color as Color,direction:Number(v.direction),angle:Number(v.angle)};});
 const occupied=new Set<string>();
 for(const p of pieces){const key=`${p.x},${p.y}`;if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=meta.size||p.y>=meta.size||occupied.has(key)||!['source','target','mirror','splitter','wall'].includes(p.kind)||!['amber','cyan'].includes(p.color)||!Number.isInteger(p.direction)||p.direction<0||p.direction>3||![0,1].includes(p.angle))throw new Error('Некорректный оптический элемент '+p.id);occupied.add(key);}
 if(!pieces.some(p=>p.kind==='source')||!pieces.some(p=>p.kind==='target')||pieces.filter(rotatable).length>16)throw new Error('Проверьте источники, приёмники и зеркала.');
 return {id:scene.id!,name:scene.name,...meta,pieces};
}

// Rays cross freely. A splitter keeps the incoming ray and adds its reflection.
// The direction + color visited set makes even a closed optical loop finite.
export function trace(level:Level,angles:readonly number[]):Trace {
 const map=new Map(level.pieces.map(p=>[`${p.x},${p.y}`,p]));
 const mirrors=level.pieces.filter(rotatable),orientations=new Map(mirrors.map((p,i)=>[p.id,angles[i]]));
 const rays=level.pieces.filter(p=>p.kind==='source').map(p=>({x:p.x,y:p.y,d:p.direction,color:p.color}));
 const segments:Segment[]=[],lit=new Set<string>(),touched=new Set<string>(),wrong=new Set<string>(),visited=new Set<string>();
 for(let cursor=0;cursor<rays.length;cursor++){
  let {x,y,d,color}=rays[cursor];
  while(true){
   const visit=`${x},${y},${d},${color}`;if(visited.has(visit))break;visited.add(visit);
   const [dx,dy]=DIRECTIONS[d],nx=x+dx,ny=y+dy;
   if(nx<0||ny<0||nx>=level.size||ny>=level.size){segments.push({x1:x,y1:y,x2:x+dx*.48,y2:y+dy*.48,color});break;}
   const p=map.get(`${nx},${ny}`);segments.push({x1:x,y1:y,x2:nx,y2:ny,color});x=nx;y=ny;
   if(!p)continue;touched.add(p.id);
   if(p.kind==='target'){if(p.color===color)lit.add(p.id);else wrong.add(p.id);break;}
   if(p.kind==='wall'||p.kind==='source')break;
   const reflected=reflect(d,orientations.get(p.id)??p.angle);
   if(p.kind==='splitter')rays.push({x,y,d:reflected,color});else d=reflected;
  }
 }
 return {segments,lit,touched,wrong,won:level.pieces.filter(p=>p.kind==='target').every(p=>lit.has(p.id))};
}
export function solutions(level:Level):number[][] {
 const count=level.pieces.filter(rotatable).length,result:number[][]=[];
 for(let mask=0;mask<2**count;mask++){const angles=Array.from({length:count},(_,i)=>(mask>>i)&1);if(trace(level,angles).won)result.push(angles);}
 return result;
}
export const distance=(a:readonly number[],b:readonly number[])=>a.reduce((sum,v,i)=>sum+Number(v!==b[i]),0);
export class Puzzle {
 level:Level;angles:number[];history:number[][]=[];moves=0;hints=0;answers:number[][];par:number;
 constructor(level:Level){this.level=level;this.angles=level.pieces.filter(rotatable).map(p=>p.angle);this.answers=solutions(level);if(!this.answers.length)throw new Error('Уровень не имеет решения: '+level.name);this.par=Math.min(...this.answers.map(a=>distance(a,this.angles)));}
 get result(){return trace(this.level,this.angles);}
 rotate(id:string){const i=this.level.pieces.filter(rotatable).findIndex(p=>p.id===id);if(i<0||this.result.won)return false;this.history.push([...this.angles]);this.angles[i]=1-this.angles[i];this.moves++;return true;}
 undo(){const previous=this.history.pop();if(!previous)return false;this.angles=previous;this.moves=Math.max(0,this.moves-1);return true;}
 reset(){this.angles=this.level.pieces.filter(rotatable).map(p=>p.angle);this.history=[];this.moves=0;this.hints=0;}
 hint(){if(this.result.won)return null;const nearest=this.answers.reduce((a,b)=>distance(a,this.angles)<=distance(b,this.angles)?a:b);const i=nearest.findIndex((v,i)=>v!==this.angles[i]);if(i<0)return null;this.hints++;return this.level.pieces.filter(rotatable)[i].id;}
 get stars(){return this.result.won?(this.hints?1:this.moves<=this.par?3:2):0;}
 save(){return {angles:[...this.angles],moves:this.moves,hints:this.hints};}
 restore(value:unknown){const s=value as ReturnType<Puzzle['save']>;if(!s||!Array.isArray(s.angles)||s.angles.length!==this.angles.length||s.angles.some(v=>v!==0&&v!==1)||!Number.isInteger(s.moves)||s.moves<0||s.moves>1e6||!Number.isInteger(s.hints)||s.hints<0||s.hints>1e6)return false;this.angles=[...s.angles];this.moves=s.moves;this.hints=s.hints;this.history=[];return true;}
}
