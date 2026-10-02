import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {atomic,inside,json,readProject} from './files.ts';
import {summarizeUsage,type TokenUsage,type UsageLedger,type UsageSource,type UsageEntry} from '../../src/engine/usage.ts';

const ledgerPath='settings/ai-usage.json';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sourceKey=(s:UsageSource)=>s.threadId+':'+s.turnId;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const modelName=(s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,100}$/.test(s)?s:'unknown';
function tokens(raw:any):TokenUsage|undefined {
 if(!raw)return;
 const u={inputTokens:raw.input_tokens,cachedInputTokens:raw.cached_input_tokens??0,outputTokens:raw.output_tokens,reasoningOutputTokens:raw.reasoning_output_tokens??0,totalTokens:raw.total_tokens};
 if(!Object.values(u).every(n=>Number.isSafeInteger(n)&&n>=0)||u.totalTokens!==u.inputTokens+u.outputTokens||u.cachedInputTokens>u.inputTokens||u.reasoningOutputTokens>u.outputTokens)return;
 return u;
}
export interface UsageScan {threadId:string;currentTurn?:string;turns:Set<string>;entries:UsageEntry[];warnings:string[]}
/** Only metadata is retained; prompts, tools, credentials and reasoning are discarded. */
export async function scanUsage(file:string):Promise<UsageScan> {
 const result:UsageScan={threadId:'',turns:new Set(),entries:[],warnings:[]};
 const models=new Map<string,string>(),pending:{payload:any;timestamp:string;model?:string}[]=[];
 let model:string|undefined;
 for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){
  let record:any;try{record=JSON.parse(line);}catch{continue;} // Active files may end in a partial write.
  const p=record.payload;
  if(!p)continue;
  if(record.type==='session_meta')result.threadId=p.id;
  if(record.type==='turn_context'&&uuid.test(p.turn_id)){result.currentTurn=p.turn_id;result.turns.add(p.turn_id);model=modelName(p.model);models.set(p.turn_id,model);}
  if(record.type==='event_msg'&&p.type==='model_rerouted')model=modelName(p.to_model??p.toModel);
  if(record.type==='token_usage_record')pending.push({payload:p,timestamp:record.timestamp,model:result.currentTurn===p.turn_id?model:undefined});
 }
 const seen=new Set<string>();
 for(const {payload:p,timestamp,model:atRecord} of pending){
  // Forked history and mirrored child records must be counted in their own source, once.
  const origin=p.session_id||p.thread_id;
  if(origin!==result.threadId)continue;
  const usage=tokens(p.usage);
  if(!usage||!uuid.test(p.turn_id)||typeof p.response_id!=='string'||!Number.isFinite(Date.parse(timestamp))){result.warnings.push('Журнал содержит неподдерживаемую запись расхода.');continue;}
  const id=hash(origin+':'+p.response_id);if(seen.has(id))continue;seen.add(id);
  result.turns.add(p.turn_id);
  result.entries.push({id,source:sourceKey({threadId:origin,turnId:p.turn_id}),model:modelName(p.model??atRecord??models.get(p.turn_id)),timestamp,...usage});
 }
 if(!pending.length)result.warnings.push('В журнале нет отдельных записей token_usage_record; расход не оценивался по длине текста.');
 result.warnings=[...new Set(result.warnings)];return result;
}
/**
 * Журнал Claude Code: строки assistant несут usage каждого ответа API, один ответ
 * повторяется на каждый блок содержимого с одинаковыми счётчиками. Ход — promptId
 * последней пользовательской записи. Вход = новые + записанные в кэш + прочитанные
 * из кэша токены; кэшем считается чтение из кэша, рассуждения — подмножество выхода.
 */
export async function scanClaudeUsage(file:string):Promise<UsageScan> {
 const result:UsageScan={threadId:'',turns:new Set(),entries:[],warnings:[]};const seen=new Set<string>();
 for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){
  let record:any;try{record=JSON.parse(line);}catch{continue;}
  if(!result.threadId&&uuid.test(record.sessionId))result.threadId=record.sessionId;
  if(record.type==='user'&&uuid.test(record.promptId)&&record.sessionId===result.threadId){result.currentTurn=record.promptId;result.turns.add(record.promptId);}
  if(record.type!=='assistant'||record.sessionId!==result.threadId)continue;
  const m=record.message,raw=m?.usage;if(!raw||m.model==='<synthetic>')continue;
  if(typeof m.id!=='string'||!result.currentTurn||!Number.isFinite(Date.parse(record.timestamp))){result.warnings.push('Журнал содержит неподдерживаемую запись расхода.');continue;}
  const id=hash(result.threadId+':'+m.id);if(seen.has(id))continue;
  const fresh=raw.input_tokens,written=raw.cache_creation_input_tokens??0,read=raw.cache_read_input_tokens??0,output=raw.output_tokens,thinking=raw.output_tokens_details?.thinking_tokens??0;
  const usage=[fresh,written,read,output,thinking].every(n=>Number.isSafeInteger(n)&&n>=0)?tokens({input_tokens:fresh+written+read,cached_input_tokens:read,output_tokens:output,reasoning_output_tokens:Math.min(thinking,output),total_tokens:fresh+written+read+output}):undefined;
  if(!usage){result.warnings.push('Журнал содержит неподдерживаемую запись расхода.');continue;}
  seen.add(id);result.entries.push({id,source:sourceKey({threadId:result.threadId,turnId:result.currentTurn}),model:modelName(m.model),timestamp:record.timestamp,...usage});
 }
 if(!result.entries.length)result.warnings.push('В журнале Claude Code нет записей расхода; расход не оценивался по длине текста.');
 result.warnings=[...new Set(result.warnings)];return result;
}
export async function findClaudeUsageLog(sessionId:string,claudeHome=process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude')){
 if(!uuid.test(sessionId))throw new Error('Нужен корректный ID сеанса Claude Code.');
 const projects=path.join(claudeHome,'projects');let list:import('node:fs').Dirent[];
 try{list=await fs.readdir(projects,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;list=[];}
 for(const item of list){if(!item.isDirectory())continue;const file=path.join(projects,item.name,sessionId+'.jsonl');try{if((await fs.lstat(file)).isFile())return file;}catch{}}
 throw new Error('Журнал выбранного сеанса Claude Code не найден на этом компьютере.');
}
export interface UsageHomes {codex?:string;claude?:string}
const homesOf=(homes?:string|UsageHomes):UsageHomes=>typeof homes==='string'?{codex:homes}:homes||{};
async function scanSource(threadId:string,agent:'codex'|'claude'|undefined,homes:UsageHomes){
 return agent==='claude'?scanClaudeUsage(await findClaudeUsageLog(threadId,homes.claude)):scanUsage(await findUsageLog(threadId,homes.codex));
}
export async function findUsageLog(threadId:string,codexHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex')) {
 if(!uuid.test(threadId))throw new Error('Нужен корректный ID чата Codex.');
 async function walk(dir:string):Promise<string|undefined>{
  let list;try{list=await fs.readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
  for(const item of list){if(item.isSymbolicLink())continue;const file=path.join(dir,item.name);if(item.isFile()&&item.name.endsWith('-'+threadId+'.jsonl'))return file;if(item.isDirectory()){const found=await walk(file);if(found)return found;}}
 }
 for(const folder of ['sessions','archived_sessions']){const file=await walk(path.join(codexHome,folder));if(file)return file;}
 throw new Error('Журнал выбранного чата Codex не найден на этом компьютере.');
}
export async function readUsage(project:string):Promise<UsageLedger>{
 const {manifest}=await readProject(project);let ledger:UsageLedger;
 try{ledger=JSON.parse(await fs.readFile(await inside(project,ledgerPath),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return {schemaVersion:1,projectId:manifest.projectId,sources:[],entries:[],warnings:[]};}
 if(ledger.schemaVersion!==1||ledger.projectId!==manifest.projectId||!Array.isArray(ledger.sources)||!Array.isArray(ledger.entries)||!Array.isArray(ledger.warnings))throw new Error('Журнал расхода не соответствует проекту.');
 const sources=new Set<string>(),ids=new Set<string>();
 for(const s of ledger.sources){if(!uuid.test(s.threadId)||!uuid.test(s.turnId)||s.agent!==undefined&&s.agent!=='codex'&&s.agent!=='claude'||sources.has(sourceKey(s)))throw new Error('Некорректная привязка расхода.');sources.add(sourceKey(s));}
 for(const e of ledger.entries){if(!/^[a-f0-9]{64}$/.test(e.id)||ids.has(e.id)||!sources.has(e.source)||modelName(e.model)!==e.model||!Number.isFinite(Date.parse(e.timestamp))||!tokens({input_tokens:e.inputTokens,cached_input_tokens:e.cachedInputTokens,output_tokens:e.outputTokens,reasoning_output_tokens:e.reasoningOutputTokens,total_tokens:e.totalTokens}))throw new Error('Некорректная запись расхода токенов.');ids.add(e.id);}
 return ledger;
}
// A filesystem lock also serializes CLI, editor and separately running agents.
async function withUsageLock<T>(root:string,fn:()=>Promise<T>):Promise<T>{
 const lock=path.join(root,'.shelter-cache/usage.lock');await fs.mkdir(path.dirname(lock),{recursive:true});
 for(let n=0;;n++){try{await fs.mkdir(lock);break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(n>=100)throw new Error('Учёт токенов занят другим процессом. Повторите синхронизацию.');await new Promise(r=>setTimeout(r,100));}}
 try{return await fn();}finally{await fs.rmdir(lock);}
}
export async function bindUsage(root:string,project:string,threadId:string,turnId?:string,homes?:string|UsageHomes,agent:'codex'|'claude'='codex'){
 const scan=await scanSource(threadId,agent,homesOf(homes));
 const turn=turnId||scan.currentTurn;if(scan.threadId!==threadId||!turn||!scan.turns.has(turn))throw new Error('Указанный этап работы отсутствует в журнале чата.');
 return withUsageLock(root,async()=>{
  const ledger=await readUsage(project),source:UsageSource=agent==='claude'?{threadId,turnId:turn,agent}:{threadId,turnId:turn},key=sourceKey(source);
  const registry=path.join(root,'.shelter-cache/usage-bindings.json');let bindings:Record<string,string>={};
  try{bindings=JSON.parse(await fs.readFile(registry,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(bindings[key]&&bindings[key]!==ledger.projectId)throw new Error('Этот этап уже отнесён к другой игре. Начните отдельный этап для нового проекта.');
  bindings[key]=ledger.projectId;await atomic(registry,json(bindings));
  if(!ledger.sources.some(s=>sourceKey(s)===key)){ledger.sources.push(source);await atomic(await inside(project,ledgerPath),json(ledger));}
  return source;
 });
}
export async function syncUsage(root:string,project:string,homes?:string|UsageHomes){
 return withUsageLock(root,async()=>{
  const ledger=await readUsage(project),entries=new Map(ledger.entries.map(e=>[e.id,e])),warnings:string[]=[];
  const scans=new Map<string,UsageScan>(),home=homesOf(homes);
  for(const source of ledger.sources){
   try{let scan=scans.get(source.threadId);if(!scan){scan=await scanSource(source.threadId,source.agent,home);scans.set(source.threadId,scan);}if(scan.threadId!==source.threadId)throw new Error('Идентичность журнала изменилась.');
    warnings.push(...scan.warnings);for(const entry of scan.entries)if(entry.source===sourceKey(source))entries.set(entry.id,entry);
   }catch{warnings.push('Один из журналов недоступен; ранее учтённые токены сохранены.');}
  }
  ledger.entries=[...entries.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));ledger.warnings=[...new Set(warnings)];
  ledger.updatedAt=ledger.entries.at(-1)?.timestamp;
  if(ledger.sources.length)await atomic(await inside(project,ledgerPath),json(ledger));
  return {summary:summarizeUsage(ledger),warnings:ledger.warnings,sources:ledger.sources};
 });
}
