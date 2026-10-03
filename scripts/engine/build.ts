import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {build as viteBuild,createServer as createViteServer} from 'vite';
import ts from 'typescript';
import type {ProjectSnapshot,BuildResult} from '../../src/engine/project.ts';
import {validateSnapshot} from '../../src/engine/project.ts';
import {ModuleRegistry} from '../../src/engine/sdk.ts';
import {basic} from '../../src/modules/basic.ts';
import {assertLayout,type Layout} from '../../src/modules/layout.ts';
import {inside,filesUnder,atomic,json} from './files.ts';
import {pack} from './zip.ts';
export const builds=new Map<string,BuildResult>();
export async function startBuild(engineRoot:string,projectRoot:string,input:ProjectSnapshot){
 engineRoot=await fs.realpath(engineRoot);projectRoot=await fs.realpath(projectRoot);
 const snapshot=validateSnapshot(input),id=randomUUID(),output=path.resolve(snapshot.manifest.build.output||path.join(engineRoot,'artifacts/builds',snapshot.manifest.projectId)),project=await fs.realpath(projectRoot);
 // Every result gets a fresh child directory. Existing releases are never replaced.
 let canonical=output;let probe=output;const tail:string[]=[];while(true){try{canonical=path.join(await fs.realpath(probe),...tail.reverse());break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;tail.push(path.basename(probe));probe=path.dirname(probe);}}
 if(canonical===project||canonical.startsWith(project+path.sep)||project.startsWith(canonical+path.sep)||canonical===engineRoot||canonical===path.parse(canonical).root)throw new Error('Выберите отдельную папку результатов вне проекта и исходников движка.');
 const result:BuildResult={id,status:'running',stage:'Фиксация данных',progress:5,log:[]};
 const work=path.join(engineRoot,'.shelter-cache','builds',id);await fs.mkdir(work,{recursive:true});
 const registry=new ModuleRegistry();registry.register(basic);
 for(const scene of Object.values(snapshot.scenes)){if(!snapshot.manifest.modules.some(m=>m.runtime!=='builtin:basic'))registry.validate(scene,snapshot.manifest);if(scene.moduleData?.layout)assertLayout(scene.moduleData.layout as Layout);}
 // Include scene transitions and references declared by components transitively.
 for(let i=0;i<snapshot.manifest.build.scenes.length;i++)for(const node of snapshot.scenes[snapshot.manifest.build.scenes[i]].nodes)for(const component of node.components||[])if(component.type==='basic.portal'){const target=String(component.values.scene);if(!snapshot.scenes[target])throw new Error('Не найдена сцена перехода: '+node.name);if(!snapshot.manifest.build.scenes.includes(target))snapshot.manifest.build.scenes.push(target);}
 const used=new Set(snapshot.manifest.build.dynamicAssets);
 for(const sceneId of snapshot.manifest.build.scenes){const scene=snapshot.scenes[sceneId];for(const n of scene.nodes){if(n.kind==='model'&&n.asset)used.add(n.asset);if(n.surface?.texture.startsWith('asset:'))used.add(n.surface.texture.slice(6));for(const c of n.components||[])if(c.type==='basic.portal'&&!snapshot.manifest.build.scenes.includes(String(c.values.scene)))throw new Error('Сцена перехода не включена в сборку: '+n.name);}}
 for(const id of snapshot.manifest.build.scenes)for(const node of snapshot.scenes[id].nodes)for(const component of node.components||[])for(const value of Object.values(component.values))if(typeof value==='string'&&snapshot.manifest.assets.some(a=>a.id===value))used.add(value);
 snapshot.manifest.assets=snapshot.manifest.assets.filter(a=>used.has(a.id));snapshot.manifest.scenes=snapshot.manifest.scenes.filter(s=>snapshot.manifest.build.scenes.includes(s.id));snapshot.scenes=Object.fromEntries(Object.entries(snapshot.scenes).filter(([k])=>snapshot.manifest.build.scenes.includes(k)));
 const included=new Set<string>();const copy=async(rel:string,dest='public/'+rel)=>{const source=await inside(projectRoot,rel);await fs.mkdir(path.dirname(path.join(work,dest)),{recursive:true});await fs.copyFile(source,path.join(work,dest));included.add(rel);};
 for(const a of snapshot.manifest.assets){await copy(a.path);for(const dep of a.dependencies)await copy(dep);}
 for(const mod of snapshot.manifest.modules){if(mod.runtime==='builtin:basic')continue;await inside(projectRoot,mod.runtime);const scripts=await filesUnder(projectRoot,'scripts');for(const [p,b] of scripts){await atomic(path.join(work,p),b);}for(const p of mod.assets||[]){const folder=await inside(projectRoot,p);for(const [file,b] of await filesUnder(folder)){const rel=p+'/'+file;await atomic(path.join(work,'public',rel),b);included.add(rel);}}}
 const runtimeModules=snapshot.manifest.modules.filter(m=>m.runtime!=='builtin:basic');
 await atomic(path.join(work,'input.json'),json(snapshot));
 const entry=runtimeModules.map((m,i)=>`import m${i} from './${m.runtime}';`).join('\n')+`\nimport {runProject} from '@shelter/player.ts';\nimport snapshot from './input.json';\nconst assets=p=>new URL(import.meta.env.BASE_URL+p,location.href).href;\nrunProject(snapshot,[${runtimeModules.map((_,i)=>'m'+i)}],snapshot.manifest.startScene,assets).catch(e=>{document.getElementById('app').textContent='Не удалось запустить игру: '+e.message;});`;
 await atomic(path.join(work,'entry.ts'),entry);
 const title=snapshot.manifest.name.replace(/[<>&"']/g,'');await atomic(path.join(work,'index.html'),`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body,#app{height:100%;margin:0;overflow:hidden;background:#202a30}#app{position:relative}button{padding:9px;background:#26383b;color:white;border:1px solid #658089;border-radius:4px}</style></head><body><div id="app"></div><script type="module" src="./entry.ts"></script></body></html>`);
 builds.set(id,result);
 const step=(stage:string,progress:number)=>{if(result.status==='cancelled')throw new Error('Сборка отменена.');result.stage=stage;result.progress=progress;result.log.push(stage);};
 void (async()=>{try{
  if(runtimeModules.length){step('Проверка типов кода проекта',20);const contract=runtimeModules.map((m,i)=>`import m${i} from './${m.runtime}';const check${i}:EngineModule=m${i};`).join('\n');await atomic(path.join(work,'module-contract.ts'),`import type {EngineModule} from '@shelter/sdk.ts';\n`+contract);const config=ts.readConfigFile(path.join(engineRoot,'tsconfig.json'),ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,engineRoot);const program=ts.createProgram([path.join(work,'module-contract.ts')],{...parsed.options,paths:{'@shelter/*':[path.join(engineRoot,'src/engine/*')]}});const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw new Error(ts.formatDiagnostics(errors.slice(0,12),{getCurrentDirectory:()=>work,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
   const checker=await createViteServer({configFile:false,root:work,resolve:{alias:{'@shelter':path.join(engineRoot,'src/engine')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});try{for(const module of runtimeModules){const imported=await checker.ssrLoadModule('/'+module.runtime);if(imported.default?.id!==module.id)throw new Error('Идентификатор модуля не совпадает с манифестом: '+module.id);registry.register(imported.default);}for(const scene of Object.values(snapshot.scenes))registry.validate(scene,snapshot.manifest);}finally{await checker.close();}
  }
  step('Компиляция runtime и модулей проекта',30);
  await viteBuild({configFile:false,root:work,define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},base:snapshot.manifest.build.base,publicDir:path.join(work,'public'),resolve:{alias:{'@shelter':path.join(engineRoot,'src/engine')}},build:{outDir:path.join(work,'result'),emptyOutDir:true,minify:snapshot.manifest.build.mode==='release'?'esbuild':false,sourcemap:snapshot.manifest.build.mode==='development'},logLevel:'warn'});
  step('Проверка состава результата',80);const files=await filesUnder(path.join(work,'result'));if(!files.has('index.html'))throw new Error('В результате отсутствует index.html.');
  for(const [name,data] of files)if(name.endsWith('.js')){const code=data.toString();if(code.includes('/@vite/client')||code.includes('/api/file/')||code.includes('class SceneEditor')||code.includes('Менеджер проектов'))throw new Error('В сборку попали средства разработки.');}
  await atomic(path.join(work,'result','build-report.json'),json({project:snapshot.manifest.name,projectId:snapshot.manifest.projectId,version:snapshot.manifest.gameVersion,engineSDK:1,base:snapshot.manifest.build.base,scenes:snapshot.manifest.scenes,modules:snapshot.manifest.modules.map(m=>({id:m.id,version:m.version})),assets:[...included],files:[...files.keys()],builtAt:new Date().toISOString(),requirements:'WebGL2, ES2022, static HTTP server'}));
  step('Подготовка переносимого каталога и ZIP',95);const destination=path.join(output,`${snapshot.manifest.gameVersion}-${id.slice(0,8)}`);await fs.mkdir(output,{recursive:true});await fs.cp(path.join(work,'result'),destination,{recursive:true,errorOnExist:true,force:false});
  const archive=destination+'.zip';await atomic(archive,pack(await filesUnder(destination)));result.output=destination;result.archive=archive;result.status='success';result.stage='Готово';result.progress=100;result.log.push('Готово: '+destination);
 }catch(error){if(result.status!=='cancelled')result.status='error';result.error=error instanceof Error?error.message:String(error);result.log.push(result.error);console.error(result.error);await atomic(path.join(work,'build-state.json'),json(result));}})();return result;
}
