import {writeFile,readFile} from 'node:fs/promises';
const directions=[[1,0],[0,1],[-1,0],[0,-1]];
const direction=(a,b)=>directions.findIndex(([x,y])=>Math.sign(b[0]-a[0])===x&&Math.sign(b[1]-a[1])===y);
const reflection=(d,a)=>a===0?[3,2,1,0][d]:[1,0,3,2][d];
const specs=[
 ['first-light','Первый свет',7,0,'У каждого путешествия есть первый луч.','Нажмите на зеркало, чтобы повернуть его. Проведите луч от источника к круглому приёмнику.',[[[0,4],[2,4],[2,2],[6,2]]],[],[[4,4],[4,5]]],
 ['detour','Обходной путь',7,0,'Иногда короткая дорога ведёт в темноту.','Каменные блоки поглощают свет. Найдите путь вокруг них.',[[[0,5],[2,5],[2,1],[4,1],[4,4],[6,4]]],[],[[3,3],[3,4],[3,5],[5,2]]],
 ['ribbon','Световая лента',7,0,'Сложите пространство одним движением света.','Лучи свободно пересекаются на пустых клетках. Зеркала отражают свет с обеих сторон.',[[[0,3],[1,3],[1,1],[5,1],[5,5],[3,5],[3,3],[6,3]]],[],[[2,2],[2,4],[4,2],[4,4]]],
 ['ascent','Восхождение',7,0,'Свет помнит дорогу к небу.','Проследите маршрут от источника. Три звезды — за решение без подсказок и лишних поворотов.',[[[3,6],[3,4],[1,4],[1,1],[5,1],[5,5],[6,5]]],[],[[2,2],[3,2],[4,2],[4,4]]],
 ['branch','Разветвление',7,1,'Один луч. Две новые возможности.','Ромб — разделитель: он пропускает луч прямо и создаёт отражённую ветвь. Зажгите оба приёмника.',[[[0,3],[5,3],[5,5],[6,5]]],[[[3,3],[3,1],[6,1],0]],[[1,1],[1,5],[4,4]]],
 ['echo','Эхо',7,1,'Свет становится щедрее, когда им делятся.','Поверните разделитель так, чтобы отражённая ветвь нашла второй приёмник.',[[[0,5],[2,5],[2,0]]],[[[2,3],[5,3],[5,1],[6,1],3]],[[1,1],[3,4],[4,4],[4,1]]],
 ['constellation','Созвездие',7,1,'Три тихих огня складываются в созвездие.','Каждый разделитель создаёт дополнительный путь. Все три приёмника должны светиться одновременно.',[[[0,3],[6,3]]],[[[2,3],[2,1],[6,1],0],[[4,3],[4,5],[1,5],[1,6],0]],[[1,1],[3,2],[3,4],[5,5]]],
 ['cascade','Каскад',7,1,'Маленький поворот меняет целую реку.','У разделённого луча может быть собственное ответвление. Начните с ближайшего к источнику зеркала.',[[[0,5],[1,5],[1,1],[6,1]]],[[[1,3],[4,3],[4,6],3],[[4,4],[6,4],1]],[[2,2],[3,2],[2,4],[5,5]]],
 ['duet','Дуэт',9,2,'Два цвета учатся звучать вместе.','Янтарный свет нужен приёмникам с кругом. Бирюзовый — с ромбом. Цвета на пересечениях не смешиваются.',[[[0,6],[2,6],[2,2],[6,2],[6,0]],[[8,5],[5,5],[5,7],[1,7],[1,3],[0,3]]],[],[[3,3],[4,3],[4,4],[7,7]]],
 ['weave','Переплетение',9,2,'Встречаясь, лучи не теряют себя.','Следите за цветом приёмника. Неподходящий луч поглощается, но не зажигает его.',[[[0,4],[2,4],[2,1],[7,1],[7,6],[8,6]],[[4,8],[4,5],[1,5],[1,7],[6,7],[6,3],[8,3]]],[],[[3,2],[4,2],[5,2],[3,6],[5,4]]],
 ['spectrum','Спектр',9,2,'Четыре огня. Две нити. Один узор.','Зеркала отражают оба цвета. Разделители тоже работают с любым цветом.',[[[0,4],[7,4],[7,1],[8,1]],[[4,8],[4,6],[1,6],[1,1],[0,1]]],[[[3,4],[3,2],[6,2],[6,0],0],[[1,3],[5,3],[5,0],3,'cyan']],[[2,5],[6,5],[6,6],[2,2]]],
 ['garden','Сад света',9,2,'Пусть каждый уголок этого сада оживёт.','Последняя композиция. Найдите место каждому лучу и зажгите все пять огней.',[[[0,4],[7,4],[7,1],[8,1]],[[4,8],[4,6],[1,6],[1,1],[0,1]]],[[[3,4],[3,2],[6,2],[6,0],0],[[1,3],[5,3],[5,0],3,'cyan'],[[4,7],[7,7],[7,8],3,'cyan']],[[2,5],[6,5],[2,2],[8,6]]],
];
const sceneList=[];
for(let index=0;index<specs.length;index++){
 const [id,name,size,chapter,caption,lesson,paths,forks,walls]=specs[index],pieces=new Map();
 const add=(p,kind,color='amber',d=0,angle=0)=>{const key=p.join(',');if(pieces.has(key))throw new Error(`${id}: overlapping ${key}`);pieces.set(key,{x:p[0],y:p[1],kind,color,direction:d,angle});};
 const corners=(path,color)=>{for(let j=1;j<path.length-1;j++){const incoming=direction(path[j-1],path[j]),out=direction(path[j],path[j+1]);if(incoming<0||out<0)throw new Error('Diagonal path');const angle=reflection(incoming,0)===out?0:1;if(reflection(incoming,angle)!==out)throw new Error('Invalid corner');add(path[j],'mirror',color,0,angle);}};
 paths.forEach((p,i)=>{const color=i===0?'amber':'cyan';add(p[0],'source',color,direction(p[0],p[1]));corners(p,color);add(p.at(-1),'target',color);});
 for(const fork of forks){const f=[...fork];let color='amber';if(typeof f.at(-1)==='string')color=f.pop();const incoming=f.pop(),out=direction(f[0],f[1]);add(f[0],'splitter',color,0,reflection(incoming,0)===out?0:1);corners(f,color);add(f.at(-1),'target',color);}
 walls.forEach(p=>add(p,'wall'));
 let mirror=0;
 const nodes=[...pieces.values()].map((p,i)=>{if(['mirror','splitter'].includes(p.kind)){// Deterministic scramble, never a random unplayable level.
   if(index<2||mirror%3!==index%3)p.angle=1-p.angle;mirror++;
  }return {id:`optic-${i}`,name:{source:'Источник',target:'Приёмник',mirror:'Зеркало',splitter:'Разделитель',wall:'Камень'}[p.kind],kind:'box',layer:'architecture',visible:true,locked:false,transform:{position:[p.x,0,p.y],rotation:[0,0,0],scale:[.7,.2,.7]},surface:{texture:'none',color:p.color==='cyan'?'#79e5de':'#ffca83',roughness:.4,metalness:.4,repeat:1},components:[{type:'prisma.optic',values:{kind:p.kind,color:p.color,direction:p.direction,angle:p.angle}}]};});
 const scene={format:'shelter-scene',version:2,id,template:'prisma-optics-v1',name,units:'m',nodes,textures:[],camera:{projection:'orthographic',fov:35,height:12,distance:20,follow:'fixed'},environment:{time:0,haze:0,exposure:1,flashlight:false},moduleData:{prisma:{size,chapter,caption,lesson}}};
 await writeFile(new URL(`../scenes/${id}.scene.json`,import.meta.url),JSON.stringify(scene,null,2)+'\n');sceneList.push({id,name,path:`scenes/${id}.scene.json`});
}
const file=new URL('../project.shelter.json',import.meta.url),manifest=JSON.parse(await readFile(file,'utf8'));manifest.scenes=sceneList;manifest.build.scenes=sceneList.map(s=>s.id);await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
console.log(`Created ${sceneList.length} native Shelter scenes.`);
