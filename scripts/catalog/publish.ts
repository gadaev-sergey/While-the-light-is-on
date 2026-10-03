import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {credential,GitHub,pushBuild,configurePages,githubGitEnvironment} from '../engine/publish.ts';
import {atomic,json,locked} from '../engine/files.ts';
import {githubRepository,githubPagesUrl} from '../../src/engine/publishing.ts';
import {buildCatalog,engineRoot} from './build.ts';

export async function ensureRepository(api:GitHub,repository:string,description:string){
 const valid=githubRepository(repository),owner=valid.split('/')[0];
 const user=await api.api<{login:string}>('/user');
 if(user.login.toLowerCase()!==owner.toLowerCase())throw new Error('Подключённый GitHub не соответствует владельцу репозитория.');
 let repo=await api.api<{full_name:string;private:boolean;archived:boolean;permissions?:{push?:boolean}}>('/repos/'+valid,'GET',undefined,true);
 if(!repo)repo=await api.api('/user/repos','POST',{name:valid.split('/')[1],description,homepage:githubPagesUrl(valid),private:false,auto_init:true});
 if(repo.archived||repo.private||!repo.permissions?.push)throw new Error('Нужен доступ на запись в активный публичный репозиторий.');
 return repo;
}

export async function publishCatalog(root=engineRoot){
 return locked('catalog-publish:'+root,async()=>{
  // Render and validate all public files before touching the remote repository.
  const {output,revision,catalog}=await buildCatalog(root),token=await credential(root,catalog.repository);
  if(!token)throw new Error('Подключите GitHub через Git credentials, gh auth login или GH_TOKEN.');
  const api=new GitHub(token),route='/repos/'+catalog.repository;
  const staging=path.join(root,'.shelter-cache/publishing','catalog-'+randomUUID());
  let commit:string|undefined;
  try{
   await ensureRepository(api,catalog.repository,'Shelter Arcade — коллекция игр и прототипов на Shelter Engine');
   const pages=await api.api<{cname?:string|null}>(route+'/pages','GET',undefined,true);
   console.log('Каталог: отправка готовой страницы в '+catalog.repository);
   commit=await pushBuild({directory:staging,remote:`https://github.com/${catalog.repository}.git`,output,projectId:'shelter-arcade-catalog',name:'Shelter Arcade',version:revision,cname:pages?.cname,env:githubGitEnvironment(token)});
   const configured=await configurePages(api,route),url=configured.html_url||catalog.url;
   console.log('Каталог: GitHub Pages развёртывает '+commit);
   for(let attempt=0;attempt<90;attempt++){
    const latest=await api.api<{commit:string;status:string}|null>(route+'/pages/builds/latest','GET',undefined,true);
    if(latest?.commit===commit&&latest.status==='built'){
     const result={status:'success',url,repository:catalog.repository,commit,revision,publishedAt:new Date().toISOString()};
     await atomic(path.join(root,'.shelter-cache/catalog-publication.json'),json(result));
     console.log(JSON.stringify(result));return result;
    }
    if(latest?.commit===commit&&latest.status==='errored')throw new Error('Сборка каталога в GitHub Pages завершилась ошибкой.');
    await new Promise(resolve=>setTimeout(resolve,8000));
   }
   throw new Error('Каталог отправлен, но GitHub Pages ещё не подтвердил развёртывание. Проверьте GitHub Actions.');
  }catch(error){
   const message=(error instanceof Error?error.message:String(error)).split(token).join('[скрыто]');
   await atomic(path.join(root,'.shelter-cache/catalog-publication.json'),json({status:commit?'pending':'error',commit,revision,url:catalog.url,repository:catalog.repository,error:message}));
   throw new Error(message);
  }finally{await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await publishCatalog();
