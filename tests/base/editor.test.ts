import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SceneHistory,validateScene,parseScene,identity,light,type SceneDocument} from '../../src/engine/scene.ts';
import {groupNodes,ungroupNodes,duplicateNodes,deleteNodes} from '../../src/engine/scene-commands.ts';
import {modelBounds,transformSelection} from '../../src/editor/selection.ts';
import * as T from 'three';
const scene=():SceneDocument=>({format:'shelter-scene',version:1,template:'shelter-house-v1',units:'m',name:'Тест',nodes:[{id:'cube',name:'Куб',kind:'box',layer:'props',visible:true,locked:false,transform:identity()}],textures:[],environment:{time:720,haze:.05,exposure:1.3,flashlight:false}});
test('Camera FOV persists and is undoable; legacy scenes remain valid and invalid cameras are rejected',()=>{
 const legacy=scene();assert.equal(parseScene(JSON.stringify(legacy)).camera,undefined);
 const history=new SceneHistory(legacy),next=scene();next.camera={projection:'perspective',fov:60};history.commit(next);
 assert.deepEqual(parseScene(JSON.stringify(history.document)).camera,next.camera);history.undo();assert.equal(parseScene(JSON.stringify(history.document)).camera,undefined);history.redo();assert.equal(history.document.camera?.fov,60);
 for(const fov of [0,14,101,Infinity,NaN]){const bad=scene();bad.camera={projection:'perspective',fov};assert.throws(()=>history.commit(bad));assert.equal(history.document.camera?.fov,60);}
 const bad=scene();bad.camera={projection:'invalid',fov:35} as any;assert.throws(()=>validateScene(bad));
});
test('Scene files round-trip in metres; edits, deletion and environment are undoable',()=>{
 const start=scene(),h=new SceneHistory(start),next=structuredClone(start);next.nodes[0].transform.position=[2.3,2.6875,-1];h.commit(next);next.nodes=[];next.environment.time=0;h.commit(next);
 assert.equal(h.document.nodes.length,0);assert.ok(h.undo());assert.deepEqual(h.document.nodes[0].transform.position,[2.3,2.6875,-1]);assert.ok(h.undo());assert.equal(h.document.environment.time,720);assert.ok(h.redo());assert.deepEqual(parseScene(JSON.stringify(h.document)),h.document);
 const fork=structuredClone(h.document);fork.name='Новая ветка';h.commit(fork);assert.equal(h.redo(),false);assert.equal(start.nodes[0].transform.position[0],0);
});
test('Group membership survives files and copying; deleting, undoing and ungrouping keep references valid',()=>{
 const d=scene(),second=structuredClone(d.nodes[0]);second.id='second';second.transform.position=[2,0,0];d.nodes.push(second);
 const ids=new Set(d.nodes.map(n=>n.id));groupNodes(d,ids,'group');const h=new SceneHistory(d);
 assert.equal(parseScene(JSON.stringify(d)).groups?.[0].id,'group');
 const next=structuredClone(d);let sequence=0;const copies=duplicateNodes(next,ids,()=>`copy-${sequence++}`);h.commit(next);
 const copied=next.nodes.filter(n=>copies.includes(n.id));assert.equal(copied[0].groupId,copied[1].groupId);assert.notEqual(copied[0].groupId,'group');assert.deepEqual(copied.map(n=>n.transform.position[0]),[.5,2.5]);
 deleteNodes(next,new Set(copies));h.commit(next);assert.equal(h.document.groups?.length,1);h.undo();assert.equal(h.document.groups?.length,2);
 const separated=structuredClone(h.document);ungroupNodes(separated,new Set(['cube']));validateScene(separated);assert.ok(separated.nodes.filter(n=>ids.has(n.id)).every(n=>!n.groupId));assert.equal(separated.groups?.length,1);
 const invalid=structuredClone(d);invalid.nodes[0].groupId='missing';assert.throws(()=>validateScene(invalid));
});
test('A locked group member prevents partial copy, deletion or regrouping',()=>{
 const d=scene(),second=structuredClone(d.nodes[0]);second.id='locked';d.nodes.push(second);const ids=new Set(['cube','locked']);groupNodes(d,ids,'group');second.locked=true;
 for(const command of [(doc:SceneDocument)=>deleteNodes(doc,ids),(doc:SceneDocument)=>duplicateNodes(doc,ids),(doc:SceneDocument)=>groupNodes(doc,ids),(doc:SceneDocument)=>ungroupNodes(doc,ids)]){
  const next=structuredClone(d);assert.throws(()=>command(next));assert.deepEqual(next,d);
 }
});
test('Shared rotation and scale preserve spacing, object proportions and original documents',()=>{
 const d=scene(),second=structuredClone(d.nodes[0]);second.id='second';second.transform.position=[2,0,0];second.transform.rotation=[15,35,10];second.transform.scale=[2,1,3];d.nodes.push(second);
 const center=new T.Vector3(1,0,0),position=new T.Vector3(4,2,0),rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
 const moved=transformSelection(d.nodes,center,position,rotation,2),a=moved.get('cube')!,b=moved.get('second')!;
 assert.ok(new T.Vector3(...a.position).distanceTo(new T.Vector3(4,2,2))<1e-8);assert.ok(new T.Vector3(...b.position).distanceTo(new T.Vector3(4,2,-2))<1e-8);
 assert.deepEqual(b.scale,[4,2,6]);assert.deepEqual(second.transform.scale,[2,1,3]);
 const original=new T.Quaternion().setFromEuler(new T.Euler(...second.transform.rotation.map(T.MathUtils.degToRad) as [number,number,number]));
 const result=new T.Quaternion().setFromEuler(new T.Euler(...b.rotation.map(T.MathUtils.degToRad) as [number,number,number]));assert.ok(result.angleTo(original.premultiply(rotation))<1e-7);
});
test('Model dimensions ignore placement, rotation, scale and editor helper geometry',()=>{
 const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,2,.5));mesh.position.y=1;root.add(mesh);root.position.set(4,3,-2);root.rotation.set(.3,.7,.2);root.scale.set(2,3,4);
 const helper=new T.Mesh(new T.BoxGeometry(100,100,100));helper.userData.editorOnly=true;root.add(helper);
 const size=modelBounds(root).getSize(new T.Vector3());assert.ok(size.distanceTo(new T.Vector3(1,2,.5))<1e-8);
 mesh.geometry.dispose();helper.geometry.dispose();
});
test('Invalid imported transforms, materials, light settings and duplicate IDs are rejected atomically',()=>{
 for(const mutate of [(d:SceneDocument)=>d.nodes.push(d.nodes[0]),(d:SceneDocument)=>d.nodes[0].transform.position[0]=Infinity,(d:SceneDocument)=>d.nodes[0].transform.scale[0]=0,(d:SceneDocument)=>d.nodes[0].surface={texture:'https://foreign/texture.png',color:'#ffffff',roughness:1,metalness:0,repeat:1},(d:SceneDocument)=>{d.nodes[0].kind='point-light';d.nodes[0].light={...light(),intensity:-1};}]){
  const history=new SceneHistory(scene()),bad=scene();mutate(bad);assert.throws(()=>history.commit(bad));assert.equal(history.past.length,0);assert.deepEqual(history.document,scene());
 }
 const d=scene();d.textures=[{id:'script',name:'bad',data:'data:image/svg+xml;base64,aaaa'}];assert.throws(()=>validateScene(d));
});

test('Extended camera settings reject unsafe clipping and invalid optional values without losing legacy compatibility',()=>{
 const original=scene();original.camera={projection:'orthographic',fov:35,height:12,distance:20,follow:'fixed',centerY:3,smoothing:0};
 assert.deepEqual(parseScene(JSON.stringify(original)),original);
 const history=new SceneHistory(original);
 for(const patch of [{height:0},{distance:101},{follow:'orbit'},{near:0},{far:20},{centerX:NaN},{smoothing:-1},{offsetY:101}]){
  const bad=structuredClone(original);Object.assign(bad.camera!,patch);assert.throws(()=>history.commit(bad));assert.deepEqual(history.document,original);
 }
});
