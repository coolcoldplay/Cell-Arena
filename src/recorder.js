/* Local arena-only video capture; never records the desktop or microphone. */
(() => {
  'use strict';
  function framing(source,view,width,height,pixels){
    const left=Math.max(source.left,view.left),top=Math.max(source.top,view.top),right=Math.min(source.right,view.right),bottom=Math.min(source.bottom,view.bottom),scale=Math.min(width/view.width,height/view.height);
    if(right<=left||bottom<=top)return null;
    return {sx:(left-source.left)*pixels.width/source.width,sy:(top-source.top)*pixels.height/source.height,sw:(right-left)*pixels.width/source.width,sh:(bottom-top)*pixels.height/source.height,dx:(width-view.width*scale)/2+(left-view.left)*scale,dy:(height-view.height*scale)/2+(top-view.top)*scale,dw:(right-left)*scale,dh:(bottom-top)*scale};
  }
  // Chromium's streaming WebM omits Duration. Add it to Segment Info so
  // players can show a finite timeline; encoded video bytes are untouched.
  // Element IDs/units: https://www.matroska.org/technical/elements.html
  // Only handle the unindexed Chrome streaming layout; preserve other muxers.
  async function finalizeWebM(blob,seconds){
    if(!blob.type.includes('webm')||!(seconds>0))return blob;
    const bytes=new Uint8Array(await blob.slice(0,65536).arrayBuffer());
    function vint(offset,id=false){let length=1,mask=128;while(length<=8&&!(bytes[offset]&mask)){length++;mask>>=1;}if(length>8||offset+length>bytes.length)throw Error('Invalid EBML');let value=id?bytes[offset]:bytes[offset]&(mask-1),unknown=!id&&value===mask-1;for(let j=1;j<length;j++){value=value*256+bytes[offset+j];unknown=unknown&&bytes[offset+j]===255;}return {length,value,unknown};}
    function element(offset){const id=vint(offset,true),size=vint(offset+id.length),data=offset+id.length+size.length;return{id:id.value,offset,sizeOffset:offset+id.length,size,data,end:data+size.value};}
    try{
      const header=element(0);if(header.id!==0x1a45dfa3)return blob;const segment=element(header.end);if(segment.id!==0x18538067||!segment.size.unknown)return blob;
      let info=null,cluster=null;
      for(let p=segment.data;p<bytes.length;){const e=element(p);if(e.id===0x114d9b74||e.id===0x1c53bb6b)return blob;if(e.id===0x1549a966)info=e;if(e.id===0x1f43b675){cluster=e;break;}if(e.end>bytes.length||e.end<=p)return blob;p=e.end;}
      if(!info||!cluster||info.end>bytes.length)return blob;
      let scale=1000000,chrome=false;
      for(let p=info.data;p<info.end;){const e=element(p);if(e.end>info.end)return blob;if(e.id===0x4489)return blob;if(e.id===0x2ad7b1){scale=0;for(let i=e.data;i<e.end;i++)scale=scale*256+bytes[i];}if(e.id===0x5741)chrome=new TextDecoder().decode(bytes.slice(e.data,e.end))==='Chrome';p=e.end;}
      const size=info.size.value+11;if(!chrome||!(scale>0)||size>=2**(info.size.length*7)-1)return blob;
      const prefix=bytes.slice(0,info.end);let remaining=size;for(let i=info.size.length-1;i>=0;i--){prefix[info.sizeOffset+i]=remaining%256;remaining=Math.floor(remaining/256);}prefix[info.sizeOffset]|=1<<(8-info.size.length);
      const duration=new Uint8Array(11);duration.set([0x44,0x89,0x88]);new DataView(duration.buffer).setFloat64(3,seconds*1e9/scale);
      return new Blob([prefix,duration,blob.slice(info.end)],{type:blob.type});
    }catch{return blob;}
  }
  class ArenaRecorder {
    constructor(canvas,viewport,{onChange=()=>{},onReady=()=>{},onError=()=>{}}={}){this.canvas=canvas;this.viewport=viewport;this.onChange=onChange;this.onReady=onReady;this.onError=onError;this.session=null;this.last={active:false,elapsed:0,bytes:0};}
    static supported(){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';}
    get status(){const s=this.session;return s?{active:s.recorder.state!=='inactive',stopping:s.stopping,elapsed:(performance.now()-s.started)/1000,bytes:s.bytes,width:s.output.width,height:s.output.height,mimeType:s.recorder.mimeType}:this.last;}
    start(){
      if(this.session)return;if(!ArenaRecorder.supported())throw Error('浏览器不支持视频录制，请使用新版 Chrome、Edge 或 Safari');
      const rect=this.viewport.getBoundingClientRect(),scale=Math.min(1,1920/rect.width,1080/rect.height),output=document.createElement('canvas');output.width=Math.max(2,Math.round(rect.width*scale/2)*2);output.height=Math.max(2,Math.round(rect.height*scale/2)*2);
      const stream=output.captureStream(30),mime=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));let recorder;
      try{recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:6000000});}catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
      const session={output,ctx:output.getContext('2d',{alpha:false}),stream,recorder,chunks:[],bytes:0,started:performance.now(),lastFrame:-Infinity,lastNotice:0,raf:0,stopping:false,error:null};this.session=session;
      session.done=new Promise(resolve=>session.resolve=resolve);
      recorder.ondataavailable=event=>{if(event.data.size){session.chunks.push(event.data);session.bytes+=event.data.size;}};
      recorder.onerror=event=>{session.error=event.error||Error('视频录制失败');this.stop();};
      recorder.onstop=async()=>{
        cancelAnimationFrame(session.raf);stream.getTracks().forEach(t=>t.stop());const elapsed=((session.stoppedAt||performance.now())-session.started)/1000;let blob=new Blob(session.chunks,{type:recorder.mimeType||mime||'video/webm'});session.chunks=[];
        try{blob=await finalizeWebM(blob,elapsed);}catch{/* Keep a playable original if metadata finalization fails. */}
        this.last={active:false,elapsed,bytes:blob.size,width:output.width,height:output.height,mimeType:blob.type};if(this.session===session)this.session=null;this.onChange(this.last);
        if(session.error)this.onError(session.error);if(blob.size)this.onReady(blob,this.last);else if(!session.error)this.onError(Error('录制没有生成视频，请重试'));session.resolve(blob);
      };
      const draw=now=>{if(this.session!==session||session.stopping)return;if(now-session.lastFrame>=1000/30){const r=framing(this.canvas.getBoundingClientRect(),this.viewport.getBoundingClientRect(),output.width,output.height,this.canvas);session.ctx.fillStyle='#eee4d2';session.ctx.fillRect(0,0,output.width,output.height);session.ctx.imageSmoothingEnabled=false;if(r)session.ctx.drawImage(this.canvas,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh);session.lastFrame=now;}if(now-session.lastNotice>250){session.lastNotice=now;this.onChange(this.status);}session.raf=requestAnimationFrame(draw);};
      try{draw(performance.now());recorder.start(1000);this.onChange(this.status);}catch(error){cancelAnimationFrame(session.raf);stream.getTracks().forEach(t=>t.stop());this.session=null;throw error;}
    }
    stop(){const s=this.session;if(!s)return Promise.resolve(null);if(!s.stopping){s.stopping=true;s.stoppedAt=performance.now();cancelAnimationFrame(s.raf);if(s.recorder.state!=='inactive')s.recorder.stop();this.onChange(this.status);}return s.done;}
  }
  globalThis.CellLabVideo={ArenaRecorder,framing,finalizeWebM};
})();
