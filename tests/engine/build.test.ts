import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startBuild,builds} from '../../scripts/engine/build.ts';
import {template} from '../../scripts/engine/templates.ts';
import {readProject,writeProject} from '../../scripts/engine/files.ts';

test('A neutral project builds with no example game, editor or library available',async()=>{
 const isolated=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-independent-')),engine=path.join(isolated,'engine'),project=path.join(isolated,'project');
 await fs.mkdir(engine,{recursive:true});await fs.symlink(path.resolve('node_modules'),path.join(engine,'node_modules'));await fs.cp('src/engine',path.join(engine,'src/engine'),{recursive:true});await fs.cp('src/modules',path.join(engine,'src/modules'),{recursive:true});await fs.mkdir(project,{recursive:true});
 const snapshot=template('Independent','neutral-25d');snapshot.manifest.build.output=path.join(isolated,'releases');await writeProject(project,snapshot);
 const build=await startBuild(engine,project,snapshot);while(build.status==='running')await new Promise(resolve=>setTimeout(resolve,25));assert.equal(build.status,'success',build.error);const report=JSON.parse(await fs.readFile(path.join(build.output!,'build-report.json'),'utf8'));assert.deepEqual(report.assets,[]);assert.deepEqual(report.modules.map((m:any)=>m.id),['shelter.basic']);assert.ok((await fs.readFile(path.join(build.output!,'index.html'),'utf8')).includes('Independent'));
 const invalid=structuredClone(snapshot);invalid.manifest.build.output=project;await assert.rejects(()=>startBuild(engine,project,invalid),/отдельную папку/);assert.equal((await readProject(project)).manifest.name,'Independent');
});

test('Missing used resources, incompatible modules and a broken entry cannot produce a successful build',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-invalid-build-')),snapshot=template('Broken','empty-3d');snapshot.manifest.build.output=path.join(os.tmpdir(),'shelter-errors');snapshot.manifest.assets.push({id:'missing',name:'Missing model',type:'model',path:'assets/missing.glb',dependencies:[],bytes:10,version:'1',author:'test',license:'CC0',category:'test',tags:[],description:''});snapshot.manifest.build.dynamicAssets.push('missing');await writeProject(root,snapshot);await assert.rejects(()=>startBuild(process.cwd(),root,snapshot),/ENOENT/);
 const future=structuredClone(snapshot);future.manifest.modules[0].version=5;await assert.rejects(()=>startBuild(process.cwd(),root,future),/Несовместимый модуль/);
 const code=template('Bad code','empty-3d');code.manifest.modules.push({id:'bad',version:1,runtime:'scripts/runtime.ts'});await fs.mkdir(path.join(root,'scripts'),{recursive:true});await fs.writeFile(path.join(root,'scripts/runtime.ts'),"const value: number = 'this is a type error'; export default {id:'bad',sdk:1};");const build=await startBuild(process.cwd(),root,code);while(build.status==='running')await new Promise(resolve=>setTimeout(resolve,25));assert.equal(build.status,'error');assert.match(build.error!,/not assignable/);assert.equal(build.output,undefined);
 const cancelled=template('Cancelled','empty-3d');const cancel=await startBuild(process.cwd(),root,cancelled);builds.get(cancel.id)!.status='cancelled';await new Promise(resolve=>setTimeout(resolve,800));assert.equal(cancel.status,'cancelled');assert.equal(cancel.output,undefined);
});
