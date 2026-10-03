import {api,modal,escape,errorIn} from './ui.ts';
import {formatTokens,formatPercent,type UsageSummary} from '../engine/usage.ts';
import type {ProjectSession} from '../engine/project.ts';

export async function openUsage(session:ProjectSession){
 const dialog=modal('ИИ · статистика разработки',`<p><strong>${escape(session.manifest.name)}</strong></p><div data-usage aria-live="polite">Читаю статистику…</div><footer><button data-refresh>Обновить</button></footer>`);
 dialog.classList.add('usage-dialog');let closed=false,busy=false,timer:ReturnType<typeof setTimeout>;
 const refresh=async()=>{
  if(closed||busy)return;busy=true;
  try{
   const {summary:s,warnings}=await api<{summary:UsageSummary;warnings:string[]}>('usage',{token:session.token});if(closed)return;errorIn(dialog,'');
   dialog.querySelector('[data-usage]')!.innerHTML=s.status==='unavailable'?`<div class="usage-empty"><h3>Расход пока не зафиксирован</h3><p>Это не означает, что на игру потрачено 0 токенов. Для следующего этапа разработки Codex привяжет учёт к этому проекту.</p><p>Команда для разработчика:</p><code>npm run usage:begin -- ${escape(JSON.stringify(session.path))}</code></div>`:`<div class="usage-total"><strong>${formatTokens(s.totalTokens)}</strong><span>учтённых токенов</span></div><p class="usage-caption">По записанным этапам разработки · запросов: ${formatTokens(s.requests)} · этапов: ${formatTokens(s.turns)}</p><div class="usage-models">${s.models.map((m,i)=>`<div class="usage-model"><div><strong>${escape(m.model==='unknown'?'Модель не определена':m.model)}</strong><b>${formatPercent(m.percent)}</b></div><div class="usage-track"><span style="width:${m.percent}%;--model-color:var(--usage-${i%4})"></span></div><small>${formatTokens(m.totalTokens)} токенов</small></div>`).join('')}</div><dl class="usage-breakdown"><div><dt>Входящие</dt><dd>${formatTokens(s.inputTokens)}</dd></div><div><dt>Из них из кэша</dt><dd>${formatTokens(s.cachedInputTokens)}</dd></div><div><dt>Исходящие</dt><dd>${formatTokens(s.outputTokens)}</dd></div><div><dt>Из них рассуждения</dt><dd>${formatTokens(s.reasoningOutputTokens)}</dd></div></dl><p class="usage-caption">Всего = входящие + исходящие. Кэш и рассуждения уже входят в эти числа. Доля модели — процент токенов, а не оценка её вклада в код. Неучтённые этапы не включены.</p><p class="usage-caption">Последняя запись: ${escape(new Date(s.updatedAt!).toLocaleString('ru-RU'))}. Обновление каждые 5 секунд; каталог получает снимок при публикации.</p>`;
   if(warnings.length)dialog.querySelector('[data-usage]')!.insertAdjacentHTML('beforeend','<p class="usage-warning">'+warnings.map(escape).join('<br>')+'</p>');
  }catch(e){if(!closed)errorIn(dialog,e);}finally{busy=false;clearTimeout(timer);if(!closed)timer=setTimeout(()=>void refresh(),5000);}
 };
 dialog.addEventListener('close',()=>{closed=true;clearTimeout(timer);});dialog.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick=()=>void refresh();
 await refresh();
}
