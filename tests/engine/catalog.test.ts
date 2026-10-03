import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildCatalog,readCatalog,validateCatalog} from '../../scripts/catalog/build.ts';
import {ensureRepository} from '../../scripts/catalog/publish.ts';
import {GitHub} from '../../scripts/engine/publish.ts';
import {template} from '../../scripts/engine/templates.ts';
import {writeProject} from '../../scripts/engine/files.ts';

test('Catalog renders only verified releases, escapes card text and ships no local project paths',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-catalog-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.cp('catalog',path.join(root,'catalog'),{recursive:true});
 const catalog=await readCatalog(root);catalog.games[0].title='<img src=x onerror=alert(1)>';
 catalog.games[1].published=false;delete catalog.games[1].release;
 await fs.writeFile(path.join(root,'catalog/games.json'),JSON.stringify(catalog));
 const built=await buildCatalog(root),html=await fs.readFile(path.join(built.output,'index.html'),'utf8');
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/data-game="perimeter"|games\/lumen|projectId/);assert.match(html,/href="https:\/\/gadaev-sergey.github.io\/lumen\/"/);
 const release=JSON.parse(await fs.readFile(path.join(built.output,'catalog-release.json'),'utf8'));assert.equal(release.games.length,2);assert.ok(!JSON.stringify(release).includes('games/'));
 catalog.games[0].preview='assets/missing.jpg';await fs.writeFile(path.join(root,'catalog/games.json'),JSON.stringify(catalog));
 await assert.rejects(()=>buildCatalog(root),/ENOENT/);assert.equal(await fs.readFile(path.join(built.output,'index.html'),'utf8'),html);
});

test('Catalog rejects duplicate identities, unsafe preview paths, unverified releases and mismatched URLs',async()=>{
 const original=await readCatalog();
 for(const mutate of [
  (value:typeof original)=>value.games.push(structuredClone(value.games[0])),
  (value:typeof original)=>value.games[0].preview='../private.png',
  (value:typeof original)=>value.games[0].url='javascript:alert(1)',
  (value:typeof original)=>value.games[0].release!.commit='unknown',
  (value:typeof original)=>value.games[0].project='../../outside',
 ]){const changed=structuredClone(original);mutate(changed);assert.throws(()=>validateCatalog(changed));}
});

test('Repository setup cannot create in another account or change visibility of a private repository',async()=>{
 let writes=0;
 const github=(login:string,repository:unknown)=>new GitHub('test-token',async(url,init)=>{
  if(init?.method!=='GET')writes++;
  const value=String(url).endsWith('/user')?{login}:repository;
  return new Response(JSON.stringify(value||{}),{status:value?200:404});
 });
 await assert.rejects(()=>ensureRepository(github('different-owner',null),'gadaev-sergey/new-game','Game'),/владельцу/);
 await assert.rejects(()=>ensureRepository(github('gadaev-sergey',{private:true,permissions:{push:true}}),'gadaev-sergey/private-game','Game'),/публичный/);
 assert.equal(writes,0);
});

test('Published usage includes totals and shares but never chat IDs, per-request IDs or private source paths',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-catalog-usage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.cp('catalog',path.join(root,'catalog'),{recursive:true});
 const catalog=await readCatalog(root),game=catalog.games[0],project=path.join(root,game.project),snapshot=template('empty-3d','Usage');snapshot.manifest.projectId=game.projectId;
 await fs.mkdir(project,{recursive:true});await writeProject(project,snapshot);await fs.mkdir(path.join(project,'settings'),{recursive:true});
 const source={threadId:'11111111-1111-4111-8111-111111111111',turnId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 await fs.writeFile(path.join(project,'settings/ai-usage.json'),JSON.stringify({schemaVersion:1,projectId:game.projectId,sources:[source],warnings:[],entries:[{id:'f'.repeat(64),source:source.threadId+':'+source.turnId,model:'model-a',timestamp:'2026-10-01T12:00:00Z',inputTokens:100,cachedInputTokens:80,outputTokens:20,reasoningOutputTokens:5,totalTokens:120}]}));
 const {output}=await buildCatalog(root),html=await fs.readFile(path.join(output,'index.html'),'utf8'),release=await fs.readFile(path.join(output,'catalog-release.json'),'utf8');
 assert.match(html,/model-a/);assert.match(html,/100%/);assert.equal(JSON.parse(release).games[0].usage.totalTokens,120);
 for(const secret of [source.threadId,source.turnId,'f'.repeat(64),'settings/ai-usage',root]){assert.ok(!html.includes(secret));assert.ok(!release.includes(secret));}
});
