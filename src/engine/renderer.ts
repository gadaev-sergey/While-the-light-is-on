import * as T from 'three';
import {DEFAULT_CAMERA,resolveCamera,type CameraSettings} from './scene.ts';
export function createRenderer(canvas:HTMLCanvasElement){const gl=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});gl.setPixelRatio(Math.min(devicePixelRatio||1,1.65));gl.outputColorSpace=T.SRGBColorSpace;gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.3;gl.shadowMap.enabled=true;gl.shadowMap.type=T.PCFShadowMap;return gl;}
export function disposeTree(root:T.Object3D){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);}}if(o instanceof T.PointLight||o instanceof T.SpotLight||o instanceof T.DirectionalLight)o.shadow.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}
/** Common Three.js renderer and camera contract, also extended by game modules. */
export class SceneRenderer {
 gl:T.WebGLRenderer;scene=new T.Scene();cutScene=new T.Scene();camera:T.PerspectiveCamera|T.OrthographicCamera=new T.OrthographicCamera(-8,8,5,-5,.1,100);
 width=1;height=1;angle=0;externalCamera=false;editorMode=false;beforeRender?:()=>void;afterRender?:()=>void;cameraSettings=resolveCamera();center=new T.Vector3();
 constructor(public canvas:HTMLCanvasElement){this.gl=createRenderer(canvas);}
 configureCamera(settings:CameraSettings=DEFAULT_CAMERA){
  this.cameraSettings=resolveCamera(settings);const previous=this.camera;
  if((settings.projection==='perspective')!==(previous instanceof T.PerspectiveCamera)){this.camera=settings.projection==='perspective'?new T.PerspectiveCamera(settings.fov,1,.1,100):new T.OrthographicCamera(-8,8,5,-5,.1,100);this.camera.position.copy(previous.position);this.camera.quaternion.copy(previous.quaternion);this.camera.up.copy(previous.up);this.camera.zoom=previous.zoom;}
  if(this.camera instanceof T.PerspectiveCamera)this.camera.fov=settings.fov;this.camera.near=this.cameraSettings.near;this.camera.far=this.cameraSettings.far;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 }
 resize(){const r=this.canvas.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.gl.setSize(this.width,this.height,false);}
 updateCamera(dt:number){const s=this.cameraSettings,aspect=this.width/this.height;this.center.lerp(new T.Vector3(s.centerX,s.centerY,0),s.smoothing?1-Math.exp(-dt*s.smoothing):1);if(this.camera instanceof T.PerspectiveCamera)this.camera.aspect=aspect;else{this.camera.left=-s.height*aspect/2;this.camera.right=s.height*aspect/2;this.camera.top=s.height/2;this.camera.bottom=-s.height/2;}this.camera.zoom=1;this.camera.position.set(this.center.x,this.center.y,s.distance);this.camera.up.set(0,1,0);this.camera.rotation.set(0,0,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();}
 project(p:T.Vector3){const q=p.clone().project(this.camera);return {x:(q.x+1)*this.width/2,y:(1-q.y)*this.height/2};}
 render(dt:number){if(!this.externalCamera)this.updateCamera(dt);this.beforeRender?.();this.gl.render(this.scene,this.camera);this.afterRender?.();}
 dispose(){disposeTree(this.scene);disposeTree(this.cutScene);this.gl.dispose();this.gl.forceContextLoss();}
}
