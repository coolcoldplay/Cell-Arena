/* Local arena / app-sidebar capture; never records the desktop or microphone. */
(() => {
  'use strict';
  function captureBounds(arena,sidebar,scope='arena'){
    if(scope==='arena')return arena;
    if(scope!=='workspace'||!sidebar)throw Error('Invalid recording scope');
    const left=Math.min(arena.left,sidebar.left),top=Math.min(arena.top,sidebar.top),right=Math.max(arena.right,sidebar.right),bottom=Math.max(arena.bottom,sidebar.bottom);
    return {left,top,right,bottom,width:right-left,height:bottom-top};
  }
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
  const QUALITIES=Object.freeze({
    standard:{short:1080,long:1920,bitrate:12000000},
    high:{short:1440,long:2560,bitrate:24000000},
    ultra:{short:2160,long:3840,bitrate:48000000}
  });
  const FORMATS=Object.freeze({
    mp4:['video/mp4;codecs=avc1.640033','video/mp4;codecs=avc1'],
    webm:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
  });
  function plan(rect,quality='high'){
    const q=QUALITIES[quality];if(!q||![rect.width,rect.height].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid recording dimensions or quality');
    const landscape=rect.width>=rect.height,scale=Math.min((landscape?q.long:q.short)/rect.width,(landscape?q.short:q.long)/rect.height);
    // Even dimensions satisfy H.264; sizing is independent of CSS pixels/DPR.
    return {width:Math.max(2,Math.floor(rect.width*scale/2)*2),height:Math.max(2,Math.floor(rect.height*scale/2)*2),fps:30,bitrate:q.bitrate,quality};
  }
  function candidates(format='mp4',supports=type=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(type)){
    return (FORMATS[format]||[]).filter(supports);
  }
  class ArenaRecorder {
    constructor(canvas,viewport,{sidebar=null,captureSidebar=null,onChange=()=>{},onReady=()=>{},onError=()=>{},onResolution=()=>{}}={}){
      Object.assign(this,{canvas,viewport,sidebar,captureSidebar,onChange,onReady,onError,onResolution});this.session=null;this.preparing=null;this.last={active:false,stopping:false,elapsed:0,bytes:0};
    }
    static supported(format){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function'&&(!format||candidates(format).length>0);}
    get status(){
      if(this.preparing)return this.preparing;
      const s=this.session;return s?{...s.config,active:s.recorder.state!=='inactive',stopping:s.stopping,elapsed:((s.stoppedAt||performance.now())-s.started)/1000,bytes:s.bytes,frames:s.frames,mimeType:s.recorder.mimeType||s.mime}:this.last;
    }
    bounds(scope='arena'){return captureBounds(this.viewport.getBoundingClientRect(),this.sidebar?.getBoundingClientRect(),scope);}
    async start({quality='high',format='mp4',scope='arena'}={}){
      if(this.session||this.preparing)return;if(!ArenaRecorder.supported())throw Error('浏览器不支持视频录制，请使用新版 Chrome、Edge 或 Safari');
      const types=candidates(format);if(!types.length)throw Error(format==='mp4'?'当前浏览器不支持 MP4，请使用新版 Chrome、Edge 或 Safari，或手动选择 WebM':'当前浏览器不支持所选视频格式');
      const bounds=this.bounds(scope),config={...plan(bounds,quality),format,scope},output=document.createElement('canvas');output.width=config.width;output.height=config.height;
      let sidebarImage=null;
      if(scope==='workspace'){
        if(!this.captureSidebar)throw Error('侧栏录制不可用');
        const preparing={...config,active:false,preparing:true,stopping:false,elapsed:0,bytes:0};this.preparing=preparing;this.onChange(this.status);
        try{sidebarImage=await this.captureSidebar(this.sidebar,Math.min(output.width/bounds.width,output.height/bounds.height));}
        catch(error){if(this.preparing===preparing){this.preparing=null;this.onChange(this.last);}throw error;}
        if(this.preparing!==preparing)return;
        this.preparing=null;
      }
      const ctx=output.getContext('2d',{alpha:false});ctx.fillStyle='#eee4d2';ctx.fillRect(0,0,output.width,output.height);
      const stream=output.captureStream(config.fps),track=stream.getVideoTracks()[0];if('contentHint' in track)track.contentHint='detail';
      let recorder,mime;
      for(const type of types){try{recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:config.bitrate});mime=type;break;}catch{/* Try another codec in the same container, never silently change format. */}}
      if(!recorder){stream.getTracks().forEach(t=>t.stop());throw Error('无法创建视频编码器，请降低画质或更换浏览器');}
      const s={output,ctx,stream,track,recorder,mime,config,chunks:[],bytes:0,frames:0,started:performance.now(),nextFrame:0,lastNotice:0,raf:0,stopping:false,error:null,sidebarImage,sidebarPending:false,nextSidebar:0};this.session=s;
      s.done=new Promise(resolve=>s.resolve=resolve);
      recorder.ondataavailable=event=>{if(event.data.size){s.chunks.push(event.data);s.bytes+=event.data.size;}};
      recorder.onerror=()=>{s.error=Error('视频编码失败，请降低画质或更换浏览器');void this.stop();};
      recorder.onstop=async()=>{
        cancelAnimationFrame(s.raf);s.sidebarImage=null;stream.getTracks().forEach(t=>t.stop());const elapsed=((s.stoppedAt||performance.now())-s.started)/1000;
        let blob=new Blob(s.chunks,{type:recorder.mimeType||mime});s.chunks=[];
        try{if(s.error)throw s.error;if(!blob.size)throw Error('录制没有生成视频，请重试');blob=await finalizeWebM(blob,elapsed);}
        catch(error){s.error=error;}
        this.last={...config,active:false,stopping:false,elapsed,bytes:s.error?0:blob.size,frames:s.frames,mimeType:blob.type};
        if(this.session===s)this.session=null;this.onResolution(0);this.onChange(this.last);
        try{if(s.error)this.onError(s.error);else this.onReady(blob,this.last);}finally{s.resolve(s.error?null:blob);}
      };
      const draw=now=>{
        if(this.session!==s||s.stopping)return;
        try{
          if(now>=s.nextFrame){
            const view=this.bounds(scope),arena=this.viewport.getBoundingClientRect(),scale=Math.min(output.width/view.width,output.height/view.height);
            this.onResolution(scale);
            // Clip a zoomed arena to its own viewport before placing it beside
            // the sidebar, so offscreen cells cannot cover the recorded panel.
            const r=framing(this.canvas.getBoundingClientRect(),arena,arena.width*scale,arena.height*scale,this.canvas);
            ctx.fillStyle='#eee4d2';ctx.fillRect(0,0,output.width,output.height);ctx.imageSmoothingEnabled=false;
            const ox=(output.width-view.width*scale)/2,oy=(output.height-view.height*scale)/2;
            if(r)ctx.drawImage(this.canvas,r.sx,r.sy,r.sw,r.sh,r.dx+ox+(arena.left-view.left)*scale,r.dy+oy+(arena.top-view.top)*scale,r.dw,r.dh);
            if(scope==='workspace'){
              const panel=this.sidebar.getBoundingClientRect();
              if(s.sidebarImage){ctx.imageSmoothingEnabled=true;ctx.drawImage(s.sidebarImage,ox+(panel.left-view.left)*scale,oy+(panel.top-view.top)*scale,panel.width*scale,panel.height*scale);}
              // Serialize captures and cap sidebar work at 5 Hz; no accumulating
              // render queue when a large panel or slow device takes longer.
              if(!s.sidebarPending&&now>=s.nextSidebar){
                s.sidebarPending=true;s.nextSidebar=now+200;
                this.captureSidebar(this.sidebar,scale).then(image=>{if(this.session===s&&!s.stopping)s.sidebarImage=image;}).catch(error=>{if(this.session===s&&!s.stopping){s.error=error;void this.stop();}}).finally(()=>{s.sidebarPending=false;});
              }
            }
            track.requestFrame?.();s.frames++;
            // Carry fractional frame time forward; resetting to 'now' drops to
            // ~20 FPS when 60 Hz animation-frame timestamps fluctuate slightly.
            const interval=1000/config.fps;s.nextFrame+=interval;if(s.nextFrame<now-interval)s.nextFrame=now+interval;
          }
          if(now-s.lastNotice>250){s.lastNotice=now;this.onChange(this.status);}s.raf=requestAnimationFrame(draw);
        }catch(error){s.error=error;void this.stop();}
      };
      try{s.nextFrame=performance.now();recorder.start(1000);draw(s.nextFrame);this.onChange(this.status);}
      catch(error){cancelAnimationFrame(s.raf);recorder.onstop=null;stream.getTracks().forEach(t=>t.stop());if(recorder.state!=='inactive')recorder.stop();this.session=null;this.onResolution(0);s.resolve(null);throw error;}
    }
    stop(){if(this.preparing){this.preparing=null;this.onChange(this.last);return Promise.resolve(null);}const s=this.session;if(!s)return Promise.resolve(null);if(!s.stopping){s.stopping=true;s.stoppedAt=performance.now();cancelAnimationFrame(s.raf);if(s.recorder.state!=='inactive')s.recorder.stop();this.onChange(this.status);}return s.done;}
  }
  globalThis.CellLabVideo={ArenaRecorder,framing,captureBounds,finalizeWebM,plan,candidates,QUALITIES};
})();
