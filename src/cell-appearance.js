/* Read-only optical thickness from the current occupied membrane. An eight-way
 * chamfer distance (axial 1, diagonal sqrt(2)) approximates Euclidean distance
 * within 8.3%, without changing the physical lattice or contact calculations.
 * Periodic padding is needed only as far as the translucent band. Buffers and
 * paused-frame results are reused; no random stream or model state is changed. */
(() => {
  'use strict';
  const INF=1e9,DIAGONAL=Math.SQRT2;
  class Surface {
    get(s){
      if(this.snapshot===s)return this.layer;
      const {width:w,height:h,grid}=s,n=w*h,wrap=s.boundary==='wrap';
      // At high physical refinement, optical thickness needs less detail than
      // mechanics. The shader reconstructs a half-resolution optical field and
      // clips it to EVERY original membrane pixel. IDs, silhouettes, collision,
      // Act, nuclei and biology keep their full resolution.
      if(s.refinement>=2&&n>350000&&w%2===0&&h%2===0)return this.refined(s);
      if(this.width!==w||this.height!==h){this.width=w;this.height=h;this.depth=new Float32Array(n);this.interior=new Uint8Array(n);}
      if(!this.live){this.live=new Uint8Array(65536);this.maxDepth=new Float32Array(65536);this.fadeWidth=new Float32Array(65536);}
      const {depth,interior,live,maxDepth,fadeWidth}=this;
      live.fill(0);maxDepth.fill(0);fadeWidth.fill(0);let radius=1;
      for(const c of s.cells)if(c.kind>0&&c.kind<4){live[c.id]=1;fadeWidth[c.id]=Math.max(1,.85*Math.sqrt(c.area/Math.PI));radius=Math.max(radius,fadeWidth[c.id]);}
      for(let y=0;y<h;y++){
        const start=y*w,up=y?start-w:wrap?(h-1)*w:-1,down=y<h-1?start+w:wrap?0:-1;
        for(let x=0;x<w;x++){
          const q=start+x,id=grid[q];
          const boundary=!live[id]||grid[x?q-1:wrap?start+w-1:-1]!==id||grid[x<w-1?q+1:wrap?start:-1]!==id||grid[up<0?-1:up+x]!==id||grid[down<0?-1:down+x]!==id;
          depth[q]=boundary?.5:INF;
        }
      }
      // Bucket padding sizes so modest growth does not reallocate the work grid.
      const pad=wrap?Math.ceil(radius/8)*8+2:0,px=Math.min(w,pad),py=Math.min(h,pad),pw=w+2*px,ph=h+2*py;
      if(this.paddedWidth!==pw||this.paddedHeight!==ph){this.paddedWidth=pw;this.paddedHeight=ph;this.work=new Float32Array(pw*ph);}
      const d=this.work;
      for(let y=0;y<ph;y++){
        const sy=(y-py+h)%h,start=sy*w,row=y*pw;
        d.set(depth.subarray(start,start+w),row+px);
        if(px){d.set(depth.subarray(start+w-px,start+w),row);d.set(depth.subarray(start,start+px),row+px+w);}
      }
      for(let x=1;x<pw;x++)d[x]=Math.min(d[x],d[x-1]+1);
      for(let y=1;y<ph;y++){
        const start=y*pw,end=start+pw-1;
        d[start]=Math.min(d[start],d[start-pw]+1,d[start-pw+1]+DIAGONAL);
        for(let q=start+1;q<end;q++)if(d[q]>.5)d[q]=Math.min(d[q],d[q-1]+1,d[q-pw]+1,d[q-pw-1]+DIAGONAL,d[q-pw+1]+DIAGONAL);
        d[end]=Math.min(d[end],d[end-1]+1,d[end-pw]+1,d[end-pw-1]+DIAGONAL);
      }
      for(let q=d.length-2;q>=d.length-pw;q--)d[q]=Math.min(d[q],d[q+1]+1);
      for(let y=ph-2;y>=0;y--){
        const start=y*pw,end=start+pw-1;
        d[end]=Math.min(d[end],d[end+pw]+1,d[end+pw-1]+DIAGONAL);
        for(let q=end-1;q>start;q--)if(d[q]>.5)d[q]=Math.min(d[q],d[q+1]+1,d[q+pw]+1,d[q+pw-1]+DIAGONAL,d[q+pw+1]+DIAGONAL);
        d[start]=Math.min(d[start],d[start+1]+1,d[start+pw]+1,d[start+pw+1]+DIAGONAL);
      }
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const q=y*w+x,id=grid[q];if(!live[id])continue;
        const value=depth[q]=d[(y+py)*pw+x+px];if(value>maxDepth[id])maxDepth[id]=value;
      }
      for(const c of s.cells)if(live[c.id])fadeWidth[c.id]=1/Math.max(.5,Math.min(fadeWidth[c.id],maxDepth[c.id]));
      for(let q=0;q<n;q++){
        const id=grid[q];if(!live[id]){interior[q]=255;continue;}
        // Preserve saturated cores even in elongated bodies; thin extensions
        // fade according to their own membrane, never an imposed ellipse.
        const t=Math.min(1,depth[q]*fadeWidth[id]);interior[q]=Math.round(255*t*t*(3-2*t));
      }
      this.snapshot=s;return this.layer={width:w,height:h,interior};
    }
    refined(s){
      const {width:w,height:h,grid}=s,cw=w/2,ch=h/2;
      if(!this.coarse)this.coarse=new Surface();
      if(this.coarseGrid?.length!==cw*ch)this.coarseGrid=new Uint16Array(cw*ch);
      for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)this.coarseGrid[y*cw+x]=grid[(2*y+1)*w+2*x+1];
      const layer=this.coarse.get({width:cw,height:ch,grid:this.coarseGrid,cells:s.cells.map(c=>({id:c.id,kind:c.kind,area:c.area/4})),boundary:s.boundary});
      this.snapshot=s;return this.layer={...layer,scale:2};
    }
    full(s){
      if(this.fullSnapshot!==s){this.fullSnapshot=s;if(!this.fullCache)this.fullCache=new Surface();this.fullLayer=this.fullCache.get({...s,refinement:1});}
      return this.fullLayer;
    }
  }
  globalThis.CellLabAppearance={Surface};
})();
