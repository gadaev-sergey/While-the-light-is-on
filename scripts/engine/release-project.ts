import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readProject,atomic,json,locked,inside} from './files.ts';
import {startBuild} from './build.ts';
import {Publisher,credential,GitHub,pushBuild} from './publish.ts';
import {syncUsage} from './usage.ts';
import {readCatalog,engineRoot} from '../catalog/build.ts';
import {publishCatalog,ensureRepository} from '../catalog/publish.ts';

export async function releaseProject(projectFolder:string,root=engineRoot){
 const project=path.resolve(root,projectFolder),catalog=await readCatalog(root);
 const entry=catalog.games.find(game=>path.resolve(root,game.project)===project);
 if(!entry)throw new Error('Сначала добавьте карточку игры в catalog/games.json (published: false для новой игры).');
 // Validate preview availability before publishing a game or creating a repository.
 await inside(path.join(root,'catalog'),entry.preview).then(async file=>(await import('node:fs/promises')).access(file));
 const snapshot=await readProject(project);
 if(snapshot.manifest.projectId!==entry.projectId)throw new Error('Карточка ссылается на другой проект.');
 const token=await credential(root,entry.repository);if(!token)throw new Error('Подключите GitHub для выпуска игры.');
 const api=new GitHub(token);
 snapshot.manifest.build.mode='release';snapshot.manifest.build.base='./';snapshot.manifest.build.output=path.join(root,'artifacts/builds',entry.id);
 console.log('Игра: подготовка '+snapshot.manifest.name);
 const build=await startBuild(root,project,snapshot);
 while(build.status==='running')await new Promise(resolve=>setTimeout(resolve,500));
 if(build.status!=='success')throw new Error(build.error||'Сборка не завершена.');
 await ensureRepository(api,entry.repository,snapshot.manifest.name+' — игра на Shelter Engine');
 const publisher=new Publisher(root,{credentials:async()=>token,github:()=>api,build:async()=>build,push:pushBuild,sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts:90});
 const job=await publisher.start(project,snapshot,entry.repository,token);let stage='';
 while(job.status==='running'){if(stage!==job.stage){stage=job.stage;console.log('Игра: '+stage);}await new Promise(resolve=>setTimeout(resolve,1000));}
 if(job.status!=='success')throw new Error(job.error||job.stage);
 console.log('Игра опубликована: '+job.url);
 const registry=path.join(root,'catalog/games.json');
 await locked(registry,async()=>{
  const latest=await readCatalog(root),game=latest.games.find(game=>game.id===entry.id);
  if(!game||game.repository!==entry.repository||game.projectId!==entry.projectId)throw new Error('Карточка изменилась во время выпуска; игра опубликована, каталог нужно обновить отдельно.');
  game.published=true;game.url=job.url;game.release={version:snapshot.manifest.gameVersion,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date()),commit:job.commit!};
  await atomic(registry,json(latest));
 });
 // A failed catalog deployment never turns into a false overall success.
 await syncUsage(root,project);
 await publishCatalog(root);
 return job;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Укажите папку игры: npm run release:game -- games/lumen');
 await releaseProject(process.argv[2]);
}
