import {BASE,LOCATION,clamp,lerp} from './config.ts';
import {floorSpans,floorOccluderSpans,stairApertures,levelFloorY,levelRoomAt,type CompiledLevel,type Opening} from './level.ts';
import {BEAM_HALF,BEAM_RANGE,SIGHT_RANGE,visibilityPolygon} from './visibility.ts';
import {daylightStyle,exteriorLightSources,type DaylightSource} from './lighting.ts';
import type {BaseAssets,ImageId} from './assets.ts';
import {BaseHero} from './hero.ts';
import type {BaseWorld} from './world.ts';
import type {Vec,Room,Floor} from './types.ts';
import {ROOM_DEPTH,backPoint,floorFace,doorLeaf,grain,raggedEdge,openingPlacement} from './architecture.ts';
import {apertureBeam,drawApertureBeam,type ApertureBeam} from './aperture-light.ts';
import type {RenderLayerId} from './layers.ts';
import {NightSky} from './night-sky.ts';
export {HOUSE_LAYERS} from './layers.ts';
type Rect={x:number;y:number;w:number;h:number};
const furnitureRects:Rect[]=[{x:0,y:95,w:592,h:355},{x:595,y:35,w:432,h:406},{x:1034,y:45,w:502,h:426},{x:18,y:524,w:564,h:425},{x:604,y:443,w:412,h:536},{x:1042,y:463,w:494,h:516}];
const objectRects:Rect[]=[{x:0,y:100,w:385,h:388},{x:391,y:135,w:410,h:340},{x:822,y:180,w:296,h:301},{x:1130,y:137,w:406,h:350},{x:18,y:530,w:373,h:425},{x:399,y:641,w:400,h:321},{x:827,y:513,w:308,h:438},{x:1190,y:518,w:346,h:486}];
// Measured transparent bounds in the generated 1254px atlas; no adjacent sprite can bleed in.
const interiorRects:Rect[]=[{x:35,y:30,w:330,h:435},{x:405,y:125,w:440,h:330},{x:885,y:75,w:345,h:380},{x:12,y:545,w:500,h:283},{x:524,y:557,w:312,h:267},{x:880,y:510,w:350,h:315},{x:0,y:934,w:405,h:249},{x:423,y:1030,w:413,h:162},{x:869,y:902,w:358,h:285}];
export class BaseRenderer{
 solidLayer=document.createElement('canvas');
 rearLayer=document.createElement('canvas');nightSky=new NightSky();
 structure=document.createElement('canvas');beamTextures=new Map<string,HTMLCanvasElement>();floorTextures=new Map<string,HTMLCanvasElement>();doorTexture?:HTMLCanvasElement;
 environment=daylightStyle(720);illumination=document.createElement('canvas');sceneCopy=document.createElement('canvas');blurred=document.createElement('canvas');
 lightKey='';lightLevel?:CompiledLevel;lightFields:{source:DaylightSource;polygon:Vec[];shaft?:ApertureBeam}[]=[];
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
  this.level=w.level;this.environment=daylightStyle(w.dayMinutes);this.layerTrace=[];const layer=(name:RenderLayerId)=>this.layerTrace.push(name);
  const c=this.c;this.time+=w.phase==='playing'?dt:0;
  const fit=this.width<700?Math.min(this.height/780,this.width/930):Math.min(this.width/1600,this.height/900);this.scale=fit*this.zoom;
  const vw=this.width/this.scale,vh=this.height/this.scale;
  const targetX=vw>=this.level.width?this.level.width/2:clamp(980+(w.player.x-750)*.65,vw/2,this.level.width-vw/2);
  const targetY=vh>=this.level.height?this.level.height/2:clamp(w.player.y-95,vh/2,this.level.height-vh/2);
  this.camera.x=lerp(this.camera.x,targetX,1-Math.exp(-dt*3));this.camera.y=lerp(this.camera.y,targetY,1-Math.exp(-dt*3));
  c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#10141a';c.fillRect(0,0,this.width,this.height);
  this.transform(c);layer('background');this.background(c);this.yard(c);
  layer('walls');this.house(c,w);
  // Collect actual opaque silhouettes on an independent surface. No animation is
  // drawn twice and alpha holes between rails/legs remain open to the rear scene.
  if(this.solidLayer.width!==this.canvas.width||this.solidLayer.height!==this.canvas.height){this.solidLayer.width=this.canvas.width;this.solidLayer.height=this.canvas.height;}
  const solid=this.solidLayer.getContext('2d')!;solid.setTransform(1,0,0,1,0,0);solid.clearRect(0,0,this.solidLayer.width,this.solidLayer.height);this.transform(solid);
  layer('fixtures');this.radiators(solid,w);
  layer('interactables');
  for(const o of w.visibleObjects()){
   solid.save();if(o.searched&&['chest','wardrobe','medicine'].includes(o.kind))solid.filter='brightness(.72)';
   const bottom=this.floorY(o.floor)-(o.atlas==='interior'?13:2);this.shadow(solid,o.x,bottom+1,o.width*.42);
   this.sprite(solid,o.atlas,o.frame,o.x,bottom,o.width,o.height);solid.restore();
   if(o.kind==='generator'&&w.powered)this.glow(solid,o.x+30,this.floorY(o.floor)-53,26,'#b7d79c',.35);
  }
  layer('floors');this.floors(solid);layer('stairs');for(const stair of this.level.stairs)if(stair.kind==='ladder')this.ladder(solid,stair.a,this.floorY(stair.from),this.floorY(stair.to));else this.stair(solid,stair.a,this.floorY(stair.from),stair.b,this.floorY(stair.to));
  layer('landings');this.floors(solid,true);
  layer('doors');this.doors(solid,w);
  layer('actors');
  if(w.dogVisible){const dog=w.dog,frame=dog.mode==='warn'?3:dog.mode==='walk'||dog.mode==='retreat'?1+Math.floor(this.time*5)%2:0;solid.save();solid.translate(lerp(dog.previousX,dog.x,alpha),615);solid.scale(-dog.facing,1);if(dog.hit)solid.filter='brightness(2)';this.sprite(solid,'dog',frame,0,-2,144,96);solid.restore();}
  this.shadow(solid,lerp(w.player.previousX,w.player.x,alpha),lerp(w.player.previousY,w.player.y,alpha)+1,38);
  this.hero.draw(solid,w.player,w.phase==='playing'?dt:0,alpha,!!w.task,this.level.stairs.find(s=>s.id===w.player.stair?.id)?.kind==='ladder',w.doorInteraction);
  if(w.flashlight)this.flashlight(solid,w);
  layer('foreground');this.stairRails(solid);this.architectureEdges(solid);this.foreground(solid,w);
  layer('lighting');this.lighting(w,this.solidLayer);
  if(this.rearLayer.width!==this.canvas.width||this.rearLayer.height!==this.canvas.height){this.rearLayer.width=this.canvas.width;this.rearLayer.height=this.canvas.height;}
  this.rearLayer.getContext('2d')!.drawImage(this.canvas,0,0);
  c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(this.solidLayer,0,0);c.restore();this.transform(c);
  layer('visibility');this.fogOfWar(w,this.rearLayer,this.solidLayer);layer('structure');this.structuralForeground(w);this.transform(c);
  layer('markers');this.markers(c,w);
  if(w.task){const p=w.player,t=1-w.task.remaining/w.task.duration;c.save();c.translate(p.x,p.y-151);c.fillStyle='#0b1016dc';c.fillRect(-31,-5,62,9);c.fillStyle='#d7bd8a';c.fillRect(-29,-3,58*t,5);c.restore();}
  if(w.dogVisible&&w.dog.mode==='warn'){c.fillStyle='#db866b';c.font='bold 20px Georgia';c.textAlign='center';c.fillText('!',w.dog.x,515);}
  if(w.navigation){const n=w.navigation;c.strokeStyle='#d8c193';c.globalAlpha=.65;c.lineWidth=1;c.beginPath();c.ellipse(n.x,this.floorY(n.floor)+1,13,4,0,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
  c.setTransform(this.dpr,0,0,this.dpr,0,0);const vignette=c.createRadialGradient(this.width*.5,this.height*.52,this.width*.16,this.width*.5,this.height*.5,this.width*.65);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,`rgba(0,0,0,${.18+(1-this.environment.sun)*.15})`);c.fillStyle=vignette;c.fillRect(0,0,this.width,this.height);
  if(w.player.hurt){c.fillStyle=`rgba(145,47,37,${w.player.hurt*.12})`;c.fillRect(0,0,this.width,this.height);}
 }
 texture(c:CanvasRenderingContext2D,index:number,x:number,y:number,w:number,h:number,scale=1){const pattern=c.createPattern(this.assets.tiles[index],'repeat')!;pattern.setTransform(new DOMMatrix().scale(scale));c.fillStyle=pattern;c.fillRect(x,y,w,h);}
 skyFrame(){const top=Math.min(-80,this.camera.y-this.height/this.scale/2);return {x:this.camera.x*.15-310,y:top,width:this.level.width+630,height:800-top};}
 background(c:CanvasRenderingContext2D){
  const im=this.assets.images.district,f=this.skyFrame();c.save();c.filter=`brightness(${.88+this.environment.sun*.4}) saturate(${.55+this.environment.sun*.25})`;c.drawImage(im,f.x,f.y,f.width,f.height);c.filter='none';c.globalCompositeOperation='screen';c.globalAlpha=this.environment.skyMix;c.fillStyle=this.environment.sky;c.fillRect(-500,f.y,this.level.width+1000,1000-f.y);c.restore();
  this.nightSky.draw(c,f,this.environment.night,this.time);
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
   const a=backPoint(room,room.x,y-h+8,y),b=backPoint(room,room.end,y+3,y);
   // Connect the rear planes through internal door reveals. Without this depth
   // backing, shrinking two neighbouring rooms exposes the outdoor sky between them.
   this.texture(wall,room.material,room.x,y-h+8,room.end-room.x,h-8,room.floor<0?.65:.58);wall.fillStyle='#050a1366';wall.fillRect(room.x,y-h+8,room.end-room.x,h-8);
   this.texture(wall,room.material,a.x,a.y,b.x-a.x,b.y-a.y,room.floor<0?.65:.58);
   const shade=wall.createLinearGradient(0,a.y,0,b.y);shade.addColorStop(0,'#08101c5c');shade.addColorStop(.43,'#16233012');shade.addColorStop(1,'#050b1585');wall.fillStyle=shade;wall.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);
   // Low skirting and exposed ceiling joists are architecture, not room contents.
   wall.fillStyle=room.floor<0?'#484840':'#635d4f';wall.fillRect(a.x,b.y-6,b.x-a.x,6);wall.fillStyle='#b7ae8a33';wall.fillRect(a.x,b.y-6,b.x-a.x,1);
   this.wallAtmosphere(wall,room);
   if(w.explored.has(room.id)){wall.fillStyle='#d2c3a868';wall.font='8px monospace';wall.textAlign='left';wall.fillText(room.name.toUpperCase(),a.x+12,a.y+19);}
  }
  wall.save();wall.globalCompositeOperation='destination-out';
  for(const opening of w.openings.filter(o=>o.plane==='back')){const p=openingPlacement(this.level,opening);this.damageSprite(wall,opening.kind==='window'?opening.variant||0:2,p.x,p.bottom,p.width,p.height,true);}
  wall.restore();c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(this.wallLayer,0,0);c.restore();
  for(const opening of w.openings){
   const y=this.floorY(opening.floor),top=y-opening.bottom-opening.height;
   if(opening.plane==='back'){
    const p=openingPlacement(this.level,opening);
    if(opening.state==='boarded')this.boards(c,p.x,p.bottom,p.width*.86,p.height*.92);
    this.damageSprite(c,opening.kind==='window'?opening.variant||0:2,p.x,p.bottom,p.width,p.height);

   }else{
    this.texture(c,2,opening.x-9,y-this.level.floorHeight+8,18,this.level.floorHeight-opening.height-8,.38);
    // A shattered divider, open at walking height; the upper remnant stays solid.
    for(let i=0;i<5;i++){c.fillStyle=i%2?'#735346':'#998b72';c.fillRect(opening.x-12+(i%2)*4,top-6+i*4,20-i*3,5);}
    if(opening.state==='boarded')this.boards(c,opening.x,y,22,opening.height);
   }
  }
  this.wallReturns(c,w);
 }
 radiators(c:CanvasRenderingContext2D,w:BaseWorld){
  for(const room of this.level.rooms)if(room.floor>=0){const x=room.end-81;if(!w.visible({x,y:this.floorY(room.floor)-40}))continue;this.sprite(c,'interior',6,x,this.floorY(room.floor)-25,66,43);}
 }
 /** Both side planes converge towards this room's own centre. The opening is cut
  * out of each adjoining reveal, so depth never paints over a walkable doorway. */
 wallReturns(c:CanvasRenderingContext2D,w:BaseWorld){
  for(const room of this.level.rooms){const y=this.floorY(room.floor),top=y-this.level.floorHeight+8;
   const a=backPoint(room,room.x,top,y),b=backPoint(room,room.end,top,y);
   c.save();this.path(c,[{x:room.x,y:top},{x:room.end,y:top},b,a]);c.clip();this.texture(c,3,room.x,top,room.end-room.x,a.y-top+1,.32);c.fillStyle='#060d1688';c.fillRect(room.x,top,room.end-room.x,a.y-top+1);c.restore();
   for(const x of [room.x,room.end]){const door=w.doors.find(d=>d.x===x&&d.floor===room.floor),hole=w.openings.find(o=>o.x===x&&o.floor===room.floor&&o.plane==='divider'),end=door?y-151:hole&&hole.state==='open'?y-hole.height:y+3;
    const bt=backPoint(room,x,top,y),bb=backPoint(room,x,end,y),left=Math.min(x,bt.x),width=Math.abs(bt.x-x);
    c.save();this.path(c,[{x,y:top},bt,bb,{x,y:end}]);c.clip();this.texture(c,room.material,left,top,width+1,y+3-top,room.floor<0?.65:.58);
    const shade=c.createLinearGradient(x,0,bt.x,0);shade.addColorStop(0,'#030608bd');shade.addColorStop(1,x===room.x?'#10171535':'#04091268');c.fillStyle=shade;c.fillRect(left,top,width+1,y+3-top);c.restore();
    c.strokeStyle='#ada28a38';c.lineWidth=1;c.beginPath();c.moveTo(bt.x,bt.y);c.lineTo(bb.x,bb.y);c.stroke();
    if(door||hole&&hole.state==='open'){c.strokeStyle=door?'#8f826858':'#6c65504d';c.lineWidth=3;c.beginPath();c.moveTo(x,end);c.lineTo(bb.x,bb.y);c.stroke();}
   }
  }
 }
 wallAtmosphere(c:CanvasRenderingContext2D,room:Room){
  const y=this.floorY(room.floor),top=y-this.level.floorHeight,seed=room.x*.3+room.floor*11,width=room.end-room.x;
  const a=backPoint(room,room.x,top+8,y),b=backPoint(room,room.end,y+3,y);c.save();c.beginPath();c.rect(a.x,a.y,b.x-a.x,b.y-a.y);c.clip();
  // Uneven stains and dusty depth, drawn before lighting: these patches cannot light a dark room.
  for(let i=0;i<5;i++){const px=room.x+25+grain(seed+i)*width,py=top+40+grain(seed+i+8)*120,r=45+grain(seed+i+17)*100,g=c.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,i%2?'#c3cbbe14':'#080e1847');g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(px-r,py-r,r*2,r*2);}
  c.strokeStyle='#cfceba0c';c.lineWidth=.6;for(let i=0;i<24;i++){const x=room.x+grain(seed+i+32)*width,yy=top+grain(seed+i+72)*180;c.beginPath();c.moveTo(x,yy);c.lineTo(x-18,yy+24);c.stroke();}
  c.strokeStyle='#101510a0';c.lineWidth=1.5;c.beginPath();c.moveTo(room.x+25,top+29);c.quadraticCurveTo(room.x+width*.55,top+49,room.end-18,top+22);c.stroke();c.restore();
 }
 damageSprite(c:CanvasRenderingContext2D,frame:number,x:number,bottom:number,width:number,height:number,mask=false){const asset=this.assets.damageFrames[frame],im=mask?asset.mask:asset.image,scale=Math.min(width/im.width,height/im.height);c.drawImage(im,x-im.width*scale/2,bottom-im.height*scale,im.width*scale,im.height*scale);}
 boards(c:CanvasRenderingContext2D,x:number,bottom:number,width:number,height:number){
  c.save();c.beginPath();c.rect(x-width/2,bottom-height,width,height);c.clip();this.texture(c,3,x-width/2,bottom-height,width,height,.35);
  for(let y=bottom-height;y<bottom;y+=22){c.fillStyle='#171d20aa';c.fillRect(x-width/2,y,width,2);c.fillStyle='#d1bea84a';c.fillRect(x-width/2,y+2,width,1);c.fillStyle='#242622';c.fillRect(x-width/2+7,y+8,2,2);c.fillRect(x+width/2-9,y+8,2,2);}c.restore();
 }
 doors(c:CanvasRenderingContext2D,w:BaseWorld){for(const d of w.doors){const y=this.floorY(d.floor),room=this.level.rooms.find(r=>r.floor===d.floor&&r.x===d.x)||this.level.rooms.find(r=>r.floor===d.floor&&r.end===d.x)!;
  const back=backPoint(room,d.x,y,y),depth={x:back.x-d.x,y:back.y-y},leaf=doorLeaf(d,depth);c.save();c.translate(d.x,y);
  // An open doorway has only its jambs and lintel, never a black rectangle down to the sill.
  c.strokeStyle='#292924';c.lineWidth=7;c.beginPath();c.moveTo(0,1);c.lineTo(0,-151);c.lineTo(depth.x,-151*(1-ROOM_DEPTH.contraction)+depth.y);c.lineTo(depth.x,depth.y);c.stroke();
  c.strokeStyle='#b1a18b';c.lineWidth=1.5;c.stroke();
  c.save();c.translate(depth.x,depth.y);c.transform(leaf.x/62,leaf.y/62,0,1,0,0);const panel=this.doorPanel();for(let x=0;x<62;x+=2){const scale=1-ROOM_DEPTH.contraction+(leaf.nearScale-1+ROOM_DEPTH.contraction)*(x+1)/62;c.drawImage(panel,x,0,2,147,x,-147*scale,2.05,147*scale);}c.restore();
  c.strokeStyle='#cec2a96b';c.lineWidth=1.4;c.beginPath();c.moveTo(depth.x+leaf.x,depth.y+leaf.y-147*leaf.nearScale);c.lineTo(depth.x+leaf.x,depth.y+leaf.y);c.stroke();
  for(const yy of [-125,-28]){c.fillStyle='#868175';c.fillRect(depth.x-2,depth.y+yy*(1-ROOM_DEPTH.contraction),4,7);}c.restore();}}
 doorPanel(){if(this.doorTexture)return this.doorTexture;const panel=document.createElement('canvas');panel.width=62;panel.height=147;const c=panel.getContext('2d')!;this.texture(c,3,0,0,62,147,.33);c.fillStyle='#47443e55';c.fillRect(0,0,62,147);c.strokeStyle='#1a1b18';c.lineWidth=2;c.strokeRect(1,1,60,144);c.strokeRect(8,13,46,57);c.strokeRect(8,80,46,53);c.strokeStyle='#ae9f7b88';c.lineWidth=1;c.strokeRect(9,14,44,55);c.strokeRect(9,81,44,51);c.fillStyle='#b4a489';c.fillRect(48,70,10,3);c.fillStyle='#151716';c.fillRect(53,74,2,6);this.doorTexture=panel;return panel;}
 roomSlabs(room:Room){const b=this.level.buildings.find(b=>b.id===room.buildingId)!;return floorOccluderSpans(this.level,b,room.floor).map(([a,b])=>[Math.max(a,room.x),Math.min(b,room.end)] as [number,number]).filter(([a,b])=>b>a);}
 floorTexture(room:Room){const y=this.floorY(room.floor),key=[room.x,room.end,y,room.material].join(':'),cached=this.floorTextures.get(key);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(room.end-room.x);canvas.height=30;const c=canvas.getContext('2d')!,center=(room.x+room.end)/2,back=backPoint(room,center,y+3,y);c.translate(-room.x,-(y-26));
  for(let yy=y-26;yy<y+4;yy++){const t=clamp((y+3-yy)/(y+3-back.y),0,1),scale=1-ROOM_DEPTH.contraction*t;c.save();c.transform(scale,0,0,1,center*(1-scale),0);this.texture(c,room.floor<0?4:3,room.x,yy,room.end-room.x,1.05,.38);c.restore();}
  const shade=c.createLinearGradient(0,back.y,0,y+3);shade.addColorStop(0,'#060a1088');shade.addColorStop(.65,'#e1d3ac22');shade.addColorStop(1,'#a79c7a11');c.fillStyle=shade;c.fillRect(room.x,y-26,room.end-room.x,30);
  c.strokeStyle='#1a1b17aa';c.lineWidth=.8;for(let px=Math.ceil(room.x/57)*57;px<room.end;px+=57){const p=backPoint(room,px,y+3,y);c.beginPath();c.moveTo(px,y+3);c.lineTo(p.x,p.y);c.stroke();}this.floorTextures.set(key,canvas);return canvas;
 }
 floors(c:CanvasRenderingContext2D,landingOnly=false){for(const b of this.level.buildings)for(const floor of b.floors){if(landingOnly&&!this.level.stairs.some(s=>s.to===floor&&s.b>=b.x&&s.b<=b.end))continue;const y=this.floorY(floor);
  // Only the rear strip has a stairwell opening. The front surface and fascia span it.
  if(!landingOnly)for(const room of this.level.rooms.filter(r=>r.buildingId===b.id&&r.floor===floor))for(const [x,end] of this.roomSlabs(room)){c.save();this.path(c,floorFace(room,x,end,y));c.clip();c.drawImage(this.floorTexture(room),room.x,y-26,room.end-room.x,30);c.restore();}
  for(const [x,end] of floorSpans(this.level,b,floor)){
   this.texture(c,floor<0?4:3,x,y-6,end-x,18,.43);const shade=c.createLinearGradient(0,y-6,0,y+12);shade.addColorStop(0,'#ced0b81e');shade.addColorStop(1,'#07101b55');c.fillStyle=shade;c.fillRect(x,y-6,end-x,18);c.fillStyle='#d2b98b55';c.fillRect(x,y-6,end-x,1);
  }
  if(!landingOnly)for(const [left,right] of stairApertures(this.level,b,floor))for(const room of this.level.rooms.filter(r=>r.buildingId===b.id&&r.floor===floor&&r.end>left&&r.x<right)){c.fillStyle='#080e1666';this.path(c,floorFace(room,Math.max(left,room.x),Math.min(right,room.end),y));c.fill();c.strokeStyle='#8c7d6055';c.lineWidth=1;c.stroke();}
 }}
 stair(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number){
  const lower=levelRoomAt(this.level,x,Math.round((this.level.groundY-y)/this.level.floorHeight))!,upper=levelRoomAt(this.level,x2,Math.round((this.level.groundY-y2)/this.level.floorHeight))!,a=backPoint(lower,x,y,y),b=backPoint(upper,x2,y2,y2);
  this.flightRail(c,a.x,a.y,b.x,b.y,true);
  const count=15,run=(x2-x)/count,dir=Math.sign(run)||1;
  for(let i=0;i<count;i++){const px=x+run*i,py=y+(y2-y)*i/count,left=Math.min(px-10,px+run+8),right=Math.max(px-10,px+run+8);
   const room={x:lerp(lower.x,upper.x,i/count),end:lerp(lower.end,upper.end,i/count)};
   c.save();this.path(c,floorFace(room,left,right,py-3));c.clip();this.texture(c,3,left-60,py-29,right-left+120,30,.23);c.fillStyle=i%3?'#89837118':'#c3ad7540';c.fillRect(left-60,py-29,right-left+120,30);c.restore();
   c.fillStyle='#34352e';c.fillRect(left,py,right-left,5);c.strokeStyle='#b2a78c99';c.lineWidth=1;c.beginPath();c.moveTo(left,py);c.lineTo(right,py);c.stroke();
   c.fillStyle='#111817';c.fillRect(px+dir*2,py+1,2,2);
  }
  c.save();this.path(c,[{x:x-14,y:y+2},{x:x2+8,y:y2+2},{x:x2+8,y:y2+15},{x:x-14,y:y+18}]);c.clip();this.texture(c,3,Math.min(x,x2)-18,Math.min(y,y2),Math.abs(x2-x)+45,Math.abs(y2-y)+23,.3);c.fillStyle='#131a1ac0';c.fillRect(Math.min(x,x2)-18,Math.min(y,y2),Math.abs(x2-x)+45,Math.abs(y2-y)+23);c.restore();
  c.strokeStyle='#8b826555';c.lineWidth=1;c.beginPath();c.moveTo(x-14,y+3);c.lineTo(x2+8,y2+3);c.stroke();
 }
 ladder(c:CanvasRenderingContext2D,x:number,bottom:number,top:number){
  // A true vertical flight with a 68-unit hatch, anchored brackets and rounded grab rails.
  c.save();c.strokeStyle='#05080770';c.lineWidth=7;for(const dx of [-17,17]){c.beginPath();c.moveTo(x+dx+6,bottom-3);c.lineTo(x+dx+6,top-31);c.stroke();}
  for(const dx of [-17,17]){const metal=c.createLinearGradient(x+dx-3,0,x+dx+4,0);metal.addColorStop(0,'#272c29');metal.addColorStop(.45,'#b3afa0');metal.addColorStop(.65,'#716d58');metal.addColorStop(1,'#242926');c.strokeStyle=metal;c.lineWidth=6;c.beginPath();c.moveTo(x+dx,bottom+1);c.lineTo(x+dx,top-31);c.quadraticCurveTo(x+dx,top-41,x+dx+8,top-39);c.stroke();}
  const count=Math.round((bottom-top)/18);for(let i=0;i<=count;i++){const y=bottom-i*(bottom-top)/count;c.fillStyle='#32362f';c.fillRect(x-18,y-4,36,6);c.fillStyle='#b7b09b';c.fillRect(x-17,y-4,34,1.5);for(const xx of [-13,13]){c.fillStyle='#7a5036';c.fillRect(x+xx,y-2,3,2);}}
  c.strokeStyle='#4f5349';c.lineWidth=3;for(const yy of [bottom-35,top+44])for(const dx of [-17,17]){c.beginPath();c.moveTo(x+dx,yy);c.lineTo(x+dx+10,yy-9);c.lineTo(x+dx+10,yy-17);c.stroke();}c.restore();
 }
 flightRail(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number,back=false){
  c.save();c.lineCap='round';for(let i=0;i<=7;i++){const t=i/7,px=lerp(x,x2,t),py=lerp(y,y2,t);c.strokeStyle=back?'#333c36':'#414339';c.lineWidth=i===0||i===7?5:2;c.beginPath();c.moveTo(px,py-48);c.lineTo(px,py+7);c.stroke();c.strokeStyle='#b5aa824e';c.lineWidth=.8;c.beginPath();c.moveTo(px-1,py-47);c.lineTo(px-1,py+3);c.stroke();if(i===0||i===7){c.fillStyle='#766e57';c.fillRect(px-4,py-51,8,4);}}
  c.strokeStyle=back?'#323930':'#292e26';c.lineWidth=6;c.beginPath();c.moveTo(x-7,y-48);c.lineTo(x2+8,y2-48);c.stroke();c.strokeStyle='#b1a4828a';c.lineWidth=1.3;c.beginPath();c.moveTo(x-7,y-50);c.lineTo(x2+8,y2-50);c.stroke();c.restore();
 }
 architectureEdges(c:CanvasRenderingContext2D){for(const b of this.level.buildings)for(const f of b.floors){const y=this.floorY(f);for(const [x,end] of floorSpans(this.level,b,f)){this.texture(c,f<0?4:3,x,y+10,end-x,17,.4);c.fillStyle='#080f1b99';c.fillRect(x,y+14,end-x,12);c.fillStyle='#b9ac8655';c.fillRect(x,y+10,end-x,2);}}}
 stairRails(c:CanvasRenderingContext2D){c.save();c.beginPath();c.rect(-1000,-1000,this.level.width+2000,this.level.height+2000);for(const b of this.level.buildings)for(const f of b.floors)c.rect(b.x,this.floorY(f)-6,b.end-b.x,33);c.clip('evenodd');for(const s of this.level.stairs)if(s.kind!=='ladder')this.flightRail(c,s.a-9,this.floorY(s.from),s.b-9,this.floorY(s.to));c.restore();}
 yard(c:CanvasRenderingContext2D){
  for(const side of [[90,451],[1590,2160]]){const [start,end]=side;c.strokeStyle='#2c322d';c.lineWidth=4;c.beginPath();c.moveTo(start,574);c.lineTo(end,574);c.moveTo(start,535);c.lineTo(end,535);c.stroke();for(let x=start;x<end;x+=29){c.fillStyle='#3c4138';c.fillRect(x,510+(x%7),10,99);c.fillStyle='#82836b22';c.fillRect(x,514,2,93);}}
  c.strokeStyle='#6b6c5440';c.lineWidth=1;for(let i=0;i<130;i++){const x=(i*193.37)%2220;if(this.level.buildings.some(b=>x>b.x-30&&x<b.end+50))continue;const y=620+(i%4)*5;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-7,y-18,x+(i%3-1)*5,y-28-i%8);c.stroke();}
  c.strokeStyle='#272a2b';c.lineWidth=8;c.beginPath();c.moveTo(1760,618);c.lineTo(1760,377);c.lineTo(1804,377);c.stroke();c.fillStyle='#958263';c.fillRect(1791,374,26,5);
  c.strokeStyle='#88897520';c.lineWidth=2;for(let i=0;i<19;i++){const x=160+i*95;c.beginPath();c.moveTo(x,639);c.lineTo(x+45,637);c.stroke();}
 }
 foreground(c:CanvasRenderingContext2D,w:BaseWorld){
  for(const d of this.level.foreground)if(w.explored.has(d.roomId)){
   c.save();const y=this.floorY(d.floor)+5;
   if(d.kind==='planks'){
    // Short, frontal stacks sit on the near floor edge, below the hero's knees.
    c.translate(d.x-d.width/2,y);c.rotate(-.028);this.shadow(c,d.width/2,0,d.width*.55);
    for(let i=0;i<4;i++){const x=i%2*9,yy=-7-i*6,width=d.width-i%3*11;this.texture(c,3,x,yy,width,7,.23);c.strokeStyle='#181b19';c.lineWidth=1.4;c.strokeRect(x,yy,width,7);c.fillStyle='#ae98745c';c.fillRect(x+2,yy+1,width-4,1);c.fillStyle='#171b1a';c.fillRect(x+7,yy+3,2,2);c.fillRect(x+width-10,yy+3,2,2);}
   }else if(d.kind==='crate'){this.sprite(c,'interior',5,d.x,y,d.width,d.height);}
   else{if(d.frame===8&&w.player.floor===d.floor)c.globalAlpha=.35+.65*clamp((Math.abs(w.player.x-d.x)-25)/65,0,1);this.sprite(c,'interior',d.frame??7,d.x,y,d.width,d.height);}
   c.restore();
  }
  // Only low silhouettes at the yard edge; nothing covers an actor's torso.
  c.strokeStyle='#050a0de8';for(let i=0;i<75;i++){const x=i*31+Math.sin(i*7)*14;if(this.level.buildings.some(b=>x>b.x-10&&x<b.end+20))continue;c.lineWidth=2;c.beginPath();c.moveTo(x,671);c.quadraticCurveTo(x+5,651,x+Math.sin(i)*14,644-i%16);c.stroke();}
 }
 trim(id:ImageId,frame:number){
  const key=id+frame,cached=this.trimCache.get(key);if(cached)return cached;
  const im=this.assets.images[id],r=id==='furniture'?furnitureRects[frame]:id==='objects'?objectRects[frame]:id==='interior'?interiorRects[frame]:id==='crate'?{x:0,y:0,w:im.width,h:im.height}:{x:frame%3*512,y:Math.floor(frame/3)*512,w:512,h:512};
  const canvas=document.createElement('canvas');canvas.width=r.w;canvas.height=r.h;const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(im,r.x,r.y,r.w,r.h,0,0,r.w,r.h);const data=c.getImageData(0,0,r.w,r.h).data;
  let l=r.w,t=r.h,rr=0,b=0;for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)if(data[(y*r.w+x)*4+3]>45){l=Math.min(l,x);t=Math.min(t,y);rr=Math.max(rr,x);b=Math.max(b,y);}
  const trim={x:r.x+l,y:r.y+t,w:rr-l+1,h:b-t+1};this.trimCache.set(key,trim);return trim;
 }
 sprite(c:CanvasRenderingContext2D,id:'furniture'|'objects'|'dog'|'interior',frame:number,x:number,y:number,maxWidth:number,maxHeight:number){const source=id==='interior'&&frame===5?'crate':id,r=this.trim(source,frame),scale=Math.min(maxWidth/r.w,maxHeight/r.h);c.drawImage(this.assets.images[source],r.x,r.y,r.w,r.h,x-r.w*scale/2,y-r.h*scale,r.w*scale,r.h*scale);}
 shadow(c:CanvasRenderingContext2D,x:number,y:number,r:number){c.save();c.translate(x,y);c.scale(1,.15);const g=c.createRadialGradient(0,0,1,0,0,r);g.addColorStop(0,'#000b');g.addColorStop(1,'transparent');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();}
 glow(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){c.save();c.globalCompositeOperation='screen';c.globalAlpha=alpha;const g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
 path(c:CanvasRenderingContext2D,points:Vec[]){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
 lightSources(w:BaseWorld){
  const key=`${Math.floor(w.dayMinutes/2)}|${w.doors.map(d=>Number(d.open)).join('')}|${w.openings.map(o=>o.state).join(',')}`;
  if(key!==this.lightKey||this.lightLevel!==w.level){this.lightKey=key;this.lightLevel=w.level;this.lightFields=exteriorLightSources(w.level,w.doors,w.openings,w.dayMinutes).map(source=>({source,polygon:visibilityPolygon(source.origin,0,Math.PI,source.range,w.sight.segments),shaft:source.apertureBeam?apertureBeam(this.assets,w.level,w.openings.find(o=>o.id===source.openingId)!,source,w.sight.segments):undefined}));}
  return this.lightFields;
 }
 directLight(c:CanvasRenderingContext2D,field:typeof this.lightFields[number]){if(field.shaft)drawApertureBeam(c,field.shaft);else if(!field.source.openingId){c.save();this.path(c,field.polygon);c.clip();this.sunBeam(c,field.source);c.restore();}}
 lighting(w:BaseWorld,solidLayer?:HTMLCanvasElement){
  const c=this.illumination.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.illumination.width,this.illumination.height);
  c.fillStyle=`rgba(5,10,22,${this.environment.exteriorDark})`;c.fillRect(0,0,this.illumination.width,this.illumination.height);this.transform(c);
  for(const room of this.level.rooms){const y=this.floorY(room.floor)-this.level.floorHeight+8,h=this.level.floorHeight+20;c.clearRect(room.x,y,room.end-room.x,h);c.fillStyle=`rgba(3,8,18,${w.powered?.48:this.environment.interiorDark})`;c.fillRect(room.x,y,room.end-room.x,h);}
  // Only real exterior openings remove ambient darkness. There is no player-centred light.
  for(const {source,polygon} of this.lightSources(w)){c.save();this.path(c,polygon);c.clip();c.globalCompositeOperation='destination-out';const {x,y}=source.origin,g=c.createRadialGradient(x,y,0,x,y,source.range);g.addColorStop(0,`rgba(0,0,0,${source.strength})`);g.addColorStop(.35,`rgba(0,0,0,${source.strength*.6})`);g.addColorStop(.7,`rgba(0,0,0,${source.strength*.25})`);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-source.range,y-source.range,source.range*2,source.range*2);c.restore();}
  if(w.flashlight){const origin=w.lightOrigin;c.save();this.path(c,visibilityPolygon(origin,w.aim,BEAM_HALF,BEAM_RANGE,w.sight.segments));c.clip();c.globalCompositeOperation='destination-out';const end={x:origin.x+Math.cos(w.aim)*BEAM_RANGE,y:origin.y+Math.sin(w.aim)*BEAM_RANGE},g=c.createLinearGradient(origin.x,origin.y,end.x,end.y);g.addColorStop(0,'rgba(0,0,0,.82)');g.addColorStop(.5,'rgba(0,0,0,.7)');g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(origin.x-BEAM_RANGE,origin.y-BEAM_RANGE,BEAM_RANGE*2,BEAM_RANGE*2);c.restore();}
  // Surface light changes RGB while preserving the solid layer's original alpha.
  // Direct aperture patterns and airborne haze belong behind these silhouettes.
  if(solidLayer){const solid=solidLayer.getContext('2d')!;solid.save();solid.setTransform(1,0,0,1,0,0);solid.globalCompositeOperation='source-atop';solid.drawImage(this.illumination,0,0);solid.restore();}
  for(const field of this.lightFields){c.save();c.globalCompositeOperation='destination-out';c.globalAlpha=field.source.beamStrength;this.directLight(c,field);c.restore();}
  this.c.save();this.c.setTransform(1,0,0,1,0,0);this.c.drawImage(this.illumination,0,0);this.c.restore();
  // A restrained warm/cool tint inside the sun shafts; the same geometry clips the tint.
  const out=this.c;for(const field of this.lightFields){out.save();out.globalCompositeOperation='screen';out.globalAlpha=field.source.beamStrength*.22;this.directLight(out,field);out.restore();}
  if(w.flashlight)this.flashlightHaze(out,w);
 }
 fogOfWar(w:BaseWorld,rearScene?:HTMLCanvasElement,solidScene?:HTMLCanvasElement){
  const sharp=this.sceneCopy.getContext('2d')!;sharp.setTransform(1,0,0,1,0,0);sharp.clearRect(0,0,this.sceneCopy.width,this.sceneCopy.height);sharp.drawImage(this.canvas,0,0);
  const small=this.blurred.getContext('2d')!;small.setTransform(1,0,0,1,0,0);small.clearRect(0,0,this.blurred.width,this.blurred.height);small.filter=`blur(${1.35*this.dpr}px)`;small.drawImage(rearScene??this.sceneCopy,0,0,this.blurred.width,this.blurred.height);small.filter='none';
  const fog=this.fog.getContext('2d')!;fog.setTransform(1,0,0,1,0,0);fog.clearRect(0,0,this.fog.width,this.fog.height);fog.drawImage(this.blurred,0,0,this.fog.width,this.fog.height);this.transform(fog);
  fog.save();fog.globalCompositeOperation='destination-out';fog.filter=`blur(${5*this.dpr}px)`;fog.fillStyle='#fff';this.path(fog,visibilityPolygon(w.sight.origin,0,Math.PI,SIGHT_RANGE,w.sight.segments,140));fog.fill();
  const peek=w.sight.peek;if(peek){this.path(fog,visibilityPolygon(peek.origin,peek.angle,peek.half,peek.range,peek.segments,80));fog.fill();}
  fog.fillRect(w.player.x-37,w.player.y-134,74,140);fog.restore();
  // Celestial background is not room discovery. Keep it legible only in the
  // exposed sky; this never reveals a room, an object or sky through a solid roof.
  if(this.environment.night>0){fog.save();fog.globalCompositeOperation='destination-out';fog.globalAlpha=this.environment.night;this.nightSky.path(fog,this.skyFrame());fog.clip();fog.beginPath();fog.rect(-2000,-2000,this.level.width+4000,this.level.height+4000);
   for(const b of this.level.buildings){const top=this.floorY(Math.max(...b.floors))-this.level.floorHeight-b.roof.rise-55;fog.rect(b.x-44,top,b.end-b.x+88,this.floorY(Math.min(...b.floors))-top+40);}fog.clip('evenodd');fog.fillRect(-2000,-2000,this.level.width+4000,this.level.height+4000);fog.restore();}
  this.c.save();this.c.setTransform(1,0,0,1,0,0);if(rearScene)this.c.drawImage(rearScene,0,0);this.c.drawImage(this.fog,0,0);
  if(solidScene){
   // Blur material colour independently of the rear rays. Source-atop retains
   // each original silhouette, so even hidden rails remain solid against light.
   small.clearRect(0,0,this.blurred.width,this.blurred.height);small.filter=`blur(${1.35*this.dpr}px)`;small.drawImage(solidScene,0,0,this.blurred.width,this.blurred.height);small.filter='none';
   const masked=this.structure.getContext('2d')!;masked.setTransform(1,0,0,1,0,0);masked.clearRect(0,0,this.structure.width,this.structure.height);masked.drawImage(this.blurred,0,0,this.structure.width,this.structure.height);masked.globalCompositeOperation='destination-in';masked.drawImage(this.fog,0,0);masked.globalCompositeOperation='source-over';
   const solid=solidScene.getContext('2d')!;solid.save();solid.setTransform(1,0,0,1,0,0);solid.globalCompositeOperation='source-atop';solid.drawImage(this.structure,0,0);solid.restore();this.c.drawImage(solidScene,0,0);
  }this.c.restore();
 }
 /** Soft rectangular shafts for exterior doors; windows use their full alpha aperture. */
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
   this.earthCut(c,groundStart,b.x-17,this.level.groundY+24,deep);groundStart=b.end+38;
   c.fillRect(b.x-17,bottom+22,b.end-b.x+55,deep-bottom);
   // Cross-section of the roof and chimney, outer walls, and continuous floor fascia.
   this.path(c,[...raggedEdge({x:b.x-40,y:top-2},{x:b.x+104,y:ridge},4),...raggedEdge({x:b.x+104,y:ridge},{x:b.end-105,y:ridge},5),...raggedEdge({x:b.end-105,y:ridge},{x:b.end+38,y:top-2},4),{x:b.end+38,y:top+9},{x:b.x-40,y:top+9}]);c.fill();
   c.fillRect(b.x+b.roof.chimney-28,ridge-44,54,90);c.fillRect(b.x+b.roof.chimney-34,ridge-49,66,9);
   for(const f of b.floors){const y=this.floorY(f);
    // These outer cuts use the same door openings as internal partitions.
    for(const [x,width] of [[b.x-17,17],[b.end,38]]){const door=w.doors.find(d=>d.floor===f&&d.x===(x<b.x?b.x:b.end)),end=door?y-151:y+26;c.fillRect(x,y-this.level.floorHeight-1,width,end-y+this.level.floorHeight+1);}
    const left=b.x-17,right=b.end+38;
    this.path(c,[...raggedEdge({x:left,y:y+3},{x:right,y:y+3},3.5,11),...raggedEdge({x:right,y:y+28},{x:left,y:y+28},3,15)]);c.fill();
    for(let xx=b.x+13;xx<b.end-18;xx+=21+grain(xx+5)*44){if(grain(xx+f*13)>.64){const height=1+grain(xx+7)*4,width=4+grain(xx+9)*14,tilt=grain(xx+12)*6-3;c.beginPath();c.moveTo(xx,y+7);c.lineTo(xx+tilt,y-height);c.lineTo(xx+width,y-height+1);c.lineTo(xx+width+3,y+7);c.fill();}}
   }
   for(const f of b.floors){const y=this.floorY(f);const edges=new Set(this.level.rooms.filter(r=>r.buildingId===b.id&&r.floor===f).flatMap(r=>[r.x,r.end]));
    for(const x of edges){const door=w.doors.find(d=>d.x===x&&d.floor===f),hole=w.openings.find(o=>o.x===x&&o.floor===f&&o.plane==='divider');const end=door?y-148:hole?y-hole.height:y;
     const start=y-this.level.floorHeight-1;
     this.path(c,[...raggedEdge({x:x-8,y:start},{x:x-8,y:end},3,12),...raggedEdge({x:x+8,y:end},{x:x+8,y:start},4,15)]);c.fill();
     if(hole){for(let i=0;i<4;i++)c.fillRect(x-9+(i%2)*3,end-2+i*3,17-i*3,4);}
    }
   }
  }
  this.earthCut(c,groundStart,right,this.level.groundY+24,deep);c.restore();
 }
 earthCut(c:CanvasRenderingContext2D,left:number,right:number,y:number,deep:number){if(right<=left)return;this.path(c,[...raggedEdge({x:left,y},{x:right,y},5,16),{x:right,y:deep},{x:left,y:deep}]);c.fill();}
 /** Restore already-lit structural pixels above fog; interiors remain blurred.
  * Copying the original composite also preserves actors in front of floor surfaces. */
 structuralForeground(w:BaseWorld){
  const c=this.structure.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.structure.width,this.structure.height);this.transform(c);c.fillStyle='#fff';
  for(const b of this.level.buildings){
   const top=this.floorY(Math.max(...b.floors))-this.level.floorHeight,bottom=this.floorY(Math.min(...b.floors));
   c.fillRect(b.x-17,top,17,bottom-top+20);c.fillRect(b.end,top,17,bottom-top+20);c.fillRect(b.x-40,top-7,b.end-b.x+80,12);
   for(const f of b.floors){const y=this.floorY(f);c.fillRect(b.x,y-6,b.end-b.x,33);for(const room of this.level.rooms.filter(r=>r.buildingId===b.id&&r.floor===f))for(const [left,right] of this.roomSlabs(room)){this.path(c,floorFace(room,left,right,y));c.fill();}}
  }
  for(const room of this.level.rooms)for(const x of [room.x,room.end]){const y=this.floorY(room.floor),top=y-this.level.floorHeight+8,door=w.doors.find(d=>d.x===x&&d.floor===room.floor),hole=w.openings.find(o=>o.x===x&&o.floor===room.floor&&o.plane==='divider'),end=door?y-151:hole&&hole.state==='open'?y-hole.height:y+3;this.path(c,[{x,y:top},backPoint(room,x,top,y),backPoint(room,x,end,y),{x,y:end}]);c.fill();}
  // Solid vertical partitions and door lintels; the actual open doorway stays unmasked.
  for(const s of w.sight.segments)if(s.a.x===s.b.x)c.fillRect(s.a.x-8,Math.min(s.a.y,s.b.y),16,Math.abs(s.b.y-s.a.y));
  for(const d of w.doors){const y=this.floorY(d.floor);c.fillRect(d.x-11,y-152,22,6);c.fillRect(d.x-10,y-149,3,149);c.fillRect(d.x+7,y-149,3,149);}
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-in';c.drawImage(this.sceneCopy,0,0);c.globalCompositeOperation='source-over';
  this.c.save();this.c.setTransform(1,0,0,1,0,0);this.c.drawImage(this.structure,0,0);this.c.restore();this.transform(this.c);this.cutaway(this.c,w);
 }
 flashlightHaze(c:CanvasRenderingContext2D,w:BaseWorld){
  const origin=w.lightOrigin,angle=w.aim;c.save();this.path(c,visibilityPolygon(origin,angle,BEAM_HALF,BEAM_RANGE,w.sight.segments));c.clip();c.globalCompositeOperation='screen';const end={x:origin.x+Math.cos(angle)*BEAM_RANGE,y:origin.y+Math.sin(angle)*BEAM_RANGE};const g=c.createLinearGradient(origin.x,origin.y,end.x,end.y);g.addColorStop(0,'#f3e2ac18');g.addColorStop(.5,'#e6d39c0c');g.addColorStop(1,'#e6d39c00');c.fillStyle=g;c.fillRect(origin.x-500,origin.y-500,1000,1000);c.restore();
 }
 flashlight(c:CanvasRenderingContext2D,w:BaseWorld){
  c.save();c.translate(w.lightOrigin.x,w.lightOrigin.y);c.rotate(w.aim);c.fillStyle='#323735';c.fillRect(-6,-3,14,6);c.fillStyle='#e8d9b8';c.fillRect(7,-3,2,6);c.restore();
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
