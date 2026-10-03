import * as T from 'three';
import {disposeTree} from '../engine/renderer.ts';
export interface LayoutRoom {id:string;name:string;x:number;width:number;floor:number;depth:number;color:string}
export interface LayoutDoor {id:string;name:string;x:number;floor:number;open:boolean}
export interface LayoutStair {id:string;name:string;a:number;b:number;from:number;to:number;kind?:'stairs'|'ladder'}
export interface LayoutOpening {id:string;name:string;room:string;x:number;bottom:number;width:number;height:number;kind:'window'|'breach';plane?:'back'|'divider'}
export interface Layout {version:1;floorHeight:number;rooms:LayoutRoom[];doors:LayoutDoor[];stairs:LayoutStair[];openings:LayoutOpening[];spawn:{x:number;floor:number}}
export interface LayoutIssue {id:string;message:string}
export const defaultLayout=():Layout=>({version:1,floorHeight:3,rooms:[{id:'room-1',name:'Главная комната',x:-4,width:8,floor:0,depth:4,color:'#858880'}],doors:[],stairs:[],openings:[],spawn:{x:0,floor:0}});
export function layoutIssues(l:Layout):LayoutIssue[]{
 const errors:LayoutIssue[]=[],issue=(id:string,message:string)=>errors.push({id,message});
 if(!l||l.version!==1||!Number.isFinite(l.floorHeight)||l.floorHeight<2.3||l.floorHeight>8||![l.rooms,l.doors,l.stairs,l.openings].every(Array.isArray))return [{id:'layout',message:'Некорректная планировка или высота этажа (2,3–8 м).'}];
 if(!l.spawn||!Number.isFinite(l.spawn.x)||!Number.isInteger(l.spawn.floor)||[...l.rooms,...l.doors,...l.stairs,...l.openings].some(i=>!i||typeof i.id!=='string'||typeof i.name!=='string')||l.rooms.some(r=>![r.x,r.width,r.floor,r.depth].every(Number.isFinite))||l.doors.some(d=>![d.x,d.floor].every(Number.isFinite))||l.stairs.some(s=>![s.a,s.b,s.from,s.to].every(Number.isFinite))||l.openings.some(o=>![o.x,o.bottom,o.width,o.height].every(Number.isFinite)))return [{id:'layout',message:'Повреждены данные планировки: проверьте элементы, координаты и появление.'}];
 const ids=new Set<string>();for(const item of [...l.rooms,...l.doors,...l.stairs,...l.openings]){if(ids.has(item.id))issue(item.id,'Повторяющийся элемент планировки.');ids.add(item.id);}
 for(const r of l.rooms){if(!Number.isFinite(r.x)||!Number.isFinite(r.width)||!Number.isInteger(r.floor)||r.width<1||r.width>100||r.depth<1||r.depth>30)issue(r.id,r.name+': проверьте размеры комнаты.');for(const b of l.rooms)if(r.id<b.id&&r.floor===b.floor&&r.x<b.x+b.width-.01&&r.x+r.width>b.x+.01)issue(r.id,r.name+': пересечение с комнатой «'+b.name+'».');}
 const room=(x:number,f:number)=>l.rooms.find(r=>r.floor===f&&x>=r.x-.01&&x<=r.x+r.width+.01);
 for(const d of l.doors)if(!l.rooms.some(r=>r.floor===d.floor&&(Math.abs(r.x-d.x)<.02||Math.abs(r.x+r.width-d.x)<.02)))issue(d.id,d.name+': дверь должна находиться на границе комнаты.');
 for(const s of l.stairs)if(!room(s.a,s.from)||!room(s.b,s.to)||s.to!==s.from+1||(s.kind==='ladder'?Math.abs(s.b-s.a)>.01:Math.abs(s.b-s.a)<1.5))issue(s.id,s.name+': соедините комнаты соседних этажей; длина марша — от 1,5 м.');
 for(const o of l.openings){const r=l.rooms.find(r=>r.id===o.room);if(!r||!['window','breach'].includes(o.kind)||o.plane&&!['back','divider'].includes(o.plane)||o.width<=0||o.height<=0||(o.plane==='divider'?(Math.min(Math.abs(o.x-r.x),Math.abs(o.x-r.x-r.width))>.02||o.width>r.depth):(o.x-o.width/2<r.x||o.x+o.width/2>r.x+r.width))||o.bottom<0||o.bottom+o.height>l.floorHeight-.15)issue(o.id,o.name+': проём должен помещаться на выбранной стене комнаты.');}
 if(!room(l.spawn?.x,l.spawn?.floor))issue('spawn','Точка появления должна быть внутри комнаты.');
 const reached=new Set<string>(),start=room(l.spawn?.x,l.spawn?.floor);if(start)reached.add(start.id);
 for(let i=0;i<l.rooms.length;i++){for(const d of [...l.doors,...l.openings.filter(isPassage).map(o=>({x:o.x,floor:l.rooms.find(r=>r.id===o.room)?.floor??0}))]){const a=room(d.x-.05,d.floor),b=room(d.x+.05,d.floor);if(a&&b&&(reached.has(a.id)||reached.has(b.id))){reached.add(a.id);reached.add(b.id);}}for(const s of l.stairs){const a=room(s.a,s.from),b=room(s.b,s.to);if(a&&b&&(reached.has(a.id)||reached.has(b.id))){reached.add(a.id);reached.add(b.id);}}}
 for(const r of l.rooms)if(!reached.has(r.id))issue(r.id,r.name+': нет маршрута от точки появления. Добавьте дверь или лестницу.');
 return errors;
}
export function assertLayout(l:Layout){const errors=layoutIssues(l);if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));}
const isPassage=(o:LayoutOpening)=>o.plane==='divider'&&o.kind==='breach'&&o.bottom===0&&o.height>=1.8&&o.width>0;
export function wallCrossing(l:Layout,from:number,to:number,floor:number,open:Set<string>){for(const r of l.rooms.filter(r=>r.floor===floor))for(const x of [r.x,r.x+r.width])if((from-x)*(to-x)<=0&&from!==to&&!l.doors.some(d=>d.floor===floor&&Math.abs(d.x-x)<.02&&open.has(d.id))&&!l.openings.some(o=>isPassage(o)&&Math.abs(o.x-x)<.02&&l.rooms.find(r=>r.id===o.room)?.floor===floor))return x;return null;}
export function visibleRooms(l:Layout,x:number,floor:number,open:Set<string>){
 const roomAt=(x:number,floor:number)=>l.rooms.find(r=>r.floor===floor&&x>=r.x&&x<=r.x+r.width),start=roomAt(x,floor),seen=new Set(start?[start.id]:[]);
 for(let i=0;i<l.rooms.length;i++)for(const door of [...l.doors.filter(d=>open.has(d.id)),...l.openings.filter(o=>o.plane==='divider').map(o=>({x:o.x,floor:l.rooms.find(r=>r.id===o.room)?.floor??0}))]){const a=roomAt(door.x-.05,door.floor),b=roomAt(door.x+.05,door.floor);if(a&&b&&(seen.has(a.id)||seen.has(b.id))){seen.add(a.id);seen.add(b.id);}}
 // A stair aperture exposes the connected room when the viewer is on the flight.
 for(const s of l.stairs)if(Math.abs(x-(floor===s.from?s.a:s.b))<.8&&(floor===s.from||floor===s.to)){const a=roomAt(s.a,s.from),b=roomAt(s.b,s.to);if(a&&b&&(seen.has(a.id)||seen.has(b.id))){seen.add(a.id);seen.add(b.id);}}
 return seen;
}
/** Geometry, collisions, sight and door light occlusion derive from these records. */
export class LayoutView {
 root=new T.Group();doors=new Map<string,T.Group>();key='';
 constructor(private scene:T.Scene){scene.add(this.root);}
 apply(l:Layout){const structural=layoutIssues(l).find(i=>i.id==='layout');if(structural)throw new Error(structural.message);const key=JSON.stringify(l);if(key===this.key)return;this.key=key;disposeTree(this.root);this.root.clear();this.doors.clear();
  const errors=new Set(layoutIssues(l).map(e=>e.id));
  const box=(root:T.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string,id:string)=>{const mesh=new T.Mesh(new T.BoxGeometry(Math.max(.01,w),Math.max(.01,h),Math.max(.01,d)),new T.MeshStandardMaterial({color:errors.has(id)?'#b54f52':color,roughness:.85}));mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.layoutId=id;root.add(mesh);return mesh;};
  const boundaries=new Set<string>();
  for(const r of l.rooms){const y=r.floor*l.floorHeight,h=l.floorHeight,back=-r.depth/2;
   const holes=l.stairs.filter(s=>s.to===r.floor&&s.b>=r.x&&s.b<=r.x+r.width).map(s=>s.kind==='ladder'?[s.b-.45,s.b+.45]:[Math.min(s.a,s.b),Math.max(s.a,s.b)+.3]);let spans=[[r.x,r.x+r.width]];for(const [a,b] of holes)spans=spans.flatMap(([x,z])=>z<=a||x>=b?[[x,z]]:[[x,Math.max(x,a)],[Math.min(z,b),z]].filter(([x,z])=>z-x>.01));
   for(const [a,b] of spans)box(this.root,(a+b)/2,y-.09,0,b-a,.18,r.depth,'#646761',r.id);
   box(this.root,r.x+r.width/2,y-.09,r.depth/2-.12,r.width,.18,.24,'#42453f',r.id);
   const openings=l.openings.filter(o=>o.room===r.id&&o.plane!=='divider'),xs=[r.x,r.x+r.width,...openings.flatMap(o=>[o.x-o.width/2,o.x+o.width/2])].sort((a,b)=>a-b);
   for(let i=1;i<xs.length;i++){const a=xs[i-1],b=xs[i],o=openings.find(o=>(a+b)/2>o.x-o.width/2&&(a+b)/2<o.x+o.width/2);if(!o)box(this.root,(a+b)/2,y+h/2,back,b-a,h,.14,r.color,r.id);else{if(o.bottom)box(this.root,(a+b)/2,y+o.bottom/2,back,b-a,o.bottom,.14,r.color,r.id);box(this.root,(a+b)/2,y+(h+o.bottom+o.height)/2,back,b-a,h-o.bottom-o.height,.14,r.color,r.id);}}
   for(const x of [r.x,r.x+r.width]){const k=x+':'+r.floor;if(boundaries.has(k))continue;boundaries.add(k);const door=l.doors.find(d=>d.floor===r.floor&&Math.abs(d.x-x)<.02);const opening=l.openings.find(o=>o.plane==='divider'&&Math.abs(o.x-x)<.02&&l.rooms.find(room=>room.id===o.room)?.floor===r.floor);
    if(!door&&opening){const w=Math.min(opening.width,r.depth),bottom=opening.bottom,top=bottom+opening.height;
     if(bottom>0)box(this.root,x,y+bottom/2,0,.14,bottom,r.depth,r.color,opening.id);
     if(top<h)box(this.root,x,y+(top+h)/2,0,.14,h-top,r.depth,r.color,opening.id);
     const side=(r.depth-w)/2;if(side>0)for(const sign of [-1,1])box(this.root,x,y+(bottom+top)/2,sign*(w+side)/2,.14,opening.height,side,r.color,opening.id);
    }else if(!door)box(this.root,x,y+h/2,0,.14,h,r.depth,r.color,r.id);else{box(this.root,x,y+(h+2.1)/2,0,.16,h-2.1,r.depth,r.color,door.id);box(this.root,x,y+1.05,-r.depth/4-.3,.16,2.1,r.depth/2-.6,r.color,door.id);box(this.root,x,y+1.05,r.depth/4+.3,.16,2.1,r.depth/2-.6,r.color,door.id);const pivot=new T.Group();pivot.position.set(x,y,-.6);box(pivot,0,1.03,.6,.08,2.06,1.16,'#6f513a',door.id);this.root.add(pivot);this.doors.set(door.id,pivot);}}
  }
  for(const s of l.stairs){if(s.kind==='ladder'){for(const offset of [-.35,.35])box(this.root,s.a+offset,(s.from+.5)*l.floorHeight,-.75,.06,l.floorHeight,.09,'#89877d',s.id);for(let y=.2;y<l.floorHeight;y+=.28)box(this.root,s.a,s.from*l.floorHeight+y,-.75,.7,.05,.08,'#89877d',s.id);continue;}const steps=16;for(let i=0;i<steps;i++){const t=(i+.5)/steps;box(this.root,s.a+(s.b-s.a)*t,s.from*l.floorHeight+(i+1)*l.floorHeight/steps-.06,-.75,Math.abs(s.b-s.a)/steps+.02,.12,1.1,'#89877d',s.id);}}
  const spawn=new T.Mesh(new T.ConeGeometry(.16,.4,16),new T.MeshBasicMaterial({color:errors.has('spawn')?'#ff5555':'#8fd8bd'}));spawn.position.set(l.spawn.x,l.spawn.floor*l.floorHeight+.2,0);spawn.userData.layoutId='spawn';spawn.userData.editorOnly=true;this.root.add(spawn);this.setDoors(new Set(l.doors.filter(d=>d.open).map(d=>d.id)));
 }
 setDoors(open:Set<string>){for(const [id,g] of this.doors)g.rotation.y=open.has(id)?Math.PI/2:0;}
 dispose(){disposeTree(this.root);this.root.removeFromParent();}
}
