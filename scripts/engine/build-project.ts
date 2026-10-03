import path from 'node:path';
import * as fs from 'node:fs/promises';
import {readProject} from './files.ts';
import {startBuild} from './build.ts';

// Developer/CI entry; the editor button uses the same pipeline.
const root=process.cwd(),project=path.resolve(process.argv[2]||'games/while-the-light-is-on');
const snapshot=await readProject(project);
if(process.argv.includes('--pages'))snapshot.manifest.build.base='/While-the-light-is-on/';
snapshot.manifest.build.output=path.join(root,'artifacts/builds',snapshot.manifest.projectId);
const build=await startBuild(root,project,snapshot);
while(build.status==='running')await new Promise(resolve=>setTimeout(resolve,200));
if(build.status!=='success')throw new Error(build.error||build.stage);
if(process.argv.includes('--pages')){
 const dist=path.join(root,'dist');await fs.mkdir(dist,{recursive:true});
 // Vite normally owns dist; its previous output is replaced only after a successful build.
 await fs.rename(dist,path.join(root,'.shelter-cache','previous-dist-'+Date.now()));
 await fs.cp(build.output!,dist,{recursive:true});
}
console.log(build.output);
