/** Token usage is input + output. Cache and reasoning are subsets, never added twice. */
export interface TokenUsage {inputTokens:number;cachedInputTokens:number;outputTokens:number;reasoningOutputTokens:number;totalTokens:number}
export interface UsageEntry extends TokenUsage {id:string;source:string;model:string;timestamp:string}
/** agent: журнал Codex (по умолчанию) или Claude Code; turnId — ход внутри этого чата. */
export interface UsageSource {threadId:string;turnId:string;agent?:'codex'|'claude'}
export interface UsageLedger {schemaVersion:1;projectId:string;sources:UsageSource[];entries:UsageEntry[];updatedAt?:string;warnings:string[]}
export interface UsageSummary extends TokenUsage {
 status:'recorded'|'unavailable';updatedAt?:string;requests:number;turns:number;
 models:(TokenUsage&{model:string;percent:number})[];
}
export const emptyTokens=():TokenUsage=>({inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningOutputTokens:0,totalTokens:0});
export function summarizeUsage(ledger:UsageLedger):UsageSummary {
 const totals=emptyTokens(),models=new Map<string,TokenUsage>();
 for(const entry of ledger.entries){const model=models.get(entry.model)||emptyTokens();for(const key of Object.keys(totals) as (keyof TokenUsage)[]){totals[key]+=entry[key];model[key]+=entry[key];}models.set(entry.model,model);}
 const rows=[...models].map(([model,usage])=>({model,...usage,percent:0})).sort((a,b)=>b.totalTokens-a.totalTokens||a.model.localeCompare(b.model));
 // Largest remainder in tenths: displayed shares sum to exactly 100.0%.
 if(totals.totalTokens){const shares=rows.map((row,index)=>({index,exact:row.totalTokens/totals.totalTokens*1000}));let remaining=1000;for(const s of shares){rows[s.index].percent=Math.floor(s.exact)/10;remaining-=Math.floor(s.exact);}shares.sort((a,b)=>(b.exact%1)-(a.exact%1)||a.index-b.index);for(let i=0;i<remaining;i++)rows[shares[i].index].percent=Math.round(rows[shares[i].index].percent*10+1)/10;}
 return {...totals,status:ledger.entries.length?'recorded':'unavailable',updatedAt:ledger.updatedAt,requests:ledger.entries.length,turns:ledger.sources.length,models:rows};
}
export const formatTokens=(value:number)=>new Intl.NumberFormat('ru-RU').format(value);
export const formatPercent=(value:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value)+'%';
