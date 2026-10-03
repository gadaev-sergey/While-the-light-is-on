import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const releases=path.join(root,'artifacts/builds/hellrift-last-stand');
const port=5200,url=`http://127.0.0.1:${port}/`;
async function latest(){try{const dirs=(await readdir(releases,{withFileTypes:true})).filter(x=>x.isDirectory());const list=await Promise.all(dirs.map(async d=>({path:path.join(releases,d.name),time:(await stat(path.join(releases,d.name,'build-report.json'))).mtimeMs})));return list.sort((a,b)=>b.time-a.time)[0]?.path;}catch{return undefined;}}
let directory=await latest();
if(!directory){console.log('Подготавливаю игру…');await new Promise((resolve,reject)=>{const p=spawn('npm',['run','build:game','--','games/hellrift'],{cwd:root,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Не удалось собрать игру.')));});directory=await latest();}
if(!directory)throw new Error('Не найдена готовая сборка Разлом.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{const relative=decodeURIComponent(new URL(req.url||'/',url).pathname);const file=path.resolve(directory,'.'+(relative==='/'?'/index.html':relative));if(file!==directory&&!file.startsWith(directory+path.sep)){res.writeHead(403).end();return;}const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Hellrift-Game':'last-stand'});res.end(bytes);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Файл не найден');}
});
const open=()=>{if(process.argv.includes('--no-open'))return;const command=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open';const args=process.platform==='win32'?['/c','start','',url]:[url];spawn(command,args,{stdio:'ignore'}).on('error',()=>console.log('Откройте '+url));};
server.on('error',async err=>{if(err.code==='EADDRINUSE'){try{const response=await fetch(url);if(response.headers.get('X-Hellrift-Game')==='last-stand'){console.log('Игра уже запущена: '+url);open();return;}}catch{}console.error('Порт 5200 занят другим приложением. Освободите его и запустите снова.');process.exitCode=1;}else{console.error(err.message);process.exitCode=1;}});
server.listen(port,'127.0.0.1',()=>{console.log(`\nРАЗЛОМ · ПОСЛЕДНИЙ РУБЕЖ\n${url}\n\nОставьте это окно открытым, пока играете.\nCtrl+C — остановить игру.\n`);open();});
