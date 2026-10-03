import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {inspectGLTF} from '../../src/engine/asset-format.ts';

test('The four game GLBs with embedded WebP textures can be registered as project assets',async()=>{
 for(const [name,triangles] of [['wardrobe',2454],['crates',4212],['sink',8266],['bed',5408]] as const){
  const file=`games/while-the-light-is-on/assets/base/models/${name}.glb`;
  const bytes=await fs.readFile(file),metadata=inspectGLTF(bytes,file,new Set([file]));
  assert.equal(metadata.triangles,triangles,name);
  assert.deepEqual(metadata.dependencies,[],name+' embeds its textures');
 }
});
