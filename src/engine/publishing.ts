/** Public publishing state. Credentials never cross back into the editor. */
export interface PublishResult {
 id:string;
 status:'running'|'success'|'error'|'pending';
 stage:string;
 progress:number;
 log:string[];
 repository:string;
 url:string;
 settingsUrl:string;
 actionsUrl:string;
 commit?:string;
 error?:string;
}
export interface PublishInfo {
 repository:string;
 connected:boolean;
 last?:PublishResult;
}

export function githubRepository(input:unknown):string {
 if(typeof input!=='string')throw new Error('Укажите репозиторий GitHub: владелец/репозиторий.');
 const value=input.trim().replace(/^https:\/\/github\.com\//i,'').replace(/^git@github\.com:/i,'').replace(/\/$/,'').replace(/\.git$/,'');
 const parts=value.split('/');
 if(parts.length!==2||!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(parts[0])||!/^[\w.-]{1,100}$/.test(parts[1])||/^\.{1,2}$/.test(parts[1]))throw new Error('Укажите владелец/репозиторий или ссылку https://github.com/владелец/репозиторий.');
 return value;
}

export function githubPagesUrl(repository:string):string {
 const [owner,repo]=githubRepository(repository).split('/');
 return `https://${owner.toLowerCase()}.github.io/${repo.toLowerCase()===owner.toLowerCase()+'.github.io'?'':repo+'/'}`;
}
