import {openingPlacement} from './architecture.ts';
import type {BaseAssets} from './assets.ts';
import type {CompiledLevel,Opening} from './level.ts';
import type {DaylightSource} from './lighting.ts';
import type {Segment,Vec} from './types.ts';

export interface ApertureBeam {image:HTMLCanvasElement;origin:Vec;angle:number;x:number;y:number}

/** Transport the actual open pixels, in coordinates aligned with the sunlight.
 * Every scanline receives light across the entire aperture. Walls reset transport;
 * a separate shadow mask clips the softened result back to the physical barriers.
 * This is cached in world space and never rebuilt for camera motion or zoom. */
export function apertureBeam(assets:BaseAssets,level:CompiledLevel,opening:Opening,source:DaylightSource,segments:Segment[]):ApertureBeam{
 const frame=assets.damageFrames[opening.kind==='window'?opening.variant||0:2],p=openingPlacement(level,opening),scale=Math.min(p.width/frame.aperture.width,p.height/frame.aperture.height),width=frame.aperture.width*scale,height=frame.aperture.height*scale;
 const origin={x:p.x,y:p.bottom-height/2},cs=Math.cos(source.angle),sn=Math.sin(source.angle),rotate=(x:number,y:number)=>({x:x*cs+y*sn,y:-x*sn+y*cs});
 const corners=[rotate(-width/2,-height/2),rotate(width/2,-height/2),rotate(width/2,height/2),rotate(-width/2,height/2)],left=Math.floor(Math.min(...corners.map(p=>p.x)))-9,top=Math.floor(Math.min(...corners.map(p=>p.y)))-9;
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(Math.max(...corners.map(p=>p.x))+source.range+9-left);canvas.height=Math.ceil(Math.max(...corners.map(p=>p.y))+9-top);
 const c=canvas.getContext('2d',{willReadFrequently:true})!;c.translate(-left,-top);c.rotate(-source.angle);c.drawImage(frame.aperture,-width/2,-height/2,width,height);c.setTransform(1,0,0,1,0,0);
 const seed=c.getImageData(0,0,canvas.width,canvas.height).data,result=c.createImageData(canvas.width,canvas.height),shadow=c.createImageData(canvas.width,canvas.height);
 const walls=segments.map(s=>({a:rotate(s.a.x-origin.x,s.a.y-origin.y),b:rotate(s.b.x-origin.x,s.b.y-origin.y)})),attenuation=Math.exp(-1/source.range*1.5);
 for(let row=0;row<canvas.height;row++){
  const v=top+row+.5,crossings=walls.filter(s=>Math.abs(s.b.y-s.a.y)>.0001&&v>=Math.min(s.a.y,s.b.y)&&v<Math.max(s.a.y,s.b.y)).map(s=>s.a.x+(v-s.a.y)*(s.b.x-s.a.x)/(s.b.y-s.a.y)).sort((a,b)=>a-b);
  let first=-1;for(let col=0;col<canvas.width;col++)if(seed[(row*canvas.width+col)*4+3]>8){first=col;break;}
  const start=first>=0?left+first:0,stop=crossings.find(x=>x>start+.5)??Infinity;
  let energy=0,distance=source.range,wall=0;
  for(let col=0;col<canvas.width;col++){
   const u=left+col+.5,i=(row*canvas.width+col)*4;
   while(wall<crossings.length&&crossings[wall]<=u){energy=0;distance=source.range;wall++;}
   energy*=attenuation;distance++;
   const emission=seed[i+3]/255;if(emission>energy){energy=emission;distance=0;}
   result.data[i]=result.data[i+1]=result.data[i+2]=255;result.data[i+3]=Math.round(255*energy*Math.sqrt(Math.max(0,1-distance/source.range)));
   shadow.data[i+3]=u<=stop?255:0;
  }
 }
 c.putImageData(result,0,0);
 const image=document.createElement('canvas');image.width=canvas.width;image.height=canvas.height;const out=image.getContext('2d')!;
 out.filter='blur(3px)';out.drawImage(canvas,0,0);out.filter='none';c.putImageData(shadow,0,0);out.globalCompositeOperation='destination-in';out.drawImage(canvas,0,0);
 // The shaft starts behind the frame/masonry. Diffuse light can illuminate these
 // materials separately, but the direct opening mask never paints over their faces.
 out.save();out.globalCompositeOperation='destination-out';out.translate(-left,-top);out.rotate(-source.angle);out.drawImage(frame.image,-width/2,-height/2,width,height);out.restore();
 out.globalCompositeOperation='source-in';out.fillStyle=source.color;out.fillRect(0,0,image.width,image.height);out.globalCompositeOperation='source-over';
 return {image,origin,angle:source.angle,x:left,y:top};
}

export function drawApertureBeam(c:CanvasRenderingContext2D,beam:ApertureBeam){c.save();c.translate(beam.origin.x,beam.origin.y);c.rotate(beam.angle);c.drawImage(beam.image,beam.x,beam.y);c.restore();}
