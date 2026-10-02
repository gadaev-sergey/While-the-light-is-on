import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bindUsage,syncUsage} from './usage.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [command,folder,...args]=process.argv.slice(2);
const flag=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
if(!folder||!['begin','sync'].includes(command))throw new Error('npm run usage:begin -- games/<id> [--thread UUID --turn UUID] [--claude] или npm run usage:sync -- games/<id>');
const project=path.resolve(root,folder);
if(command==='begin'){
 // Чат Codex даёт CODEX_THREAD_ID, сеанс Claude Code — CLAUDE_CODE_SESSION_ID; --claude выбирает журнал Claude Code явно.
 const claude=args.includes('--claude')||!flag('--thread')&&!process.env.CODEX_THREAD_ID&&!!process.env.CLAUDE_CODE_SESSION_ID;
 const thread=flag('--thread')||(claude?process.env.CLAUDE_CODE_SESSION_ID:process.env.CODEX_THREAD_ID);
 if(!thread)throw new Error('Запустите команду в чате Codex или Claude Code либо укажите --thread UUID (и --claude для журнала Claude Code).');
 await bindUsage(root,project,thread,flag('--turn'),undefined,claude?'claude':'codex');
}
console.log(JSON.stringify(await syncUsage(root,project),null,2));
