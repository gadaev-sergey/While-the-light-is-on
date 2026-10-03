import type {Arena} from './arena.ts';
import {HostGame} from './host.ts';
import {workerTicker,type Channel} from './net.ts';
import {PROTOCOL,type GuestMessage,type HostMessage,type SessionInfo,type SessionOptions} from './protocol.ts';

export interface ClientLink{send(msg:GuestMessage):void}
export interface ClientSink{receive(msg:HostMessage):void}

export const HOST_HZ=60;
const SNAPSHOT_EVERY=3;

/** Хост: ведёт HostGame, принимает гостей и рассылает снимки (20 Гц) и события (60 Гц). */
export class HostSession{
 readonly game:HostGame;readonly link:ClientLink;onRoster=()=>{};
 readonly options:SessionOptions;readonly code:string;
 private ticks=0;private stopTicker:()=>void=()=>{};private channel:Channel;private hostName:string;private local:ClientSink;
 constructor(channel:Channel,arena:Arena,options:SessionOptions,code:string,hostName:string,local:ClientSink){
  this.channel=channel;this.options=options;this.code=code;this.hostName=hostName;this.local=local;
  this.game=new HostGame(arena,options);
  this.link={send:msg=>this.handle(channel.selfId,msg)};
  channel.onMessage=(data,from)=>this.handle(from,data as GuestMessage);
  channel.onLeave=peer=>{if(this.game.players.has(peer)){this.game.leave(peer);this.roster();}};
 }
 start(){
  this.handle(this.channel.selfId,{k:'hello',name:this.hostName,protocol:PROTOCOL});
  this.stopTicker=workerTicker(HOST_HZ,()=>this.tick());
 }
 /** Шаг вызывается тикером; в тестах можно звать напрямую. */
 tick(){
  this.game.step(1/HOST_HZ);
  const events=this.game.drain();if(events.length)this.deliver({k:'ev',list:events});
  if(++this.ticks%SNAPSHOT_EVERY===0)this.deliver(this.game.snapshot());
 }
 info():SessionInfo{return {code:this.code,name:this.options.name,host:this.hostName,players:this.game.players.size,max:this.options.maxPlayers,fragLimit:this.options.fragLimit,protocol:PROTOCOL};}
 close(){this.stopTicker();this.channel.leave();}

 private handle(from:string,msg:GuestMessage){
  if(!msg||typeof msg!=='object')return;
  switch(msg.k){
   case 'hello':{
    if(msg.protocol!==PROTOCOL){this.deliver({k:'reject',reason:'protocol'},from);return;}
    const player=this.game.join(from,String(msg.name??''));
    if(player==='full'){this.deliver({k:'reject',reason:'full'},from);return;}
    this.deliver({k:'welcome',id:from,name:player.name,color:player.color,options:this.options},from);
    this.roster();this.deliver(this.game.snapshot(),from);return;
   }
   case 'pose':this.game.pose(from,msg);return;
   case 'fire':this.game.fire(from,msg);return;
   case 'reload':this.game.reload(from,msg);return;
   case 'ping':this.deliver({k:'pong',t:msg.t},from);return;
  }
 }
 private roster(){this.deliver({k:'roster',players:this.game.roster()});this.onRoster();}
 /** Без адресата — всем, включая собственного клиента хоста. */
 private deliver(msg:HostMessage,to?:string){
  if(!to||to===this.channel.selfId)this.local.receive(msg);
  if(to!==this.channel.selfId)this.channel.send(msg,to);
 }
}

export type GuestFailure='timeout'|'full'|'protocol';
/** Гость: находит хоста в комнате сессии и общается только с ним. */
export class GuestSession{
 hostId:string|null=null;readonly link:ClientLink;
 onFail:(reason:GuestFailure)=>void=()=>{};onHostLeft=()=>{};
 private timer:ReturnType<typeof setTimeout>;private channel:Channel;private name:string;
 constructor(channel:Channel,name:string,sink:ClientSink,timeoutMs=25000){
  this.channel=channel;this.name=name;
  this.link={send:msg=>{if(this.hostId)channel.send(msg,this.hostId);}};
  channel.onJoin=peer=>{if(!this.hostId)channel.send({k:'hello',name:this.name,protocol:PROTOCOL},peer);};
  channel.onLeave=peer=>{if(peer===this.hostId)this.onHostLeft();};
  channel.onMessage=(data,from)=>{
   const msg=data as HostMessage;if(!msg||typeof msg!=='object')return;
   if(!this.hostId){
    if(msg.k==='welcome'){this.hostId=from;clearTimeout(this.timer);sink.receive(msg);}
    else if(msg.k==='reject'){clearTimeout(this.timer);this.onFail(msg.reason);}
    return;
   }
   if(from===this.hostId)sink.receive(msg);
  };
  this.timer=setTimeout(()=>{if(!this.hostId)this.onFail('timeout');},timeoutMs);
 }
 close(){clearTimeout(this.timer);this.channel.leave();}
}
