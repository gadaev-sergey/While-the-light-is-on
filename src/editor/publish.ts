import type {ProjectSession} from '../engine/project.ts';
import {githubPagesUrl,githubRepository,type PublishInfo,type PublishResult} from '../engine/publishing.ts';
import {api,modal,escape,errorIn} from './ui.ts';

export async function openPublish(session:()=>ProjectSession,save:()=>Promise<boolean>){
 const project=session();
 const dialog=modal('Опубликовать на GitHub Pages',`
  <p class="publish-project"><strong>${escape(project.manifest.name)}</strong><span>Версия ${escape(project.manifest.gameVersion)}</span></p>
  <p>Сохраните игру в GitHub и поделитесь ссылкой — её можно будет открыть прямо в браузере.</p>
  <form data-publish-form>
   <label>Репозиторий GitHub<input name="repository" aria-label="Репозиторий GitHub" placeholder="владелец/репозиторий" autocomplete="off" required></label>
   <p class="publish-help"><a href="https://github.com/new" target="_blank" rel="noopener noreferrer">Создать репозиторий ↗</a> · Для каждой игры выбирайте отдельный репозиторий.</p>
   <div class="publish-destination"><span>АДРЕС ИГРЫ</span><output data-url>Укажите репозиторий</output></div>
   <p data-connection role="status">Проверка подключения GitHub…</p>
   <details data-auth><summary>Подключить GitHub с помощью токена</summary>
    <label>Токен GitHub<input type="password" name="githubToken" aria-label="Токен GitHub" autocomplete="off" spellcheck="false"></label>
    <p class="publish-help">Токен используется только для этой публикации и не сохраняется. Для выбранного репозитория нужны права Contents, Pages и Administration: Read and write.</p>
    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Создать токен GitHub ↗</a>
   </details>
   <p class="publish-help">При публикации сайт выбранного репозитория обновится этой игрой. GitHub Pages будет настроен на ветку gh-pages. Игра станет доступна посетителям сайта.</p>
   <progress max="100" value="0" aria-label="Ход публикации"></progress>
   <p data-stage aria-live="polite">Готово к публикации</p>
   <p class="publish-help">Окно можно закрыть — публикация продолжится. Оставьте движок запущенным до её завершения.</p>
   <pre data-log hidden></pre>
   <footer><button type="button" data-refresh hidden>Обновить статус</button><button type="submit" class="primary" data-publish disabled>Опубликовать игру</button></footer>
  </form>
  <div class="publish-result" data-result></div>`);
 dialog.classList.add('publish-dialog');
 const form=dialog.querySelector<HTMLFormElement>('form')!,repository=form.elements.namedItem('repository') as HTMLInputElement,secret=form.elements.namedItem('githubToken') as HTMLInputElement;
 const submit=dialog.querySelector<HTMLButtonElement>('[data-publish]')!,refresh=dialog.querySelector<HTMLButtonElement>('[data-refresh]')!;
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false,activeId='';
 dialog.addEventListener('close',()=>{closed=true;clearTimeout(timer);secret.value='';});
 const destination=()=>{try{dialog.querySelector('[data-url]')!.textContent=githubPagesUrl(repository.value);}catch{dialog.querySelector('[data-url]')!.textContent='Укажите владелец/репозиторий';}};
 repository.oninput=destination;
 const busy=(value:boolean)=>{submit.disabled=value;repository.disabled=value;secret.disabled=value;submit.textContent=value?'Публикация…':'Опубликовать игру';};
 const show=(job:PublishResult)=>{
  dialog.querySelector('progress')!.value=job.progress;
  dialog.querySelector('[data-stage]')!.textContent=job.stage;
  const log=dialog.querySelector<HTMLPreElement>('[data-log]')!;log.hidden=!job.log.length;log.textContent=job.log.join('\n');
  busy(job.status==='running');
  refresh.hidden=job.status!=='running';
  if(job.status==='error')errorIn(dialog,job.error||job.stage);
  const result=dialog.querySelector('[data-result]')!;
  if(job.status==='success'||job.status==='pending'||job.commit){
   result.innerHTML=`<p><strong>${job.status==='success'?'Игра доступна по ссылке':job.status==='pending'?'Сборка отправлена в GitHub':'Состояние публикации'}</strong></p><a class="button ${job.status==='success'?'primary':''}" href="${escape(job.url)}" target="_blank" rel="noopener noreferrer">${job.status==='success'?'Открыть игру ↗':'Проверить адрес игры ↗'}</a><button type="button" data-copy>Копировать ссылку</button><p><a href="${escape(job.actionsUrl)}" target="_blank" rel="noopener noreferrer">Журнал GitHub Actions ↗</a> · <a href="${escape(job.settingsUrl)}" target="_blank" rel="noopener noreferrer">Настройки Pages ↗</a></p>`;
   result.querySelector<HTMLButtonElement>('[data-copy]')!.onclick=async event=>{const button=event.currentTarget as HTMLButtonElement;try{await navigator.clipboard.writeText(job.url);button.textContent='Ссылка скопирована';}catch{errorIn(dialog,'Не удалось скопировать. Адрес игры: '+job.url);}};
  }
 };
 const poll=async()=>{
  if(closed||!activeId)return;
  clearTimeout(timer);
  try{const result=await api<PublishResult>('publish-status',{token:project.token,id:activeId});if(closed)return;errorIn(dialog,'');show(result);if(result.status==='running')timer=setTimeout(()=>void poll(),2000);}
  catch(error){if(!closed){errorIn(dialog,error);refresh.hidden=false;}}
 };
 refresh.onclick=()=>void poll();
 form.onsubmit=async event=>{
  event.preventDefault();clearTimeout(timer);errorIn(dialog,'');dialog.querySelector('[data-result]')!.replaceChildren();
  try{
   const target=githubRepository(repository.value);busy(true);
   if(!await save())throw new Error('Не удалось сохранить проект. Публикация остановлена.');
   if(closed)return;
   const current=session();if(current.token!==project.token)throw new Error('Открытый проект изменился. Откройте публикацию заново.');
   let job:PublishResult;
   try{job=await api<PublishResult>('publish',{token:current.token,revision:current.revision,repository:target,githubToken:secret.value||undefined});}finally{secret.value='';}
   activeId=job.id;if(closed)return;show(job);if(job.status==='running')timer=setTimeout(()=>void poll(),1000);
  }catch(error){if(!closed){busy(false);errorIn(dialog,error);}}
 };
 try{
  const info=await api<PublishInfo>('publish-info',{token:project.token});if(closed)return;
  if(!repository.value)repository.value=info.repository;
  destination();
  dialog.querySelector('[data-connection]')!.textContent=info.connected?'GitHub подключён на этом компьютере.':'Для публикации подключите GitHub с помощью токена.';
  dialog.querySelector<HTMLDetailsElement>('[data-auth]')!.open=!info.connected;
  busy(false);
  if(info.last){show(info.last);if(info.last.status==='running'){activeId=info.last.id;void poll();}}
 }catch(error){if(!closed){busy(false);errorIn(dialog,error);dialog.querySelector('[data-connection]')!.textContent='Укажите репозиторий и токен GitHub.';dialog.querySelector<HTMLDetailsElement>('[data-auth]')!.open=true;}}
}
