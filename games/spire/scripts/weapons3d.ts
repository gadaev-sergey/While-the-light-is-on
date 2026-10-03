import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {BLASTER,SHOTGUN,AUTO,RIFLE,ROCKET,WEAPON_IDS,type WeaponId} from './rules.ts';

/**
 * Процедурные модели оружия. Система координат модели: начало — рукоять под правой рукой,
 * ствол смотрит в −Z, верх — +Y, размеры в метрах. Именованные части:
 * muzzle — срез ствола, sight — точка глаза при прицеливании, fore — место левой руки,
 * mag — магазин, bolt — затвор, pump — цевьё помпы, heat — светящиеся части бластера.
 */
type Mats={metal:T.MeshStandardMaterial;steel:T.MeshStandardMaterial;polymer:T.MeshStandardMaterial;rubber:T.MeshStandardMaterial;
 tan:T.MeshStandardMaterial;olive:T.MeshStandardMaterial;ceramic:T.MeshStandardMaterial;brass:T.MeshStandardMaterial;glass:T.MeshStandardMaterial;
 red:T.MeshStandardMaterial;dark:T.MeshBasicMaterial;cyan:T.MeshStandardMaterial;orange:T.MeshBasicMaterial;dot:T.MeshBasicMaterial;hazard:T.MeshStandardMaterial;shell:T.MeshStandardMaterial;lens:T.MeshStandardMaterial};
/** Профиль сбоку: [вперёд, вверх] в метрах. */
type Profile=[number,number][];

export class WeaponKit{
 private templates:T.Group[]=[];private disposables:{dispose():void}[]=[];private m:Mats;readonly env:T.Texture;
 constructor(renderer:T.WebGLRenderer){
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
  this.env=pmrem.fromScene(room,.04).texture;pmrem.dispose();room.dispose();this.disposables.push(this.env);
  const std=(color:number,metalness:number,roughness:number,extra:T.MeshStandardMaterialParameters={})=>
   this.track(new T.MeshStandardMaterial({color,metalness,roughness,envMap:this.env,envMapIntensity:.9,...extra}));
  const c=document.createElement('canvas');c.width=64;c.height=8;const g=c.getContext('2d')!;g.fillStyle='#f2c01e';g.fillRect(0,0,64,8);
  g.fillStyle='#14161a';for(let x=-8;x<72;x+=12){g.beginPath();g.moveTo(x,8);g.lineTo(x+6,0);g.lineTo(x+12,0);g.lineTo(x+6,8);g.fill();}
  const hazard=this.track(new T.CanvasTexture(c));hazard.colorSpace=T.SRGBColorSpace;hazard.wrapS=T.RepeatWrapping;hazard.repeat.set(4,1);
  this.m={
   metal:std(0x2c3038,.85,.36),steel:std(0x9ba2ac,.95,.22),polymer:std(0x1e2127,.05,.72),rubber:std(0x121315,0,.95),
   tan:std(0x7a6a50,.05,.7),olive:std(0x434d38,.08,.68),ceramic:std(0x8f959e,.15,.45),brass:std(0xc9a24a,1,.3),
   glass:std(0x0d2a40,1,.05,{emissive:0x1a4c80,emissiveIntensity:.6}),red:std(0xc4241c,.3,.45),
   dark:this.track(new T.MeshBasicMaterial({color:0x050506})),cyan:std(0x0a3040,.2,.3,{emissive:0x3fd0ff,emissiveIntensity:1.6}),
   orange:this.track(new T.MeshBasicMaterial({color:0xff9a3d})),dot:this.track(new T.MeshBasicMaterial({color:0xff2a2a})),
   hazard:std(0xffffff,.2,.6,{map:hazard}),shell:std(0xb3261e,.1,.55),
   lens:std(0x6fd0ff,1,.05,{transparent:true,opacity:.18,depthWrite:false,side:T.DoubleSide}),
  };
  for(const w of WEAPON_IDS)this.templates[w]=this.build(w);
 }
 /** Копия модели: геометрия и материалы общие, части можно двигать независимо. */
 model(w:WeaponId){return this.templates[w].clone();}
 dispose(){for(const d of this.disposables)d.dispose();}

 private track<X extends {dispose():void}>(x:X){this.disposables.push(x);return x;}
 private add(parent:T.Object3D,geo:T.BufferGeometry,mat:T.Material,x=0,y=0,z=0){const m=new T.Mesh(this.track(geo),mat);m.position.set(x,y,z);parent.add(m);return m;}
 /** Скруглённый блок: w — ширина (X), h — высота, d — длина вдоль ствола. */
 private box(parent:T.Object3D,w:number,h:number,d:number,mat:T.Material,x=0,y=0,z=0,r=.006){
  return this.add(parent,new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2-1e-4,h/2-1e-4,d/2-1e-4)),mat,x,y,z);
 }
 /** Цилиндр вдоль ствола (оси Z): r0 — радиус спереди, r1 — сзади. */
 private tube(parent:T.Object3D,r0:number,r1:number,len:number,mat:T.Material,x=0,y=0,z=0,seg=20){
  const m=this.add(parent,new T.CylinderGeometry(r0,r1,len,seg),mat,x,y,z);m.rotation.x=-Math.PI/2;return m;
 }
 /** Силуэт сбоку, вытянутый по ширине: так делаются рукояти, приклады и магазины. */
 private profile(parent:T.Object3D,points:Profile,width:number,mat:T.Material,x=0,y=0,z=0,bevel=.004){
  const shape=new T.Shape(points.map(([u,v])=>new T.Vector2(u,v)));
  const geo=new T.ExtrudeGeometry(shape,{depth:width-bevel*2,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:8});
  geo.translate(0,0,-(width-bevel*2)/2);geo.rotateY(Math.PI/2);
  return this.add(parent,geo,mat,x,y,z);
 }
 /** Повторяющиеся детали (рельсы, рёбра) — одной геометрией. */
 private repeat(parent:T.Object3D,make:(i:number)=>T.BufferGeometry,count:number,mat:T.Material){
  const parts=Array.from({length:count},(_,i)=>make(i)),geo=mergeGeometries(parts);for(const p of parts)p.dispose();return this.add(parent,geo,mat);
 }
 private anchor(parent:T.Object3D,name:string,x:number,y:number,z:number){const o=new T.Object3D();o.name=name;o.position.set(x,y,z);parent.add(o);return o;}
 private part(parent:T.Object3D,name:string,x=0,y=0,z=0){const g=new T.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;}
 private grip(parent:T.Object3D,mat:T.Material,z=0){
  this.profile(parent,[[.018,0],[-.03,0],[-.062,-.115],[-.018,-.125],[.012,-.03]],.034,mat,0,0,z);
  this.box(parent,.012,.012,.065,this.m.metal,0,-.035,z-.035,.004);this.box(parent,.006,.022,.008,this.m.steel,0,-.022,z-.022,.002);
 }

 private build(w:WeaponId):T.Group{
  const g=new T.Group(),m=this.m;
  if(w===BLASTER){
   // Компактный бластер: керамический корпус, эмиттер с катушками, светящаяся батарея.
   this.grip(g,m.polymer);
   // Обтекаемый корпус: скос к носу, тёмный хребет сверху, прорези охлаждения по бокам.
   this.profile(g,[[-.1,0],[-.1,.06],[-.075,.076],[.13,.076],[.205,.052],[.205,.014],[.15,0]],.056,m.ceramic,0,0,0,.008);
   this.profile(g,[[-.085,.074],[.14,.074],[.115,.096],[-.06,.096]],.04,m.metal,0,0,0,.005);
   this.repeat(g,i=>{const b=new T.BoxGeometry(.06,.006,.03);b.translate(0,.024+i*.012,.02);return b;},3,m.dark);
   this.box(g,.03,.014,.12,m.metal,0,-.004,-.11,.004);
   this.box(g,.058,.05,.03,m.metal,0,.032,.09,.01);
   this.tube(g,.017,.017,.15,m.steel,0,.036,-.26);
   const heat=this.part(g,'heat');
   for(const z of [-.21,-.25,-.29]){const ring=this.add(heat,new T.TorusGeometry(.025,.006,8,20),m.cyan,0,.036,z);ring.rotation.y=0;}
   this.box(heat,.006,.026,.11,m.cyan,.029,.04,-.05,.002);this.box(heat,.006,.026,.11,m.cyan,-.029,.04,-.05,.002);
   this.tube(g,.024,.022,.03,m.metal,0,.036,-.335);this.tube(g,.012,.012,.004,m.dark,0,.036,-.351);
   this.box(g,.008,.014,.012,m.metal,0,.103,-.18,.002);this.box(g,.03,.012,.012,m.metal,0,.101,.0,.002);
   this.anchor(g,'muzzle',0,.036,-.36);this.anchor(g,'sight',0,.106,.05);this.anchor(g,'fore',0,-.01,-.15);
  }
  if(w===SHOTGUN){
   // Помповый дробовик: ствол над трубчатым магазином, рифлёное цевьё, патронташ на боку.
   this.grip(g,m.polymer);
   this.profile(g,[[-.03,.07],[-.33,.045],[-.35,-.1],[-.3,-.112],[-.12,-.02],[-.05,-.03],[-.03,0]],.044,m.polymer);
   this.box(g,.05,.15,.022,m.rubber,0,-.03,.345,.006);
   this.box(g,.062,.088,.25,m.metal,0,.032,-.12,.01);
   this.box(g,.063,.007,.2,m.orange,0,.06,-.12,.002);
   this.box(g,.003,.03,.08,m.dark,.032,.045,-.13,.001);
   this.tube(g,.016,.016,.56,m.steel,0,.06,-.52);this.tube(g,.015,.015,.46,m.metal,0,.022,-.47);this.tube(g,.017,.017,.02,m.metal,0,.022,-.7);
   const pump=this.part(g,'pump',0,.022,-.43);
   this.tube(pump,.027,.027,.17,m.polymer);
   this.repeat(pump,i=>{const c=new T.CylinderGeometry(.029,.029,.008,20);c.rotateX(Math.PI/2);c.translate(0,0,-.065+i*.026);return c;},6,m.polymer);
   this.box(g,.004,.05,.1,m.polymer,-.033,.035,-.12,.002);
   for(let i=0;i<4;i++){const z=-.155+i*.022;const s=this.add(g,new T.CylinderGeometry(.0085,.0085,.042,10),m.shell,-.041,.04,z);s.rotation.z=0;
    this.add(g,new T.CylinderGeometry(.009,.009,.009,10),m.brass,-.041,.012,z);}
   this.add(g,new T.SphereGeometry(.004,8,6),m.orange,0,.081,-.79);
   const ring=this.add(g,new T.TorusGeometry(.009,.002,6,14),m.metal,0,.093,-.02);ring.rotation.y=0;
   this.anchor(g,'muzzle',0,.06,-.8);this.anchor(g,'sight',0,.093,.08);this.anchor(g,'fore',0,.0,-.43);
  }
  if(w===AUTO){
   // Автомат: верхний ствольный короб с планкой, восьмигранное цевьё, изогнутый магазин, коллиматор.
   this.grip(g,m.polymer);
   this.box(g,.056,.062,.31,m.metal,0,.05,-.1,.008);
   this.box(g,.05,.052,.19,m.tan,0,.0,-.03,.008);
   this.box(g,.03,.012,.36,m.metal,0,.087,-.12,.002);
   this.repeat(g,i=>{const b=new T.BoxGeometry(.034,.006,.007);b.translate(0,.096,.04-i*.028);return b;},13,m.metal);
   const guard=this.add(g,new T.CylinderGeometry(.031,.031,.3,8),m.tan,0,.05,-.4);guard.rotation.x=-Math.PI/2;guard.rotation.y=Math.PI/8;
   this.repeat(g,i=>{const b=new T.BoxGeometry(.065,.008,.035);b.translate(0,.05,-.3-i*.055);return b;},4,m.dark);
   this.tube(g,.011,.011,.16,m.steel,0,.05,-.62);this.box(g,.03,.032,.026,m.metal,0,.05,-.56,.004);
   this.profile(g,[[.008,0],[-.008,0],[-.004,.05],[.004,.05]],.012,m.metal,0,.06,-.56,.002);
   this.tube(g,.016,.016,.065,m.metal,0,.05,-.72);
   this.repeat(g,i=>{const b=new T.BoxGeometry(.034,.005,.012);b.translate(0,.05,-.705-i*.018);return b;},3,m.dark);
   const mag=this.part(g,'mag',0,-.005,-.1);
   this.profile(mag,[[.03,0],[-.03,0],[-.012,-.09],[.03,-.17],[.085,-.158],[.068,-.075]],.028,m.polymer);
   this.box(mag,.03,.01,.07,m.metal,0,-.005,0,.003);
   this.tube(g,.013,.013,.16,m.metal,0,.045,.14);
   this.profile(g,[[0,.035],[-.17,.035],[-.195,-.095],[-.16,-.105],[-.03,-.015],[0,-.015]],.04,m.tan,0,.03,.1);
   this.box(g,.042,.12,.018,m.rubber,0,-.005,.29,.005);
   this.box(g,.014,.012,.04,m.metal,.03,.07,-.02,.003);
   // Открытый коллиматор: рамка вокруг окна, тонированное стекло и красная точка в центре.
   this.box(g,.04,.012,.05,m.metal,0,.099,-.06,.003);
   for(const x of [-.019,.019])this.box(g,.005,.036,.05,m.polymer,x,.122,-.06,.002);
   this.box(g,.043,.005,.05,m.polymer,0,.142,-.06,.002);
   this.add(g,new T.PlaneGeometry(.034,.032),m.lens,0,.122,-.08);
   this.add(g,new T.SphereGeometry(.0018,8,6),m.dot,0,.122,-.079);
   this.anchor(g,'muzzle',0,.05,-.76);this.anchor(g,'sight',0,.122,.17);this.anchor(g,'fore',0,.012,-.38);
  }
  if(w===RIFLE){
   // Снайперская винтовка: ложе с рукоятью, рифлёный ствол, затвор с рукояткой, оптика ×4, сложенные сошки.
   this.profile(g,[[.38,.035],[.38,-.005],[.07,-.03],[.035,-.02],[.0,-.125],[-.05,-.128],[-.045,-.03],[-.12,-.045],[-.42,-.08],[-.435,.02],[-.38,.05],[-.12,.045],[-.04,.03],[.06,.035]],.05,m.olive);
   this.box(g,.04,.03,.16,m.olive,0,.06,.24,.01);
   this.box(g,.054,.15,.022,m.rubber,0,-.015,.44,.006);
   this.tube(g,.022,.022,.25,m.metal,0,.048,-.05);
   const barrel=this.add(g,new T.CylinderGeometry(.014,.016,.6,6),m.metal,0,.048,-.47);barrel.rotation.x=-Math.PI/2;
   this.tube(g,.019,.019,.075,m.metal,0,.048,-.8);
   this.repeat(g,i=>{const b=new T.BoxGeometry(.042,.006,.014);b.translate(0,.048,-.78-i*.022);return b;},3,m.dark);
   const bolt=this.part(g,'bolt',0,.048,.05);
   this.tube(bolt,.012,.012,.07,m.steel);
   const handle=this.add(bolt,new T.CylinderGeometry(.005,.005,.06,8),m.steel,.03,-.012,.02);handle.rotation.z=Math.PI/2.6;
   this.add(bolt,new T.SphereGeometry(.011,12,8),m.steel,.056,-.026,.02);
   const magazine=this.part(g,'mag',0,-.02,-.07);this.box(magazine,.032,.055,.075,m.metal,0,-.01,0,.004);
   this.box(g,.012,.012,.07,m.metal,0,-.04,.0,.004);
   // Оптика.
   this.tube(g,.019,.019,.3,m.polymer,0,.118,-.07,24);
   this.tube(g,.033,.021,.07,m.polymer,0,.118,-.25,24);this.tube(g,.029,.029,.004,m.glass,0,.118,-.286,24);
   this.tube(g,.024,.028,.06,m.polymer,0,.118,.1,24);this.tube(g,.022,.022,.003,m.glass,0,.118,.131,24);
   const top=this.add(g,new T.CylinderGeometry(.012,.012,.03,16),m.metal,0,.148,-.07);top.rotation.x=0;
   const side=this.add(g,new T.CylinderGeometry(.012,.012,.03,16),m.metal,.033,.118,-.07);side.rotation.z=Math.PI/2;
   for(const z of [-.16,.02]){this.box(g,.03,.05,.02,m.metal,0,.085,z,.004);const r=this.add(g,new T.TorusGeometry(.021,.005,6,18),m.metal,0,.118,z);r.rotation.y=0;}
   for(const x of [-.012,.012])this.tube(g,.005,.005,.18,m.metal,x,.0,-.3);
   this.box(g,.03,.02,.02,m.metal,0,.005,-.2,.004);
   this.anchor(g,'muzzle',0,.048,-.84);this.anchor(g,'sight',0,.118,.2);this.anchor(g,'fore',0,-.01,-.26);
  }
  if(w===ROCKET){
   // Ракетница: оливковая труба с кольцами, предупреждающая полоса, раструбы, видна головка ракеты.
   this.grip(g,m.polymer);
   this.tube(g,.065,.065,.92,m.olive,0,.075,-.25,28);
   for(const z of [-.55,-.25,.1])this.tube(g,.071,.071,.03,m.metal,0,.075,z,28);
   this.tube(g,.067,.067,.05,m.hazard,0,.075,-.63,28);
   this.tube(g,.086,.072,.09,m.metal,0,.075,-.75,28);this.tube(g,.062,.062,.012,m.dark,0,.075,-.79,28);
   const tip=this.add(g,new T.ConeGeometry(.038,.09,18),m.red,0,.075,-.76);tip.rotation.x=-Math.PI/2;
   this.tube(g,.072,.092,.09,m.metal,0,.075,.25,28);this.tube(g,.066,.066,.01,m.dark,0,.075,.29,28);
   this.box(g,.034,.11,.04,m.polymer,0,-.02,-.32,.008);
   this.box(g,.034,.055,.09,m.polymer,-.085,.11,-.12,.006);this.add(g,new T.SphereGeometry(.007,8,6),m.dot,-.085,.12,-.166);
   this.box(g,.008,.006,.42,m.dot,0,.141,-.25,.002);
   this.box(g,.03,.05,.12,m.metal,0,.025,-.05,.006);
   this.anchor(g,'muzzle',0,.075,-.8);this.anchor(g,'sight',-.085,.14,.1);this.anchor(g,'fore',0,-.06,-.32);
  }
  for(const o of g.children)if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}
  return g;
 }
}
