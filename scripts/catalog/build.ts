import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {githubRepository,githubPagesUrl} from '../../src/engine/publishing.ts';
import {portablePath} from '../../src/engine/project.ts';
import {inside,atomic,json} from '../engine/files.ts';
import {syncUsage} from '../engine/usage.ts';
import {formatTokens,formatPercent,type UsageSummary} from '../../src/engine/usage.ts';

export interface CatalogGame {
 id:string;project:string;projectId:string;repository:string;url:string;title:string;subtitle:string;genre:string;description:string;
 details:string[];controls:string;preview:string;previewAlt:string;theme:'teal'|'lime'|'amber';status:'release'|'prototype';published:boolean;
 release?:{version:string;date:string;commit:string};
}
export interface Catalog {schemaVersion:1;repository:string;url:string;games:CatalogGame[]}
export const engineRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function validateCatalog(input:unknown):Catalog {
 const catalog=input as Catalog;
 if(catalog?.schemaVersion!==1||!Array.isArray(catalog.games))throw new Error('Некорректный каталог.');
 if(githubPagesUrl(githubRepository(catalog.repository))!==catalog.url)throw new Error('Адрес каталога не соответствует репозиторию.');
 const ids=new Set<string>(),projects=new Set<string>();
 for(const game of catalog.games){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id)||ids.has(game.id)||!portablePath(game.project)||!game.project.startsWith('games/')||projects.has(game.project)||typeof game.projectId!=='string'||!game.projectId)throw new Error('Повтор или неверная идентичность игры.');
  ids.add(game.id);projects.add(game.project);
  if(githubPagesUrl(githubRepository(game.repository))!==game.url)throw new Error('Адрес игры не соответствует репозиторию: '+game.id);
  for(const field of ['title','subtitle','genre','description','controls','previewAlt'] as const)if(typeof game[field]!=='string'||!game[field].trim()||game[field].length>1000)throw new Error('Заполните '+field+' для '+game.id);
  if(!portablePath(game.preview)||!/^assets\/[^/]+\.(jpg|jpeg|png|webp)$/.test(game.preview)||!Array.isArray(game.details)||game.details.some(text=>typeof text!=='string'||text.length>80)||!['teal','lime','amber'].includes(game.theme)||!['release','prototype'].includes(game.status)||typeof game.published!=='boolean')throw new Error('Проверьте оформление карточки: '+game.id);
  if(game.published&&(!game.release?.version||!/^\d{4}-\d{2}-\d{2}$/.test(game.release.date)||!Number.isFinite(Date.parse(game.release.date))||!/^[a-f0-9]{40}$/.test(game.release.commit)))throw new Error('Нет подтверждённого выпуска: '+game.id);
 }
 return structuredClone(catalog);
}
export async function readCatalog(root=engineRoot){return validateCatalog(JSON.parse(await fs.readFile(path.join(root,'catalog/games.json'),'utf8')));}
export function renderUsage(usage?:UsageSummary){
 if(!usage||usage.status==='unavailable')return '<section class="game-usage"><span class="usage-eyebrow">РАЗРАБОТКА С ИИ</span><p class="usage-unavailable">Расход ещё не зафиксирован</p><small>Статистика появится после учтённого этапа разработки.</small></section>';
 return `<section class="game-usage"><span class="usage-eyebrow">РАЗРАБОТКА С ИИ</span><p class="usage-count"><strong>${formatTokens(usage.totalTokens)}</strong> токенов</p><ul class="usage-shares">${usage.models.map(m=>`<li><span>${escape(m.model==='unknown'?'Модель не определена':m.model)}</span><strong>${formatPercent(m.percent)}</strong></li>`).join('')}</ul><small>Доли по токенам · учтённые этапы · вход + выход с кэшем</small></section>`;
}
export function renderCard(game:CatalogGame,index:number,wide=false,usage?:UsageSummary){
 const play='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13 8Z"/></svg>';
 const date=game.release!.date.split('-').reverse().join('.');
 return `<article class="game theme-${game.theme}${wide?' wide-card':''}" data-game="${game.id}"><a class="game-card" href="${escape(game.url)}" target="_blank" rel="noopener noreferrer" aria-label="Играть в ${escape(game.title)}: ${escape(game.subtitle)} (новая вкладка)"><div class="game-cover"><img src="./${escape(game.preview)}?v=${game.release!.commit.slice(0,8)}" width="1440" height="900" alt="${escape(game.previewAlt)}" ${index===0?'fetchpriority="high"':'loading="lazy"'}><span class="cover-index">${String(index+1).padStart(2,'0')} / SHELTER ORIGINAL</span><span class="cover-play">${play}</span></div><div class="game-content"><div class="game-topline"><span class="game-genre">${escape(game.genre)}</span><span class="game-status ${game.status==='prototype'?'status-prototype':''}">${game.status==='prototype'?'Прототип':'Полная игра'}</span></div><h3 class="game-title">${escape(game.title)}</h3><p class="game-subtitle">${escape(game.subtitle)}</p><p class="game-description">${escape(game.description)}</p><ul class="game-details">${game.details.map(detail=>'<li>'+escape(detail)+'</li>').join('')}</ul>${renderUsage(usage)}<div class="game-bottom"><span class="game-version">Версия ${escape(game.release!.version)}<time datetime="${game.release!.date}">Обновлено ${date}</time></span><span class="play-button">${play}Играть</span></div><p class="game-controls">${escape(game.controls)}</p></div></a></article>`;
}
export async function buildCatalog(root=engineRoot){
 const catalog=await readCatalog(root),games=catalog.games.filter(game=>game.published);
 if(!games.length)throw new Error('В каталоге нет опубликованных игр.');
 const output=path.join(root,'artifacts/catalog/site');
 const template=await fs.readFile(path.join(root,'catalog/index.template.html'),'utf8'),style=await fs.readFile(path.join(root,'catalog/style.css'),'utf8');
 const previews=new Map<string,Buffer>();
 for(const game of games){const file=await inside(path.join(root,'catalog'),game.preview);previews.set(game.preview,await fs.readFile(file));}
 const usage=new Map<string,UsageSummary>();
 for(const game of games){
  try{const project=await inside(root,game.project);const state=await syncUsage(root,project);usage.set(game.id,state.summary);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 const cards=games.map((game,i)=>renderCard(game,i,games.length%2===1&&i===games.length-1,usage.get(game.id))).join('\n');
 const digest=createHash('sha256').update(JSON.stringify(catalog)).update(JSON.stringify([...usage])).update(template).update(style).update(cards);
 for(const bytes of previews.values())digest.update(bytes);
 const revision=digest.digest('hex').slice(0,12);
 const html=template.replaceAll('{{url}}',escape(catalog.url)).replaceAll('{{revision}}',revision).replaceAll('{{count}}',String(games.length).padStart(2,'0')).replace('{{cards}}',cards);
 if(/\{\{[a-z]+\}\}/i.test(html))throw new Error('В HTML остался незаполненный шаблон.');
 await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
 await atomic(path.join(output,'index.html'),html);await atomic(path.join(output,'style.css'),style);
 for(const [file,bytes] of previews)await atomic(path.join(output,file),bytes);
 await atomic(path.join(output,'catalog-release.json'),json({revision,games:games.map(game=>({id:game.id,url:game.url,...game.release,usage:usage.get(game.id)}))}));
 return {output,revision,catalog};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCatalog(),(key,value)=>key==='catalog'?undefined:value));
