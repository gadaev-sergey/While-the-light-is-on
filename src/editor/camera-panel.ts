import {resolveCamera,type CameraSettings} from '../engine/scene.ts';

export function cameraPanel(settings:CameraSettings|undefined,preview:boolean,aspect:string,guides:boolean,activeNode=false,followTarget=false){
 const c=resolveCamera(settings),perspective=c.projection==='perspective';
 const field=(label:string,html:string)=>`<label class="ed-field"><span>${label}</span>${html}</label>`;
 const number=(key:keyof typeof c,label:string,min:number,max:number,step:number,disabled=false)=>field(label,`<input type="number" aria-label="${label}" data-camera="${key}" value="${c[key]}" min="${min}" max="${max}" step="${step}" ${disabled?'disabled':''}>`);
 return `<section class="ed-section" id="ed-camera"><h3>Игровая камера</h3>
 <p class="ed-note">${activeNode?'Положение и поворот задаются объектом активной камеры в сцене.':'Камера сцены направлена вдоль −Z. Рабочий ракурс редактора задаётся отдельно.'}</p>
 ${field('Проекция',`<select aria-label="Проекция камеры" data-camera="projection"><option value="orthographic" ${perspective?'':'selected'}>Ортографическая</option><option value="perspective" ${perspective?'selected':''}>Перспективная</option></select>`)}
 ${number('fov','FOV камеры, °',15,100,1,!perspective)}
 <input class="ed-fov-slider" type="range" aria-label="Угол обзора камеры" data-camera="fov" value="${c.fov}" min="15" max="100" step="1" ${perspective?'':'disabled'}>
 ${number('height','Высота кадра, м',2,80,.1,perspective)}${number('distance','Расстояние камеры, м',3,100,.1)}
 ${followTarget&&!activeNode?field('Слежение',`<select aria-label="Слежение камеры" data-camera="follow">${Object.entries({adaptive:'Авто: экран и персонаж',fixed:'Неподвижный кадр',horizontal:'За персонажем по X',player:'За персонажем по X и Y'}).map(([value,label])=>`<option value="${value}" ${c.follow===value?'selected':''}>${label}</option>`).join('')}</select>`):''}
 ${number('centerX','Центр кадра X, м',-1000,1000,.1,activeNode||c.follow==='player'||c.follow==='horizontal')}${number('centerY','Центр кадра Y, м',-1000,1000,.1,activeNode||c.follow==='player')}
 ${followTarget&&!activeNode?number('offsetX','Смещение от героя X, м',-100,100,.1,c.follow==='fixed')+number('offsetY','Смещение от героя Y, м',-100,100,.1,c.follow==='fixed'||c.follow==='horizontal')+number('smoothing','Плавность слежения',0,20,.5,c.follow==='fixed'):''}
 <p class="ed-note">${perspective?'FOV и расстояние задают размер игрового кадра.':'Высота кадра задаёт охват в метрах. Расстояние не меняет масштаб ортографической камеры.'} ${followTarget&&!activeNode?'Авто: на узком экране камера следует за персонажем по X и Y, на широком — по X.':''}</p>
 <details class="ed-camera-advanced"><summary>Границы видимости</summary>${number('near','Ближняя граница, м',.01,2,.01)}${number('far','Дальняя граница, м',20,2000,1)}</details>
 <div class="ed-inspector-actions"><button class="ed-button ed-primary" data-action="game-preview">${preview?'Вернуться к сцене':'Проверить кадр'}</button><button class="ed-button" data-action="reset-camera">Сбросить камеру</button></div>
 ${field('Формат',`<select aria-label="Формат предпросмотра" data-preview="aspect">${Object.entries({window:'По размеру окна','16:9':'16:9 · широкий','4:3':'4:3 · классический','9:16':'9:16 · телефон'}).map(([value,label])=>`<option value="${value}" ${aspect===value?'selected':''}>${label}</option>`).join('')}</select>`)}
 <label class="ed-checks"><input type="checkbox" data-preview="guides" ${guides?'checked':''}>Сетка третей и безопасная область</label>
 <p class="ed-note">Кадр показывает вид игры на паузе. Формат и направляющие — только для проверки; рабочий ракурс восстановится при выходе.</p></section>`;
}
