import {spawnSync} from 'node:child_process';import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
await mkdir('build',{recursive:true});
const compiler=process.env.WASI_CLANG||'.tooling/wasi-sdk-20.0+m/bin/clang.exe';
for(const [name,memory] of [['cpm-kernel',134217728],['appearance-kernel',50331648]]){
const args=['--target=wasm32','-O3','-ffp-contract=off','-fno-fast-math','-mbulk-memory','-nostdlib','-Wl,--no-entry','-Wl,--export-memory','-Wl,--initial-memory='+memory,'-Wl,--max-memory='+memory,'-Wl,-z,stack-size=65536',`src/${name}.c`,'-o',`build/${name}.wasm`];
const result=spawnSync(compiler,args,{stdio:'inherit',windowsHide:true,env:{...process.env,TEMP:path.resolve('build'),TMP:path.resolve('build'),TMPDIR:path.resolve('build')}});if(result.error)throw result.error;process.exitCode=result.status;
if(result.status!==0)break;
const hash=async f=>createHash('sha256').update(await readFile(f)).digest('hex');const source=(await readFile(`src/${name}.c`,'utf8')).replace(/\r\n/g,'\n');await writeFile(`build/${name}.meta.json`,JSON.stringify({sourceSHA256:createHash('sha256').update(source).digest('hex'),wasmSHA256:await hash(`build/${name}.wasm`),compiler:'WASI SDK 20 / Clang 16',flags:args},null,2));
}
