// Legacy standalone game entry. The editor never imports the example game.
import {runProject} from './engine/player.ts';
import module from '../games/while-the-light-is-on/scripts/runtime.ts';
const session=await (await fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:(await (await fetch('/api/info')).json()).example})})).json();
await runProject(session,[module],session.manifest.startScene,p=>'/api/file/'+session.token+'/'+p);
