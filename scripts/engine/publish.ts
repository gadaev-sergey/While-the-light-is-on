import * as fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import type {ProjectSnapshot} from '../../src/engine/project.ts';
import {githubRepository,githubPagesUrl,type PublishInfo,type PublishResult} from '../../src/engine/publishing.ts';
import {atomic,filesUnder,json,locked} from './files.ts';
import {startBuild} from './build.ts';

const branch='gh-pages',marker='.shelter-publish.json';
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export const githubGitEnvironment=(token:string):NodeJS.ProcessEnv=>({...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64'),GIT_CONFIG_KEY_1:'credential.helper',GIT_CONFIG_VALUE_1:''});
type CommandOptions={cwd?:string;env?:NodeJS.ProcessEnv;input?:string;timeout?:number};
export function command(file:string,args:string[],options:CommandOptions={}):Promise<string> {
 return new Promise((resolve,reject)=>{
  const child=execFile(file,args,{cwd:options.cwd,env:options.env||process.env,timeout:options.timeout||120000,maxBuffer:2*1024*1024},(error,stdout)=>{
   // Child-process errors contain command arguments and stderr; never surface them.
   if(error)reject(new Error(`${file==='git'?'Git':'GitHub CLI'}: команда ${args[0]} не выполнена. Проверьте доступ к репозиторию и подключение к сети.`));else resolve(stdout.trim());
  });
  child.stdin?.end(options.input);
 });
}

export async function credential(root:string,repository:string,provided?:unknown):Promise<string> {
 if(provided!==undefined&&provided!==''){
  if(typeof provided!=='string'||provided.length>1000||!/^[\w-]+$/.test(provided))throw new Error('Некорректный токен GitHub.');
  return provided;
 }
 for(const name of ['GH_TOKEN','GITHUB_TOKEN'])if(process.env[name])return process.env[name]!;
 try{return await command('gh',['auth','token','--hostname','github.com'],{cwd:root,timeout:10000});}catch{}
 try{
  const output=await command('git',['credential','fill'],{cwd:root,input:`protocol=https\nhost=github.com\npath=${githubRepository(repository)}.git\n\n`,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_ASKPASS:'/usr/bin/false',GCM_INTERACTIVE:'never'},timeout:10000});
  const password=output.split('\n').find(line=>line.startsWith('password='))?.slice(9);
  if(password)return password;
 }catch{}
 return '';
}

type PagesSite={build_type?:string;html_url?:string;cname?:string|null;source?:{branch:string;path:string}};
export class GitHub {
 constructor(private token:string,private request:typeof fetch=fetch){}
 async api<T=any>(route:string,method='GET',data?:unknown,missing=false):Promise<T> {
  const response=await this.request('https://api.github.com'+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Shelter-Engine','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  if(missing&&response.status===404)return null as T;
  if(!response.ok){
   const messages:Record<number,string>={401:'GitHub не принял токен. Подключите действующий аккаунт.',403:'Недостаточно прав или достигнут лимит GitHub. Для токена нужны Contents, Pages и Administration: Read and write.',404:'Репозиторий не найден или недоступен этому аккаунту.',409:'GitHub не может выполнить операцию в текущем состоянии репозитория.',422:'GitHub отклонил настройки Pages. Проверьте доступность Pages для репозитория и права токена.'};
   throw new Error(messages[response.status]||`GitHub ответил ошибкой ${response.status}. Повторите позже.`);
  }
  return response.status===204?undefined as T:await response.json() as T;
 }
}

/** Pushing gh-pages can enable Pages before our configuration request arrives. */
export async function configurePages(api:GitHub,route:string,sleep=delay):Promise<PagesSite> {
 const desired=(site:PagesSite|null)=>site?.build_type==='legacy'&&site.source?.branch===branch&&site.source.path==='/';
 let current=await api.api<PagesSite|null>(route+'/pages','GET',undefined,true);
 if(!desired(current)){
  try{await api.api(route+'/pages',current?'PUT':'POST',{build_type:'legacy',source:{branch,path:'/'}});}
  catch(error){
   // GitHub may return 409 or 500 even though the branch has already enabled Pages.
   // Only the observed desired configuration allows us to recover from the error.
   for(let attempt=0;attempt<3;attempt++){
    await sleep(2000);
    current=await api.api<PagesSite|null>(route+'/pages','GET',undefined,true).catch(()=>null);
    if(desired(current))return current!;
   }
   throw error;
  }
 }
 return await api.api<PagesSite>(route+'/pages');
}

/** Build-only commit, with a parent when updating. Push is always fast-forward. */
export async function pushBuild(options:{directory:string;remote:string;output:string;projectId:string;name:string;version:string;cname?:string|null;env?:NodeJS.ProcessEnv}):Promise<string> {
 const {directory,remote,output,projectId,name,version,cname,env}=options;
 await fs.mkdir(directory,{recursive:true});
 const git=(args:string[])=>command('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false',...args],{cwd:directory,env});
 await git(['init','--quiet']);
 await git(['remote','add','origin',remote]);
 const existing=await git(['ls-remote','--heads','origin','refs/heads/'+branch]);
 if(existing){
  await git(['fetch','--depth=1','origin','refs/heads/'+branch]);
  await git(['checkout','-B',branch,'FETCH_HEAD']);
  let previous:{projectId?:string};
  try{previous=JSON.parse(await fs.readFile(path.join(directory,marker),'utf8'));}catch{throw new Error('Ветка gh-pages уже содержит другой сайт. Выберите отдельный репозиторий для этой игры.');}
  if(previous.projectId!==projectId)throw new Error('В этом репозитории опубликован другой проект Shelter. Выберите отдельный репозиторий.');
  // Delete only inside the fresh, private staging checkout.
  for(const item of await fs.readdir(directory))if(item!=='.git')await fs.rm(path.join(directory,item),{recursive:true,force:true});
 }else await git(['checkout','--orphan',branch]);
 const files=await filesUnder(output);
 if(!files.has('index.html'))throw new Error('В сборке отсутствует index.html.');
 let total=0;
 for(const [file,bytes] of files){
  if(file.split('/').some(part=>part.startsWith('.'))||file.endsWith('.map'))throw new Error('В публикацию попал служебный файл: '+file);
  if(bytes.length>95*1024*1024)throw new Error('Файл превышает лимит GitHub (95 МБ): '+file);
  total+=bytes.length;
 }
 if(total>900*1024*1024)throw new Error('Сборка слишком велика для GitHub Pages (более 900 МБ).');
 for(const [file,bytes] of files)await atomic(path.join(directory,file),bytes);
 await atomic(path.join(directory,'.nojekyll'),'');
 await atomic(path.join(directory,marker),json({format:'shelter-publication',projectId,name,version,publishedAt:new Date().toISOString()}));
 if(cname)await atomic(path.join(directory,'CNAME'),cname+'\n');
 await git(['add','--all']);
 await git(['-c','user.name=Shelter Engine','-c','user.email=shelter-engine@users.noreply.github.com','commit','--quiet','-m',`Publish ${name} ${version}`]);
 const commit=await git(['rev-parse','HEAD']);
 await git(['push','origin',`HEAD:refs/heads/${branch}`]);
 return commit;
}

export type PublishDependencies={
 credentials:typeof credential;
 github:(token:string)=>GitHub;
 build:typeof startBuild;
 push:typeof pushBuild;
 sleep:typeof delay;
 attempts:number;
};
const defaults:PublishDependencies={credentials:credential,github:token=>new GitHub(token),build:startBuild,push:pushBuild,sleep:delay,attempts:90};

export class Publisher {
 jobs=new Map<string,PublishResult>();
 private active=new Map<string,string>();
 private roots=new Map<string,string>();
 constructor(private root:string,private dependencies:PublishDependencies=defaults){}
 private stateFile(project:string){return path.join(this.root,'.shelter-cache','publishing',createHash('sha256').update(project).digest('hex')+'.json');}
 async info(project:string):Promise<PublishInfo> {
  let saved:{repository?:string;last?:PublishResult}={};
  try{saved=JSON.parse(await fs.readFile(this.stateFile(project),'utf8'));}catch{}
  const latest=[...this.jobs.values()].reverse().find(job=>this.roots.get(job.id)===project);
  let repository=saved.repository||'';
  if(!repository){try{repository=githubRepository(await command('git',['remote','get-url','origin'],{cwd:project}));}catch{try{repository=githubRepository(await command('git',['remote','get-url','origin'],{cwd:this.root}));}catch{}}}
  const connected=!!(await this.dependencies.credentials(this.root,repository||'github/github'));
  return {repository,connected,last:latest||saved.last};
 }
 status(id:string,project:string){const job=this.jobs.get(id);if(!job||this.roots.get(id)!==project)throw new Error('Публикация не найдена.');return job;}
 async start(project:string,snapshot:ProjectSnapshot,input:unknown,provided?:unknown):Promise<PublishResult> {
  const repository=githubRepository(input),key=repository.toLowerCase();
  if(this.active.has(key))throw new Error('Этот репозиторий уже публикуется. Дождитесь завершения.');
  const id=randomUUID();this.active.set(key,id);
  try{
   const token=await this.dependencies.credentials(this.root,repository,provided);
   if(!token)throw new Error('Подключите GitHub: войдите через gh auth login или укажите токен в этом окне.');
   const job:PublishResult={id,status:'running',stage:'Проверка доступа к GitHub',progress:2,log:[],repository,url:githubPagesUrl(repository),settingsUrl:`https://github.com/${repository}/settings/pages`,actionsUrl:`https://github.com/${repository}/actions`};
   this.jobs.set(id,job);this.roots.set(id,project);
   void this.run(project,structuredClone(snapshot),job,token).finally(()=>this.active.delete(key));
   return job;
  }catch(error){this.active.delete(key);throw error;}
 }
 private async run(project:string,snapshot:ProjectSnapshot,job:PublishResult,token:string){
  const {github,build,push,sleep,attempts}=this.dependencies,api=github(token),route='/repos/'+job.repository;
  const step=(stage:string,progress:number)=>{job.stage=stage;job.progress=progress;job.log.push(stage);};
  let staging='';
  try{
   const repository=await api.api<{archived?:boolean;permissions?:{push?:boolean}}>(route);
   if(repository.archived||repository.permissions?.push===false)throw new Error('Нет прав записи в этот репозиторий или он архивирован.');
   const pages=await api.api<PagesSite|null>(route+'/pages','GET',undefined,true);
   step('Сборка сохранённой игры для Web',10);
   // Relative URLs work at project paths, user sites and existing custom domains.
   snapshot.manifest.build.base='./';snapshot.manifest.build.mode='release';
   snapshot.manifest.build.output=path.join(this.root,'artifacts/builds','publish-'+job.id);
   const result=await build(this.root,project,snapshot);
   while(result.status==='running'){job.stage='Сборка: '+result.stage;job.progress=10+Math.round(result.progress*.55);await sleep(300);}
   if(result.status!=='success'||!result.output)throw new Error(result.error||'Не удалось собрать игру.');
   step('Отправка игры в GitHub',70);
   staging=path.join(this.root,'.shelter-cache','publishing','staging-'+job.id);
   // Authentication is passed in the environment, never command arguments or git config files.
   const env=githubGitEnvironment(token);
   job.commit=await push({directory:staging,remote:`https://github.com/${job.repository}.git`,output:result.output,projectId:snapshot.manifest.projectId,name:snapshot.manifest.name,version:snapshot.manifest.gameVersion,cname:pages?.cname,env});
   step('Настройка GitHub Pages',85);
   const configured=await configurePages(api,route,sleep);
   if(configured.html_url&&/^https:\/\//.test(configured.html_url))job.url=configured.html_url;
   step('GitHub Pages развёртывает игру',90);
   // A successful older build must never mark the new publication as ready.
   for(let attempt=0;attempt<attempts;attempt++){
    const latest=await api.api<{commit:string;status:string;error?:{message?:string}}|null>(route+'/pages/builds/latest','GET',undefined,true);
    if(latest?.commit===job.commit){
     if(latest.status==='built'){job.status='success';step('Игра опубликована',100);return;}
     if(latest.status==='errored')throw new Error('GitHub Pages не смог развернуть игру. Откройте журнал GitHub Actions.');
    }
    await sleep(8000);
   }
   job.status='pending';step('Игра отправлена. GitHub Pages ещё обрабатывает публикацию — проверьте GitHub Actions.',95);
  }catch(error){
   job.status='error';job.error=error instanceof Error?error.message:String(error);
   // Do not persist credentials, including accidental messages from a dependency.
   job.error=job.error.split(token).join('[скрыто]').split(Buffer.from('x-access-token:'+token).toString('base64')).join('[скрыто]');
   step(job.commit?'Игра отправлена, но публикация не завершена':'Публикация не выполнена',job.progress);job.log.push(job.error);
  }finally{
   if(staging)await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});
   await locked(this.stateFile(project),()=>atomic(this.stateFile(project),json({repository:job.repository,last:job}))).catch(()=>{});
  }
 }
}
