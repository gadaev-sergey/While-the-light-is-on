export type AssetName = 'environment' | 'enemies' | 'props' | 'developer-walk' | 'developer-attack' | 'developer-jump' | 'ground' | 'developer-punch' | 'developer-kick' | 'elevator';
export class Assets {
  images = {} as Record<AssetName, HTMLImageElement>;
  async load(progress: (percent:number)=>void) {
    let complete=0;
    const names:AssetName[]=['environment','enemies','props','developer-walk','developer-attack','developer-jump','ground','developer-punch','developer-kick','elevator'];
    await Promise.all(names.map(name=>new Promise<void>((resolve,reject)=>{
      const img=new Image();img.onload=()=>{this.images[name]=img;progress(++complete/names.length);resolve();};
      img.onerror=()=>reject(new Error(`Не удалось загрузить ${name}.png`));const file=({environment:'office-wall',ground:'office-floor',props:'office-foreground',elevator:'office-elevator',enemies:'enemies-illustrated','developer-punch':'developer-left-punch'} as Partial<Record<AssetName,string>>)[name]||name;img.src=`${import.meta.env.BASE_URL}assets/${file}.png`;
    })));
  }
}
