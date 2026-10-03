import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Publisher,GitHub,command,pushBuild,configurePages,type PublishDependencies} from '../../scripts/engine/publish.ts';
import {githubRepository,githubPagesUrl,type PublishResult} from '../../src/engine/publishing.ts';
import {template} from '../../scripts/engine/templates.ts';
import type {BuildResult} from '../../src/engine/project.ts';

test('GitHub destinations accept HTTPS and SSH remotes and reject credentials, hosts and unsafe paths',()=>{
 for(const input of ['User/My-game','https://github.com/User/My-game.git','git@github.com:User/My-game.git','https://github.com/User/My-game/'])assert.equal(githubRepository(input),'User/My-game');
 assert.equal(githubPagesUrl('User/My-game'),'https://user.github.io/My-game/');
 assert.equal(githubPagesUrl('User/USER.github.io'),'https://user.github.io/');
 for(const input of ['https://evil.test/user/repo','https://github.com.evil.test/u/r','https://secret@github.com/u/r','u/r/../../x','u/r?token=secret','u/..','-bad/repo','u/r\n--force',null])assert.throws(()=>githubRepository(input));
});

test('Publishing pushes only the release, preserves main and history, removes stale assets and refuses another project',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-publish-git-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const remote=path.join(root,'remote.git'),source=path.join(root,'source'),output=path.join(root,'release');
 await command('git',['init','--bare',remote]);await fs.mkdir(source);await command('git',['init','-b','main'],{cwd:source});
 await fs.writeFile(path.join(source,'private-source.ts'),'not for publication');
 await command('git',['add','.'],{cwd:source});await command('git',['-c','user.name=Test','-c','user.email=test@example.com','-c','commit.gpgSign=false','commit','-m','Source'],{cwd:source});
 await command('git',['push',remote,'main'],{cwd:source});
 const original=await command('git',['--git-dir',remote,'rev-parse','main']);
 await fs.mkdir(path.join(output,'assets'),{recursive:true});await fs.writeFile(path.join(output,'index.html'),'<script src="./assets/game.js"></script>');await fs.writeFile(path.join(output,'assets/game.js'),'game');await fs.writeFile(path.join(output,'assets/obsolete.js'),'old');
 const options={remote,output,projectId:'test-game',name:'Test game',version:'1.0',directory:path.join(root,'first')};
 const first=await pushBuild(options);
 assert.equal(await command('git',['--git-dir',remote,'rev-parse','main']),original);
 assert.equal(await command('git',['--git-dir',remote,'rev-parse','gh-pages']),first);
 const files=(await command('git',['--git-dir',remote,'ls-tree','--name-only','-r','gh-pages'])).split('\n');
 assert.deepEqual(files,['.nojekyll','.shelter-publish.json','assets/game.js','assets/obsolete.js','index.html']);
 await fs.rm(path.join(output,'assets/obsolete.js'));await fs.writeFile(path.join(output,'assets/game.js'),'new');
 const second=await pushBuild({...options,directory:path.join(root,'second'),version:'1.1',cname:'play.example.com'});
 assert.equal(await command('git',['--git-dir',remote,'rev-parse','gh-pages^']),first);
 assert.equal(await command('git',['--git-dir',remote,'show','gh-pages:CNAME']),'play.example.com');
 assert.equal(await command('git',['--git-dir',remote,'show','gh-pages:assets/game.js']),'new');
 await assert.rejects(()=>command('git',['--git-dir',remote,'show','gh-pages:assets/obsolete.js']));
 await assert.rejects(()=>pushBuild({...options,projectId:'another-game',directory:path.join(root,'other')}),/другой проект/);
 assert.equal(await command('git',['--git-dir',remote,'rev-parse','gh-pages']),second);
 await fs.writeFile(path.join(output,'assets/game.js.map'),'source code');
 await assert.rejects(()=>pushBuild({...options,directory:path.join(root,'sourcemap')}),/служебный файл/);
 assert.equal(await command('git',['--git-dir',remote,'rev-parse','gh-pages']),second);
});

test('An existing gh-pages branch without a Shelter marker is never overwritten',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-publish-existing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const remote=path.join(root,'remote.git'),source=path.join(root,'source');await command('git',['init','--bare',remote]);await fs.mkdir(source);await command('git',['init','-b','gh-pages'],{cwd:source});
 await fs.writeFile(path.join(source,'index.html'),'existing website');await command('git',['add','.'],{cwd:source});await command('git',['-c','user.name=Test','-c','user.email=test@example.com','-c','commit.gpgSign=false','commit','-m','Existing site'],{cwd:source});await command('git',['push',remote,'gh-pages'],{cwd:source});
 await assert.rejects(()=>pushBuild({directory:path.join(root,'publish'),remote,output:source,projectId:'new',name:'New',version:'1'}),/другой сайт/);
 assert.equal(await command('git',['--git-dir',remote,'show','gh-pages:index.html']),'existing website');
});

async function finish(job:PublishResult){for(let i=0;i<500&&job.status==='running';i++)await new Promise(resolve=>setTimeout(resolve,2));assert.notEqual(job.status,'running','publication did not settle');}
function fakeDependencies(overrides:Partial<PublishDependencies>={}):PublishDependencies {
 return {
  credentials:async()=> 'test-secret-token',
  github:token=>new GitHub(token,async()=>new Response('{}')),
  build:async()=>({id:'build',status:'success',stage:'Готово',progress:100,log:[],output:'/unused/release'}),
  push:async()=> 'new-commit',sleep:async()=>{},attempts:3,...overrides,
 };
}

test('Publisher uses a release snapshot, enables Pages and waits for this exact commit, without saving credentials',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-publish-state-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const requests:{route:string;method:string;body:any}[]=[];let polls=0,buildBase='',buildMode='',configured=false;
 const deps=fakeDependencies({
  github:token=>new GitHub(token,async(input,init)=>{
   const route=String(input).replace('https://api.github.com',''),method=init?.method||'GET';requests.push({route,method,body:init?.body?JSON.parse(String(init.body)):undefined});
   assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-secret-token');
   let value:unknown={permissions:{push:true}};
   if(route.endsWith('/pages')){if(method==='GET'&&!configured)return new Response('{}',{status:404});if(method==='POST')configured=true;value={html_url:'https://play.example.com/',build_type:'legacy',source:{branch:'gh-pages',path:'/'}};}
   if(route.endsWith('/builds/latest'))value=++polls===1?{commit:'older-commit',status:'built'}:{commit:'new-commit',status:'built'};
   return new Response(JSON.stringify(value),{status:method==='POST'?201:200});
  }),
  build:async(_engine,_project,snapshot)=>{buildBase=snapshot.manifest.build.base;buildMode=snapshot.manifest.build.mode;return {id:'b',status:'success',stage:'',progress:100,log:[],output:path.join(root,'release')};},
 });
 const p=new Publisher(root,deps),snapshot=template('Publish','empty-3d');snapshot.manifest.build.base='/old/';snapshot.manifest.build.mode='development';
 const job=await p.start(root,snapshot,'owner/game');await finish(job);
 assert.equal(job.status,'success',job.error);assert.equal(polls,2);assert.equal(job.url,'https://play.example.com/');assert.equal(buildBase,'./');assert.equal(buildMode,'release');
 assert.equal(snapshot.manifest.build.base,'/old/');assert.equal(snapshot.manifest.build.mode,'development');
 assert.deepEqual(requests.find(r=>r.method==='POST')?.body,{build_type:'legacy',source:{branch:'gh-pages',path:'/'}});
 for(let i=0;i<100;i++){try{const info=await new Publisher(root,deps).info(root);if(info.last){assert.equal(info.last.commit,'new-commit');assert.ok(!JSON.stringify(info).includes('test-secret-token'));return;}}catch{}await new Promise(resolve=>setTimeout(resolve,5));}
 assert.fail('Publication state not persisted');
});

test('Build errors never push or change Pages; GitHub errors and credentials are not exposed',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-publish-failure-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let pushed=false;
 const p=new Publisher(root,fakeDependencies({build:async()=>({id:'b',status:'error',stage:'Error',progress:20,log:[],error:'bad code test-secret-token'}),push:async()=>{pushed=true;return 'bad';}}));
 const job=await p.start(root,template('Broken','empty-3d'),'owner/game');await finish(job);assert.equal(job.status,'error');assert.equal(pushed,false);assert.match(job.error!,/bad code/);assert.ok(!JSON.stringify(job).includes('test-secret-token'));
 const api=new GitHub('test-secret-token',async()=>new Response(JSON.stringify({message:'server test-secret-token'}),{status:401}));await assert.rejects(()=>api.api('/user'),error=>error instanceof Error&&!error.message.includes('test-secret-token')&&/токен/.test(error.message));
});

test('Concurrent and unauthenticated publications are rejected; timeout stays pending and access is session scoped',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-publish-pending-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),snapshot=template('Game','empty-3d');
 const p=new Publisher(root,fakeDependencies({build:async()=>{await gate;return {id:'b',status:'success',stage:'',progress:100,log:[],output:'/unused'};}}));
 const job=await p.start(root,snapshot,'Owner/game');await assert.rejects(()=>p.start(root,snapshot,'owner/game'),/уже публикуется/);
 assert.throws(()=>p.status(job.id,'other-project'),/не найдена/);assert.equal(p.status(job.id,root),job);
 release();await finish(job);assert.equal(job.status,'pending');assert.equal(job.commit,'new-commit');
 const disconnected=new Publisher(root,fakeDependencies({credentials:async()=>''}));await assert.rejects(()=>disconnected.start(root,snapshot,'owner/game'),/Подключите GitHub/);
});

test('A Pages failure after upload keeps the commit and diagnostic links; an old deployment cannot succeed',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-publish-pages-error-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const failure of ['configure','deploy']){
  const p=new Publisher(root,fakeDependencies({github:token=>new GitHub(token,async(input,init)=>{
   const route=String(input);
   if(init?.method==='PUT'&&failure==='configure')return new Response('{}',{status:403});
   if(init?.method==='PUT')return new Response(null,{status:204});
   return new Response(JSON.stringify(route.endsWith('/builds/latest')?{commit:'new-commit',status:'errored'}:{}));
  })}));
  const job=await p.start(root,template('Game','empty-3d'),'owner/game');await finish(job);assert.equal(job.status,'error');assert.equal(job.commit,'new-commit');assert.match(job.settingsUrl,/settings\/pages$/);assert.match(job.stage,/отправлена/);
 }
});

test('Pages enabled by the push is reused; conflicting and ambiguous create responses are verified before recovery',async()=>{
 const site={build_type:'legacy',source:{branch:'gh-pages',path:'/'},html_url:'https://owner.github.io/game/'};
 let writes=0;
 const existing=new GitHub('token',async(_url,init)=>{if(init?.method!=='GET')writes++;return new Response(JSON.stringify(site));});
 assert.deepEqual(await configurePages(existing,'/repos/owner/game',async()=>{}),site);assert.equal(writes,0);
 for(const code of [409,500]){
  let created=false;
  const racing=new GitHub('token',async(_url,init)=>{
   if(init?.method==='POST'){created=true;return new Response('{}',{status:code});}
   return new Response(JSON.stringify(created?site:{}),{status:created?200:404});
  });
  assert.deepEqual(await configurePages(racing,'/repos/owner/game',async()=>{}),site);
 }
 const failed=new GitHub('token',async(_url,init)=>new Response('{}',{status:init?.method==='POST'?500:404}));
 await assert.rejects(()=>configurePages(failed,'/repos/owner/game',async()=>{}),/500/);
});
