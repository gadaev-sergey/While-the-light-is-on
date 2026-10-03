import type {SceneDocument,SceneNode} from './scene.ts';

/** Commands edit a draft. The editor validates and commits the whole operation once. */
function editableNodes(doc:SceneDocument,ids:ReadonlySet<string>):SceneNode[]{
 const nodes=doc.nodes.filter(n=>ids.has(n.id));
 if(nodes.some(n=>n.locked))throw new Error('Сначала разблокируйте все выбранные объекты.');
 return nodes;
}
export function pruneGroups(doc:SceneDocument){
 if(doc.groups)doc.groups=doc.groups.filter(g=>doc.nodes.some(n=>n.groupId===g.id));
}
export function groupNodes(doc:SceneDocument,ids:ReadonlySet<string>,id:string=crypto.randomUUID()){
 const nodes=editableNodes(doc,ids);if(nodes.length<2)throw new Error('Выберите хотя бы два объекта.');
 doc.groups||=[];doc.groups.push({id,name:`Группа ${doc.groups.length+1}`});
 for(const node of nodes)node.groupId=id;
 pruneGroups(doc);return id;
}
export function ungroupNodes(doc:SceneDocument,ids:ReadonlySet<string>){
 const groups=new Set(doc.nodes.filter(n=>ids.has(n.id)).map(n=>n.groupId).filter(Boolean));
 const members=doc.nodes.filter(n=>groups.has(n.groupId));
 editableNodes(doc,new Set(members.map(n=>n.id)));
 for(const node of members)delete node.groupId;
 pruneGroups(doc);
}
export function deleteNodes(doc:SceneDocument,ids:ReadonlySet<string>){
 editableNodes(doc,ids);if(doc.activeCamera&&ids.has(doc.activeCamera))delete doc.activeCamera;doc.nodes=doc.nodes.filter(n=>!ids.has(n.id));pruneGroups(doc);
}
export function duplicateNodes(doc:SceneDocument,ids:ReadonlySet<string>,newId:()=>string=()=>crypto.randomUUID()){
 const nodes=editableNodes(doc,ids),groups=new Map<string,string>();
 const copies=nodes.map(node=>{
  const copy=structuredClone(node);copy.id=newId();copy.name=copy.name.slice(0,90)+' · копия';delete copy.gameId;copy.transform.position[0]+=.5;
  if(copy.groupId){
   const oldId=copy.groupId;
   if(!groups.has(oldId)){
    const id=newId();groups.set(oldId,id);doc.groups!.push({id,name:doc.groups!.find(g=>g.id===oldId)!.name.slice(0,90)+' · копия'});
   }
   copy.groupId=groups.get(oldId)!;
  }
  return copy;
 });
 const remap=new Map(nodes.map((n,i)=>[n.id,copies[i].id]));for(const copy of copies)for(const c of copy.components||[])for(const [key,value] of Object.entries(c.values))if(typeof value==='string'&&remap.has(value))c.values[key]=remap.get(value)!;
 doc.nodes.push(...copies);return copies.map(n=>n.id);
}
