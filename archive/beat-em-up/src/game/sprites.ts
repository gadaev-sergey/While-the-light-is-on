/** Pixel rectangles are measured on the original PNGs. Generated sheets have optical,
 * rather than perfectly uniform, rows; explicit rectangles prevent adjacent sprite bleed. */
export const ENEMY_FRAMES = [
  {x:45,y:84,w:460,h:315,ax:235,ay:302},
  {x:547,y:87,w:458,h:311,ax:230,ay:300},
  {x:1017,y:80,w:509,h:322,ax:255,ay:310},
  {x:20,y:401,w:419,h:571,ax:227,ay:557},
  {x:432,y:414,w:565,h:560,ax:340,ay:545},
  {x:999,y:406,w:535,h:564,ax:280,ay:557}
] as const;
export const HERO_FRAMES = [
  {x:0,y:0,w:376,h:507,ax:145,ay:477},
  {x:384,y:0,w:380,h:498,ax:184,ay:477},
  {x:768,y:0,w:384,h:498,ax:217,ay:477},
  {x:1152,y:0,w:384,h:505,ax:206,ay:477},
  {x:0,y:543,w:393,h:481,ax:180,ay:446},
  {x:397,y:490,w:371,h:534,ax:193,ay:500},
  {x:770,y:625,w:455,h:360,ax:199,ay:326},
  {x:1206,y:557,w:330,h:467,ax:179,ay:429}
] as const;

/** Exclude the detached claw of the neighbouring pose where the illustrated cells overlap. */
export function drawEnemyFrame(ctx:CanvasRenderingContext2D,img:HTMLImageElement,index:number,dx:number,dy:number,scale:number) {
  const f=ENEMY_FRAMES[index];ctx.save();
  ctx.drawImage(img,f.x,f.y,f.w,f.h,dx,dy,f.w*scale,f.h*scale);ctx.restore();
}
