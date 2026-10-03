import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {defaultLayout,layoutIssues,LayoutView,visibleRooms,wallCrossing} from '../../src/modules/layout.ts';

test('Partition openings agree on geometry, sight and walkable reachability',()=>{
 const layout=defaultLayout();
 layout.rooms=[{...layout.rooms[0],id:'left',x:-4,width:4},{...layout.rooms[0],id:'right',x:0,width:4}];
 layout.spawn.x=-2;
 layout.openings=[{id:'opening',name:'Проём',room:'left',plane:'divider',kind:'window',x:0,bottom:1,width:1.2,height:1.2}];
 assert.equal(wallCrossing(layout,-.2,.2,0,new Set()),0);
 assert.equal(visibleRooms(layout,-2,0,new Set()).size,2);
 assert.ok(layoutIssues(layout).some(i=>i.id==='right')); // A window gives sight, never a walking route.
 Object.assign(layout.openings[0],{kind:'breach',bottom:0,height:2.1});
 assert.deepEqual(layoutIssues(layout),[]);
 assert.equal(wallCrossing(layout,-.2,.2,0,new Set()),null);
 const scene=new T.Scene(),view=new LayoutView(scene);view.apply(layout);scene.updateMatrixWorld(true);
 const ray=(y:number)=>new T.Raycaster(new T.Vector3(-.5,y,0),new T.Vector3(1,0,0),0,1).intersectObjects(view.root.children,true);
 assert.equal(ray(1).length,0);
 assert.ok(ray(2.6).length>0);
 layout.openings[0].height=1.5;
 assert.equal(wallCrossing(layout,-.2,.2,0,new Set()),0);
 assert.ok(layoutIssues(layout).some(i=>i.id==='right'));
 view.dispose();
});

test('Vertical ladder leaves an actual aperture in the upper floor',()=>{
 const layout=defaultLayout();layout.rooms.push({...layout.rooms[0],id:'upper',floor:1});
 layout.stairs=[{id:'ladder',name:'Лестница',a:0,b:0,from:0,to:1,kind:'ladder'}];
 assert.deepEqual(layoutIssues(layout),[]);
 const scene=new T.Scene(),view=new LayoutView(scene);view.apply(layout);scene.updateMatrixWorld(true);
 const ray=(x:number)=>new T.Raycaster(new T.Vector3(x,3.3,0),new T.Vector3(0,-1,0),0,.7).intersectObjects(view.root.children,true);
 assert.equal(ray(0).length,0);assert.ok(ray(1).length>0);
 view.dispose();
});
