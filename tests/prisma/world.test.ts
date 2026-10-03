import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateScene} from '../../src/engine/scene.ts';
import {Puzzle,readLevel,trace,reflect,rotatable,type Level,type Piece} from '../../games/prisma/scripts/world.ts';
const project=new URL('../../games/prisma/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('project.shelter.json',project),'utf8'));
const levels:Level[]=manifest.scenes.map((s:{path:string})=>readLevel(validateScene(JSON.parse(readFileSync(new URL(s.path,project),'utf8')))));
const piece=(id:string,x:number,y:number,kind:Piece['kind'],angle=0,direction=0,color:Piece['color']='amber'):Piece=>({id,x,y,kind,angle,direction,color});
const fixture=(pieces:Piece[]):Level=>({id:'test',name:'test',size:7,chapter:0,caption:'',lesson:'',pieces});

test('all native Shelter campaign levels are initially unsolved and completable using legal turns',()=>{
 assert.equal(levels.length,12);assert.deepEqual(new Set(levels.map(l=>l.chapter)),new Set([0,1,2]));
 for(const level of levels){const puzzle=new Puzzle(level);assert.equal(puzzle.result.won,false,level.name);assert.ok(puzzle.par>=2);const nearest=puzzle.answers.reduce((a,b)=>a.reduce((n,x,i)=>n+Number(x!==puzzle.angles[i]),0)<=b.reduce((n,x,i)=>n+Number(x!==puzzle.angles[i]),0)?a:b);const mirrors=level.pieces.filter(rotatable);nearest.forEach((angle,i)=>{if(puzzle.angles[i]!==angle)assert.equal(puzzle.rotate(mirrors[i].id),true);});assert.equal(puzzle.result.won,true,level.name);assert.equal(puzzle.moves,puzzle.par);assert.equal(puzzle.stars,3);assert.equal(puzzle.rotate(mirrors[0].id),false,'completed board does not change accidentally');}
});
test('reflection supports every incoming direction and both faces',()=>{
 assert.deepEqual([0,1,2,3].map(d=>reflect(d,0)),[3,2,1,0]);assert.deepEqual([0,1,2,3].map(d=>reflect(d,1)),[1,0,3,2]);
});
test('splitter lights straight and reflected receivers at the same time',()=>{
 const level=fixture([piece('s',0,3,'source'),piece('p',3,3,'splitter'),piece('a',6,3,'target'),piece('b',3,0,'target')]);
 assert.equal(trace(level,[0]).won,true);const rotated=trace(level,[1]);assert.equal(rotated.won,false);assert.deepEqual([...rotated.lit],['a']);
});
test('wrong color and walls cannot activate receivers; crossing colors remain independent',()=>{
 const level=fixture([piece('s',0,3,'source'),piece('t',6,3,'target',0,0,'cyan')]);assert.equal(trace(level,[]).lit.size,0);assert.equal(trace(level,[]).wrong.has('t'),true);
 level.pieces[1].color='amber';level.pieces.push(piece('wall',2,3,'wall'));assert.equal(trace(level,[]).lit.size,0);
 const crossing=fixture([piece('s',0,3,'source'),piece('t',6,3,'target'),piece('blue',3,6,'source',0,3,'cyan'),piece('bt',3,0,'target',0,0,'cyan')]);assert.equal(trace(crossing,[]).won,true);
});
test('a branching closed loop terminates without exhausting the ray tracer',()=>{
 const loop=fixture([piece('s',0,4,'source'),piece('split',2,4,'splitter',1),piece('m1',5,4,'mirror',0),piece('m2',5,1,'mirror',1),piece('m3',2,1,'mirror',0),piece('target',6,6,'target')]);
 const result=trace(loop,[1,0,1,0]);assert.ok(result.segments.length>15);assert.ok(result.segments.length<100);assert.equal(result.won,false);
});
test('undo, reset, saved state and corrupt data preserve consistent progress',()=>{
 const p=new Puzzle(levels[3]),initial=p.save(),id=p.level.pieces.find(rotatable)!.id;
 assert.equal(p.rotate('not-a-piece'),false);assert.equal(p.rotate(id),true);assert.equal(p.moves,1);assert.equal(p.undo(),true);assert.deepEqual(p.save(),initial);assert.equal(p.undo(),false);
 p.rotate(id);const saved=p.save(),copy=new Puzzle(levels[3]);assert.equal(copy.restore(saved),true);assert.deepEqual(copy.save(),saved);
 assert.equal(copy.restore({...saved,angles:[3]}),false);assert.equal(copy.restore({...saved,moves:-1}),false);assert.deepEqual(copy.save(),saved);copy.reset();assert.deepEqual(copy.save(),initial);
});
test('hints adapt to the current board and lead to a complete 12-level campaign',()=>{
 for(const level of levels){const p=new Puzzle(level);let count=0;while(!p.result.won){const id=p.hint();assert.ok(id);assert.equal(p.rotate(id!),true);assert.ok(++count<=p.angles.length);}assert.equal(p.stars,1);assert.equal(p.hint(),null);assert.equal(p.hints,count);}
});
test('scene parser rejects overlaps and non-grid optics',()=>{
 const scene=JSON.parse(readFileSync(new URL(manifest.scenes[0].path,project),'utf8'));scene.nodes[1].transform.position=scene.nodes[0].transform.position;assert.throws(()=>readLevel(scene),/Некорректный/);
});
