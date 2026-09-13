export type ImageId='district'|'materials'|'furniture'|'objects'|'dog'|'walk'|'idle'|'punch';
export class BaseAssets{
 images={} as Record<ImageId,HTMLImageElement>;tiles:HTMLCanvasElement[]=[];
 async load(progress:(n:number)=>void){
  const files:Record<ImageId,string>={district:'base/district',materials:'base/materials',furniture:'base/furniture',objects:'base/objects',dog:'base/dog',walk:'developer-walk',idle:'developer-attack',punch:'developer-left-punch'};let done=0;
  await Promise.all(Object.entries(files).map(([key,file])=>new Promise<void>((resolve,reject)=>{const im=new Image();im.onload=()=>{this.images[key as ImageId]=im;progress(++done/8);resolve();};im.onerror=()=>reject(new Error(`Не удалось загрузить ${file}`));im.src=`${import.meta.env.BASE_URL}assets/${file}.png`;})));
  const im=this.images.materials;for(let i=0;i<6;i++){const c=document.createElement('canvas');c.width=384;c.height=384;c.getContext('2d')!.drawImage(im,i%3*im.width/3,Math.floor(i/3)*im.height/2,im.width/3,im.height/2,0,0,384,384);this.tiles.push(c);}
 }
}
