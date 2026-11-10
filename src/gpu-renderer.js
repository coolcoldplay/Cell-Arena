/* Display-only WebGL2 rasterizer. All cell copies and contacts stay in the
 * simulation Worker. A lost/unsupported context falls back to Canvas2D.
 * Act color mapping follows Artistoo Canvas.drawActivityValues (MIT):
 * copyright (c) 2019 Johannes Textor & Inge Wortel. See ../THIRD_PARTY_NOTICES.md. */
(() => {
  'use strict';
  class GPURenderer {
    constructor(){
      this.canvas=document.createElement('canvas');
      const gl=this.gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
      if(!gl)throw Error('WebGL2 unavailable');
      this.lost=false;this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
      this.canvas.addEventListener('webglcontextrestored',()=>{this.lost=true;});
      const vertex=`#version 300 es
      void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
      const fragment=`#version 300 es
      precision highp float;precision highp int;precision highp usampler2D;
      uniform usampler2D ids,activity,walls,metadata;uniform sampler2D environment,palette,signalLayer,bodySignalLayer;
      uniform vec3 bodyColors[8];uniform int showSignals,proliferationShading;uniform float environmentOpacity,bodyEnvironmentOpacity,pixelRatio;
      uniform ivec2 lattice;uniform vec2 viewport;uniform int fieldScale,fieldMode,seams,selected,wrap,smoothWall,antigen;
      uniform ivec4 actFlags;out vec4 color;
      uint idAt(ivec2 p){if(wrap==1)p=(p+lattice)%lattice;else if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,lattice)))return 0u;return texelFetch(ids,p,0).r;}
      bool antigenEdge(uint id,ivec2 p,bool marked){uint other=idAt(p);return other!=id&&(marked||(texelFetch(metadata,ivec2(int(other)&255,int(other)>>8),0).g&8u)>0u);}
      vec3 body(int kind){return bodyColors[kind];}
      void main(){
        vec2 xy=vec2(gl_FragCoord.x,viewport.y-gl_FragCoord.y)*vec2(lattice)/viewport;
        ivec2 p=clamp(ivec2(xy),ivec2(0),lattice-1);uint id=idAt(p);
        uvec4 m=texelFetch(metadata,ivec2(int(id)&255,int(id)>>8),0);int kind=int(m.r),physicalKind=kind==5?1:(kind==6||kind==7)?3:kind;vec3 base=body(kind);if(kind==2&&proliferationShading==1)base=mix(base,vec3(1),float(m.b)/255.);vec3 rgb=base;
        if(fieldMode>0){float value=texelFetch(environment,p/fieldScale,0).r;int q=int(clamp(floor(value*255.+.5),0.,255.));rgb=mix(rgb,texelFetch(palette,ivec2(q,kind),0).rgb,kind>0?bodyEnvironmentOpacity:environmentOpacity);}
        if(showSignals==1){vec4 signal=kind>0?texelFetch(bodySignalLayer,p/fieldScale,0):texelFetch(signalLayer,p/fieldScale,0);rgb=mix(rgb,signal.rgb,signal.a);}
        if(texelFetch(walls,p,0).r>0u&&id!=uint(smoothWall))rgb=(p.x+p.y)%7<2?vec3(66,83,87)/255.:body(4);
        if(physicalKind>0&&physicalKind<4){uint death=m.g&7u;if(death>0u){float p=float(m.a)/255.;vec3 tint=death==2u?vec3(248,177,48):death==3u?vec3(158,145,112):vec3(75,78,86);float weight=death==2u?.15+.85*p:death==3u?.4+.45*p:.2+.65*p;rgb=mix(rgb,tint/255.,weight);}else if(actFlags[physicalKind]>0){float a=float(texelFetch(activity,p,0).r);if(a>0.)rgb=vec3(min(255.,a*2.),min(255.,(255.-a)*2.),0.)/255.;}
          if(seams==1||int(id)==selected){vec2 f=fract(xy),thin=min(vec2(.32),vec2(lattice)/viewport*.55*pixelRatio);bool edge=(f.x>1.-thin.x&&idAt(p+ivec2(1,0))!=id)||(f.x<thin.x&&idAt(p-ivec2(1,0))!=id)||(f.y>1.-thin.y&&idAt(p+ivec2(0,1))!=id)||(f.y<thin.y&&idAt(p-ivec2(0,1))!=id);if(edge)rgb=mix(rgb,physicalKind==1?vec3(98,110,109)/255.:kind==7?vec3(26,69,107)/255.:kind==3?vec3(128,61,70)/255.:vec3(225,230,225)/255.,.9);}
        }
        if(antigen==1){vec2 f=fract(xy),stepSize=vec2(lattice)/viewport;float limit=.5*pixelRatio+.5,coverage=0.;bool marked=(m.g&8u)>0u;
          float d=(1.-f.x)/stepSize.x;if(d<limit&&antigenEdge(id,p+ivec2(1,0),marked))coverage=max(coverage,limit-d);
          d=f.x/stepSize.x;if(d<limit&&antigenEdge(id,p-ivec2(1,0),marked))coverage=max(coverage,limit-d);
          d=(1.-f.y)/stepSize.y;if(d<limit&&antigenEdge(id,p+ivec2(0,1),marked))coverage=max(coverage,limit-d);
          d=f.y/stepSize.y;if(d<limit&&antigenEdge(id,p-ivec2(0,1),marked))coverage=max(coverage,limit-d);
          rgb=mix(rgb,vec3(209,47,57)/255.,min(1.,coverage));
        }color=vec4(rgb,1);
      }`;
      const compile=(type,source)=>{const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
      const program=this.program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);gl.uniform3fv(gl.getUniformLocation(program,'bodyColors[0]'),Float32Array.from(CellLabDisplay.BODY_COLORS.flat(),v=>v/255));
      this.uniforms={};for(const key of ['lattice','viewport','fieldScale','fieldMode','seams','selected','wrap','smoothWall','antigen','actFlags','showSignals','environmentOpacity','bodyEnvironmentOpacity','pixelRatio','bodyColors[0]','proliferationShading'])this.uniforms[key]=gl.getUniformLocation(program,key);
      this.textures=[];for(const [i,key] of ['ids','activity','walls','metadata','environment','palette','signalLayer','bodySignalLayer'].entries()){const t=gl.createTexture();this.textures.push(t);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,key),i);}
      this.meta=new Uint8Array(256*256*4);this.palettes=new WeakMap();this.textureSizes=[];
      const ext=gl.getExtension('WEBGL_debug_renderer_info');this.device=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
      this.hardware=ext?!/swiftshader|llvmpipe|software/i.test(this.device):null;
    }
    upload(unit,w,h,internal,format,type,data){const g=this.gl;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,this.textures[unit]);g.pixelStorei(g.UNPACK_ALIGNMENT,1);
      const old=this.textureSizes[unit];if(old&&old[0]===w&&old[1]===h&&old[2]===internal)g.texSubImage2D(g.TEXTURE_2D,0,0,0,w,h,format,type,data);
      else{g.texImage2D(g.TEXTURE_2D,0,internal,w,h,0,format,type,data);this.textureSizes[unit]=[w,h,internal];}
    }
    draw(ctx,s,{actFlags,seams,selected,showAntigen=false,field,info,signal,bodySignal=signal,environmentOpacity=1,bodyEnvironmentOpacity=environmentOpacity,pixelRatio=1,cellColors=null}){
      if(this.lost||this.gl.isContextLost())return false;
      const g=this.gl,u=this.uniforms,c=this.canvas;const start=performance.now();
      if(c.width!==ctx.canvas.width||c.height!==ctx.canvas.height){c.width=ctx.canvas.width;c.height=ctx.canvas.height;}
      g.useProgram(this.program);g.viewport(0,0,c.width,c.height);
      // Palette changes redraw even when model time and snapshot are unchanged.
      if(this.cellColors!==cellColors){g.uniform3fv(u['bodyColors[0]'],Float32Array.from((cellColors?CellLabDisplay.paletteBodies(cellColors):CellLabDisplay.BODY_COLORS).flat(),v=>v/255));this.cellColors=cellColors;}
      g.uniform1i(u.proliferationShading,cellColors?.proliferationShading===false?0:1);
      if(this.snapshot!==s){this.upload(0,s.width,s.height,g.R16UI,g.RED_INTEGER,g.UNSIGNED_SHORT,s.grid);this.upload(1,s.width,s.height,g.R8UI,g.RED_INTEGER,g.UNSIGNED_BYTE,s.activity);this.upload(2,s.width,s.height,g.R8UI,g.RED_INTEGER,g.UNSIGNED_BYTE,s.walls);
        this.meta.fill(0);for(const m of s.cells){this.meta[m.id*4]=CellLabDisplay.displayKind(m);this.meta[m.id*4+1]=CellLabDisplay.deathCode(m)|(CellLabDisplay.antigenMarked(m)?8:0);this.meta[m.id*4+2]=m.kind===2?CellLabDisplay.tumorShade(m):0;this.meta[m.id*4+3]=Math.round(Math.max(0,Math.min(1,m.deathProgress||0))*255);}this.upload(3,256,256,g.RGBA8UI,g.RGBA_INTEGER,g.UNSIGNED_BYTE,this.meta);this.snapshot=s;this.field=null;}
      if(this.field!==field){if(field)this.upload(4,field.width,field.height,g.R32F,g.RED,g.FLOAT,field.values);else this.upload(4,1,1,g.R32F,g.RED,g.FLOAT,new Float32Array(1));this.field=field;}
      if(info!==this.info||!this.paletteReady){let p=this.palettes.get(info);if(!p&&info){p=Uint8Array.from(info.palette.flat(2));this.palettes.set(info,p);}this.upload(5,256,8,g.RGB8,g.RGB,g.UNSIGNED_BYTE,p||new Uint8Array(256*8*3));this.info=info;this.paletteReady=true;}
      if(this.signal!==signal||!this.signalReady){this.upload(6,signal?.width||1,signal?.height||1,g.RGBA8,g.RGBA,g.UNSIGNED_BYTE,signal?.rgba||new Uint8Array(4));this.signal=signal;this.signalReady=true;}
      if(this.bodySignal!==bodySignal||!this.bodySignalReady){this.upload(7,bodySignal?.width||1,bodySignal?.height||1,g.RGBA8,g.RGBA,g.UNSIGNED_BYTE,bodySignal?.rgba||new Uint8Array(4));this.bodySignal=bodySignal;this.bodySignalReady=true;}
      g.uniform1i(u.showSignals,signal?1:0);g.uniform1i(u.smoothWall,s.maze?.wallID||0);g.uniform1i(u.antigen,showAntigen?1:0);
      g.uniform1f(u.environmentOpacity,environmentOpacity);g.uniform1f(u.bodyEnvironmentOpacity,bodyEnvironmentOpacity);g.uniform1f(u.pixelRatio,pixelRatio);
      g.uniform2i(u.lattice,s.width,s.height);g.uniform2f(u.viewport,c.width,c.height);g.uniform1i(u.fieldScale,s.fieldScale);g.uniform1i(u.fieldMode,field?(info.low?1:2):0);g.uniform1i(u.seams,seams?1:0);g.uniform1i(u.selected,selected);g.uniform1i(u.wrap,s.boundary==='wrap'?1:0);g.uniform4iv(u.actFlags,actFlags);
      g.drawArrays(g.TRIANGLES,0,3);ctx.drawImage(c,0,0);this.lastMs=performance.now()-start;return true;
    }
  }
  globalThis.CellLabRenderer=GPURenderer;
})();
