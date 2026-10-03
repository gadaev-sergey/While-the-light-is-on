import type {SceneDocument} from '@shelter/scene.ts';
export type Terrain='water'|'grass'|'meadow'|'forest';
export type Kind='road'|'cottage'|'farm'|'lumber'|'market'|'windmill'|'park'|'clinic'|'apartment'|'lighthouse'|'hall';
export type Tool=Kind|'inspect'|'bulldoze';
export interface Tile {x:number;y:number;terrain:Terrain;building:Kind|null}
export interface Blueprint {name:string;short:string;icon:string;cost:number;wood:number;upkeep:number;power:number;capacity:number;stage:number;description:string;color:string}
export const BLUEPRINTS:Record<Kind,Blueprint>={
 road:{name:'Дорога',short:'Дорога',icon:'⌁',cost:4,wood:0,upkeep:0,power:0,capacity:0,stage:0,description:'Соединяет здания с ратушей. Зданию достаточно одной соседней дороги. Дороги соединяются сторонами.',color:'#c2b8a0'},
 cottage:{name:'Дом у моря',short:'Дом',icon:'⌂',cost:40,wood:14,upkeep:1,power:1,capacity:10,stage:0,description:'Место для 10 жителей. Новые семьи приезжают в начале сезона, если в городе хватает еды.',color:'#d88568'},
 farm:{name:'Ферма',short:'Ферма',icon:'♧',cost:65,wood:20,upkeep:2,power:2,capacity:0,stage:0,description:'Еда: 24 за сезон, на лугу +25%. Летом урожай +25%, зимой −35%. Требует дорогу.',color:'#d7b767'},
 lumber:{name:'Лесопилка',short:'Лесопилка',icon:'♜',cost:65,wood:15,upkeep:2,power:2,capacity:0,stage:0,description:'Дерево: 12 + 3 за каждую лесную клетку в радиусе 2 (до 24). Лес возобновляется. Рядом с домами −4 к счастью.',color:'#997553'},
 market:{name:'Рынок',short:'Рынок',icon:'▤',cost:90,wood:30,upkeep:2,power:2,capacity:0,stage:1,description:'Продаёт 4 еды за 26 монет каждый сезон. Налог с жителей поступает отдельно.',color:'#d67d74'},
 windmill:{name:'Ветряная мельница',short:'Мельница',icon:'✣',cost:100,wood:35,upkeep:2,power:-40,capacity:0,stage:1,description:'Даёт 40 энергии. При перегрузке сети производство замедляется. Ратуша даёт первые 12 энергии.',color:'#ece1bd'},
 park:{name:'Городской сад',short:'Сад',icon:'♠',cost:35,wood:10,upkeep:1,power:0,capacity:0,stage:0,description:'Каждый подключённый сад даёт +5 к счастью (до +20). Жители любят зелёный город.',color:'#6f9f7c'},
 clinic:{name:'Лечебница',short:'Лечебница',icon:'✚',cost:120,wood:35,upkeep:4,power:3,capacity:0,stage:2,description:'Забота о жителях: +10 к счастью. Одной лечебницы достаточно для всего острова.',color:'#a7c5bd'},
 apartment:{name:'Городской квартал',short:'Квартал',icon:'▥',cost:110,wood:40,upkeep:3,power:4,capacity:24,stage:1,description:'Компактный квартал на 24 жителя. Потребляет 4 энергии. Поможет превратить посёлок в город.',color:'#e5b77b'},
 lighthouse:{name:'Маяк бухты',short:'Маяк',icon:'♟',cost:300,wood:140,upkeep:3,power:4,capacity:0,stage:2,description:'Символ города. Строится у воды. Для открытия бухты нужны 80 жителей, 75 счастья и лечебница.',color:'#e8e0c6'},
 hall:{name:'Ратуша',short:'Ратуша',icon:'⚑',cost:0,wood:0,upkeep:0,power:-12,capacity:0,stage:0,description:'Сердце дорожной сети. Даёт 25 монет и 12 энергии каждый сезон. Снести ратушу нельзя.',color:'#e9d8ad'}
};
export const BUILD_ORDER:Kind[]=['road','cottage','farm','lumber','park','market','windmill','apartment','clinic','lighthouse'];
export const SEASONS=['Весна','Лето','Осень','Зима'];
export interface Statistics {connected:Set<number>;counts:Record<Kind,number>;capacity:number;power:number;demand:number;happiness:number;food:number;consumption:number;wood:number;income:number;upkeep:number;balance:number;disconnected:number}
export interface Choice {label:string;detail:string;coins?:number;wood?:number;food?:number;morale?:number}
export interface CityEvent {title:string;story:string;choices:Choice[]}
export const EVENTS:CityEvent[]=[
 {title:'Корабль с материка',story:'Капитан привёз подарок первым жителям бухты. Что сейчас нужнее городу?',choices:[{label:'Стройматериалы',detail:'+35 дерева',wood:35},{label:'Запасы на зиму',detail:'+55 еды',food:55}]},
 {title:'Праздник на набережной',story:'Жители хотят провести вечер у моря. Можно устроить праздник или открыть ярмарку.',choices:[{label:'Устроить праздник',detail:'−35 монет · +10 счастья на 3 сезона',coins:-35,morale:10},{label:'Провести ярмарку',detail:'+60 монет',coins:60}]},
 {title:'Хорошие соседи',story:'Соседний остров предлагает обмен. Или просто пришлёт небольшой подарок к годовщине города.',choices:[{label:'Купить лес',detail:'−45 монет · +55 дерева',coins:-45,wood:55},{label:'Принять подарок',detail:'+25 еды',food:25}]},
 {title:'Попутный ветер',story:'Бухта привлекает путешественников. Как распорядиться доходом от приезжих?',choices:[{label:'В городскую казну',detail:'+85 монет',coins:85},{label:'Угостить весь город',detail:'+35 еды · +8 счастья на 3 сезона',food:35,morale:8}]}
];
export interface Save {version:1;season:number;coins:number;wood:number;food:number;population:number;stage:number;won:boolean;buildings:(Kind|null)[];event:number|null;morale:number;moraleTurns:number;aidSeason:number;aidCount:number;log:string[]}
const ALL=Object.keys(BLUEPRINTS);
export class City {
 tiles:Tile[];size:number;season=0;coins=320;wood=160;food=100;population=12;stage=0;won=false;event:number|null=null;morale=0;moraleTurns=0;aidSeason=-10;aidCount=0;log=['Добро пожаловать в Тихую бухту.'];undoState:Save|null=null;
 constructor(scene:SceneDocument){
  this.size=Number((scene.moduleData?.tidehaven as {size?:number})?.size);
  if(!Number.isInteger(this.size)||this.size<10||this.size>30)throw new Error('Некорректный размер бухты');
  this.tiles=scene.nodes.filter(n=>n.components?.some(c=>c.type==='tidehaven.tile')).map(n=>{const v=n.components!.find(c=>c.type==='tidehaven.tile')!.values;return{x:n.transform.position[0],y:n.transform.position[2],terrain:v.terrain as Terrain,building:(v.building||null) as Kind|null};}).sort((a,b)=>a.y-b.y||a.x-b.x);
  if(this.tiles.length!==this.size*this.size||this.tiles.some((t,i)=>t.x!==i%this.size||t.y!==Math.floor(i/this.size)||!['water','grass','meadow','forest'].includes(t.terrain)||t.building&&!ALL.includes(t.building))||this.tiles.filter(t=>t.building==='hall').length!==1)throw new Error('Неполная карта бухты');
 }
 index(x:number,y:number){return x>=0&&y>=0&&x<this.size&&y<this.size?y*this.size+x:-1;}
 neighbors(i:number){const t=this.tiles[i];return t?[[t.x-1,t.y],[t.x+1,t.y],[t.x,t.y-1],[t.x,t.y+1]].map(([x,y])=>this.index(x,y)).filter(i=>i>=0):[];}
 count(kind:Kind){return this.tiles.filter(t=>t.building===kind).length;}
 coastal(i:number){return this.neighbors(i).some(i=>this.tiles[i].terrain==='water');}
 stats():Statistics {
  const hall=this.tiles.findIndex(t=>t.building==='hall'),roads=new Set<number>([hall]),queue=[hall];
  for(let q=0;q<queue.length;q++)for(const i of this.neighbors(queue[q]))if(this.tiles[i].building==='road'&&!roads.has(i)){roads.add(i);queue.push(i);}
  const connected=new Set(roads),counts=Object.fromEntries(ALL.map(k=>[k,0])) as Record<Kind,number>;
  for(let i=0;i<this.tiles.length;i++)if(this.tiles[i].building&&this.tiles[i].building!=='road'&&this.neighbors(i).some(j=>roads.has(j)))connected.add(i);
  let capacity=0,power=0,demand=0,food=0,wood=0,upkeep=0,disconnected=0;
  for(let i=0;i<this.tiles.length;i++){const t=this.tiles[i];if(!t.building)continue;const d=BLUEPRINTS[t.building];upkeep+=d.upkeep;if(!connected.has(i)){disconnected++;continue;}counts[t.building]++;capacity+=d.capacity;if(d.power<0)power-=d.power;else demand+=d.power;
   if(t.building==='farm')food+=24*(t.terrain==='meadow'?1.25:1)*[1,1.25,1,.65][this.season%4];
   if(t.building==='lumber')wood+=12+Math.min(4,this.tiles.filter(p=>p.terrain==='forest'&&!p.building&&Math.abs(t.x-p.x)<=2&&Math.abs(t.y-p.y)<=2).length)*3;
  }
  const efficiency=demand>power?Math.max(.35,power/demand):1;
  food=Math.floor(food*efficiency);wood=Math.floor(wood*efficiency);
  const consumption=Math.ceil(this.population*.5),marketSales=Math.min(counts.market,Math.floor(Math.max(0,this.food+food-consumption)/4));
  const income=25+Math.floor(this.population*1.4)+Math.floor(marketSales*26*efficiency);
  let pollution=0;
  for(const t of this.tiles.filter(t=>t.building==='lumber'))if(this.tiles.some(p=>(p.building==='cottage'||p.building==='apartment')&&Math.abs(p.x-t.x)+Math.abs(p.y-t.y)<=2))pollution+=4;
  const happiness=Math.max(5,Math.min(100,60+Math.min(20,counts.park*5)+(counts.clinic?10:0)+(this.food>=consumption?5:-25)+(power>=demand?5:-12)-(this.population>capacity?15:0)-pollution+this.morale));
  return{connected,counts,capacity,power,demand,happiness,food:food-marketSales*4,consumption,wood,income,upkeep,balance:income-upkeep,disconnected};
 }
 reason(kind:Tool,i:number):string {
  if(this.event!==null)return'Сначала выберите ответ в городском событии.';
  const t=this.tiles[i];if(!t)return'Выберите клетку острова.';
  if(kind==='inspect')return'';
  if(kind==='bulldoze')return t.building==='hall'?'Ратуша — сердце города.':!t.building?'На этой клетке нет здания.':'';
  const d=BLUEPRINTS[kind];if(d.stage>this.stage)return`Откроется после главы ${d.stage}.`;
  if(t.terrain==='water')return'Стройте на суше.';
  if(t.building)return'Клетка уже занята. Выберите свободную.';
  if(kind==='lighthouse'&&!this.coastal(i))return'Маяк должен стоять на берегу, рядом с водой.';
  if(kind==='lighthouse'&&this.count('lighthouse'))return'В бухте уже есть маяк.';
  if(kind==='hall')return'Ратуша уже построена.';
  if(this.coins<d.cost||this.wood<d.wood)return`Нужно ${d.cost} монет и ${d.wood} дерева.`;
  return'';
 }
 build(kind:Tool,i:number):string {
  const error=this.reason(kind,i);if(error||kind==='inspect')return error;
  this.undoState=this.save();const tile=this.tiles[i];
  if(kind==='bulldoze'){const old=BLUEPRINTS[tile.building!];this.coins+=Math.floor(old.cost*.5);this.wood+=Math.floor(old.wood*.5);tile.building=null;return'';}
  const b=BLUEPRINTS[kind];this.coins-=b.cost;this.wood-=b.wood;tile.building=kind;return'';
 }
 undo(){if(!this.undoState||this.event!==null)return false;const previous=this.undoState;this.restore(previous);this.undoState=null;return true;}
 objectives(){const s=this.stats();return this.stage===0?[
  {text:'24 жителя',value:this.population,max:24},{text:'4 дома',value:s.counts.cottage,max:4},{text:'Ферма',value:s.counts.farm,max:1},{text:'Лесопилка',value:s.counts.lumber,max:1}
 ]:this.stage===1?[
  {text:'50 жителей',value:this.population,max:50},{text:'Рынок',value:s.counts.market,max:1},{text:'2 городских сада',value:s.counts.park,max:2},{text:'Мельница',value:s.counts.windmill,max:1}
 ]:[{text:'80 жителей',value:this.population,max:80},{text:'Счастье 75%',value:s.happiness,max:75},{text:'Лечебница',value:s.counts.clinic,max:1},{text:'Маяк у воды',value:s.counts.lighthouse,max:1}];}
 advance():string {
  if(this.event!==null)return'Сначала ответьте на городское событие.';
  this.undoState=null;const s=this.stats();this.coins=Math.max(0,this.coins+s.balance);this.wood+=s.wood;
  const available=this.food+s.food,shortage=available<s.consumption;
  this.food=Math.max(0,available-s.consumption);
  const growth=shortage?-Math.min(5,this.population-4):this.population>s.capacity?-Math.min(4,this.population-s.capacity):s.happiness>=50?Math.min(10,s.capacity-this.population):0;
  this.population=Math.max(4,this.population+growth);this.season++;
  if(this.moraleTurns>0&&--this.moraleTurns===0)this.morale=0;
  let message=shortage?'Не хватило еды. Часть жителей уехала.':growth>0?`В бухту приехали ${growth} жителей.`:'Новый сезон в Тихой бухте.';
  if(!this.won&&this.objectives().every(o=>o.value>=o.max)){
   if(this.stage<2){this.stage++;this.coins+=this.stage===1?120:180;this.wood+=this.stage===1?40:60;message=this.stage===1?'Посёлок растёт! Открыты рынок, мельница и кварталы. Награда: 120 монет, 40 дерева.':'Бухта стала городом! Открыты лечебница и маяк. Награда: 180 монет, 60 дерева.';}
   else{this.won=true;message='Маяк зажжён. Тихая бухта открыта миру!';}
  }
  if(this.season%4===3&&!this.won)this.event=Math.floor(this.season/4)%EVENTS.length;
  this.log.unshift(message);this.log=this.log.slice(0,12);return message;
 }
 choose(index:number){if(this.event===null)return false;const c=EVENTS[this.event].choices[index];if(!c||this.coins+(c.coins||0)<0)return false;this.coins+=c.coins||0;this.wood+=c.wood||0;this.food+=c.food||0;if(c.morale){this.morale=c.morale;this.moraleTurns=3;}this.log.unshift(c.label+'. '+c.detail);this.log=this.log.slice(0,12);this.event=null;this.undoState=null;return true;}
 trade(kind:'food'|'wood'){const price=kind==='food'?35:40,amount=kind==='food'?30:20;if(this.event!==null||this.coins<price)return false;this.coins-=price;this[kind]+=amount;this.undoState=null;return true;}
 aid(){if(this.event!==null||this.coins>=40||this.season-this.aidSeason<4)return false;this.coins+=100;this.aidSeason=this.season;this.aidCount++;this.undoState=null;return true;}
 save():Save{return{version:1,season:this.season,coins:this.coins,wood:this.wood,food:this.food,population:this.population,stage:this.stage,won:this.won,buildings:this.tiles.map(t=>t.building),event:this.event,morale:this.morale,moraleTurns:this.moraleTurns,aidSeason:this.aidSeason,aidCount:this.aidCount,log:[...this.log]};}
 restore(value:unknown){
  if(!value||typeof value!=='object')return false;const s=value as Save;
  if(s.version!==1||!Array.isArray(s.buildings)||s.buildings.length!==this.tiles.length||s.buildings.some((b,i)=>b!==null&&(!ALL.includes(b)||this.tiles[i].terrain==='water'))||s.buildings.filter(b=>b==='hall').length!==1||s.buildings[this.tiles.findIndex(t=>t.building==='hall')]!=='hall')return false;
  if(!['season','coins','wood','food','population','stage','morale','moraleTurns','aidSeason','aidCount'].every(k=>typeof s[k as keyof Save]==='number'&&Number.isFinite(s[k as keyof Save] as number))||[s.coins,s.wood,s.food,s.season,s.aidCount].some(v=>v<0)||![0,1,2].includes(s.stage)||s.population<4||!Number.isInteger(s.season)||s.event!==null&&(!Number.isInteger(s.event)||s.event<0||s.event>=EVENTS.length)||typeof s.won!=='boolean'||!Array.isArray(s.log)||s.log.some(x=>typeof x!=='string'))return false;
  for(const k of ['season','coins','wood','food','population','stage','won','event','morale','moraleTurns','aidSeason','aidCount'] as const)(this as any)[k]=s[k];this.log=s.log.slice(0,12);this.tiles.forEach((t,i)=>t.building=s.buildings[i]);this.undoState=null;return true;
 }
}
