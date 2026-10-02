import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {portablePath,validateProject,validateSnapshot,type ProjectSnapshot} from '../../src/engine/project.ts';
export const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
export async function inside(root:string,relative:string){if(!portablePath(relative))throw new Error('Недопустимый путь файла.');const full=path.resolve(root,relative),realRoot=await fs.realpath(root);let parent=full;while(true){try{const real=await fs.realpath(parent);if(real!==realRoot&&!real.startsWith(realRoot+path.sep))throw new Error('Символическая ссылка выходит за папку проекта.');break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;parent=path.dirname(parent);}}return full;}
export async function atomic(file:string,data:string|Buffer){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+randomUUID();await fs.writeFile(tmp,data);await fs.rename(tmp,file);}
export async function readProject(root:string):Promise<ProjectSnapshot>{const manifest=validateProject(JSON.parse(await fs.readFile(await inside(root,'project.shelter.json'),'utf8'))),scenes:ProjectSnapshot['scenes']={};for(const s of manifest.scenes)scenes[s.id]=JSON.parse(await fs.readFile(await inside(root,s.path),'utf8'));return validateSnapshot({manifest,scenes});}
export function revision(snapshot:ProjectSnapshot){return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');}
const locks=new Map<string,Promise<unknown>>();
export async function locked<T>(key:string,fn:()=>Promise<T>):Promise<T>{const previous=locks.get(key)||Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>release=r);locks.set(key,gate);await previous.catch(()=>{});try{return await fn();}finally{release();if(locks.get(key)===gate)locks.delete(key);}}
export async function writeProject(root:string,snapshot:ProjectSnapshot,expected?:string){return locked(root,async()=>{
 const valid=validateSnapshot(snapshot);let previous:ProjectSnapshot|undefined;
 try{previous=await readProject(root);}catch(e){if(expected)throw e;}
 if(expected&&(!previous||revision(previous)!==expected))throw new Error('Проект изменён в другом окне или на диске. Сохраните копию либо перечитайте файлы; ваши изменения остаются в редакторе.');
 // Immutable scene revisions + a single atomic manifest switch form one transaction.
 const manifest=structuredClone(valid.manifest);
 for(const scene of manifest.scenes){const content=json(valid.scenes[scene.id]),hash=createHash('sha256').update(content).digest('hex').slice(0,12);scene.path=`scenes/${scene.id}-${hash}.scene.json`;await atomic(await inside(root,scene.path),content);}
 if(previous)await atomic(await inside(root,`settings/backups/${revision(previous)}.json`),json(previous));
 await atomic(await inside(root,'project.shelter.json'),json(manifest));return readProject(root);
 });}
export async function filesUnder(root:string,prefix=''):Promise<Map<string,Buffer>>{const result=new Map<string,Buffer>();for(const item of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){if(item.isSymbolicLink())throw new Error('Архивирование символических ссылок не поддерживается.');const rel=prefix?prefix+'/'+item.name:item.name;if(item.isDirectory()){for(const [p,b] of await filesUnder(root,rel))result.set(p,b);}else result.set(rel,await fs.readFile(path.join(root,rel)));}return result;}
