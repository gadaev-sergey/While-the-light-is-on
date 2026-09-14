export type ImageId='district'|'materials'|'furniture'|'objects'|'dog'|'walk'|'idle'|'punch'|'damage'|'interior'|'crate';
export class BaseAssets{
 images={} as Record<ImageId,HTMLImageElement|HTMLCanvasElement>;tiles:HTMLCanvasElement[]=[];damageFrames:{image:HTMLCanvasElement;mask:HTMLCanvasElement}[]=[];
 async load(progress:(n:number)=>void){
  const files:Record<ImageId,string>={district:'base/district',materials:'base/materials',furniture:'base/furniture',objects:'base/objects',dog:'base/dog',walk:'developer-walk',idle:'developer-attack',punch:'developer-left-punch',damage:'base/house-damage',interior:'base/interior-front',crate:'base/crates-front'};let done=0;
  await Promise.all(Object.entries(files).map(([key,file])=>new Promise<void>((resolve,reject)=>{const im=new Image();im.onload=()=>{this.images[key as ImageId]=im;progress(++done/Object.keys(files).length);resolve();};im.onerror=()=>reject(new Error(`Не удалось загрузить ${file}`));im.src=`${import.meta.env.BASE_URL}assets/${file}.png`;})));
  this.images.interior=this.keyedTexture(this.images.interior);
  const im=this.images.materials;for(let i=0;i<6;i++){const c=document.createElement('canvas');c.width=384;c.height=384;c.getContext('2d')!.drawImage(im,i%3*im.width/3,Math.floor(i/3)*im.height/2,im.width/3,im.height/2,0,0,384,384);this.tiles.push(c);}
  for(let frame=0;frame<4;frame++)this.damageFrames.push(this.cutout(frame));
 }
 /** The generated RGB atlas uses a green production matte. Decode it once at load
  * time, including enclosed holes; preserve the original PNG and all non-key colours. */
 keyedTexture(source:HTMLImageElement|HTMLCanvasElement){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(source,0,0);const image=c.getImageData(0,0,canvas.width,canvas.height),p=image.data;
  for(let i=0;i<p.length;i+=4){const r=p[i],g=p[i+1],b=p[i+2],excess=g-Math.max(r,b);if(excess<24||g<80)continue;const alpha=1-excess/255;if(alpha<.08){p[i+3]=0;continue;}p[i]=Math.min(255,r/alpha);p[i+1]=Math.min(255,Math.max(r,b)/alpha);p[i+2]=Math.min(255,b/alpha);p[i+3]=Math.round(p[i+3]*alpha);}
  c.putImageData(image,0,0);return canvas;
 }
 /** Extract the architectural silhouette, including its enclosed transparent openings. This
  * mask cuts the BACK WALL only; the untouched sprite is then drawn over the exposed scenery. */
 cutout(frame:number){
  const source=this.images.damage,c=document.createElement('canvas'),size=Math.floor(source.width/2),height=Math.floor(source.height/2);c.width=size;c.height=height;
  const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(source,frame%2*size,Math.floor(frame/2)*height,size,height,0,0,size,height);
  const pixels=ctx.getImageData(0,0,size,height).data;let left=size,top=height,right=0,bottom=0;
  for(let y=0;y<height;y++)for(let x=0;x<size;x++)if(pixels[(y*size+x)*4+3]>40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const image=document.createElement('canvas');image.width=right-left+1;image.height=bottom-top+1;image.getContext('2d')!.drawImage(c,left,top,image.width,image.height,0,0,image.width,image.height);
  const outside=new Uint8Array(size*height),queue=new Int32Array(size*height);let head=0,tail=0;
  const visit=(i:number)=>{if(!outside[i]&&pixels[i*4+3]<40){outside[i]=1;queue[tail++]=i;}};
  for(let x=0;x<size;x++){visit(x);visit((height-1)*size+x);}for(let y=0;y<height;y++){visit(y*size);visit(y*size+size-1);}
  while(head<tail){const i=queue[head++],x=i%size,y=Math.floor(i/size);if(x)visit(i-1);if(x<size-1)visit(i+1);if(y)visit(i-size);if(y<height-1)visit(i+size);}
  const mask=document.createElement('canvas');mask.width=image.width;mask.height=image.height;const mc=mask.getContext('2d')!,data=mc.createImageData(mask.width,mask.height);
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){const i=(top+y)*size+left+x;data.data[(y*mask.width+x)*4+3]=outside[i]?0:255;}mc.putImageData(data,0,0);
  return {image,mask};
 }
}
