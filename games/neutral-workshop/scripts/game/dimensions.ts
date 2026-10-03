import type {BaseObject} from './types.ts';

/** All rendered geometry is measured in metres. Legacy map coordinates are layout units only. */
export const DIMENSIONS={
 layoutUnit:.0125,
 hero:{height:1.78,flashlightHeight:1.12},
 house:{back:-1.8,front:1.2,actorZ:.50,slab:.13},
 door:{height:2.05,interiorWidth:.80,exteriorWidth:.90,thickness:.045,handleHeight:1.0},
 stairs:{z:-1.02,width:.90,railHeight:.90,maxRiser:.20},
 // chest, wardrobe, sink and bed are GLB models from models/: their entries are the measured bounds.
 furniture:{
  chest:{width:.85,height:.904,depth:.53},
  wardrobe:{width:1.334,height:1.925,depth:.662},
  workbench:{width:1.50,height:1.10,depth:.65},
  sink:{width:1.20,height:1.281,depth:.608},
  bed:{width:2.024,height:.98,depth:1.077},
  generator:{width:.90,height:.70,depth:.55},
  barrel:{width:.60,height:.90,depth:.60},
  medicine:{width:.35,height:.28,depth:.32},
  rubble:{width:.65,height:.25,depth:.45},
  fusebox:{width:.40,height:.55,depth:.22},
 },
} as const;
export const metres=(layout:number)=>layout*DIMENSIONS.layoutUnit;
export const layoutUnits=(metres:number)=>metres/DIMENSIONS.layoutUnit;
export const wx=(x:number)=>metres(x-1000);
export function furnitureSize(o:BaseObject){return DIMENSIONS.furniture[o.kind];}

/** Calibrate from the opaque standing silhouette, not the padded sprite canvas. */
export function spriteCalibration(data:Uint8ClampedArray,width:number,height:number,footY:number){
 let top=footY;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>128){top=Math.min(top,y);}
 if(top>=footY)throw new Error('Standing sprite has no visible silhouette above its foot anchor');
 const pixelMetres=DIMENSIONS.hero.height/(footY-top);
 return {top,footY,pixelMetres,width:width*pixelMetres,height:height*pixelMetres};
}
