import {BASE,DOORS,OBJECTS,ROOMS,STAIRS,clamp,floorY,roomAt} from './config.ts';
import {canSee,occluders,visibleRoomSamples,angularDifference,BEAM_HALF,type Sight} from './visibility.ts';
import type {Action,BaseObject,BaseSave,Dog,Door,Floor,Navigation,Player,Resources,Task,Vec} from './types.ts';
export class BaseWorld{
 player!:Player;dog!:Dog;doors:Door[]=[];objects:BaseObject[]=[];inventory!:Resources;explored=new Set<string>();
 phase:'playing'|'paused'='playing';flashlight=true;powered=false;time=0;aim=0;mouseAim=false;task:Task|null=null;navigation:Navigation|null=null;
 toast='';toastTime=0;toastKind:'info'|'good'|'warn'='info';sight!:Sight;onSound=(name:string)=>{};revision=0;
 constructor(){this.reset();}
 reset(){
  this.player={x:595,y:floorY(0),previousX:595,previousY:floorY(0),floor:0,facing:1,moving:false,distance:0,previousDistance:0,hp:100,attack:0,attackHit:false,hurt:0,stair:null};
  this.dog={x:2010,previousX:2010,facing:-1,mode:'idle',timer:3,hp:60,hit:0};
  this.inventory={wood:0,scrap:0,cloth:0,water:0,fuse:0,bandage:0};this.doors=DOORS.map(d=>({...d}));this.objects=OBJECTS.map(o=>({...o}));this.explored=new Set(['hall']);
  this.flashlight=true;this.powered=false;this.time=0;this.aim=0;this.mouseAim=false;this.task=null;this.navigation=null;this.phase='playing';this.refreshSight();this.revision++;
  this.notify('Дом — ваша база. Осмотритесь и загляните в ящик рядом.');
 }
 notify(text:string,kind:'info'|'good'|'warn'='info'){this.toast=text;this.toastKind=kind;this.toastTime=4.5;}
 get currentRoom(){return roomAt(this.player.x,this.player.floor);}
 get location(){return this.player.stair?'Лестница':this.currentRoom?.name||'Двор';}
 get lightOrigin(){return {x:this.player.x+this.player.facing*17,y:this.player.y-69};}
 refreshSight(){this.sight={origin:this.lightOrigin,angle:this.aim,flashlight:this.flashlight,powered:this.powered,segments:occluders(this.doors)};for(const id of visibleRoomSamples(this.sight))this.explored.add(id);}
 visible(point:Vec){return canSee(this.sight,point);}
 objectPoint(o:BaseObject){return {x:o.x,y:floorY(o.floor)-Math.min(o.height*.5,58)};}
 visibleObjects(){return this.objects.filter(o=>!(o.kind==='rubble'&&o.searched)&&this.visible(this.objectPoint(o)));}
 visibleDoors(){return this.doors.filter(d=>this.visible({x:d.x,y:floorY(d.floor)-65}));}
 get dogVisible(){return this.dog.hp>0&&this.visible({x:this.dog.x,y:floorY(0)-35});}
 nearby(){
  const p=this.player;if(p.stair||p.attack||p.hurt)return null;
  const targets=[...this.visibleObjects(),...this.visibleDoors()].filter(o=>o.floor===p.floor&&Math.abs(o.x-p.x)<76);
  targets.sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x));return targets[0]||null;
 }
 description(id:string){
  const d=this.doors.find(d=>d.id===id);if(d)return {title:d.name,verb:d.open?'Закрыть':'Открыть',detail:d.open?'Закрытая дверь перекрывает обзор':'За дверью может быть ещё одна комната',seconds:0};
  const o=this.objects.find(o=>o.id===id);if(!o)return null;
  const entries:Record<string,[string,string,number]>={
   chest:[o.searched?'Осмотрено':'Обыскать',o.searched?'Здесь больше ничего нет':'Проверить содержимое',1.5],
   wardrobe:[o.searched?'Осмотрено':'Обыскать',o.searched?'Шкаф пуст':'Поискать полезные вещи',1.8],
   rubble:[o.searched?'Расчищено':'Разобрать','Можно получить древесину и детали',2.8],
   workbench:['Сделать бинт','Нужно: 2 ткани',2.4],bed:['Отдохнуть','Восстанавливает здоровье',3.2],sink:['Набрать воды',o.uses?'Запас воды исчерпан':'Осталась одна порция чистой воды',1.6],
   medicine:[o.searched?'Осмотрено':'Забрать','Медикаменты для первой помощи',1],barrel:['Набрать воды',o.uses>=2?'Бочка пуста':'Дождевая вода · 2 порции',1.7],
   generator:[this.powered?'Работает':'Запустить',this.powered?'Электричество подано в дом':'Нужно: 2 детали + предохранитель',2.5],
   fusebox:[this.powered?'Питание включено':'Проверить','Питание поступает от генератора в подвале',.8],
  };const [verb,detail,seconds]=entries[o.kind];return {title:o.name,verb,detail,seconds};
 }
 action(action:Action){
  if(this.phase!=='playing')return;
  const p=this.player;
  if(action.type==='flashlight'){this.flashlight=!this.flashlight;this.onSound('click');this.refreshSight();return;}
  if(action.type==='bandage'){if(!this.task&&!p.stair&&this.inventory.bandage>0&&p.hp<100){this.inventory.bandage--;p.hp=Math.min(100,p.hp+35);this.notify('Перевязка: +35 здоровья','good');this.onSound('done');}else this.notify(p.hp>=100?'Вы здоровы':'В рюкзаке нет бинтов');return;}
  if(action.type==='shove'){if(!p.stair&&!p.attack&&!this.task){p.attack=.42;p.attackHit=false;this.navigation=null;this.onSound('swing');}return;}
  if(action.type==='up'||action.type==='down'){this.navigation=null;this.tryStair(action.type==='up'?1:-1);return;}
  if(action.type==='interact'){
   if(p.stair||p.attack||p.hurt)return;if(this.task){this.cancelTask();return;}
   const id=action.target||this.nearby()?.id;if(!id)return;
   const object=this.objects.find(o=>o.id===id),door=this.doors.find(o=>o.id===id),target=object||door;
   if(!target||target.floor!==p.floor||Math.abs(target.x-p.x)>76||!this.visible({x:target.x,y:floorY(target.floor)-55}))return;
   if(door){door.open=!door.open;this.navigation=null;this.refreshSight();this.onSound('door');this.revision++;return;}
   if(!object)return;
   if(['chest','wardrobe','medicine','rubble'].includes(object.kind)&&object.searched){this.notify('Здесь больше ничего нет');return;}
   if(object.kind==='generator'&&(this.powered||this.inventory.scrap<2||this.inventory.fuse<1)){this.notify(this.powered?'Генератор уже работает':'Для генератора нужны 2 детали и предохранитель','warn');return;}
   if(object.kind==='workbench'&&this.inventory.cloth<2){this.notify('Нужно 2 ткани для бинта','warn');return;}
   if(object.kind==='bed'&&p.hp>=100){this.notify('Вы здоровы. Отдых пока не нужен');return;}
   if(object.kind==='sink'&&object.uses||object.kind==='barrel'&&object.uses>=2){this.notify('Вода закончилась');return;}
   const duration=this.description(id)!.seconds;this.task={id,duration,remaining:duration};this.navigation=null;p.moving=false;this.onSound('search');
  }
 }
 cancelTask(){this.task=null;this.notify('Действие прервано');}
 finishTask(){
  if(!this.task)return;const o=this.objects.find(o=>o.id===this.task!.id)!;this.task=null;o.uses++;const inv=this.inventory;let message='';
  switch(o.kind){
   case 'chest':o.searched=true;inv.wood+=3;inv.scrap+=2;message='Найдено: древесина ×3, детали ×2';break;
   case 'wardrobe':o.searched=true;inv.cloth+=3;inv.fuse++;message='Найдено: ткань ×3, предохранитель';break;
   case 'rubble':o.searched=true;inv.wood+=2;inv.scrap++;message='Расчищено: древесина ×2, деталь';break;
   case 'medicine':o.searched=true;inv.bandage++;message='В рюкзаке появился бинт. H — использовать';break;
   case 'workbench':inv.cloth-=2;inv.bandage++;message='Бинт готов. H — перевязать рану';break;
   case 'bed':this.player.hp=Math.min(100,this.player.hp+40);message='Вы отдохнули: +40 здоровья';break;
   case 'sink':case 'barrel':inv.water++;message='Получена чистая вода';break;
   case 'generator':inv.scrap-=2;inv.fuse--;this.powered=true;message='Генератор запущен. В доме появился свет';break;
   case 'fusebox':message=this.powered?'Напряжение в норме':'Электрощит исправен. Запустите генератор';break;
  }
  this.notify(message,'good');this.onSound('done');this.revision++;this.refreshSight();
 }
 setTarget(x:number,floor:Floor,object?:string){if(this.phase!=='playing')return;if(this.task)this.cancelTask();this.navigation={x:clamp(x,floor===0?70:BASE.houseLeft+25,floor===0?BASE.width-70:BASE.houseRight-25),floor,object};}
 tryStair(direction:number){
  const p=this.player;if(p.stair||p.attack||this.task)return false;
  const link=STAIRS.find(s=>direction>0?s.from===p.floor&&Math.abs(p.x-s.a)<70:s.to===p.floor&&Math.abs(p.x-s.b)<70);
  if(!link)return false;const reverse=direction<0;p.stair={id:link.id,t:0,reverse,approach:Math.abs(p.x-(reverse?link.b:link.a))/BASE.speed};return true;
 }
 move(dx:number,dt:number,run:boolean){
  const p=this.player,from=p.x;let next=clamp(from+dx*(run?BASE.runSpeed:BASE.speed)*dt,p.floor===0?70:BASE.houseLeft+23,p.floor===0?BASE.width-70:BASE.houseRight-23);
  for(const d of this.doors)if(d.floor===p.floor&&!d.open){if(from<=d.x-12&&next>d.x-12)next=d.x-12;if(from>=d.x+12&&next<d.x+12)next=d.x+12;}
  p.x=next;if(dx){p.facing=dx>0?1:-1;if(!this.mouseAim)this.aim=p.facing===1?0:Math.PI;}
  p.moving=Math.abs(next-from)>.001;p.distance+=Math.abs(next-from);
 }
 update(dt:number,direction=0,run=false){
  if(this.phase!=='playing')return;dt=Math.min(dt,.05);const p=this.player;p.previousX=p.x;p.previousY=p.y;p.previousDistance=p.distance;this.dog.previousX=this.dog.x;
  this.time+=dt;this.toastTime=Math.max(0,this.toastTime-dt);p.hurt=Math.max(0,p.hurt-dt);
  if(p.attack){p.attack=Math.max(0,p.attack-dt);p.moving=false;if(p.attack<.25&&!p.attackHit){p.attackHit=true;if(this.dog.hp>0&&p.floor===0&&Math.abs(p.x-this.dog.x)<110&&(this.dog.x-p.x)*p.facing>-10){this.dog.hp-=20;this.dog.x=clamp(this.dog.x+p.facing*85,1730,2150);this.dog.hit=.25;this.dog.mode='retreat';this.dog.timer=3;this.onSound('hit');}}}
  else if(p.stair){
   const s=STAIRS.find(s=>s.id===p.stair!.id)!,reverse=p.stair.reverse;
   if(p.stair.approach>0){const entry=reverse?s.b:s.a,dx=entry-p.x;p.x+=Math.sign(dx)*Math.min(Math.abs(dx),BASE.speed*dt);p.stair.approach=Math.max(0,p.stair.approach-dt);if(!p.stair.approach)p.x=entry;}
   else{p.stair.t=Math.min(1,p.stair.t+dt/1.85);const t=reverse?1-p.stair.t:p.stair.t;p.x=s.a+(s.b-s.a)*t;p.y=floorY(s.from)+(floorY(s.to)-floorY(s.from))*t;}
   p.facing=p.x>=p.previousX?1:-1;p.moving=true;p.distance+=Math.hypot(p.x-p.previousX,(p.y-p.previousY)*.45);if(!this.mouseAim)this.aim=p.facing===1?-.22:Math.PI-.22;
   if(p.stair.t>=1){p.floor=reverse?s.from:s.to;p.y=floorY(p.floor);p.stair=null;p.moving=false;this.revision++;}
  }else if(this.task){p.moving=false;if(direction){this.cancelTask();this.navigation=null;this.move(direction,dt,run);}else{this.task.remaining=Math.max(0,this.task.remaining-dt);if(!this.task.remaining)this.finishTask();}}
  else if(direction){this.navigation=null;this.move(direction,dt,run);}
  else if(this.navigation){
   const dest=this.navigation;let x=dest.x;
   if(p.floor!==dest.floor){const up=dest.floor>p.floor,stair=STAIRS.find(s=>up?s.from===p.floor:s.to===p.floor);if(stair){x=up?stair.a:stair.b;if(Math.abs(x-p.x)<15){this.tryStair(up?1:-1);this.refreshSight();return;}}}
   if(dest.object&&p.floor===dest.floor&&Math.abs(dest.x-p.x)<68){this.navigation=null;this.action({type:'interact',target:dest.object});this.refreshSight();return;}
   const distance=x-p.x;if(Math.abs(distance)>8){const before=p.x;this.move(Math.sign(distance),Math.min(dt,Math.abs(distance)/(run?BASE.runSpeed:BASE.speed)),run);if(before===p.x){this.navigation=null;this.notify('Дверь закрыта. E — открыть');}}
   else{p.moving=false;this.navigation=null;if(dest.object)this.action({type:'interact',target:dest.object});}
  }else p.moving=false;
  this.refreshSight();this.updateDog(dt);if(this.currentRoom)this.explored.add(this.currentRoom.id);
 }
 updateDog(dt:number){
  const d=this.dog,p=this.player;d.hit=Math.max(0,d.hit-dt);if(d.hp<=0){d.mode='rest';return;}d.timer-=dt;
  const near=p.floor===0&&!p.stair&&Math.abs(p.x-d.x)<135;
  const dogPoint={x:d.x,y:floorY(0)-35},beamAngle=Math.atan2(dogPoint.y-this.sight.origin.y,dogPoint.x-this.sight.origin.x);
  const lit=this.flashlight&&Math.abs(angularDifference(beamAngle,this.aim))<=BEAM_HALF&&this.visible(dogPoint)&&Math.abs(p.x-d.x)<330;
  if(lit&&p.x>1630){d.mode='retreat';d.timer=2.5;}
  if(d.mode==='retreat'){d.x+=Math.sign(2100-d.x)*48*dt;d.facing=1;if(Math.abs(d.x-2100)<5||d.timer<=0){d.mode='idle';d.timer=3;}}
  else if(near&&d.mode!=='warn'){d.mode='warn';d.timer=1.15;this.notify('Не подходите близко. Фонарик заставит пса отступить','warn');}
  else if(d.mode==='warn'){
   d.facing=p.x<d.x?-1:1;if(!near){d.mode='idle';d.timer=2;}
   else if(d.timer<=0){if(Math.abs(p.x-d.x)<90&&!p.hurt){p.hp=Math.max(0,p.hp-6);p.hurt=.8;this.onSound('hit');}d.mode='retreat';d.timer=2;if(p.hp<=0){p.hp=70;p.x=595;p.floor=0;p.y=floorY(0);p.previousX=p.x;p.previousY=p.y;this.notify('Вы отступили к дому','warn');}}
  }else if(d.timer<=0){d.mode=d.mode==='idle'?'walk':'idle';d.timer=d.mode==='walk'?3:4;d.facing=d.x>2000?-1:1;}
  if(d.mode==='walk')d.x=clamp(d.x+d.facing*23*dt,1870,2110);
 }
 aimAt(point:Vec){const origin=this.lightOrigin;this.aim=Math.atan2(point.y-origin.y,point.x-origin.x);this.mouseAim=true;if(!this.player.stair&&!this.player.attack)this.player.facing=point.x>=this.player.x?1:-1;this.refreshSight();}
 save():BaseSave{return {version:1,player:{x:this.player.x,floor:this.player.floor,hp:this.player.hp},inventory:{...this.inventory},doors:this.doors.map(d=>({id:d.id,open:d.open})),objects:this.objects.map(o=>({id:o.id,searched:o.searched,uses:o.uses})),explored:[...this.explored],powered:this.powered,flashlight:this.flashlight,time:this.time,dogHp:this.dog.hp};}
 restore(data:unknown){
  const s=data as BaseSave;if(!s||s.version!==1||!s.player||![-1,0,1].includes(s.player.floor)||!Number.isFinite(s.player.x)||!s.inventory)return false;
  this.reset();const p=this.player;p.floor=s.player.floor;p.x=clamp(s.player.x,p.floor===0?70:525,p.floor===0?2150:1505);p.y=floorY(p.floor);p.previousX=p.x;p.previousY=p.y;p.hp=clamp(Number(s.player.hp)||100,1,100);
  for(const k of Object.keys(this.inventory) as (keyof Resources)[])this.inventory[k]=clamp(Number(s.inventory[k])||0,0,999);
  for(const d of this.doors){const entry=s.doors?.find(x=>x.id===d.id);if(entry)d.open=!!entry.open;}
  for(const o of this.objects){const entry=s.objects?.find(x=>x.id===o.id);if(entry){o.searched=!!entry.searched;o.uses=clamp(Number(entry.uses)||0,0,999);}}
  this.explored=new Set((s.explored||[]).filter(id=>ROOMS.some(r=>r.id===id)));this.powered=!!s.powered;this.flashlight=!!s.flashlight;this.time=Math.max(0,Number(s.time)||0);this.dog.hp=clamp(Number(s.dogHp)||0,0,60);this.refreshSight();this.notify('Вы вернулись на базу');return true;
 }
 snapshot(){return {phase:this.phase,player:{...this.player,stair:this.player.stair?{...this.player.stair}:null},location:this.location,inventory:{...this.inventory},powered:this.powered,flashlight:this.flashlight,aim:this.aim,task:this.task?{...this.task}:null,navigation:this.navigation?{...this.navigation}:null,explored:[...this.explored],visibleObjects:this.visibleObjects().map(o=>o.id),visibleDoors:this.visibleDoors().map(d=>d.id),doors:this.doors.map(d=>({...d})),objects:this.objects.map(o=>({id:o.id,searched:o.searched,uses:o.uses})),dog:{...this.dog,visible:this.dogVisible},time:this.time,toast:this.toast};}
}
