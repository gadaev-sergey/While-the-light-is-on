import * as T from 'three';
import {SceneRenderer} from '@shelter/renderer.ts';
import type {BaseAssets} from './assets.ts';
import {BaseHero} from './hero.ts';
import type {GameRenderer} from './renderer-contract.ts';
import type {BaseWorld} from './world.ts';
import {LOCATION,clamp,lerp} from './config.ts';
import {levelFloorY,stairApertures,type CompiledLevel,type Opening} from './level.ts';
import {daylightStyle} from './lighting.ts';
import {visibilityPolygon} from './visibility.ts';
import type {Vec,Floor,Room} from './types.ts';
import {DIMENSIONS,metres,layoutUnits,furnitureSize,spriteCalibration} from './dimensions.ts';
import {volumeUniforms,volumeShader} from './volumetric-light.ts';
import {ShelterModels,BACK,FRONT,ACTOR_Z,wx} from './three-models.ts';
import {DEFAULT_CAMERA,resolveCamera,type CameraSettings} from '@shelter/scene.ts';

const cutMaterial=new T.MeshBasicMaterial({color:0x000000,fog:false,toneMapped:false});
const v3=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const actorCanvas=()=>{const c=document.createElement('canvas');c.width=400;c.height=360;return c;};

/** A real depth-tested scene. Simulation remains on its existing side-view plane. */
export class ThreeRenderer extends SceneRenderer implements GameRenderer {
 readonly mode='3d';
 editorMode=false;externalCamera=false;
 heroScale:ReturnType<typeof spriteCalibration>;actorZ:number=ACTOR_Z;
 hero:BaseHero;models:ShelterModels;
 scene=new T.Scene();cutScene=new T.Scene();camera:T.OrthographicCamera|T.PerspectiveCamera=new T.OrthographicCamera(-8,8,5,-5,.1,100);
 level:CompiledLevel=LOCATION;structure=new T.Group();
 zoom=1;hover:string|null=null;width=1;height=1;angle=0;targetAngle=0;
 cameraSettings=resolveCamera();
 center=new T.Vector3(.1,1.65,0);elapsed=0;
 hemisphere=new T.HemisphereLight(0xc7d7e4,0x40382d,.8);
 fill=new T.AmbientLight(0xb8c3cb,.35);
 sun=new T.DirectionalLight(0xffedce,2.4);lamp=new T.SpotLight(0xffe4ac,24,6,.48,.65,1.3);
 poweredLights:T.PointLight[]=[];
 objects=new Map<string,T.Group>();doors=new Map<string,T.Group>();boards=new Map<string,T.Group>();
 markers=new Map<string,HTMLButtonElement>();markerLayer:HTMLDivElement;
 hits:{id:string;x:number;y:number}[]=[];
 heroCanvas=actorCanvas();heroTexture=new T.CanvasTexture(this.heroCanvas);heroMesh:T.Mesh;
 dogCanvas=actorCanvas();dogTexture=new T.CanvasTexture(this.dogCanvas);dogMesh:T.Mesh;
 backdrop:T.Mesh;backdropMaterial:T.MeshBasicMaterial;
 moon:T.Mesh;stars:T.Points;
 raycaster=new T.Raycaster();walkingPlane=new T.Plane(new T.Vector3(0,0,1),-ACTOR_Z);
 frameTarget:T.WebGLRenderTarget;postScene=new T.Scene();postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 sightCanvas=document.createElement('canvas');sightTexture:T.CanvasTexture;postMaterial:T.ShaderMaterial;
 maskTime=0;lastMask='';observer:ResizeObserver;drawCalls=0;triangles=0;

 constructor(public canvas:HTMLCanvasElement,public assets:BaseAssets,level:CompiledLevel=LOCATION){
  super(canvas);this.level=level;
  this.hero=new BaseHero(assets);
  const standing=this.hero.texture('idle:0');
  this.heroScale=spriteCalibration(standing.getContext('2d')!.getImageData(0,0,400,360).data,400,360,320);
  this.models=new ShelterModels(assets);
  this.scene.background=new T.Color(0x263842);this.scene.fog=new T.FogExp2(0x263842,.017);
  this.sun.position.set(-5,11,-5);this.sun.target.position.set(0,0,0);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-12,right:12,top:9,bottom:-9,near:.1,far:40});
  this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.012;
  this.lamp.castShadow=true;this.lamp.shadow.mapSize.set(1024,1024);this.lamp.shadow.bias=-.0005;this.lamp.shadow.normalBias=.012;
  // At the handle the lamp is only ~0.25 m from the door: the default 0.5 m
  // shadow near plane would discard the very obstacle that must stop its beam.
  this.lamp.shadow.camera.near=.025;this.lamp.shadow.camera.far=6;
  this.scene.add(this.hemisphere,this.fill,this.sun,this.sun.target,this.lamp,this.lamp.target,this.structure);
  this.heroTexture.colorSpace=this.dogTexture.colorSpace=T.SRGBColorSpace;
  const actorMaterial=(map:T.Texture)=>new T.MeshStandardMaterial({map,transparent:true,alphaTest:.075,side:T.DoubleSide,roughness:1,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.08});
  this.heroMesh=new T.Mesh(new T.PlaneGeometry(this.heroScale.width,this.heroScale.height),actorMaterial(this.heroTexture));this.heroMesh.name='developer-sprite';
  this.heroMesh.castShadow=true;this.heroMesh.receiveShadow=false;this.scene.add(this.heroMesh);
  this.dogMesh=new T.Mesh(new T.PlaneGeometry(1.44,.96),actorMaterial(this.dogTexture));this.dogMesh.castShadow=true;this.scene.add(this.dogMesh);
  const district=new T.Texture(assets.images.district);district.needsUpdate=true;district.colorSpace=T.SRGBColorSpace;
  this.backdropMaterial=new T.MeshBasicMaterial({map:district,color:0x8b9ba5,fog:true});
  this.backdrop=new T.Mesh(new T.PlaneGeometry(42,18.66),this.backdropMaterial);this.backdrop.position.set(0,1.4,-10);this.scene.add(this.backdrop);
  this.moon=new T.Mesh(new T.SphereGeometry(.25,20,16),new T.MeshBasicMaterial({color:0xcbdcf1}));this.moon.position.set(6.8,4.25,-8.8);this.scene.add(this.moon);
  const starPoints=[];for(let i=0;i<90;i++)starPoints.push(Math.sin(i*193.7)*13,4.3+((i*71)%100)/90,-9);
  this.stars=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(starPoints,3)),new T.PointsMaterial({color:0xccdef4,size:.025,transparent:true}));this.scene.add(this.stars);
  this.markerLayer=document.createElement('div');this.markerLayer.className='world-markers';canvas.parentElement!.append(this.markerLayer);
  this.frameTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:Math.min(4,this.gl.capabilities.maxSamples)});
  this.frameTarget.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  this.sightCanvas.width=640;this.sightCanvas.height=360;this.sightTexture=new T.CanvasTexture(this.sightCanvas);
  this.postMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{...volumeUniforms(),sceneMap:{value:this.frameTarget.texture},sightMap:{value:this.sightTexture},resolution:{value:new T.Vector2(1,1)}},
   vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
   fragmentShader:`uniform sampler2D sceneMap; uniform sampler2D sightMap; uniform vec2 resolution; varying vec2 vUv;
    ${volumeShader}
    void main(){
     float sight=texture2D(sightMap,vUv).r; vec2 d=vec2(2.6)/resolution;
     vec3 color=texture2D(sceneMap,vUv).rgb; vec3 blur=color*0.20;
     blur+=texture2D(sceneMap,vUv+d*vec2(1.,0.)).rgb*.12; blur+=texture2D(sceneMap,vUv-d*vec2(1.,0.)).rgb*.12;
     blur+=texture2D(sceneMap,vUv+d*vec2(0.,1.)).rgb*.12; blur+=texture2D(sceneMap,vUv-d*vec2(0.,1.)).rgb*.12;
     blur+=texture2D(sceneMap,vUv+d).rgb*.08; blur+=texture2D(sceneMap,vUv-d).rgb*.08;
     blur+=texture2D(sceneMap,vUv+d*vec2(-1.,1.)).rgb*.08; blur+=texture2D(sceneMap,vUv+d*vec2(1.,-1.)).rgb*.08;
     color=airLight(vUv,mix(blur,color,sight)); float vignette=1.-.26*smoothstep(.2,.75,length((vUv-.5)*vec2(1.,.85)));
     gl_FragColor=vec4(color*vignette,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`});
  this.postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.postMaterial));
  this.buildLevel();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  canvas.dataset.renderer='3d';
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();const message=document.createElement('div');message.className='base-toast';message.textContent='Графический контекст потерян. Перезагрузите страницу, чтобы продолжить.';canvas.parentElement!.append(message);});
 }
 floorY(floor:Floor){return levelFloorY(this.level,floor);}
 worldPosition(p:Vec,z:number=ACTOR_Z){return v3(wx(p.x),metres(this.level.groundY-p.y),z);}
 worldToScreen(p:Vec){return this.project(this.worldPosition(p));}
 project(p:T.Vector3){const q=p.clone().project(this.camera);return {x:(q.x+1)*this.width/2,y:(1-q.y)*this.height/2};}
 screenToWorld(p:Vec){
  this.raycaster.setFromCamera(new T.Vector2(p.x/this.width*2-1,1-p.y/this.height*2),this.camera);
  const hit=this.raycaster.ray.intersectPlane(this.walkingPlane,new T.Vector3());
  return hit?{x:layoutUnits(hit.x)+1000,y:this.level.groundY-layoutUnits(hit.y)}:{x:1000,y:this.level.groundY};
 }
 // Player input never changes the authored game framing.
 zoomBy(_delta:number){}
 rotateView(_direction:number){}
 resetView(){this.targetAngle=this.angle=0;this.zoom=1;}
 configureCamera(settings:CameraSettings=DEFAULT_CAMERA){
  this.cameraSettings=resolveCamera(settings);
  const perspective=settings.projection==='perspective',previous=this.camera;
  if(perspective!==(previous instanceof T.PerspectiveCamera)){
   this.camera=perspective?new T.PerspectiveCamera(settings.fov,this.width/this.height,.1,100):new T.OrthographicCamera(-8,8,5,-5,.1,100);
   this.camera.position.copy(previous.position);this.camera.quaternion.copy(previous.quaternion);this.camera.up.copy(previous.up);this.camera.zoom=previous.zoom;
  }
  if(this.camera instanceof T.PerspectiveCamera)this.camera.fov=settings.fov;
  this.camera.near=this.cameraSettings.near;this.camera.far=this.cameraSettings.far;
  this.lastMask='';this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 }
 hitAt(point:Vec){const p=this.worldToScreen(point);return this.hits.find(h=>Math.hypot(h.x-p.x,h.y-p.y)<20)?.id||null;}
 floorAtScreen(point:Vec):Floor{const b=this.level.buildings.find(b=>point.x>=b.x&&point.x<=b.end);return b?b.floors.reduce((best,f)=>Math.abs(point.y-this.floorY(f))<Math.abs(point.y-this.floorY(best))?f:best,b.floors[0]):0;}
 resize(){
  const box=this.canvas.getBoundingClientRect();this.width=Math.max(1,box.width);this.height=Math.max(1,box.height);this.gl.setSize(this.width,this.height,false);
  this.frameTarget.setSize(Math.round(this.width*this.gl.getPixelRatio()),Math.round(this.height*this.gl.getPixelRatio()));
  this.postMaterial.uniforms.resolution.value.set(this.width,this.height);this.sightCanvas.height=Math.round(640*this.height/this.width);this.lastMask='';if(!this.externalCamera)this.updateCamera(1);
 }
 updateCamera(dt:number,w?:BaseWorld){
  const settings=this.cameraSettings,aspect=this.width/this.height;
  let cx=settings.centerX,cy=settings.centerY;
  if(w&&settings.follow!=='fixed'){
   const px=wx(w.player.x),py=metres(this.level.groundY-w.player.y);
   if(settings.follow==='player'||settings.follow==='adaptive'&&aspect<1){cx=px+settings.offsetX;cy=py+settings.offsetY;}
   else if(settings.follow==='horizontal')cx=px+settings.offsetX;
   else cx+=px*.46+settings.offsetX;
  }
  this.center.lerp(v3(cx,cy,0),settings.smoothing===0?1:1-Math.exp(-dt*settings.smoothing));
  this.resetView();this.camera.zoom=1;
  if(this.camera instanceof T.OrthographicCamera){const h=settings.height;this.camera.left=-h*aspect/2;this.camera.right=h*aspect/2;this.camera.top=h/2;this.camera.bottom=-h/2;}
  else this.camera.aspect=aspect;
  // Translating the rig never tilts it toward the player: optical axis stays -Z.
  this.camera.position.set(this.center.x,this.center.y,settings.distance);this.camera.up.set(0,1,0);this.camera.rotation.set(0,0,0);
  this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 }
 buildLevel(){
  const m=this.models,L=this.level,H=metres(L.floorHeight);
  for(const room of L.rooms)this.room(room);
  for(const b of L.buildings){
   for(const floor of b.floors){
    const y=floor*H;
    const apertures=L.stairs.filter(s=>s.to===floor&&s.a>=b.x&&s.b<=b.end).map(stair=>{
     const [left,right]=stairApertures({...L,stairs:[stair]},b,floor)[0];
     const z=stair.kind==='ladder'?ACTOR_Z:DIMENSIONS.stairs.z;
     const width=stair.kind==='ladder'?.70:DIMENSIONS.stairs.width+.10;
     return {left,right,back:z-width/2,front:z+width/2};
    });
    const xs=[...new Set([b.x,b.end,...apertures.flatMap(a=>[a.left,a.right])])].sort((a,b)=>a-b);
    const zs=[...new Set([BACK,FRONT,...apertures.flatMap(a=>[a.back,a.front])])].sort((a,b)=>a-b);
    for(let ix=0;ix<xs.length-1;ix++)for(let iz=0;iz<zs.length-1;iz++){
     const x=(xs[ix]+xs[ix+1])/2,z=(zs[iz]+zs[iz+1])/2;
     if(apertures.some(a=>x>a.left&&x<a.right&&z>a.back&&z<a.front))continue;
     const slab=m.box(this.structure,wx(x),y-.065,z,metres(xs[ix+1]-xs[ix]),.13,zs[iz+1]-zs[iz],m.materials[floor<0?4:3]);slab.name='floor-slab';
    }
    m.box(this.structure,wx((b.x+b.end)/2),y-.07,FRONT,metres(b.end-b.x)+.14,.18,.14,cutMaterial);
    for(const a of apertures)for(const x of [a.left,a.right])m.box(this.structure,wx(x),y-.06,(a.back+a.front)/2,.07,.18,a.front-a.back,m.wood);
    const edges=new Set(L.rooms.filter(r=>r.buildingId===b.id&&r.floor===floor).flatMap(r=>[r.x,r.end]));
    for(const x of edges){
     const d=L.doors.find(d=>d.floor===floor&&d.x===x),opening=L.openings.find(o=>o.plane==='divider'&&o.floor===floor&&o.x===x);
     if(d||opening){
      const height=d?DIMENSIONS.door.height:Math.max(DIMENSIONS.door.height,metres(opening!.height));
      const doorWidth=d?.exterior?DIMENSIONS.door.exteriorWidth:DIMENSIONS.door.interiorWidth;
      const rear=ACTOR_Z-doorWidth/2,front=ACTOR_Z+doorWidth/2;
      m.box(this.structure,wx(x),y+(H+height)/2,(BACK+FRONT)/2,.16,H-height,FRONT-BACK,m.brick);
      m.box(this.structure,wx(x),y+height/2,(BACK+rear)/2,.16,height,rear-BACK,m.brick);
      m.box(this.structure,wx(x),y+height/2,(front+FRONT)/2,.16,height,FRONT-front,m.brick);
      if(d){
       for(const z of [rear-.025,front+.025])m.box(this.structure,wx(x),y+height/2,z,.20,height,.05,m.wood);
       m.box(this.structure,wx(x),y+height+.025,ACTOR_Z,.20,.05,doorWidth+.10,m.wood);
       const hinge=new T.Group();hinge.name=d.id;hinge.position.set(wx(x),y,rear);this.structure.add(hinge);
       hinge.userData.dimensions={width:doorWidth,height,thickness:DIMENSIONS.door.thickness};
       const leaf=m.box(hinge,0,height/2,doorWidth/2,DIMENSIONS.door.thickness,height,doorWidth,m.wood);leaf.name='door-leaf';
       for(const side of [-1,1]){
        for(const yy of [.51,1.48])m.box(hinge,side*.027,yy,doorWidth/2,.012,.78,doorWidth-.20,m.wood);
        m.box(hinge,side*.036,1,doorWidth-.10,.016,.13,.045,m.metal);
        m.bar(hinge,v3(side*.07,1,doorWidth-.10),v3(side*.07,1,doorWidth-.22),.012,m.metal);
       }
       this.doors.set(d.id,hinge);
      }else if(opening){
       const board=new T.Group();for(let i=0;i<7;i++)m.box(board,wx(x),y+(i+.5)*height/7,ACTOR_Z,.07,height/7+.015,doorWidth,m.wood);
       this.structure.add(board);this.boards.set(opening.id,board);
      }
     }else m.box(this.structure,wx(x),y+H/2,(BACK+FRONT)/2,.17,H,FRONT-BACK,m.brick);
    }
   }
   const top=(Math.max(...b.floors)+1)*H,width=metres(b.end-b.x);
   m.box(this.structure,wx((b.x+b.end)/2),top-.02,(BACK+FRONT)/2,width+.2,.16,FRONT-BACK+.15,cutMaterial);
   // The cut roof retains its depth and slopes upward toward the rear ridge.
   const rise=metres(b.roof.rise),depth=FRONT-BACK+.5;
   const roof=m.box(this.structure,wx((b.x+b.end)/2),top+rise/2,(BACK+FRONT)/2,width+.7,.11,Math.hypot(depth,rise),m.materials[5]);roof.rotation.x=Math.atan2(rise,depth);
   m.box(this.structure,wx(b.x+b.roof.chimney),top+rise+.12,-1.1,.45,.95,.47,m.brick);
   m.box(this.structure,wx(b.x+b.roof.chimney),top+rise+.62,-1.1,.56,.09,.58,cutMaterial);
   m.box(this.structure,wx((b.x+b.end)/2),Math.min(...b.floors)*H-.32,-.15,width+.4,.47,FRONT-BACK+.2,m.materials[4]);
  }
  for(const stair of L.stairs){
   const flight=new T.Group();flight.name=stair.kind==='ladder'?'Лестница в подвал':'Главная лестница';this.structure.add(flight);
   const y=stair.from*H,upper=stair.to*H;
   if(stair.kind==='ladder'){
    for(const x of [-.25,.25])m.bar(flight,v3(wx(stair.a)+x,y,ACTOR_Z),v3(wx(stair.b)+x,upper+.18,ACTOR_Z),.023);
    for(let yy=y+.14;yy<upper+.1;yy+=.20)m.bar(flight,v3(wx(stair.a)-.25,yy,ACTOR_Z),v3(wx(stair.a)+.25,yy,ACTOR_Z),.021);
   }else{
    const n=Math.ceil(H/DIMENSIONS.stairs.maxRiser),run=metres(stair.b-stair.a),z=DIMENSIONS.stairs.z;
    for(let i=0;i<n;i++)m.box(flight,wx(stair.a)+run*(i+.5)/n,y+H*(i+1)/n-.036,z,Math.abs(run)/n+.025,.072,DIMENSIONS.stairs.width,m.wood);
    for(const z of [DIMENSIONS.stairs.z-DIMENSIONS.stairs.width/2,DIMENSIONS.stairs.z+DIMENSIONS.stairs.width/2]){
     m.bar(flight,v3(wx(stair.a),y-.04,z),v3(wx(stair.b),upper-.04,z),.045,m.wood);
     m.bar(flight,v3(wx(stair.a),y+DIMENSIONS.stairs.railHeight,z),v3(wx(stair.b),upper+DIMENSIONS.stairs.railHeight,z),.023,m.metal);
     for(let i=0;i<=5;i++){const x=wx(stair.a)+run*i/5,yy=y+H*i/5;m.bar(flight,v3(x,yy,z),v3(x,yy+DIMENSIONS.stairs.railHeight,z),.015,m.metal);}
    }
   }
  }
  for(const o of L.objects){const group=m.furniture(o);group.position.set(wx(o.x),o.floor*H,o.kind==='workbench'||o.id==='home/supply-crates'?.27:BACK+.24+furnitureSize(o).depth/2);this.structure.add(group);this.objects.set(o.id,group);}
  for(const detail of L.foreground){
   const g=new T.Group();g.position.set(wx(detail.x),detail.floor*H,FRONT-.09);this.structure.add(g);
   if(detail.kind==='crate')m.crate(g,0,0,0,.57,.30,.36);
   else for(let i=0;i<4;i++){const plank=m.box(g,Math.sin(i*5)*.14,.025+i*.025,Math.cos(i*7)*.08,.65-i*.07,.035,.10);plank.rotation.y=Math.sin(i*3)*.5;}
  }
  this.yard();
  // Exposed structural cuts stay black and sharp above the fog pass.
  for(const child of [...this.structure.children])if(child instanceof T.Mesh&&child.material===cutMaterial)this.cutScene.add(child);
 }
 room(room:Room){
  const m=this.models,H=metres(this.level.floorHeight),y=room.floor*H,left=wx(room.x),width=metres(room.end-room.x);
  const shape=new T.Shape();shape.moveTo(0,0);shape.lineTo(width,0);shape.lineTo(width,H);shape.lineTo(0,H);shape.closePath();
  const holes=this.level.openings.filter(o=>o.roomId===room.id&&o.plane==='back');
  for(const o of holes){
   const hole=new T.Path(),x=metres(o.x-room.x),w=metres(o.width),h=metres(o.height),b=metres(o.bottom);
   const points=o.kind==='breach'?[
    [x-w*.47,b+h*.05],[x-w*.54,b+h*.26],[x-w*.44,b+h*.45],[x-w*.50,b+h*.73],[x-w*.33,b+h*.98],
    [x-w*.04,b+h*.94],[x+w*.22,b+h],[x+w*.48,b+h*.84],[x+w*.43,b+h*.64],[x+w*.52,b+h*.36],[x+w*.44,b+h*.03],[x+w*.13,b],
   ]:[[x-w/2,b],[x-w/2,b+h],[x+w/2,b+h],[x+w/2,b]];
   points.forEach(([a,z],i)=>i?hole.lineTo(a,z):hole.moveTo(a,z));hole.closePath();shape.holes.push(hole);
   this.opening(o,left+x,y+b,w,h,points.map(([a,z])=>v3(left+a,y+z,BACK+.21)));
  }
  const geometry=new T.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:false}),uv=geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/1.7,uv.getY(i)/1.7);
  const wall=new T.Mesh(geometry,[m.materials[room.material],m.brick]);wall.name='Стена · '+room.name;wall.position.set(left,y,BACK);wall.castShadow=true;wall.receiveShadow=true;this.structure.add(wall);
  m.box(this.structure,left+width/2,y+.06,BACK+.21,width,.10,.06,m.wood);
  m.box(this.structure,left+width/2,y+H-.1,BACK+.25,width,.08,.13,m.wood);
  for(let x=left+.35;x<left+width-.1;x+=.75)m.box(this.structure,x,y+H-.08,(BACK+FRONT)/2,.065,.09,FRONT-BACK,m.wood);
  if(room.floor>=0&&holes.length)m.radiator(this.structure,left+.25,y+.12,BACK+.27);
  const bulb=new T.PointLight(0xffd492,0,4.3,2);bulb.position.set(left+width*.5,y+H-.25,-.35);this.scene.add(bulb);this.poweredLights.push(bulb);
  m.cylinder(this.structure,left+width*.5,y+H-.22,-.35,.10,.07,m.dark);
 }
 opening(o:Opening,x:number,y:number,width:number,height:number,points:T.Vector3[]){
  const m=this.models;
  if(o.kind==='window'){
   for(const xx of [x-width/2,x+width/2])m.box(this.structure,xx,y+height/2,BACK+.14,.055,height+.08,.27,m.wood);
   for(const yy of [y,y+height])m.box(this.structure,x,yy,BACK+.14,width+.12,.06,.27,m.wood);
   m.box(this.structure,x,y-.025,BACK+.23,width+.24,.08,.43,m.materials[4]);
   m.box(this.structure,x,y+height/2,BACK+.15,.035,height,.09,m.wood);
   m.box(this.structure,x,y+height*.55,BACK+.15,width,.035,.09,m.wood);
   // A few shards remain, with most of the aperture genuinely empty.
   const glass=new T.MeshStandardMaterial({color:0xa6c5cc,transparent:true,opacity:.15,roughness:.15,side:T.DoubleSide,depthWrite:false});
   for(const sign of [-1,1]){
    const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([x+sign*.04,y+.04,BACK+.17,x+sign*(width*.40),y+.04,BACK+.17,x+sign*.04,y+height*.30,BACK+.17],3));geo.computeVertexNormals();this.structure.add(new T.Mesh(geo,glass));
   }
  }else{
   for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];m.bar(this.structure,a,b,.055,m.brick);
    const chip=m.box(this.structure,a.x,a.y,a.z,.12,.08,.16,m.brick);chip.rotation.z=i*.7;
   }
  }
  const boarded=new T.Group();for(let i=0;i<3;i++){const plank=m.box(boarded,x,y+height*(.2+i*.29),BACK+.30,width+.18,.12,.055,m.wood);plank.rotation.z=(i-1)*.13;}
  this.structure.add(boarded);this.boards.set(o.id,boarded);
 }
 yard(){
  const m=this.models;
  for(const [a,b] of [[wx(0),wx(500)-.08],[wx(1530)+.08,wx(2220)]]){
   m.box(this.structure,(a+b)/2,-1.25,-.3,b-a,2.5,3.25,m.materials[4]);
   m.box(this.structure,(a+b)/2,-.055,-.3,b-a,.11,3.25,m.materials[0]);
   m.box(this.structure,(a+b)/2,-1.30,1.34,b-a,2.55,.05,cutMaterial);
  }
  const grass=new T.MeshStandardMaterial({color:0x666b50,roughness:1,side:T.DoubleSide});
  for(let i=0;i<110;i++){
   const x=-11.8+i*.215;if(x>wx(500)-.1&&x<wx(1530)+.1)continue;
   const h=.07+((i*17)%13)*.015,z=.8+Math.sin(i*1.7)*.25;
   const blade=new T.Mesh(new T.PlaneGeometry(.025,h),grass);blade.position.set(x,h/2,z);blade.rotation.z=Math.sin(i*2.3)*.5;this.structure.add(blade);
  }
  for(const side of [-1,1]){
   for(let i=0;i<7;i++){const x=side*(6.2+i*.75);m.box(this.structure,x,.61,-1.40,.045,1.22,.055,m.dark);}
   for(const y of [.38,.98])m.box(this.structure,side*8.45,y,-1.4,4.9,.035,.045,m.dark);
  }
  // Small physical rubble catches low-angle light along the cutaway edge.
  for(let i=0;i<42;i++){
   const x=-4.8+(i*1.137)%9.8,floor=i%3-1;
   const rock=m.box(this.structure,x,floor*metres(this.level.floorHeight)+.025,.76,.05+(i%4)*.018,.05,.055,m.brick);rock.rotation.set(.1*i,.6*i,.2*i);
  }
 }
 updateActors(w:BaseWorld,dt:number,alpha:number){
  const p=w.player,stair=this.level.stairs.find(s=>s.id===p.stair?.id);
  this.actorZ=lerp(this.actorZ,p.stair&&stair?.kind==='stairs'?DIMENSIONS.stairs.z:ACTOR_Z,1-Math.exp(-dt*20));
  const c=this.heroCanvas.getContext('2d')!;c.clearRect(0,0,400,360);c.save();c.translate(180,320);c.scale(2,2);
  // BaseHero still owns all approved animation frames and blend transitions.
  const local={...p,x:0,y:0,previousX:0,previousY:0};
  const interaction=w.doorInteraction,door=w.doors.find(d=>d.id===interaction?.id);
  let hand:Vec|undefined;
  if(interaction&&door){
   const handleZ=ACTOR_Z+(door.exterior?DIMENSIONS.door.exteriorWidth:DIMENSIONS.door.interiorWidth)/2-.10;
   const target=v3(wx(door.x)+(p.x<door.x?-.07:.07),door.floor*metres(this.level.floorHeight)+DIMENSIONS.door.handleHeight,handleZ);
   const delta=target.sub(this.worldPosition(p));
   hand={x:delta.dot(v3(1,0,0).applyAxisAngle(v3(0,1,0),this.angle))/(2*this.heroScale.pixelMetres)*p.facing,y:-delta.y/(2*this.heroScale.pixelMetres)};
  }
  this.hero.draw(c,local,dt,alpha,!!w.task,this.level.stairs.find(s=>s.id===p.stair?.id)?.kind==='ladder',interaction,hand);c.restore();this.heroTexture.needsUpdate=true;
  this.heroMesh.rotation.set(0,this.angle,0);
  const offset=v3(20*this.heroScale.pixelMetres,140*this.heroScale.pixelMetres,0).applyQuaternion(this.heroMesh.quaternion);
  this.heroMesh.position.copy(this.worldPosition({x:lerp(p.previousX,p.x,alpha),y:lerp(p.previousY,p.y,alpha)},this.actorZ)).add(offset);
  const dc=this.dogCanvas.getContext('2d')!;dc.clearRect(0,0,400,360);const im=this.assets.images.dog,d=w.dog,frame=d.mode==='warn'?3:d.mode==='walk'||d.mode==='retreat'?1+Math.floor(this.elapsed*5)%2:0;
  dc.save();dc.translate(200,180);dc.scale(-d.facing,1);dc.drawImage(im,frame%3*im.width/3,Math.floor(frame/3)*im.height/2,im.width/3,im.height/2,-200,-180,400,360);dc.restore();this.dogTexture.needsUpdate=true;
  this.dogMesh.visible=w.dogVisible;this.dogMesh.quaternion.copy(this.camera.quaternion);this.dogMesh.position.copy(this.worldPosition({x:lerp(d.previousX,d.x,alpha),y:this.floorY(0)-45},.32));
 }
 updateMarkers(w:BaseWorld){
  this.hits=[];const active=w.nearby()?.id;
  const items=[...w.visibleObjects().map(o=>({id:o.id,x:o.x,y:this.floorY(o.floor)-layoutUnits(furnitureSize(o).height+.20),symbol:o.searched&&['chest','wardrobe'].includes(o.kind)?'✓':o.kind==='generator'?'ϟ':o.kind==='bed'?'☾':o.kind==='sink'||o.kind==='barrel'?'≈':'+',label:o.name})),...w.visibleDoors().map(d=>({id:d.id,x:d.x,y:this.floorY(d.floor)-layoutUnits(DIMENSIONS.door.height+.20),symbol:d.open?'↔':'⌑',label:d.name}))];
  const visible=new Set(items.map(i=>i.id));for(const [id,marker] of this.markers)marker.hidden=!visible.has(id);
  for(const item of items){
   let marker=this.markers.get(item.id);if(!marker){marker=document.createElement('button');marker.className='world-marker';marker.tabIndex=0;marker.type='button';marker.setAttribute('aria-label',item.label);marker.addEventListener('click',e=>{e.stopPropagation();if(w.phase!=='playing')return;const target=w.objects.find(o=>o.id===item.id)||w.doors.find(d=>d.id===item.id);if(!target)return;this.canvas.focus();if(target.floor===w.player.floor&&Math.abs(target.x-w.player.x)<76)w.action({type:'interact',target:item.id});else w.setTarget(target.x,target.floor,item.id);});this.markers.set(item.id,marker);this.markerLayer.append(marker);}
   const p=this.worldToScreen(item);marker.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;marker.textContent=item.symbol;marker.title=item.label;marker.classList.toggle('nearby',item.id===active||item.id===this.hover);marker.hidden=p.x<10||p.x>this.width-10||p.y<12||p.y>this.height-12;this.hits.push({id:item.id,...p});
  }
 }
 updateSight(w:BaseWorld,dt:number){
  this.maskTime+=dt;const key=`${w.player.x.toFixed(1)}:${w.player.y.toFixed(1)}:${w.doors.map(d=>d.open)}:${!!w.sight.peek}:${this.center.x.toFixed(2)}:${this.center.y.toFixed(2)}:${this.angle.toFixed(3)}:${this.zoom}:${this.width}:${w.openings.map(o=>o.state)}`;
  if(this.lastMask===key||this.maskTime<.07)return;this.lastMask=key;this.maskTime=0;
  const c=this.sightCanvas.getContext('2d')!,sx=this.sightCanvas.width/this.width,sy=this.sightCanvas.height/this.height;
  c.setTransform(1,0,0,1,0,0);c.fillStyle='#000';c.fillRect(0,0,c.canvas.width,c.canvas.height);c.setTransform(sx,0,0,sy,0,0);c.fillStyle='#fff';c.filter='blur(7px)';
  const draw=(polygon:Vec[])=>{c.beginPath();polygon.forEach((p,i)=>{const q=this.worldToScreen(p);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.closePath();c.fill();};
  draw(visibilityPolygon(w.sight.origin,0,Math.PI,1800,w.sight.segments,150));
  if(w.sight.peek){const p=w.sight.peek;draw(visibilityPolygon(p.origin,p.angle,p.half,p.range,p.segments,40));}
  c.filter='none';this.sightTexture.needsUpdate=true;
 }
 draw(w:BaseWorld,dt:number,alpha=1){
  this.elapsed+=w.phase==='playing'?dt:0;if(!this.externalCamera)this.updateCamera(dt,w);
  const env=daylightStyle(w.dayMinutes),night=env.night;
  this.hemisphere.intensity=.17+env.sun*1.6;this.hemisphere.color.set(env.sun>.1?0xc9d8e0:0x6382b4);this.fill.intensity=.04+env.sun*.6;
  this.sun.intensity=env.sun*2.8+night*.14;this.sun.color.set(env.sun>.1?env.color:env.moonColor);
  this.sun.position.set(Math.cos(env.angle)*8,10,-6);this.backdropMaterial.color.setRGB(.18+env.sun*.67,.24+env.sun*.64,.34+env.sun*.58);
  this.moon.visible=night>.1;(this.stars.material as T.PointsMaterial).opacity=night*.75;this.stars.visible=night>.1;
  for(const light of this.poweredLights)light.intensity=w.powered?3:0;
  const origin=w.lightOrigin;this.lamp.visible=w.flashlight;this.lamp.position.copy(this.worldPosition(origin,this.actorZ-.12));
  // A slight depth component illuminates rear furniture while retaining mouse aim.
  this.lamp.target.position.copy(this.lamp.position).add(v3(Math.cos(w.aim)*4,-Math.sin(w.aim)*4,-1.15));
  for(const d of w.doors){const group=this.doors.get(d.id);if(group)group.rotation.y=-(d.openness??Number(d.open))*Math.PI*.48;}
  const visible=new Set(w.visibleObjects().map(o=>o.id));for(const [id,group] of this.objects)group.visible=visible.has(id);
  for(const o of w.openings){const board=this.boards.get(o.id);if(board)board.visible=o.state==='boarded';}
  this.updateActors(w,w.phase==='playing'?dt:0,alpha);
  if(!this.editorMode){this.updateMarkers(w);this.updateSight(w,dt);}else{this.markerLayer.hidden=true;if(this.lastMask!=='editor'){const c=this.sightCanvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,this.sightCanvas.width,this.sightCanvas.height);this.sightTexture.needsUpdate=true;this.lastMask='editor';}this.dogMesh.visible=false;}
  this.beforeRender?.();
  this.gl.setRenderTarget(this.frameTarget);this.gl.render(this.scene,this.camera);this.drawCalls=this.gl.info.render.calls;this.triangles=this.gl.info.render.triangles;
  const u=this.postMaterial.uniforms;
  u.sceneDepth.value=this.frameTarget.depthTexture;u.inverseProjection.value.copy(this.camera.projectionMatrixInverse);u.cameraWorld.value.copy(this.camera.matrixWorld);
  u.lampShadow.value=this.lamp.shadow.map?.depthTexture||this.sun.shadow.map?.depthTexture;u.sunShadow.value=this.sun.shadow.map?.depthTexture;
  u.lampMatrix.value.copy(this.lamp.shadow.matrix);u.sunMatrix.value.copy(this.sun.shadow.matrix);
  u.lampPosition.value.copy(this.lamp.position);u.lampDirection.value.copy(this.lamp.target.position).sub(this.lamp.position).normalize();
  u.lampPower.value=w.flashlight?this.lamp.intensity:0;u.lampRange.value=this.lamp.distance;u.lampCone.value.set(Math.cos(this.lamp.angle),Math.cos(this.lamp.angle*(1-this.lamp.penumbra)));
  u.lampColor.value.copy(this.lamp.color);u.sunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
  const building=this.level.buildings[0],floors=building.floors;
  u.airMin.value.set(wx(building.x),metres(Math.min(...floors)*this.level.floorHeight),BACK+.19);
  u.airMax.value.set(wx(building.end),metres((Math.max(...floors)+1)*this.level.floorHeight),FRONT);
  this.gl.setRenderTarget(null);this.gl.render(this.postScene,this.postCamera);
  this.gl.autoClear=false;this.gl.clearDepth();this.gl.render(this.cutScene,this.camera);this.gl.autoClear=true;this.afterRender?.();
 }
 diagnostics(){return {mode:this.mode,drawCalls:this.drawCalls,triangles:this.triangles,geometries:this.gl.info.memory.geometries,textures:this.gl.info.memory.textures,angle:this.angle,doors:[...this.doors].map(([id,g])=>({id,angle:g.rotation.y})),objects:[...this.objects].map(([id,g])=>({id,visible:g.visible})),hero:{type:this.heroMesh.geometry.type,z:this.heroMesh.position.z,height:DIMENSIONS.hero.height,pixelMetres:this.heroScale.pixelMetres},camera:this.camera.type,cameraPose:{position:this.camera.position.toArray(),direction:this.camera.getWorldDirection(new T.Vector3()).toArray(),zoom:this.camera.zoom,settings:this.cameraSettings},fov:this.camera instanceof T.PerspectiveCamera?this.camera.fov:null,dimensions:DIMENSIONS,hazeDensity:this.postMaterial.uniforms.hazeDensity.value};}
 dispose(){this.observer.disconnect();this.markerLayer.remove();this.frameTarget.dispose();this.sightTexture.dispose();this.heroTexture.dispose();this.dogTexture.dispose();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();[this.scene,this.cutScene,this.postScene].forEach(scene=>scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);}}}));for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();this.sun.shadow.map?.dispose();this.lamp.shadow.map?.dispose();this.gl.dispose();}
}
