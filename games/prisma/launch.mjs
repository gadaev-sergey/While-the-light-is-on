import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),releases=path.join(root,'artifacts/builds/prisma-garden-of-light'),port=5195,url=`http://127.0.0.1:${port}/`;
async function latest(){try{const dirs=(await readdir(releases,{withFileTypes:true})).filter(d=>d.isDirectory());const entries=await Promise.all(dirs.map(async d=>({path:path.join(releases,d.name),time:(await stat(path.join(releases,d.name,'build-report.json'))).mtimeMs})));return entries.sort((a,b)=>b.time-a.time)[0]?.path;}catch{return undefined;}}
let directory=await latest();
if(!directory){await new Promise((resolve,reject)=>{const p=spawn('npm',['run','build:game','--','games/prisma'],{cwd:root,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Не удалось собрать игру.')));});directory=await latest();}
if(!directory)throw new Error('Сначала соберите игру.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url||'/',url).pathname),file=path.resolve(directory,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(directory+path.sep)){res.writeHead(403).end();return;}const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Prisma-Game':'garden-of-light'});res.end(bytes);}catch{res.writeHead(404).end('Файл не найден');}});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`ПРИЗМА · САД СВЕТА\n${url}\nCtrl+C — остановить игру.`);if(!process.argv.includes('--no-open'))spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'}).on('error',()=>{});});
