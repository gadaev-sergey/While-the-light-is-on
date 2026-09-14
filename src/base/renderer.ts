import {BASE,LOCATION,clamp,lerp} from './config.ts';
import {floorSpans,floorOccluderSpans,stairApertures,levelFloorY,type CompiledLevel,type Opening} from './level.ts';
import {BEAM_HALF,BEAM_RANGE,SIGHT_RANGE,visibilityPolygon} from './visibility.ts';
import {daylightStyle,daylightSources,type DaylightSource} from './lighting.ts';
import type {BaseAssets,ImageId} from './assets.ts';
import {BaseHero} from './hero.ts';
import type {BaseWorld} from './world.ts';
import type {Vec,Room,Floor} from './types.ts';
type Rect={x:number;y:number;w:number;h:number};
const furnitureRects:Rect[]=[{x:0,y:95,w:592,h:355},{x:595,y:35,w:432,h:406},{x:1034,y:45,w:502,h:426},{x:18,y:524,w:564,h:425},{x:604,y:443,w:412,h:536},{x:1042,y:463,w:494,h:516}];
const objectRects:Rect[]=[{x:0,y:100,w:385,h:388},{x:391,y:135,w:410,h:340},{x:822,y:180,w:296,h:301},{x:1130,y:137,w:406,h:350},{x:18,y:530,w:373,h:425},{x:399,y:641,w:400,h:321},{x:827,y:513,w:308,h:438},{x:1190,y:518,w:346,h:486}];
export const HOUSE_LAYERS=['background','walls','interactables','floors','stairs','landings','actors','foreground','lighting','visibility','structure','markers'] as const;
export class BaseRenderer{
 structure=document.createElement('canvas');beamTextures=new Map<string,HTMLCanvasElement>();
 environment=daylightStyle(720);illumination=document.createElement('canvas');sceneCopy=document.createElement('canvas');blurred=document.createElement('canvas');
 lightKey='';lightLevel?:CompiledLevel;lightFields:{source:DaylightSource;polygon:Vec[]}[]=[];
 level:CompiledLevel=LOCATION;wallLayer=document.createElement('canvas');layerTrace:string[]=[];
 floorY(floor:Floor){return levelFloorY(this.level,floor);}
 c:CanvasRenderingContext2D;hero:BaseHero;fog=document.createElement('canvas');zoom=1;camera={x:940,y:463};scale=1;width=1600;height=900;dpr=1;time=0;hover:string|null=null;
 hits:{id:string;x:number;y:number}[]=[];trimCache=new Map<string,Rect>();grit:{x:number;y:number;r:number}[]=[];
 constructor(public canvas:HTMLCanvasElement,public assets:BaseAssets){this.c=canvas.getContext('2d',{alpha:false})!;this.hero=new BaseHero(assets);let seed=47;for(let i=0;i<380;i++){seed=(seed*16807)%2147483647;const x=seed/2147483647*2220;seed=(seed*16807)%2147483647;this.grit.push({x,y:615+seed/2147483647*120,r:.5+i%3});}new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();}
 resize(){const box=this.canvas.getBoundingClientRect();this.width=Math.max(1,box.width);this.height=Math.max(1,box.height);this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.structure.width=this.canvas.width;this.structure.height=this.canvas.height;this.fog.width=this.canvas.width;this.fog.height=this.canvas.height;this.wallLayer.width=this.canvas.width;this.wallLayer.height=this.canvas.height;this.illumination.width=this.canvas.width;this.illumination.height=this.canvas.height;this.sceneCopy.width=this.canvas.width;this.sceneCopy.height=this.canvas.height;this.blurred.width=Math.ceil(this.canvas.width/3);this.blurred.height=Math.ceil(this.canvas.height/3);}
 worldToScreen(p:Vec){return {x:(p.x-this.camera.x)*this.scale+this.width/2,y:(p.y-this.camera.y)*this.scale+this.height/2};}
 screenToWorld(p:Vec){return {x:(p.x-this.width/2)/this.scale+this.camera.x,y:(p.y-this.height/2)/this.scale+this.camera.y};}
 zoomBy(delta:number){this.zoom=clamp(this.zoom+delta,.8,1.8);}
 transform(c:CanvasRenderingContext2D){c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,(this.width/2-this.camera.x*this.scale)*this.dpr,(this.height/2-this.camera.y*this.scale)*this.dpr);}
 draw(w:BaseWorld,dt:number,alpha=1){
  this.level=w.level;this.environment=daylightStyle(w.dayMinutes);this.layerTrace=[];const layer=(name:typeof HOUSE_LAYERS[number])=>this.layerTrace.push(name);
  const c=this.c;this.time+=w.phase==='playing'?dt:0;
  const fit=this.width<700?Math.min(this.height/780,this.width/930):Math.min(this.width/1600,this.height/900);this.scale=fit*this.zoom;
  const vw=this.width/this.scale,vh=this.height/this.scale;
  const targetX=vw>=this.level.width?this.level.width/2:clamp(980+(w.player.x-750)*.65,vw/2,this.level.width-vw/2);
  const targetY=vh>=this.level.height?this.level.height/2:clamp(w.player.y-95,vh/2,this.level.height-vh/2);
  this.camera.x=lerp(this.camera.x,targetX,1-Math.exp(-dt*3));this.camera.y=lerp(this.camera.y,targetY,1-Math.exp(-dt*3));
  c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#10141a';c.fillRect(0,0,this.width,this.height);
  this.transform(c);layer('background');this.background(c);this.yard(c);
  layer('walls');this.house(c,w);this.doors(c,w);
  layer('interactables');
  for(const o of w.visibleObjects()){
   c.save();if(o.searched&&['chest','wardrobe','medicine'].includes(o.kind))c.globalAlpha=.6;
   this.sprite(c,o.atlas,o.frame,o.x,this.floorY(o.floor)-2,o.width,o.height);c.restore();
   if(o.kind==='generator'&&w.powered)this.glow(c,o.x+30,this.floorY(o.floor)-53,26,'#b7d79c',.35);
  }
  layer('floors');this.floors(c);layer('stairs');for(const stair of this.level.stairs)this.stair(c,stair.a,this.floorY(stair.from),stair.b,this.floorY(stair.to));
  layer('landings');this.floors(c,true);
  layer('actors');
  if(w.dogVisible){const dog=w.dog,frame=dog.mode==='warn'?3:dog.mode==='walk'||dog.mode==='retreat'?1+Math.floor(this.time*5)%2:0;c.save();c.translate(lerp(dog.previousX,dog.x,alpha),615);c.scale(-dog.facing,1);if(dog.hit)c.filter='brightness(2)';this.sprite(c,'dog',frame,0,-2,144,96);c.restore();}
  this.shadow(c,lerp(w.player.previousX,w.player.x,alpha),lerp(w.player.previousY,w.player.y,alpha)+1,38);
  this.hero.draw(c,w.player,w.phase==='playing'?dt:0,alpha,!!w.task);
  layer('foreground');this.stairRails(c);this.architectureEdges(c);this.foreground(c,w);
  layer('lighting');this.lighting(w);this.transform(c);if(w.flashlight)this.flashlight(c,w);
  layer('visibility');this.fogOfWar(w);layer('structure');this.structuralForeground(w);this.transform(c);
  layer('markers');this.markers(c,w);
  if(w.task){const p=w.player,t=1-w.task.remaining/w.task.duration;c.save();c.translate(p.x,p.y-151);c.fillStyle='#0b1016dc';c.fillRect(-31,-5,62,9);c.fillStyle='#d7bd8a';c.fillRect(-29,-3,58*t,5);c.restore();}
  if(w.dogVisible&&w.dog.mode==='warn'){c.fillStyle='#db866b';c.font='bold 20px Georgia';c.textAlign='center';c.fillText('!',w.dog.x,515);}
  if(w.navigation){const n=w.navigation;c.strokeStyle='#d8c193';c.globalAlpha=.65;c.lineWidth=1;c.beginPath();c.ellipse(n.x,this.floorY(n.floor)+1,13,4,0,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
  c.setTransform(this.dpr,0,0,this.dpr,0,0);const vignette=c.createRadialGradient(this.width*.5,this.height*.52,this.width*.16,this.width*.5,this.height*.5,this.width*.65);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,`rgba(0,0,0,${.18+(1-this.environment.sun)*.15})`);c.fillStyle=vignette;c.fillRect(0,0,this.width,this.height);
  if(w.player.hurt){c.fillStyle=`rgba(145,47,37,${w.player.hurt*.12})`;c.fillRect(0,0,this.width,this.height);}
 }
 texture(c:CanvasRenderingContext2D,index:number,x:number,y:number,w:number,h:number,scale=1){const pattern=c.createPattern(this.assets.tiles[index],'repeat')!;pattern.setTransform(new DOMMatrix().scale(scale));c.fillStyle=pattern;c.fillRect(x,y,w,h);}
 background(c:CanvasRenderingContext2D){
  const im=this.assets.images.district,top=Math.min(-80,this.camera.y-this.height/this.scale/2);c.save();c.filter=`brightness(${.88+this.environment.sun*.4}) saturate(${.55+this.environment.sun*.25})`;c.drawImage(im,this.camera.x*.15-310,top,this.level.width+630,800-top);c.filter='none';c.globalCompositeOperation='screen';c.globalAlpha=this.environment.skyMix;c.fillStyle=this.environment.sky;c.fillRect(-500,top,this.level.width+1000,1000-top);c.restore();
  const earth=c.createLinearGradient(0,606,0,935);earth.addColorStop(0,'#282b29');earth.addColorStop(.25,'#181b1b');earth.addColorStop(1,'#090c10');c.fillStyle=earth;c.fillRect(-300,607,2900,420);
  for(const p of this.grit){c.fillStyle=p.r>2?'#a09b7132':'#0006';c.fillRect(p.x,p.y,p.r*5,p.r);}
  c.strokeStyle='#0d151b';c.lineWidth=4;c.beginPath();c.moveTo(90,370);c.quadraticCurveTo(660,450,1720,100);c.stroke();
 }
 house(c:CanvasRenderingContext2D,w:BaseWorld){
  const wall=this.wallLayer.getContext('2d')!;wall.setTransform(1,0,0,1,0,0);wall.clearRect(0,0,this.wallLayer.width,this.wallLayer.height);this.transform(wall);
  for(const building of this.level.buildings){
   const x=building.x,end=building.end,top=this.floorY(Math.max(...building.floors))-this.level.floorHeight,bottom=this.floorY(Math.min(...building.floors)),ridge=top-building.roof.rise;
   c.save();this.path(c,[{x:end,y:top},{x:end+38,y:top-18},{x:end+38,y:bottom-7},{x:end,y:bottom+12}]);c.clip();this.texture(c,2,end,top-20,40,bottom-top+45,.56);c.fillStyle='#0b17267a';c.fillRect(end,top-20,40,bottom-top+45);c.restore();
   this.texture(c,2,x-17,top,17,bottom-top+20,.55);this.texture(c,2,end,top,17,bottom-top+20,.55);
   c.save();this.path(c,[{x:x-40,y:top-2},{x:x+104,y:ridge},{x:end-105,y:ridge},{x:end+38,y:top-2}]);c.clip();this.texture(c,5,x-42,ridge,end-x+86,top-ridge,.27);const shade=c.createLinearGradient(0,ridge,0,top);shade.addColorStop(0,'#24324215');shade.addColorStop(1,'#080e1977');c.fillStyle=shade;c.fillRect(x-42,ridge,end-x+86,top-ridge);c.restore();
   const chimney=x+building.roof.chimney;this.texture(c,2,chimney-28,ridge-44,54,90,.31);c.fillStyle='#242925';c.fillRect(chimney-34,ridge-49,66,9);
   c.fillStyle='#10191f';c.fillRect(x-40,top-7,end-x+80,12);c.fillStyle='#92938666';c.fillRect(x-40,top-7,end-x+80,2);
  }
  for(const room of this.level.rooms){
   const y=this.floorY(room.floor),h=this.level.floorHeight;
   this.texture(wall,room.material,room.x,y-h+8,room.end-room.x,h-8,room.floor<0?.65:.58);
   const shade=wall.createLinearGradient(0,y-h,0,y);shade.addColorStop(0,'#08101c5c');shade.addColorStop(.43,'#16233012');shade.addColorStop(1,'#050b1585');wall.fillStyle=shade;wall.fillRect(room.x,y-h+8,room.end-room.x,h-8);
   // Low skirting and exposed ceiling joists are architecture, not room contents.
   wall.fillStyle=room.floor<0?'#484840':'#635d4f';wall.fillRect(room.x,y-24,room.end-room.x,6);wall.fillStyle='#b7ae8a33';wall.fillRect(room.x,y-24,room.end-room.x,1);
   if(w.explored.has(room.id)){wall.fillStyle='#d2c3a868';wall.font='8px monospace';wall.textAlign='left';wall.fillText(room.name.toUpperCase(),room.x+27,y-h+29);}
  }
  wall.save();wall.globalCompositeOperation='destination-out';
  for(const opening of w.openings.filter(o=>o.plane==='back'))this.damageSprite(wall,opening.kind==='window'?opening.variant||0:2,opening.x,this.floorY(opening.floor)-opening.bottom,opening.width,opening.height,true);
  wall.restore();c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(this.wallLayer,0,0);c.restore();
  for(const opening of w.openings){
   const y=this.floorY(opening.floor),top=y-opening.bottom-opening.height;
   if(opening.plane==='back'){
    if(opening.state==='boarded')this.boards(c,opening.x,y-opening.bottom,opening.width*.86,opening.height*.92);
    this.damageSprite(c,opening.kind==='window'?opening.variant||0:2,opening.x,y-opening.bottom,opening.width,opening.height);

   }else{
    this.texture(c,2,opening.x-9,y-this.level.floorHeight+8,18,this.level.floorHeight-opening.height-8,.38);
    // A shattered divider, open at walking height; the upper remnant stays solid.
    for(let i=0;i<5;i++){c.fillStyle=i%2?'#735346':'#998b72';c.fillRect(opening.x-12+(i%2)*4,top-6+i*4,20-i*3,5);}
    if(opening.state==='boarded')this.boards(c,opening.x,y,22,opening.height);
   }
  }
 }
 damageSprite(c:CanvasRenderingContext2D,frame:number,x:number,bottom:number,width:number,height:number,mask=false){const asset=this.assets.damageFrames[frame],im=mask?asset.mask:asset.image,scale=Math.min(width/im.width,height/im.height);c.drawImage(im,x-im.width*scale/2,bottom-im.height*scale,im.width*scale,im.height*scale);}
 boards(c:CanvasRenderingContext2D,x:number,bottom:number,width:number,height:number){
  c.save();c.beginPath();c.rect(x-width/2,bottom-height,width,height);c.clip();this.texture(c,3,x-width/2,bottom-height,width,height,.35);
  for(let y=bottom-height;y<bottom;y+=22){c.fillStyle='#171d20aa';c.fillRect(x-width/2,y,width,2);c.fillStyle='#d1bea84a';c.fillRect(x-width/2,y+2,width,1);c.fillStyle='#242622';c.fillRect(x-width/2+7,y+8,2,2);c.fillRect(x+width/2-9,y+8,2,2);}c.restore();
 }
 doors(c:CanvasRenderingContext2D,w:BaseWorld){for(const d of w.doors){const y=this.floorY(d.floor);c.save();c.translate(d.x,y);this.texture(c,2,-8,-this.level.floorHeight,16,this.level.floorHeight-149,.4);c.fillStyle='#786b55';c.fillRect(-11,-152,22,6);c.fillRect(-10,-149,3,149);c.fillRect(7,-149,3,149);
  if(!d.open){this.texture(c,3,-7,-146,14,146,.2);c.strokeStyle='#b6a18488';c.lineWidth=1;c.strokeRect(-5,-143,10,140);c.fillStyle='#d1b886';c.fillRect(-3,-74,6,3);}
  else{c.save();this.path(c,[{x:8,y:-146},{x:31,y:-135},{x:31,y:0},{x:8,y:0}]);c.clip();this.texture(c,3,8,-146,25,146,.25);c.fillStyle='#0d152333';c.fillRect(8,-146,25,146);c.restore();}c.restore();}}
 floors(c:CanvasRenderingContext2D,landingOnly=false){for(const b of this.level.buildings)for(const floor of b.floors){if(landingOnly&&!this.level.stairs.some(s=>s.to===floor&&s.b>=b.x&&s.b<=b.end))continue;const y=this.floorY(floor);
  // Only the rear strip has a stairwell opening. The front surface and fascia span it.
  if(!landingOnly)for(const [x,end] of floorOccluderSpans(this.level,b,floor)){this.texture(c,floor<0?4:3,x,y-18,end-x,12,.43);c.fillStyle='#d2b98b55';c.fillRect(x,y-18,end-x,1);}
  for(const [x,end] of floorSpans(this.level,b,floor)){
   this.texture(c,floor<0?4:3,x,y-6,end-x,18,.43);const shade=c.createLinearGradient(0,y-6,0,y+12);shade.addColorStop(0,'#ced0b81e');shade.addColorStop(1,'#07101b55');c.fillStyle=shade;c.fillRect(x,y-6,end-x,18);c.fillStyle='#d2b98b55';c.fillRect(x,y-6,end-x,1);
  }
  if(!landingOnly)for(const [left,right] of stairApertures(this.level,b,floor)){c.fillStyle='#080e1666';c.fillRect(left,y-18,right-left,12);c.strokeStyle='#8c7d6055';c.lineWidth=1;c.strokeRect(left,y-18,right-left,12);}
 }}
 stair(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number){
  c.fillStyle='#0a0f13';c.beginPath();c.moveTo(x-20,y+6);c.lineTo(x2+15,y2+4);c.lineTo(x2+15,y2+21);c.lineTo(x-20,y+23);c.closePath();c.fill();
  const count=15;for(let i=0;i<count;i++){const px=x+(x2-x)*i/count,py=y+(y2-y)*(i+1)/count,run=(x2-x)/count;
   c.fillStyle=i%2?'#5c5548':'#665f50';c.fillRect(px-21,py,run+28,5);c.fillStyle='#292a28';c.fillRect(px-21,py+5,run,10);c.strokeStyle='#a59a7c77';c.lineWidth=.8;c.beginPath();c.moveTo(px-21,py);c.lineTo(px+run+7,py);c.stroke();}
 }
 architectureEdges(c:CanvasRenderingContext2D){for(const b of this.level.buildings)for(const f of b.floors){const y=this.floorY(f);for(const [x,end] of floorSpans(this.level,b,f)){this.texture(c,f<0?4:3,x,y+10,end-x,17,.4);c.fillStyle='#080f1b99';c.fillRect(x,y+14,end-x,12);c.fillStyle='#b9ac8655';c.fillRect(x,y+10,end-x,2);}}}
 stairRails(c:CanvasRenderingContext2D){c.save();c.beginPath();c.rect(-1000,-1000,this.level.width+2000,this.level.height+2000);for(const b of this.level.buildings)for(const f of b.floors)c.rect(b.x,this.floorY(f)-6,b.end-b.x,33);c.clip('evenodd');for(const s of this.level.stairs){const y=this.floorY(s.from),y2=this.floorY(s.to);c.strokeStyle='#0c1116';c.lineWidth=4;c.beginPath();c.moveTo(s.a-10,y-39);c.lineTo(s.b+8,y2-39);c.stroke();c.strokeStyle='#86827188';c.lineWidth=1;c.stroke();for(let i=0;i<4;i++){const t=i/3,x=lerp(s.a,s.b,t),yy=lerp(y,y2,t);c.strokeStyle='#4c514a';c.lineWidth=2;c.beginPath();c.moveTo(x,yy-39);c.lineTo(x,yy+7);c.stroke();}}c.restore();}
 yard(c:CanvasRenderingContext2D){
  for(const side of [[90,451],[1590,2160]]){const [start,end]=side;c.strokeStyle='#2c322d';c.lineWidth=4;c.beginPath();c.moveTo(start,574);c.lineTo(end,574);c.moveTo(start,535);c.lineTo(end,535);c.stroke();for(let x=start;x<end;x+=29){c.fillStyle='#3c4138';c.fillRect(x,510+(x%7),10,99);c.fillStyle='#82836b22';c.fillRect(x,514,2,93);}}
  c.strokeStyle='#6b6c5440';c.lineWidth=1;for(let i=0;i<130;i++){const x=(i*193.37)%2220;if(this.level.buildings.some(b=>x>b.x-30&&x<b.end+50))continue;const y=620+(i%4)*5;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-7,y-18,x+(i%3-1)*5,y-28-i%8);c.stroke();}
  c.strokeStyle='#272a2b';c.lineWidth=8;c.beginPath();c.moveTo(1760,618);c.lineTo(1760,377);c.lineTo(1804,377);c.stroke();c.fillStyle='#958263';c.fillRect(1791,374,26,5);
  c.strokeStyle='#88897520';c.lineWidth=2;for(let i=0;i<19;i++){const x=160+i*95;c.beginPath();c.moveTo(x,639);c.lineTo(x+45,637);c.stroke();}
 }
 foreground(c:CanvasRenderingContext2D,w:BaseWorld){
  for(const d of this.level.foreground)if(w.explored.has(d.roomId))this.damageSprite(c,3,d.x,this.floorY(d.floor)+15,d.width,d.height);
  // Only low silhouettes at the yard edge; nothing covers an actor's torso.
  c.strokeStyle='#050a0de8';for(let i=0;i<75;i++){const x=i*31+Math.sin(i*7)*14;if(this.level.buildings.some(b=>x>b.x-10&&x<b.end+20))continue;c.lineWidth=2;c.beginPath();c.moveTo(x,671);c.quadraticCurveTo(x+5,651,x+Math.sin(i)*14,644-i%16);c.stroke();}
 }
 trim(id:ImageId,frame:number){
  const key=id+frame,cached=this.trimCache.get(key);if(cached)return cached;
  const im=this.assets.images[id],r=id==='furniture'?furnitureRects[frame]:id==='objects'?objectRects[frame]:{x:frame%3*512,y:Math.floor(frame/3)*512,w:512,h:512};
  const canvas=document.createElement('canvas');canvas.width=r.w;canvas.height=r.h;const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(im,r.x,r.y,r.w,r.h,0,0,r.w,r.h);const data=c.getImageData(0,0,r.w,r.h).data;
  let l=r.w,t=r.h,rr=0,b=0;for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)if(data[(y*r.w+x)*4+3]>45){l=Math.min(l,x);t=Math.min(t,y);rr=Math.max(rr,x);b=Math.max(b,y);}
  const trim={x:r.x+l,y:r.y+t,w:rr-l+1,h:b-t+1};this.trimCache.set(key,trim);return trim;
 }
 sprite(c:CanvasRenderingContext2D,id:'furniture'|'objects'|'dog',frame:number,x:number,y:number,maxWidth:number,maxHeight:number){const r=this.trim(id,frame),scale=Math.min(maxWidth/r.w,maxHeight/r.h);c.drawImage(this.assets.images[id],r.x,r.y,r.w,r.h,x-r.w*scale/2,y-r.h*scale,r.w*scale,r.h*scale);}
 shadow(c:CanvasRenderingContext2D,x:number,y:number,r:number){c.save();c.translate(x,y);c.scale(1,.15);const g=c.createRadialGradient(0,0,1,0,0,r);g.addColorStop(0,'#000b');g.addColorStop(1,'transparent');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();}
 glow(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){c.save();c.globalCompositeOperation='screen';c.globalAlpha=alpha;const g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
 path(c:CanvasRenderingContext2D,points:Vec[]){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
 lightSources(w:BaseWorld){
  const key=`${Math.floor(w.dayMinutes/2)}|${w.doors.map(d=>Number(d.open)).join('')}|${w.openings.map(o=>o.state).join(',')}`;
  if(key!==this.lightKey||this.lightLevel!==w.level){this.lightKey=key;this.lightLevel=w.level;this.lightFields=daylightSources(w.level,w.doors,w.openings,w.dayMinutes).map(source=>({source,polygon:visibilityPolygon(source.origin,0,Math.PI,source.range,w.sight.segments)}));}
  return this.lightFields;
 }
 lighting(w:BaseWorld){
  const c=this.illumination.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.illumination.width,this.illumination.height);
  c.fillStyle=`rgba(5,10,22,${this.environment.exteriorDark})`;c.fillRect(0,0,this.illumination.width,this.illumination.height);this.transform(c);
  for(const room of this.level.rooms){const y=this.floorY(room.floor)-this.level.floorHeight+8,h=this.level.floorHeight+20;c.clearRect(room.x,y,room.end-room.x,h);c.fillStyle=`rgba(3,8,18,${w.powered?.48:this.environment.interiorDark})`;c.fillRect(room.x,y,room.end-room.x,h);}
  // Only real exterior openings remove ambient darkness. There is no player-centred light.
  for(const {source,polygon} of this.lightSources(w)){c.save();this.path(c,polygon);c.clip();c.globalCompositeOperation='destination-out';const {x,y}=source.origin,g=c.createRadialGradient(x,y,0,x,y,source.range);g.addColorStop(0,`rgba(0,0,0,${source.strength})`);g.addColorStop(.35,`rgba(0,0,0,${source.strength*.6})`);g.addColorStop(.7,`rgba(0,0,0,${source.strength*.25})`);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-source.range,y-source.range,source.range*2,source.range*2);c.restore();}
  for(const {source,polygon} of this.lightFields){c.save();this.path(c,polygon);c.clip();c.globalCompositeOperation='destination-out';c.globalAlpha=source.beamStrength;this.sunBeam(c,source);c.restore();}
  if(w.flashlight){const origin=w.lightOrigin;c.save();this.path(c,visibilityPolygon(origin,w.aim,BEAM_HALF,BEAM_RANGE,w.sight.segments));c.clip();c.globalCompositeOperation='destination-out';const end={x:origin.x+Math.cos(w.aim)*BEAM_RANGE,y:origin.y+Math.sin(w.aim)*BEAM_RANGE},g=c.createLinearGradient(origin.x,origin.y,end.x,end.y);g.addColorStop(0,'rgba(0,0,0,.82)');g.addColorStop(.5,'rgba(0,0,0,.7)');g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(origin.x-BEAM_RANGE,origin.y-BEAM_RANGE,BEAM_RANGE*2,BEAM_RANGE*2);c.restore();}
  this.c.save();this.c.setTransform(1,0,0,1,0,0);this.c.drawImage(this.illumination,0,0);this.c.restore();
  // A restrained warm/cool tint inside the sun shafts; the same geometry clips the tint.
  const out=this.c;for(const {source,polygon} of this.lightFields){out.save();this.path(out,polygon);out.clip();out.globalCompositeOperation='screen';out.globalAlpha=source.beamStrength*.22;this.sunBeam(out,source);out.restore();}
 }
 fogOfWar(w:BaseWorld){
  const sharp=this.sceneCopy.getContext('2d')!;sharp.setTransform(1,0,0,1,0,0);sharp.clearRect(0,0,this.sceneCopy.width,this.sceneCopy.height);sharp.drawImage(this.canvas,0,0);
  const small=this.blurred.getContext('2d')!;small.setTransform(1,0,0,1,0,0);small.clearRect(0,0,this.blurred.width,this.blurred.height);small.filter=`blur(${1.35*this.dpr}px)`;small.drawImage(this.sceneCopy,0,0,this.blurred.width,this.blurred.height);small.filter='none';
  const fog=this.fog.getContext('2d')!;fog.setTransform(1,0,0,1,0,0);fog.clearRect(0,0,this.fog.width,this.fog.height);fog.drawImage(this.blurred,0,0,this.fog.width,this.fog.height);this.transform(fog);
  fog.save();fog.globalCompositeOperation='destination-out';fog.filter=`blur(${5*this.dpr}px)`;fog.fillStyle='#fff';this.path(fog,visibilityPolygon(w.sight.origin,0,Math.PI,SIGHT_RANGE,w.sight.segments,140));fog.fill();
  fog.fillRect(w.player.x-37,w.player.y-134,74,140);fog.restore();
  this.c.save();this.c.setTransform(1,0,0,1,0,0);this.c.drawImage(this.fog,0,0);this.c.restore();
 }
 /** A soft rectangular shaft: window-sized at its source, fading along and across the ray.
  * Three separate strips per opening retain gaps like light passing broken frames. */
 sunBeam(c:CanvasRenderingContext2D,source:DaylightSource){
  let texture=this.beamTextures.get(source.color);if(!texture){texture=document.createElement('canvas');texture.width=256;texture.height=128;const t=texture.getContext('2d')!;
   const along=t.createLinearGradient(0,0,256,0);along.addColorStop(0,'#ffffff90');along.addColorStop(.045,'#fff');along.addColorStop(.28,'#ffffffc0');along.addColorStop(.65,'#ffffff48');along.addColorStop(1,'#ffffff00');t.fillStyle=along;t.fillRect(0,0,256,128);
   t.globalCompositeOperation='destination-in';const across=t.createLinearGradient(0,0,0,128);across.addColorStop(0,'transparent');across.addColorStop(.2,'#ffffff10');across.addColorStop(.4,'#ffffffd0');across.addColorStop(.5,'#fff');across.addColorStop(.6,'#ffffffd0');across.addColorStop(.8,'#ffffff10');across.addColorStop(1,'transparent');t.fillStyle=across;t.fillRect(0,0,256,128);t.globalCompositeOperation='source-in';t.fillStyle=source.color;t.fillRect(0,0,256,128);this.beamTextures.set(source.color,texture);
  }
  c.save();c.translate(source.origin.x,source.origin.y);c.rotate(source.angle);c.drawImage(texture,0,-source.beamWidth*2,source.range,source.beamWidth*4);c.restore();
 }
 /** Opaque cut material sits in front of the lit rooms; it is never illuminated or blurred. */
 cutaway(c:CanvasRenderingContext2D,w:BaseWorld){
  c.save();c.fillStyle='#000';
  const left=Math.min(-1000,this.camera.x-this.width/this.scale),right=Math.max(this.level.width+1000,this.camera.x+this.width/this.scale),deep=Math.max(this.level.height+1000,this.camera.y+this.height/this.scale);
  let groundStart=left;
  for(const b of [...this.level.buildings].sort((a,b)=>a.x-b.x)){
   const top=this.floorY(Math.max(...b.floors))-this.level.floorHeight,bottom=this.floorY(Math.min(...b.floors)),ridge=top-b.roof.rise;
   c.fillRect(groundStart,this.level.groundY+24,Math.max(0,b.x-17-groundStart),deep-this.level.groundY);groundStart=b.end+38;
   c.fillRect(b.x-17,bottom+27,b.end-b.x+55,deep-bottom);
   // Cross-section of the roof and chimney, outer walls, and continuous floor fascia.
   this.path(c,[{x:b.x-40,y:top+5},{x:b.x-40,y:top-2},{x:b.x+104,y:ridge},{x:b.end-105,y:ridge},{x:b.end+38,y:top-2},{x:b.end+38,y:top+5}]);c.fill();
   c.fillRect(b.x+b.roof.chimney-28,ridge-44,54,90);c.fillRect(b.x+b.roof.chimney-34,ridge-49,66,9);
   c.fillRect(b.x-17,top,17,bottom-top+27);c.fillRect(b.end,top,38,bottom-top+27);
   for(const f of b.floors)c.fillRect(b.x,this.floorY(f)+3,b.end-b.x,24);
   for(const f of b.floors){const y=this.floorY(f);const edges=new Set(this.level.rooms.filter(r=>r.buildingId===b.id&&r.floor===f).flatMap(r=>[r.x,r.end]));
    for(const x of edges){const door=w.doors.find(d=>d.x===x&&d.floor===f),hole=w.openings.find(o=>o.x===x&&o.floor===f&&o.plane==='divider');const end=door?y-148:hole?y-hole.height:y;
     c.fillRect(x-8,y-this.level.floorHeight,16,end-(y-this.level.floorHeight));
     if(hole){for(let i=0;i<4;i++)c.fillRect(x-9+(i%2)*3,end-2+i*3,17-i*3,4);}
    }
   }
  }
  c.fillRect(groundStart,this.level.groundY+24,right-groundStart,deep-this.level.groundY);c.restore();
 }
 /** Restore already-lit structural pixels above fog; interiors remain blurred.
  * Copying the original composite also preserves actors in front of floor surfaces. */
 structuralForeground(w:BaseWorld){
  const c=this.structure.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.structure.width,this.structure.height);this.transform(c);c.fillStyle='#fff';
  for(const b of this.level.buildings){
   const top=this.floorY(Math.max(...b.floors))-this.level.floorHeight,bottom=this.floorY(Math.min(...b.floors));
   c.fillRect(b.x-17,top,17,bottom-top+20);c.fillRect(b.end,top,17,bottom-top+20);c.fillRect(b.x-40,top-7,b.end-b.x+80,12);
   for(const f of b.floors){const y=this.floorY(f);c.fillRect(b.x,y-6,b.end-b.x,33);for(const [left,right] of floorOccluderSpans(this.level,b,f))c.fillRect(left,y-18,right-left,12);}
  }
  // Solid vertical partitions and door lintels; the actual open doorway stays unmasked.
  for(const s of w.sight.segments)if(s.a.x===s.b.x)c.fillRect(s.a.x-8,Math.min(s.a.y,s.b.y),16,Math.abs(s.b.y-s.a.y));
  for(const d of w.doors){const y=this.floorY(d.floor);c.fillRect(d.x-11,y-152,22,6);c.fillRect(d.x-10,y-149,3,149);c.fillRect(d.x+7,y-149,3,149);}
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-in';c.drawImage(this.sceneCopy,0,0);c.globalCompositeOperation='source-over';
  this.c.save();this.c.setTransform(1,0,0,1,0,0);this.c.drawImage(this.structure,0,0);this.c.restore();this.transform(this.c);this.cutaway(this.c,w);
 }
 flashlight(c:CanvasRenderingContext2D,w:BaseWorld){
  const origin=w.lightOrigin,angle=w.aim;c.save();this.path(c,visibilityPolygon(origin,angle,BEAM_HALF,BEAM_RANGE,w.sight.segments));c.clip();c.globalCompositeOperation='screen';const end={x:origin.x+Math.cos(angle)*BEAM_RANGE,y:origin.y+Math.sin(angle)*BEAM_RANGE};const g=c.createLinearGradient(origin.x,origin.y,end.x,end.y);g.addColorStop(0,'#f3e2ac18');g.addColorStop(.5,'#e6d39c0c');g.addColorStop(1,'#e6d39c00');c.fillStyle=g;c.fillRect(origin.x-500,origin.y-500,1000,1000);c.restore();
  c.save();c.translate(origin.x,origin.y);c.rotate(angle);c.fillStyle='#323735';c.fillRect(-6,-3,14,6);c.fillStyle='#e8d9b8';c.fillRect(7,-3,2,6);c.restore();
 }
 markers(c:CanvasRenderingContext2D,w:BaseWorld){
  this.hits=[];const nearest=w.nearby()?.id;
  const items=[...w.visibleObjects().map(o=>({id:o.id,x:o.x,y:this.floorY(o.floor)-o.height-22,done:o.searched&&['chest','medicine','wardrobe'].includes(o.kind),symbol:o.kind==='bed'?'☾':o.kind==='workbench'?'⚒':o.kind==='generator'?'ϟ':o.kind==='sink'||o.kind==='barrel'?'≈':'+'})),...w.visibleDoors().map(d=>({id:d.id,x:d.x,y:this.floorY(d.floor)-168,done:false,symbol:d.open?'↔':'⌑'}))];
  for(const item of items){
   const active=item.id===nearest||item.id===this.hover;c.save();c.translate(item.x,item.y);c.fillStyle=active?'#d8c59e':'#101821d9';c.strokeStyle=item.done?'#7e83796b':active?'#f3e5c9':'#acb4a5';c.lineWidth=active?1.8:1;c.beginPath();c.arc(0,0,active?15:12,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=active?'#263035':item.done?'#8a9285':'#e0dccd';c.font='16px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText(item.done?'✓':item.symbol,0,-1);c.restore();this.hits.push({id:item.id,x:item.x,y:item.y});
   if(active){const name=w.description(item.id)!.title;c.save();c.font='11px Arial';c.textAlign='center';const width=c.measureText(name).width;c.fillStyle='#0a1015e8';c.fillRect(item.x-width/2-9,item.y-40,width+18,20);c.fillStyle='#eee8d6';c.fillText(name,item.x,item.y-26);c.restore();}
  }
  for(const stair of this.level.stairs){for(const side of [0,1]){const x=side?stair.b:stair.a,y=this.floorY(side?stair.to:stair.from);if(!w.visible({x,y:y-55}))continue;c.save();c.fillStyle='#c9c3ab';c.font='15px Arial';c.textAlign='center';c.fillText(side?'↓':'↑',x,y-12);c.restore();}}
 }
 hitAt(point:Vec){return this.hits.find(h=>Math.hypot(h.x-point.x,h.y-point.y)<24)?.id||null;}
 floorAtScreen(point:Vec):Floor{const b=this.level.buildings.find(b=>point.x>=b.x&&point.x<=b.end);return b?b.floors.reduce((best,f)=>Math.abs(point.y-this.floorY(f))<Math.abs(point.y-this.floorY(best))?f:best,b.floors[0]):0;}
}
