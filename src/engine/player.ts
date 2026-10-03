import {ModuleRegistry,type RuntimeSession} from './sdk.ts';
import {createRuntimeSession} from './session.ts';
import {basic} from '../modules/basic.ts';
import type {ProjectSession,ProjectSnapshot} from './project.ts';
export async function runProject(snapshot:ProjectSnapshot,modules:unknown[],sceneId:string,assetUrl:(p:string)=>string,isolated=false){const registry=new ModuleRegistry();registry.register(basic);for(const mod of modules)registry.register((mod as any).default||mod);return createRuntimeSession({container:document.querySelector<HTMLElement>('#app')!,snapshot,sceneId,assetUrl,registry,savePolicy:isolated?'isolated':'persistent'});}
if(import.meta.env.DEV&&new URLSearchParams(location.search).has('session')){
 const token=new URLSearchParams(location.search).get('session')!;let active:RuntimeSession|undefined;window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent)return;const data=e.data;if(data.type==='start'){try{const session=data.session as ProjectSession;const modules=[];for(const m of session.moduleUrls)if(m.runtime!=='builtin:basic')modules.push(await import(/* @vite-ignore */m.runtime));active=await runProject(session,modules,data.sceneId,p=>`/api/file/${encodeURIComponent(token)}/${p}`,true);if(import.meta.env.DEV)Object.defineProperty(window,'__RUNTIME__',{configurable:true,value:{diagnostics:()=>active?.diagnostics?.()}});parent.postMessage({type:'ready'},location.origin);}catch(error){parent.postMessage({type:'error',message:error instanceof Error?error.message:String(error)},location.origin);}}else if(data.type==='pause')active?.pause(data.value);else if(data.type==='dispose'){active?.dispose();active=undefined;}});parent.postMessage({type:'player-loaded'},location.origin);
}

// Direct development session for any project; compiled out of published games.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('project')) {
 const project = new URLSearchParams(location.search).get('project')!;
 try {
  const response = await fetch('/api/open', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:project})});
  const session = await response.json() as ProjectSession & {error?:string};
  if (!response.ok) throw new Error(session.error || 'Не удалось открыть проект');
  const modules = [];
  for (const entry of session.moduleUrls) if (entry.runtime !== 'builtin:basic') modules.push(await import(/* @vite-ignore */entry.runtime));
  await runProject(session, modules, session.manifest.startScene, p=>`/api/file/${session.token}/${p}`);
 } catch (error) { document.querySelector('#app')!.textContent = String(error); }
}
