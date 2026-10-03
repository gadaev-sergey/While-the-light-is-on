import * as T from 'three';
import type {SceneNode,Transform,Triple} from '../engine/scene.ts';

/** Bounds in the model's own axes, excluding its editable transform. */
export function modelBounds(root:T.Object3D){
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),box=new T.Box3();
 root.traverse(object=>{
  if(!(object instanceof T.Mesh)||object.userData.editorOnly)return;
  object.geometry.computeBoundingBox();
  if(object.geometry.boundingBox)box.union(object.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,object.matrixWorld)));
 });
 return box;
}
export function selectionBounds(roots:T.Object3D[]){
 const box=new T.Box3();
 for(const root of roots){root.updateWorldMatrix(true,true);const local=modelBounds(root);if(local.isEmpty())box.expandByPoint(root.getWorldPosition(new T.Vector3()));else box.union(local.applyMatrix4(root.matrixWorld));}
 return box;
}
export function objectTransform(object:T.Object3D):Transform{
 return {position:object.position.toArray() as Triple,rotation:[object.rotation.x,object.rotation.y,object.rotation.z].map(T.MathUtils.radToDeg) as Triple,scale:object.scale.toArray() as Triple};
}
/** Uniform group scale avoids introducing shear into rotated furniture. No reparenting. */
export function transformSelection(nodes:SceneNode[],center:T.Vector3,position:T.Vector3,rotation:T.Quaternion,scale:number){
 return new Map(nodes.map(node=>{
  const original=node.transform;
  const point=new T.Vector3(...original.position).sub(center).multiplyScalar(scale).applyQuaternion(rotation).add(position);
  const quaternion=new T.Quaternion().setFromEuler(new T.Euler(...original.rotation.map(T.MathUtils.degToRad) as Triple));quaternion.premultiply(rotation);
  const euler=new T.Euler().setFromQuaternion(quaternion);
  return [node.id,{position:point.toArray() as Triple,rotation:[euler.x,euler.y,euler.z].map(T.MathUtils.radToDeg) as Triple,scale:original.scale.map(v=>v*scale) as Triple}];
 }));
}
