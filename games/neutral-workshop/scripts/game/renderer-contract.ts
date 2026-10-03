import type {BaseHero} from './hero.ts';
import type {BaseWorld} from './world.ts';
import type {Floor,Vec} from './types.ts';

/** Input and HUD use world coordinates independently of the rendering backend. */
export interface GameRenderer {
 canvas:HTMLCanvasElement;
 hero:BaseHero;
 zoom:number;
 hover:string|null;
 draw(world:BaseWorld,dt:number,alpha:number):void;
 zoomBy(delta:number):void;
 worldToScreen(point:Vec):Vec;
 screenToWorld(point:Vec):Vec;
 hitAt(point:Vec):string|null;
 floorAtScreen(point:Vec):Floor;
 rotateView?(direction:number):void;
 resetView?():void;
}
