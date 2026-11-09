import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';vm.runInThisContext(await readFile('src/recorder.js','utf8'));
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
test('combined recording frames the live arena and sidebar on desktop and mobile',()=>{
 const arena=rect(0,0,1100,900),sidebar=rect(1100,0,340,900);
 assert.deepEqual(CellLabVideo.captureBounds(arena,sidebar,'arena'),arena);
 assert.deepEqual(CellLabVideo.captureBounds(arena,sidebar,'workspace'),rect(0,0,1440,900));
 assert.deepEqual(CellLabVideo.captureBounds(rect(0,0,390,280),rect(0,280,390,420),'workspace'),rect(0,0,390,700));
 assert.throws(()=>CellLabVideo.captureBounds(arena,null,'workspace'));
 assert.throws(()=>CellLabVideo.captureBounds(arena,sidebar,'screen'));
});
test('recording crops the visible arena consistently under cover zoom and pan',()=>{const r=CellLabVideo.framing(rect(-120,0,1340,1000),rect(0,0,1100,1000),1100,1000,{width:2680,height:2000});assert.deepEqual(r,{sx:240,sy:0,sw:2200,sh:2000,dx:0,dy:0,dw:1100,dh:1000});assert.equal(r.dw/r.sw,r.dh/r.sh);});
test('recording keeps proportions when the viewport is resized or the full culture is shown',()=>{const r=CellLabVideo.framing(rect(0,88,1100,825),rect(0,0,1100,1000),550,500,{width:2200,height:1650});assert.equal(r.sy,0);assert.equal(r.dy,44);assert.equal(r.dw,550);assert.equal(r.dh,412.5);assert.equal(r.dw/r.sw,r.dh/r.sh);assert.equal(CellLabVideo.framing(rect(200,200,10,10),rect(0,0,100,100),100,100,{width:10,height:10}),null);});
test('recording quality sets real even pixel dimensions independently of CSS size',()=>{
 const high=CellLabVideo.plan({width:1098,height:1000});assert.deepEqual(high,{width:1580,height:1440,fps:30,bitrate:24000000,quality:'high'});
 const phone=CellLabVideo.plan({width:390,height:280});assert.ok(phone.width>1900&&phone.height===1440);
 assert.equal(CellLabVideo.plan({width:1920,height:1080},'ultra').width,3840);
 const portrait=CellLabVideo.plan({width:900,height:1600},'standard');assert.equal(portrait.width,1080);assert.equal(portrait.height,1920);
 for(const quality of ['standard','high','ultra']){const p=CellLabVideo.plan({width:399,height:517},quality);assert.equal(p.width%2,0);assert.equal(p.height%2,0);assert.ok(Math.abs(p.width/p.height-399/517)<.002);}
 assert.throws(()=>CellLabVideo.plan({width:0,height:1}));
});
test('MP4 is the default and cannot silently fall back to a WebM container',()=>{
 const both=CellLabVideo.candidates(undefined,()=>true);assert.ok(both.every(type=>type.startsWith('video/mp4')&&type.includes('avc1')));
 assert.deepEqual(CellLabVideo.candidates('mp4',type=>type.startsWith('video/webm')),[]);
 assert.ok(CellLabVideo.candidates('webm',()=>true).every(type=>type.startsWith('video/webm')));
});
test('streaming WebM gets a finite duration without changing encoded payload; other formats remain untouched',async()=>{
 const bytes=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x80,0x18,0x53,0x80,0x67,0x01,255,255,255,255,255,255,255,0x15,0x49,0xa9,0x66,0x90,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40,0x57,0x41,0x86,67,104,114,111,109,101,0x1f,0x43,0xb6,0x75,0xff,0x01,0x02,0x03]);
 const original=new Blob([bytes],{type:'video/webm'}),fixed=await CellLabVideo.finalizeWebM(original,3.5),result=new Uint8Array(await fixed.arrayBuffer());
 assert.equal(fixed.size,original.size+11);assert.deepEqual(result.slice(-8),bytes.slice(-8));
 const index=result.findIndex((b,i)=>b===0x44&&result[i+1]===0x89);assert.equal(new DataView(result.buffer).getFloat64(index+3),3500);
 assert.equal(await CellLabVideo.finalizeWebM(fixed,9),fixed);
 const mp4=new Blob([bytes],{type:'video/mp4'});assert.equal(await CellLabVideo.finalizeWebM(mp4,3.5),mp4);
 assert.equal(await CellLabVideo.finalizeWebM(new Blob(['invalid'],{type:'video/webm'}),3.5) instanceof Blob,true);
});
