import {spawnSync} from 'node:child_process';import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
await mkdir('build',{recursive:true});
const compiler=process.env.WASI_CLANG||'.tooling/wasi-sdk-20.0+m/bin/clang.exe';
const args=['--target=wasm32','-O3','-ffp-contract=off','-fno-fast-math','-nostdlib','-Wl,--no-entry','-Wl,--export-memory','-Wl,--initial-memory=134217728','-Wl,--max-memory=134217728','-Wl,-z,stack-size=65536','src/cpm-kernel.c','-o','build/cpm-kernel.wasm'];
const result=spawnSync(compiler,args,{stdio:'inherit',windowsHide:true,env:{...process.env,TEMP:path.resolve('build'),TMP:path.resolve('build'),TMPDIR:path.resolve('build')}});if(result.error)throw result.error;process.exitCode=result.status;
if(result.status===0){const hash=async f=>createHash('sha256').update(await readFile(f)).digest('hex');await writeFile('build/cpm-kernel.meta.json',JSON.stringify({sourceSHA256:await hash('src/cpm-kernel.c'),wasmSHA256:await hash('build/cpm-kernel.wasm'),compiler:'WASI SDK 20 / Clang 16',flags:args},null,2));}
