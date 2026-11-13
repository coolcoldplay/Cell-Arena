/* Observation only: tapered lineage ribbons connect measured population shares.
 * Widths are independently normalized at each time, not conserved cell traffic. */
(() => {
  'use strict';
  function columns(rows,ids){
    if(rows.length<2)return rows.slice();
    const take=new Set([0,rows.length-1]);
    for(let i=1;i<5;i++)take.add(Math.round((rows.length-1)*i/5));
    // Preserve a sampled peak for every displayed branch, including extinct ones.
    for(const id of ids){let peak=-1,index=0;rows.forEach((r,i)=>{const n=r.counts[id]||0;if(n>peak){peak=n;index=i;}});if(peak>0)take.add(index);}
    return [...take].sort((a,b)=>a-b).map(i=>rows[i]);
  }
  function layout(data){
    const metadata=new Map(data.branches.map(b=>[b.id,b])),ids=[...data.shown],chosen=new Set(ids),children=new Map(),roots=[];
    const parentOf=id=>{let p=metadata.get(id)?.parent||0,seen=new Set([id]);while(p&&!chosen.has(p)&&!seen.has(p)){seen.add(p);p=metadata.get(p)?.parent||0;}return p&&!seen.has(p)?p:0;};
    for(const id of ids){const parent=parentOf(id);if(parent){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(id);}else roots.push(id);}
    const order=[],visit=id=>{if(order.includes(id))return;order.push(id);for(const child of (children.get(id)||[]).sort((a,b)=>a-b))visit(child);};
    roots.sort((a,b)=>a-b).forEach(visit);ids.forEach(visit);if(data.omitted)order.push(0);
    const rows=columns(data.rows,order),nodes=rows.map((row,col)=>{let y=0;return order.map(id=>{const count=row.counts[id]||0,share=row.total?count/row.total:0,node={id,col,time:row.time,count,total:row.total,share,lo:y,hi:y+share};y+=share;return node;});}),links=[];
    for(let col=1;col<nodes.length;col++)for(const end of nodes[col]){
      const start=nodes[col-1].find(n=>n.id===end.id);
      if(!start.count&&!end.count)continue;
      let source=start,ancestor=0;
      if(!start.count&&end.count&&end.id){let p=metadata.get(end.id)?.parent,seen=new Set([end.id]);while(p&&!seen.has(p)){seen.add(p);const node=nodes[col-1].find(n=>n.id===p&&n.count);if(node){source={...start,lo:(node.lo+node.hi)/2,hi:(node.lo+node.hi)/2};ancestor=p;break;}p=metadata.get(p)?.parent;}}
      links.push({id:end.id,col:col-1,start:source,end,ancestor});
    }
    return {rows,nodes,links,order,metadata};
  }
  const english=()=>document.documentElement.lang.startsWith('en'),t=(a,b)=>english()?b:a;
  class Chart {
    constructor(){
      this.canvas=document.getElementById('lineage-sankey');this.legend=document.getElementById('lineage-sankey-legend');this.readout=document.getElementById('lineage-sankey-readout');this.note=document.getElementById('lineage-sankey-note');this.focus=null;this.column=null;
      const panel=document.getElementById('lineage-sankey-panel'),dialog=document.getElementById('lineage-sankey-dialog'),expand=document.getElementById('lineage-sankey-expand'),anchor=document.createComment('lineage chart position');panel.before(anchor);
      expand.addEventListener('click',()=>{if(dialog.open){dialog.close();return;}document.getElementById('lineage-sankey-host').append(panel);dialog.showModal();this.expanded=true;this.stamp=null;if(this.last)this.update(this.last);});
      document.getElementById('lineage-sankey-close').addEventListener('click',()=>dialog.close());
      dialog.addEventListener('close',()=>{anchor.after(panel);this.expanded=false;this.stamp=null;if(this.last)this.update(this.last);expand.focus();});
      this.canvas.addEventListener('pointerdown',e=>this.point(e));this.canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')this.point(e);});
      this.canvas.addEventListener('keydown',e=>{if(!this.plot||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))return;e.preventDefault();if(e.key==='Escape')this.focus=null;else if(e.key==='ArrowLeft'||e.key==='ArrowRight')this.column=Math.max(0,Math.min(this.plot.rows.length-1,(this.column??this.plot.rows.length-1)+(e.key==='ArrowLeft'?-1:1)));else {const i=this.plot.order.indexOf(this.focus);this.focus=this.plot.order[(i+(e.key==='ArrowUp'?-1:1)+this.plot.order.length)%this.plot.order.length];}this.draw();});
      new ResizeObserver(()=>{if(this.last){this.stamp=null;this.update(this.last);}}).observe(this.canvas.parentElement);
    }
    update(s){
      const data=s.immunity?.evolution;if(!data)return;
      const epoch=s.revision+':'+s.seed;if(this.epoch!==epoch){this.focus=null;this.column=null;this.epoch=epoch;}
      this.last=s;const stamp=JSON.stringify([epoch,english(),data.rows.length,data.rows.at(-1),data.shown,data.compressed,Math.round(this.canvas.parentElement.clientWidth)]);if(this.stamp===stamp)return;this.stamp=stamp;
      this.plot=layout(data);this.width=Math.max(620,(this.plot.rows.length-1)*86+80,this.canvas.parentElement.clientWidth);this.height=270;
      const ratio=Math.min(2,devicePixelRatio||1);this.canvas.width=Math.round(this.width*ratio);this.canvas.height=Math.round(this.height*ratio);this.canvas.style.width=this.width+'px';this.canvas.style.height=this.height+'px';
      this.canvas.setAttribute('aria-label',t('肿瘤抗原谱系演化桑基图；左右方向键选择时间，上下选择谱系','Tumor antigen lineage Sankey; left/right select time, up/down select lineage'));
      document.getElementById('lineage-sankey-expand').textContent=this.expanded?t('收起','Collapse'):t('展开','Expand');
      document.getElementById('lineage-sankey-close').setAttribute('aria-label',t('关闭谱系图','Close lineage diagram'));
      document.getElementById('lineage-sankey-title').textContent=t('肿瘤谱系演化 · 桑基图','Tumor lineage evolution · Sankey');
      this.note.textContent=t('带宽＝该采样时点的存活肿瘤占比；连带表示祖先关系，增殖／死亡可改变带宽，非守恒流量。横向滚动查看全程。','Width = share of living tumors at each sampled time; ribbons show ancestry, not conserved traffic. Growth and death change widths. Scroll horizontally for the full history.')+(data.omitted?t(' 其余 '+data.omitted+' 条分支合并为“其他”。',' '+data.omitted+' additional branches grouped as Other.'):'')+(data.compressed?t(' 长历史已降采样，短暂分支可能遗漏。',' Long history is downsampled; brief branches may be missed.'):'');
      this.legend.replaceChildren();for(const id of this.plot.order){const button=document.createElement('button'),swatch=document.createElement('i');button.type='button';button.dataset.lineage=id;swatch.style.background=this.color(id);button.append(swatch,document.createTextNode(id?'A'+id:t('其他','Other')));button.addEventListener('click',()=>{this.focus=this.focus===id?null:id;this.column=null;this.draw();});this.legend.append(button);}
      if(!this.plot.order.includes(this.focus))this.focus=null;this.column=this.column===null?null:Math.min(this.column,this.plot.rows.length-1);this.draw();
    }
    color(id){const b=this.plot.metadata.get(id);return b?.key?CellLabDisplay.antigenProfileStyle(b.key).color:id?'#9d8d76':'#c7bca9';}
    x(col){return 36+col*(this.width-72)/Math.max(1,this.plot.rows.length-1);}
    point(e){if(!this.plot?.rows.length)return;const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)*this.width/r.width,y=(e.clientY-r.top)*this.height/r.height;this.column=Math.max(0,Math.min(this.plot.rows.length-1,Math.round((x-36)/(this.width-72)*Math.max(1,this.plot.rows.length-1))));const node=this.plot.nodes[this.column].find(n=>n.count&&y>=32+n.lo*190&&y<=32+n.hi*190);if(node)this.focus=node.id;this.draw();}
    draw(){
      const ctx=this.canvas.getContext('2d'),p=this.plot;if(!p)return;ctx.setTransform(this.canvas.width/this.width,0,0,this.canvas.height/this.height,0,0);ctx.clearRect(0,0,this.width,this.height);ctx.fillStyle='#f7f0e2';ctx.fillRect(0,0,this.width,this.height);ctx.font='11px system-ui';ctx.textAlign='center';
      if(!p.order.length){ctx.fillStyle='#71634c';ctx.fillText(t('尚无肿瘤谱系；肿瘤出现后开始记录。','No tumor lineages yet. Recording begins when tumors appear.'),this.width/2,125);this.readout.textContent='';return;}
      for(const link of p.links){const x=this.x(link.col)+4,xx=this.x(link.col+1)-4,mid=(x+xx)/2,y=32+link.start.lo*190,yy=32+link.end.lo*190,b=32+link.start.hi*190,bb=32+link.end.hi*190;ctx.globalAlpha=(this.focus===null||link.id===this.focus)?0.68:0.12;ctx.fillStyle=this.color(link.id);ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(mid,y,mid,yy,xx,yy);ctx.lineTo(xx,bb);ctx.bezierCurveTo(mid,bb,mid,b,x,b);ctx.closePath();ctx.fill();if(link.ancestor){ctx.globalAlpha=.65;ctx.strokeStyle=this.color(link.id);ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(mid,y,mid,yy,xx,yy);ctx.stroke();ctx.setLineDash([]);}}
      ctx.globalAlpha=1;
      p.nodes.forEach((nodes,col)=>{const x=this.x(col);ctx.globalAlpha=1;ctx.fillStyle='#71634c';ctx.fillText(p.rows[col].time+'',x,246);ctx.fillText('n='+p.rows[col].total,x,17);for(const node of nodes)if(node.count){ctx.globalAlpha=this.focus===null||node.id===this.focus?1:.3;ctx.fillStyle=this.color(node.id);ctx.fillRect(x-4,32+node.lo*190,8,node.share*190);if(node.share>=.085){ctx.fillStyle='#312a20';ctx.textAlign='left';ctx.fillText(node.id?'A'+node.id:t('其他','Other'),x+7,32+(node.lo+node.hi)*95+4);ctx.textAlign='center';}}});
      ctx.globalAlpha=1;ctx.fillStyle='#71634c';ctx.textAlign='right';ctx.fillText('MCS',this.width-6,265);ctx.textAlign='center';
      const col=this.column??p.rows.length-1,row=p.rows[col],id=this.focus,b=p.metadata.get(id),count=row?.counts[id]||0;
      this.readout.textContent=id===null?t('选择色带或谱系编号查看细胞数、占比、抗原和祖先；虚线标出分支来源。','Select a ribbon or lineage ID for count, share, antigen and ancestry; dashed edges mark branching.'):row.time+' MCS · '+(id?'A'+id:t('其他','Other'))+' · '+count+t(' 颗',' cells')+' · '+(row.total?100*count/row.total:0).toFixed(1)+'%'+(b?' · '+t('父谱系 ','Parent ')+(b.parent?'A'+b.parent:t('独立起源','Independent founder'))+' · C'+(b.channel+1)+' '+b.sequence+' · '+(!b.present?t('抗原遗传丢失','Antigen lost'):b.self?t('自身抗原','Self antigen'):t('非自身抗原','Non-self antigen'))+' · '+t('分支出现 ','Branch arose ')+b.time+' MCS':'');
      for(const button of this.legend.children)button.setAttribute('aria-pressed',String(Number(button.dataset.lineage)===this.focus));
    }
  }
  globalThis.CellLabLineage={layout,columns,Chart};
})();
