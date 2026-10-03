import {City,BLUEPRINTS,type Kind,type Tool} from './world.ts';
type Point=[number,number];
const colors={grass:['#aac58a','#aec990','#a3c086','#b1c991'],meadow:['#bdcc8a','#c5d293','#bac987','#c0cf8c'],forest:['#8fac76','#98b67d','#a1bb80','#94b17a']};
export class Renderer {
 canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;city:City;width=0;height=0;scale=1;zoom=1;panX=0;panY=0;originX=0;originY=0;hover=-1;selected=-1;tool:Tool='inspect';time=0;grid=false;reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(canvas:HTMLCanvasElement,city:City){this.canvas=canvas;this.city=city;this.ctx=canvas.getContext('2d')!;this.resize();}
 resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.layout();}
 layout(){const mobile=this.width<1000;this.scale=Math.max(.38,Math.min((this.width-(mobile?16:170))/(this.city.size*(mobile?34:48)),(this.height-(mobile?300:260))/(this.city.size*24),1.8))*this.zoom;this.originX=this.width/2+this.panX;this.originY=(mobile?this.height*.45:this.height*.47)-this.city.size*12*this.scale+this.panY;}
 reset(){this.zoom=1;this.panX=this.panY=0;this.layout();}
 zoomBy(f:number){this.zoom=Math.max(.65,Math.min(2.6,this.zoom*f));this.layout();}
 project(x:number,y:number):Point{return[this.originX+(x-y)*24*this.scale,this.originY+(x+y)*12*this.scale];}
 pick(px:number,py:number){const x=(px-this.originX)/this.scale/24,y=(py-this.originY)/this.scale/12;return this.city.index(Math.floor((y+x)/2+.5),Math.floor((y-x)/2+.5));}
 polygon(p:Point[],color:string,stroke?:string){const c=this.ctx;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.65;c.stroke();}}
 diamond(x:number,y:number,w:number,h:number,color:string,stroke?:string){this.polygon([[x,y-h],[x+w,y],[x,y+h],[x-w,y]],color,stroke);}
 line(p:Point[],color:string,width=1){const c=this.ctx;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
 ellipse(x:number,y:number,rx:number,ry:number,color:string){const c=this.ctx;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
 box(x:number,y:number,w:number,d:number,h:number,top:string,left:string,right:string){
  const p=(a:number,b:number,z=0):Point=>[x+(a-b)*24,y+(a+b)*12-z];
  const a=p(-w/2,-d/2,h),b=p(w/2,-d/2,h),cc=p(w/2,d/2,h),dd=p(-w/2,d/2,h);
  this.polygon([dd,cc,p(w/2,d/2),p(-w/2,d/2)],left);this.polygon([b,cc,p(w/2,d/2),p(w/2,-d/2)],right);this.polygon([a,b,cc,dd],top);return p;
 }
 roof(x:number,y:number,w:number,d:number,h:number,peak:number,color:string){const p=(a:number,b:number,z:number):Point=>[x+(a-b)*24,y+(a+b)*12-z];this.polygon([p(-w/2,d/2,h),p(w/2,d/2,h),p(0,d/2,h+peak)],'#f5d9b0');this.polygon([p(-w/2,-d/2,h),p(-w/2,d/2,h),p(0,d/2,h+peak),p(0,-d/2,h+peak)],color);this.polygon([p(0,-d/2,h+peak),p(0,d/2,h+peak),p(w/2,d/2,h),p(w/2,-d/2,h)],'#b46751');}
 tree(x:number,y:number,seed:number,small=false){const k=small?.7:1;this.ellipse(x+3,y+1,10*k,4*k,'#41685430');this.line([[x,y],[x,y-17*k]],'#776a4c',3*k);this.ellipse(x,y-20*k,10*k,13*k,['#547d62','#648e6a','#7b9c6d'][seed%3]);this.ellipse(x-3*k,y-24*k,6*k,8*k,'#a2b58255');}
 building(kind:Kind,x:number,y:number,seed:number){const c=this.ctx;
  this.ellipse(x+7,y+5,21,8,'#2e4c4430');
  if(kind==='road'){return;}
  if(kind==='park'){this.diamond(x,y,20,10,'#7ca577');this.line([[x-12,y+3],[x+10,y-4]],'#d7ceaa',4);this.tree(x-8,y-2,seed,true);this.tree(x+9,y+1,seed+1,true);this.box(x+3,y+6,.25,.12,3,'#c89765','#a8754f','#976341');this.ellipse(x-12,y+6,2,1,'#e7bc7a');return;}
  if(kind==='farm'){
   this.diamond(x,y,21,10.5,'#897658');for(let n=-2;n<=2;n++){this.line([[x-15+n*3,y-1+n*1.5],[x+5+n*3,y+9+n*1.5]],'#cdb669',2.4);for(let j=0;j<4;j++)this.line([[x-12+n*3+j*5,y+n*1.5+j*2.5],[x-12+n*3+j*5,y-4+n*1.5+j*2.5]],'#dace80',1);}
   this.box(x,y-6,.34,.34,10,'#e6d5a7','#e4c88f','#c5a16d');this.roof(x,y-6,.42,.42,10,6,'#b46e56');return;
  }
  if(kind==='lumber'){
   this.box(x-3,y,.58,.54,17,'#b99d74','#a38662','#816a51');this.roof(x-3,y,.68,.63,17,7,'#7a9081');for(let j=0;j<3;j++){this.box(x+10,y+7-j*3,.38,.12,3,'#d4b885','#ae8b61','#937348');this.ellipse(x+12,y+8-j*3,2,2,'#e3c898');}return;
  }
  if(kind==='windmill'){
   this.box(x,y,.43,.43,42,'#f1e2c3','#e0d1ae','#c5b89a');this.roof(x,y,.55,.55,42,8,'#648a85');const angle=this.reduced?.5:this.time*.45;c.save();c.translate(x+7,y-36);c.rotate(angle);for(let i=0;i<4;i++){c.rotate(Math.PI/2);this.line([[0,0],[0,27]],'#776d56',1.5);this.polygon([[1,8],[7,10],[7,26],[1,25]],'#f9edce','#bbae8c');}this.ellipse(0,0,3,3,'#756f58');c.restore();return;
  }
  if(kind==='lighthouse'){
   this.box(x,y,.65,.65,8,'#d7cbb0','#c6b593','#b9a685');this.box(x,y-6,.38,.38,53,'#eee9d4','#f6e8c8','#cfccb8');this.box(x,y-26,.4,.4,9,'#bd6856','#d8866a','#b36555');this.box(x,y-58,.53,.53,3,'#e3d5ac','#9a8c6d','#897e65');this.box(x,y-61,.3,.3,12,'#eadb97','#ffdf83','#deb861');this.roof(x,y-61,.48,.48,12,6,'#527b79');if(this.city.won){c.save();c.globalAlpha=.14;c.fillStyle='#fff4b4';c.beginPath();c.moveTo(x,y-70);c.arc(x,y-70,200,this.time*.35,this.time*.35+.28);c.closePath();c.fill();c.restore();}return;
  }
  if(kind==='market'){
   this.box(x,y,.7,.65,16,'#e8d1a4','#f0ddad','#cbb989');for(let i=0;i<5;i++)this.polygon([[x-20+i*7,y-18+i*3.5],[x-13+i*7,y-14.5+i*3.5],[x-6+i*7,y-20+i*3.5],[x-13+i*7,y-23.5+i*3.5]],i%2?'#f9e6b9':'#d97966');this.box(x,y+8,.6,.13,5,'#c39667','#ae8057','#926b4c');for(let i=0;i<4;i++)this.ellipse(x-9+i*5,y+3+i*1.3,2.3,1.8,i%2?'#d4ab50':'#cb7660');return;
  }
  const hall=kind==='hall',apartment=kind==='apartment',clinic=kind==='clinic';const w=hall?.85:apartment?.73:.64,d=hall?.8:.64,h=hall?30:apartment?43:clinic?24:21;
  const top=hall?'#eddbb1':clinic?'#d7e6d7':apartment?'#e5be83':'#f3ddbb';
  this.box(x,y,w,d,h,top,top,clinic?'#a7c8bb':apartment?'#c59f71':'#d0b68f');
  if(clinic){this.box(x,y-h,.72,.72,4,'#6c9994','#5b817e','#4c7473');this.line([[x-8,y-h+9],[x-8,y-h+17]],'#bd6e5d',2.5);this.line([[x-12,y-h+13],[x-4,y-h+13]],'#bd6e5d',2.5);}
  else this.roof(x,y,w+.1,d+.1,h,hall?12:10,apartment?'#658783':seed%3===0?'#6c9290':'#d38669');
  for(let floor=0;floor<(apartment?3:hall?2:1);floor++)for(let j=0;j<2;j++){
   const yy=y-9-floor*10;this.polygon([[x-14+j*8,yy-4+j*4],[x-10+j*8,yy-2+j*4],[x-10+j*8,yy+3+j*4],[x-14+j*8,yy+1+j*4]],'#537576');this.polygon([[x+5+j*7,yy+3-j*3.5],[x+9+j*7,yy+1-j*3.5],[x+9+j*7,yy+6-j*3.5],[x+5+j*7,yy+8-j*3.5]],'#5d8081');
  }
  this.polygon([[x-2,y+5],[x+3,y+7.5],[x+3,y-2],[x-2,y-4.5]],'#98775b');
  if(hall){this.box(x,y-h-6,.23,.23,12,'#e8d9b5','#eee0bf','#cbb98c');this.ellipse(x,y-h-12,3,3,'#fff1ce');this.line([[x,y-h-25],[x,y-h-40]],'#796e59',1);this.polygon([[x,y-h-40],[x+12,y-h-37],[x,y-h-33]],'#db846c');}
  if(!hall&&!apartment&&!clinic){this.box(x+5,y-h-5,.13,.13,9,'#e1c8a5','#be9d7e','#9b8169');this.ellipse(x-13,y+8,3,2,'#77956b');}
 }
 draw(time:number){this.time=this.reduced?0:time;const c=this.ctx,w=this.width,h=this.height;const grad=c.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#76b0b2');grad.addColorStop(.6,'#55959d');grad.addColorStop(1,'#3b7d89');c.fillStyle=grad;c.fillRect(0,0,w,h);
  c.save();c.globalAlpha=.14;for(let i=0;i<65;i++){const x=(i*173.3+time*(this.reduced?0:3))%(w+100)-50,y=(i*89.7)%(h+30);this.line([[x,y],[x+15,y],[x+19,y-2]],'#e9f2d7',1);}c.restore();
  c.save();c.translate(this.originX,this.originY);c.scale(this.scale,this.scale);
  const stats=this.city.stats();
  // A sand shelf and shallow turquoise water make the coast readable at every zoom.
  for(const t of this.city.tiles){if(t.terrain==='water')continue;const x=(t.x-t.y)*24,y=(t.x+t.y)*12;this.diamond(x,y+7,27,14,'#99b9a080');this.diamond(x,y+5,24,12,'#d6c899');}
  for(const t of this.city.tiles){const i=t.y*this.city.size+t.x;if(t.terrain==='water')continue;const x=(t.x-t.y)*24,y=(t.x+t.y)*12,seed=(t.x*7+t.y*13)%4;
   this.diamond(x,y,24,12,colors[t.terrain][seed],this.grid?'#6f906751':'#a3bc8025');
   if(t.building==='road'){
    this.diamond(x,y,17,8.5,'#d9ceb0');for(const j of this.city.neighbors(i)){const p=this.city.tiles[j];if(p.building==='road'||p.building==='hall'){const dx=(p.x-t.x-(p.y-t.y))*24,dy=(p.x-t.x+p.y-t.y)*12;this.line([[x,y],[x+dx/2,y+dy/2]],'#d9ceb0',11);}}
    this.ellipse(x+3,y+1,1,.5,'#b4a98a');
   }else if(!t.building&&seed===0&&t.terrain!=='forest'){for(let j=0;j<3;j++)this.line([[x-9+j*7,y+j%2*4],[x-8+j*7,y-2+j%2*4]],'#779b6880',1);}
  }
  for(let sum=0;sum<this.city.size*2;sum++)for(const t of this.city.tiles){if(t.x+t.y!==sum||t.terrain==='water')continue;const x=(t.x-t.y)*24,y=(t.x+t.y)*12,i=t.y*this.city.size+t.x;
   if(t.building&&t.building!=='road')this.building(t.building,x,y,t.x+t.y*5);
   else if(!t.building&&t.terrain==='forest'){this.tree(x-7,y-2,t.x+t.y);this.tree(x+7,y+4,t.x+t.y+1,true);}
   if(t.building&&!stats.connected.has(i)){this.ellipse(x,y-33,6,6,'#df9a66');c.fillStyle='#fff7dc';c.font='bold 9px sans-serif';c.textAlign='center';c.fillText('!',x,y-30);}
  }
  const i=this.hover>=0?this.hover:this.selected,t=this.city.tiles[i];if(t){const x=(t.x-t.y)*24,y=(t.x+t.y)*12,valid=!this.city.reason(this.tool,i);c.save();c.globalAlpha=.38;this.diamond(x,y,24,12,this.tool==='inspect'?'#fff8d7':valid?'#f8f0bc':'#e77f70');c.restore();this.line([[x,y-12],[x+24,y],[x,y+12],[x-24,y],[x,y-12]],valid?'#fff2be':'#d76457',1.8);if(this.tool!=='inspect'&&this.tool!=='bulldoze'&&this.tool!=='road'&&valid){c.save();c.globalAlpha=.65;this.building(this.tool,x,y,0);c.restore();}}
  // Small boats and seagulls belong to the world, rather than an external asset pack.
  for(const [bx,by,offset] of [[15.8,9,0],[7,16,2]] as [number,number,number][]){const x=(bx-by)*24+Math.sin(this.time*.25+offset)*9,y=(bx+by)*12+Math.sin(this.time+offset)*1.3;this.ellipse(x+4,y+4,16,4,'#d8e5d350');this.polygon([[x-12,y],[x+11,y],[x+6,y+5],[x-6,y+5]],'#ede0bd');this.line([[x,y],[x,y-24]],'#6a7769',1);this.polygon([[x-1,y-22],[x-1,y-2],[x-12,y-2]],'#f4e9cd');}
  if(!this.reduced)for(let b=0;b<4;b++){const x=Math.sin(this.time*.12+b*2)*190,y=90+b*38+Math.cos(this.time*.15+b)*22,flap=Math.sin(this.time*4+b)*2;this.line([[x-5,y+flap],[x,y],[x+5,y+flap]],'#f0f0d6',1.3);}
  c.restore();
 }
}
