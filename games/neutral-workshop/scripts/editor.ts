import {toLevel} from './layout-adapter.ts';
import type {SceneDocument} from '@shelter/scene.ts';
import type {Layout} from '@shelter/layout.ts';
import {BaseAssets} from './game/assets.ts';
import {BaseWorld} from './game/world.ts';
import {ThreeRenderer} from './game/renderer-3d.ts';
import {ShelterSceneRuntime} from './scene-adapter.ts';
import {metres} from './game/dimensions.ts';
import type {EditorHost} from '@shelter/sdk.ts';
export const prefabs={chest:'Ящики',wardrobe:'Шкаф',workbench:'Верстак',sink:'Раковина',bed:'Кровать',generator:'Генератор',barrel:'Бочка'};
export async function prepare(assetUrl:(p:string)=>string,document?:SceneDocument){const assets=new BaseAssets(assetUrl);await assets.load(()=>{});return (canvas:HTMLCanvasElement):EditorHost=>{const world=new BaseWorld(document?.moduleData?.layout?toLevel(document.moduleData.layout as Layout):undefined);world.phase='paused';const renderer=new ThreeRenderer(canvas,assets,world.level),runtime=new ShelterSceneRuntime(renderer,world);for(let i=0;i<renderer.models.materials.length;i++){const map=renderer.models.materials[i].map;if(map)runtime.textures.set('tile-'+i,map);}return {renderer,runtime,prefabs,supportedComponents:['basic.rotate','basic.bob'],flashlight:true,floorHeight:metres(renderer.level.floorHeight),floorNames:[{value:-1,name:'Подвал'},{value:0,name:'1 этаж'},{value:1,name:'2 этаж'}],draw:dt=>renderer.draw(world,dt,1),updateCamera:dt=>renderer.updateCamera(dt,world),helper:visible=>renderer.heroMesh.visible=visible,helperVisible:()=>renderer.heroMesh.visible,dispose:()=>{runtime.dispose();renderer.dispose();}};};}

export function readLegacyScene(){const value=localStorage.getItem('shelter-engine-scene-v1')||localStorage.getItem('shelter-engine-draft-v1');return value?JSON.parse(value) as SceneDocument:undefined;}
