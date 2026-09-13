export const GROUND={top:508,height:212,tileWidth:1536,overlap:256} as const;

/** Global tile indices are stable on both sides of a wrap, including negative coordinates. */
export function visibleTiles(camera:number,period:number,viewport=1280){
  const first=Math.floor(camera/period),last=Math.floor((camera+viewport)/period);
  return Array.from({length:last-first+1},(_,offset)=>{const index=first+offset;return {index,x:index*period-camera};});
}

/** Build a periodic strip once. Its first pixels continue the tail of the same image;
 * smooth overlap hides the original asset edge while preserving exact spatial continuity. */
export function periodicStrip(image:CanvasImageSource,width:number,height:number,overlap:number):HTMLCanvasElement {
  const source=document.createElement('canvas');source.width=width;source.height=height;
  source.getContext('2d')!.drawImage(image,0,0,width,height);
  const period=width-overlap,tile=document.createElement('canvas');tile.width=period;tile.height=height;
  const c=tile.getContext('2d')!;c.drawImage(source,0,0);
  const blend=document.createElement('canvas');blend.width=overlap;blend.height=height;
  const b=blend.getContext('2d')!;b.drawImage(source,period,0,overlap,height,0,0,overlap,height);
  b.globalCompositeOperation='destination-in';
  const fade=b.createLinearGradient(0,0,overlap,0);
  for(let i=0;i<=16;i++){const t=i/16;fade.addColorStop(t,`rgba(0,0,0,${1-t*t*(3-2*t)})`);}
  b.fillStyle=fade;b.fillRect(0,0,overlap,height);c.drawImage(blend,0,0);
  return tile;
}

export class Ground {
  tile:HTMLCanvasElement;
  constructor(image:HTMLImageElement){this.tile=periodicStrip(image,GROUND.tileWidth,GROUND.height,GROUND.overlap);}
  draw(ctx:CanvasRenderingContext2D,camera:number){
    ctx.save();ctx.beginPath();ctx.rect(0,GROUND.top,1280,720-GROUND.top);ctx.clip();
    // One repeating canvas pattern has no per-tile filtering gaps or mirrored-index changes.
    const pattern=ctx.createPattern(this.tile,'repeat-x')!;
    pattern.setTransform(new DOMMatrix().translate(-camera,GROUND.top));
    ctx.fillStyle=pattern;ctx.fillRect(0,GROUND.top,1280,GROUND.height);
    const depth=ctx.createLinearGradient(0,GROUND.top,0,GROUND.top+GROUND.height);
    depth.addColorStop(0,'rgba(8,21,23,.25)');depth.addColorStop(.09,'transparent');depth.addColorStop(.7,'transparent');depth.addColorStop(1,'rgba(1,8,12,.68)');
    ctx.fillStyle=depth;ctx.fillRect(0,GROUND.top,1280,GROUND.height);ctx.restore();
  }
}
