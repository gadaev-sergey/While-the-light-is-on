// Сетевой транспорт «Шпиля» (см. docs/adr/0001). Игра знает только интерфейс Channel:
// публичная сеть — Trystero поверх Nostr-реле и WebRTC, для тестов — BroadcastChannel.
import {PROTOCOL,type SessionInfo} from './protocol.ts';

export const APP_ID='shelter-arcade-spire-v1';
export const LOBBY_ROOM='lobby';
export const sessionRoom=(code:string)=>'s-'+code;
/** Публичные Nostr-реле для сигнализации. Набор по умолчанию у Trystero выбирается по appId и часто включает недоступные реле. */
export const RELAYS=['wss://nos.lol','wss://relay.primal.net','wss://nostr.mom','wss://relay.snort.social','wss://nostr.oxtr.dev','wss://relay.nostr.net'];

/** Одна комната: все её участники соединены друг с другом напрямую. */
export interface Channel{
 readonly selfId:string;
 send(data:unknown,to?:string):void;
 onMessage:(data:unknown,from:string)=>void;
 onJoin:(peer:string)=>void;
 onLeave:(peer:string)=>void;
 ping(peer:string):Promise<number>;
 leave():void;
}
export interface Network{readonly selfId:string;readonly kind:'public'|'local';join(room:string):Channel}

const noop=()=>{};
function baseChannel(selfId:string):Pick<Channel,'selfId'|'onMessage'|'onJoin'|'onLeave'>{return {selfId,onMessage:noop,onJoin:noop,onLeave:noop};}

/** Публичная сеть: сигнализация через бесплатные Nostr-реле, данные — напрямую по WebRTC. */
export async function publicNetwork():Promise<Network>{
 const {joinRoom,selfId}=await import('trystero');
 // room.leave() у Trystero асинхронный: пока он не завершён, joinRoom с тем же id вернёт
 // закрывающуюся комнату. Поэтому повторный вход ждёт окончания прошлого выхода.
 const leaving=new Map<string,Promise<void>>();
 return {selfId,kind:'public',join(roomId){
  let room:ReturnType<typeof joinRoom>|null=null,action:{send:(data:any,options?:{target:string})=>Promise<void>}|null=null,left=false;
  const channel:Channel={...baseChannel(selfId),
   send(data,to){if(action)void action.send(data as any,to?{target:to}:undefined).catch(noop);},
   ping:peer=>room?room.ping(peer):Promise.reject(new Error('Комната ещё не открыта')),
   leave(){
    if(left)return;left=true;
    const done=(async()=>{await ready;if(room)await room.leave().catch(noop);})();
    leaving.set(roomId,done);void done.finally(()=>{if(leaving.get(roomId)===done)leaving.delete(roomId);});
   }};
  const ready=(leaving.get(roomId)??Promise.resolve()).then(()=>{
   if(left)return;
   const r=joinRoom({appId:APP_ID,relayConfig:{urls:RELAYS}},roomId),a=r.makeAction<any>('m');
   a.onMessage=(data,context)=>channel.onMessage(data,context.peerId);
   r.onPeerJoin=peer=>channel.onJoin(peer);r.onPeerLeave=peer=>channel.onLeave(peer);
   room=r;action=a;
  });
  return channel;
 }};
}

/** Локальная сеть между вкладками одного браузера — для автотестов и разработки без интернета. */
export function localNetwork():Network{
 const selfId=Math.random().toString(36).slice(2,10);
 return {selfId,kind:'local',join(roomId){
  const bus=new BroadcastChannel('spire-local-'+roomId),seen=new Map<string,number>(),pings=new Map<number,(ms:number)=>void>();
  let closed=false,pingId=0;
  const post=(type:string,extra:Record<string,unknown>={})=>{if(!closed)bus.postMessage({type,from:selfId,...extra});};
  const channel:Channel={...baseChannel(selfId),
   send(data,to){post('m',{to,data});},
   ping(peer){const id=++pingId,start=performance.now();return new Promise(resolve=>{pings.set(id,()=>resolve(performance.now()-start));post('ping',{to:peer,id});});},
   leave(){post('bye');closed=true;clearInterval(beat);bus.close();removeEventListener('pagehide',bye);}};
  const meet=(peer:string)=>{const known=seen.has(peer);seen.set(peer,performance.now());if(!known)channel.onJoin(peer);};
  bus.onmessage=({data:m})=>{
   if(closed||m.from===selfId||m.to&&m.to!==selfId)return;
   if(m.type==='hi'){meet(m.from);post('here',{to:m.from});return;}
   if(m.type==='bye'){if(seen.delete(m.from))channel.onLeave(m.from);return;}
   meet(m.from);
   if(m.type==='m')channel.onMessage(m.data,m.from);
   if(m.type==='ping')post('pong',{to:m.from,id:m.id});
   if(m.type==='pong')pings.get(m.id)?.(0);
  };
  const beat=setInterval(()=>{post('beat');const now=performance.now();for(const [peer,at] of seen)if(now-at>4000){seen.delete(peer);channel.onLeave(peer);}},1000);
  const bye=()=>post('bye');addEventListener('pagehide',bye);
  queueMicrotask(()=>post('hi'));
  return channel;
 }};
}

export type ListedSession=SessionInfo&{peer:string;seen:number;ping:number|null};
type LobbyMessage={t:'ann';info:SessionInfo}|{t:'gone';code:string};
const isInfo=(v:any):v is SessionInfo=>v&&typeof v.code==='string'&&/^[A-Z0-9]{6}$/.test(v.code)&&typeof v.name==='string'&&typeof v.host==='string'&&Number.isInteger(v.players)&&Number.isInteger(v.max)&&Number.isInteger(v.fragLimit)&&v.protocol===PROTOCOL;

/** Список открытых сессий: хосты объявляют себя в общей комнате, остальные слушают. */
export class Lobby{
 sessions=new Map<string,ListedSession>();onChange=noop;
 private channel:Channel;private own:SessionInfo|null=null;private timer:ReturnType<typeof setInterval>;
 constructor(net:Network){
  this.channel=net.join(LOBBY_ROOM);
  this.channel.onJoin=peer=>{if(this.own)this.channel.send({t:'ann',info:this.own},peer);};
  this.channel.onLeave=peer=>{let changed=false;for(const [code,s] of this.sessions)if(s.peer===peer){this.sessions.delete(code);changed=true;}if(changed)this.onChange();};
  this.channel.onMessage=(data,from)=>{
   const m=data as LobbyMessage;
   if(m?.t==='gone'){if(this.sessions.get(m.code)?.peer===from){this.sessions.delete(m.code);this.onChange();}return;}
   if(m?.t!=='ann'||!isInfo(m.info))return;
   const known=this.sessions.get(m.info.code);
   this.sessions.set(m.info.code,{...m.info,name:m.info.name.slice(0,40),host:m.info.host.slice(0,24),peer:from,seen:performance.now(),ping:known?.ping??null});
   if(!known)void this.measure(m.info.code,from);this.onChange();
  };
  this.timer=setInterval(()=>{
   if(this.own)this.channel.send({t:'ann',info:this.own});
   const now=performance.now();let changed=false;for(const [code,s] of this.sessions)if(now-s.seen>9000){this.sessions.delete(code);changed=true;}if(changed)this.onChange();
  },2500);
 }
 /** Объявить свою сессию (или снять объявление, передав null). */
 announce(info:SessionInfo|null){
  if(!info&&this.own)this.channel.send({t:'gone',code:this.own.code});
  const fresh=info&&(!this.own||JSON.stringify(info)!==JSON.stringify(this.own));this.own=info;if(fresh)this.channel.send({t:'ann',info});
 }
 private async measure(code:string,peer:string){
  try{const ms=await Promise.race([this.channel.ping(peer),new Promise<number>((_,reject)=>setTimeout(()=>reject(new Error('timeout')),5000))]);const s=this.sessions.get(code);if(s){s.ping=Math.round(ms);this.onChange();}}catch{}
 }
 close(){this.announce(null);clearInterval(this.timer);this.channel.leave();}
}

const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(random=Math.random){let s='';for(let i=0;i<6;i++)s+=CODE_ALPHABET[Math.floor(random()*CODE_ALPHABET.length)];return s;}
export const normalizeCode=(text:string)=>{const m=text.toUpperCase().replace(/[^A-Z0-9]/g,'').match(/[A-Z0-9]{6}$/);return m?m[0]:null;};

/**
 * Тикер в Web Worker: таймеры вкладки в фоне замедляются до 1 Гц, а хост должен
 * продолжать считать матч, даже если игрок переключился в другое окно.
 */
export function workerTicker(hz:number,fn:()=>void):()=>void{
 try{
  const url=URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${Math.round(1000/hz)})`],{type:'text/javascript'}));
  const worker=new Worker(url);worker.onmessage=()=>fn();
  return ()=>{worker.terminate();URL.revokeObjectURL(url);};
 }catch{const id=setInterval(fn,1000/hz);return ()=>clearInterval(id);}
}
