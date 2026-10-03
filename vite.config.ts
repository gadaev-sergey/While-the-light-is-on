import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {enginePlugin} from './scripts/engine/service.ts';
export default defineConfig({base:'./',plugins:[enginePlugin()],resolve:{alias:[{find:'@shelter',replacement:fileURLToPath(new URL('./src/engine',import.meta.url))},{find:/^three$/,replacement:fileURLToPath(new URL('./node_modules/three/build/three.module.js',import.meta.url))},{find:/^three\/addons\//,replacement:fileURLToPath(new URL('./node_modules/three/examples/jsm/',import.meta.url))}]},server:{host:'127.0.0.1',watch:{ignored:['**/.shelter-cache/**','**/projects/**','**/artifacts/**','**/games/**/scenes/**','**/games/**/settings/**']}},build:{rollupOptions:{input:{editor:'index.html',player:'player.html'}}}});
