import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanUsage,scanClaudeUsage,bindUsage,syncUsage,readUsage} from '../../scripts/engine/usage.ts';
import {summarizeUsage,type UsageLedger} from '../../src/engine/usage.ts';
import {template} from '../../scripts/engine/templates.ts';
import {writeProject} from '../../scripts/engine/files.ts';

const thread='11111111-1111-4111-8111-111111111111',turnA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',turnB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row=(type:string,payload:unknown)=>JSON.stringify({type,timestamp:'2026-10-01T12:00:00.000Z',payload})+'\n';
const usage=(response:string,turn=turnA,input=100,output=20)=>row('token_usage_record',{thread_id:thread,turn_id:turn,response_id:response,usage:{input_tokens:input,cached_input_tokens:80,output_tokens:output,reasoning_output_tokens:5,total_tokens:input+output}});
const header=row('session_meta',{id:thread})+row('turn_context',{turn_id:turnA,model:'model-a'});

test('Usage counts each response once, separates models and ignores cumulative counters, inherited history and prompts',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-usage-parser-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'log.jsonl');
 await fs.writeFile(file,header+row('response_item',{role:'user',content:[{text:'private prompt'}]})+usage('r1')+usage('r1')+row('event_msg',{type:'token_count',info:{total_token_usage:{total_tokens:999999}}})+row('turn_context',{turn_id:turnB,model:'model-b'})+usage('r2',turnB,200,30)+usage('inherited').replace(thread,'22222222-2222-4222-8222-222222222222')+'{"partial":');
 const scan=await scanUsage(file);assert.equal(scan.entries.length,2);assert.deepEqual(scan.entries.map(e=>e.model),['model-a','model-b']);assert.equal(scan.currentTurn,turnB);
 const summary=summarizeUsage({schemaVersion:1,projectId:'p',sources:[{threadId:thread,turnId:turnA},{threadId:thread,turnId:turnB}],entries:scan.entries,warnings:[]});
 assert.equal(summary.totalTokens,350);assert.equal(summary.cachedInputTokens,160);assert.equal(summary.reasoningOutputTokens,10);assert.equal(summary.models.reduce((n,m)=>n+m.percent,0),100);assert.equal(summary.models[0].percent,65.7);
 assert.doesNotMatch(JSON.stringify(scan.entries),/private prompt|r1|r2/);
});

test('Bound turns synchronize idempotently, count late records, retain offline data and reject a second game',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-usage-sync-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const home=path.join(root,'codex'),logs=path.join(home,'sessions/2026/10/01');await fs.mkdir(logs,{recursive:true});const file=path.join(logs,'rollout-'+thread+'.jsonl');
 await fs.writeFile(file,header+usage('r1')+row('turn_context',{turn_id:turnB,model:'model-b'})+usage('r2',turnB));
 const game=path.join(root,'game'),other=path.join(root,'other');await fs.mkdir(game);await fs.mkdir(other);
 await writeProject(game,template('empty-3d','Test'));await writeProject(other,template('empty-3d','Other'));
 await bindUsage(root,game,thread,turnA,home);await bindUsage(root,game,thread,turnA,home);
 let result=await syncUsage(root,game,home);assert.equal(result.summary.totalTokens,120);assert.equal(result.sources.length,1);
 await syncUsage(root,game,home);assert.equal((await readUsage(game)).entries.length,1);
 await assert.rejects(()=>bindUsage(root,other,thread,turnA,home),/другой игре/);
 await fs.appendFile(file,usage('r3'));result=await syncUsage(root,game,home);assert.equal(result.summary.totalTokens,240);assert.equal(result.summary.models.length,1);
 await fs.rm(file);result=await syncUsage(root,game,home);assert.equal(result.summary.totalTokens,240);assert.match(result.warnings[0],/недоступен/);
 assert.equal((await syncUsage(root,other,home)).summary.status,'unavailable');
 await assert.rejects(()=>bindUsage(root,other,'../../auth.json',undefined,home),/корректный ID/);
});

test('Missing model remains unknown and percentage rounding is exactly 100%; malformed counters are excluded',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-usage-validation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'log.jsonl');
 await fs.writeFile(file,row('session_meta',{id:thread})+usage('r1')+usage('bad',turnB,-100));const scan=await scanUsage(file);assert.equal(scan.entries.length,1);assert.equal(scan.entries[0].model,'unknown');assert.ok(scan.warnings.length);
 const ledger:UsageLedger={schemaVersion:1,projectId:'p',sources:[],entries:[0,1,2].map(n=>({...scan.entries[0],id:String(n),model:'model-'+n})),warnings:[]};
 assert.deepEqual(summarizeUsage(ledger).models.map(m=>m.percent),[33.4,33.3,33.3]);
});

test('Agent usage belongs to the originating session even when mirrored in its parent journal',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-usage-agent-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const child='33333333-3333-4333-8333-333333333333',record=JSON.parse(usage('agent'));record.payload.session_id=child;
 const parentFile=path.join(root,'parent.jsonl'),childFile=path.join(root,'child.jsonl');
 await fs.writeFile(parentFile,header+JSON.stringify(record)+'\n');await fs.writeFile(childFile,row('session_meta',{id:child})+row('turn_context',{turn_id:turnA,model:'child-model'})+JSON.stringify(record)+'\n');
 assert.equal((await scanUsage(parentFile)).entries.length,0);const entries=(await scanUsage(childFile)).entries;assert.equal(entries.length,1);assert.equal(entries[0].model,'child-model');assert.equal(entries[0].source,child+':'+turnA);
});

test('Claude Code transcripts count each API message once per prompt turn, with cache inside input',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shelter-usage-claude-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const session='22222222-2222-4222-8222-222222222222',p1='cccccccc-cccc-4ccc-8ccc-cccccccccccc',p2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const user=(promptId:string,text:string)=>JSON.stringify({type:'user',sessionId:session,promptId,timestamp:'2026-10-02T08:00:00.000Z',message:{role:'user',content:text}})+'\n';
 const reply=(id:string,model='claude-test',over:Record<string,unknown>={})=>JSON.stringify({type:'assistant',sessionId:session,timestamp:'2026-10-02T08:00:01.000Z',message:{id,model,content:[{type:'text',text:'secret answer'}],usage:{input_tokens:10,cache_creation_input_tokens:30,cache_read_input_tokens:60,output_tokens:20,output_tokens_details:{thinking_tokens:5},...over}}})+'\n';
 const home=path.join(root,'claude'),dir=path.join(home,'projects/-tmp-game');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,session+'.jsonl');
 await fs.writeFile(file,user(p1,'private prompt')+reply('m1')+reply('m1')+reply('m2')+reply('x','<synthetic>')+user(p2,'second')+reply('m3','claude-other',{output_tokens:-1})+reply('m4','claude-other'));
 const scan=await scanClaudeUsage(file);assert.equal(scan.threadId,session);assert.equal(scan.currentTurn,p2);assert.equal(scan.entries.length,3);
 assert.deepEqual(scan.entries.map(e=>[e.inputTokens,e.cachedInputTokens,e.outputTokens,e.reasoningOutputTokens,e.totalTokens]),[[100,60,20,5,120],[100,60,20,5,120],[100,60,20,5,120]]);
 assert.match(scan.warnings[0],/неподдерживаемую/);assert.doesNotMatch(JSON.stringify(scan.entries),/private prompt|secret answer|m1|m2/);
 const game=path.join(root,'game');await fs.mkdir(game);await writeProject(game,template('empty-3d','Test'));
 await bindUsage(root,game,session,p1,{claude:home},'claude');let result=await syncUsage(root,game,{claude:home});
 assert.equal(result.summary.totalTokens,240);assert.equal(result.summary.models[0].model,'claude-test');assert.equal((await readUsage(game)).sources[0].agent,'claude');
 await bindUsage(root,game,session,undefined,{claude:home},'claude');result=await syncUsage(root,game,{claude:home});assert.equal(result.summary.totalTokens,360);assert.equal(result.summary.turns,2);
 await assert.rejects(()=>bindUsage(root,game,session,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',{claude:home},'claude'),/отсутствует/);
});
