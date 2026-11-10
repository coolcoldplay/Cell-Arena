/* Read-only history view. Filters and normalized composition never edit the
 * population archive, model clock, RNG or the simulation's cell visibility. */
(() => {
  'use strict';
  const types=[['normal','正常','#707c78'],['abnormal','异常','#947743'],['tumor','肿瘤','#36302b'],['immune','免疫','#b95263']];
  const states={
    normal:[['normalLiving','存活','#899992'],['normalDying','清除中','#c4ae86']],
    abnormal:[['abnormalPositive','抗原阳性','#b97758'],['abnormalNegative','抗原阴性','#947743'],['abnormalDying','清除中','#c4ae86']],
    tumor:[['tumorPositive','抗原阳性','#a64146'],['tumorNegative','抗原阴性','#36302b'],['tumorDying','清除中','#e2a343']],
    immune:[['immuneSuppressive','抑制','#548fbc'],['immuneActive','激活','#bc353b'],['immuneResting','静息','#e2a1ad'],['immuneDying','清除中','#c4ae86']]
  };
  const number=v=>Math.max(0,Number.isFinite(v)?v:0);
  function niceMax(value){if(value<=1)return 1;const base=10**Math.floor(Math.log10(value)),v=value/base;return Math.ceil(v*2)/2*base;}
  function plan(rows,selected,percent=false,end=rows.at(-1)?.time||0){
    const chosen=types.filter(([k])=>selected.includes(k)),present=chosen.filter(([k])=>rows.some(r=>number(r[k])>0));
    const type=chosen.length===1?chosen[0][0]:present.length===1?present[0][0]:null;
    if(!chosen.length)return {mode:'empty',series:[],values:[],max:1,end,rows};
    if(!type){const series=chosen.map(([key,label,color])=>({key,label,color}));let max=0;for(const r of rows)for(const s of series)max=Math.max(max,number(r[s.key]));return {mode:'lines',series,rows,end,max:niceMax(max),percent:false};}
    const series=states[type].map(([key,label,color])=>({key,label,color}));let unknown=false,max=0;
    const counts=rows.map(r=>{const total=number(r[type]),values=series.map(s=>number(r[s.key])),sum=values.reduce((a,b)=>a+b,0);max=Math.max(max,total);
      // Older exported rows may contain only totals. Do not invent past states.
      const missing=Math.max(0,total-sum);if(missing)unknown=true;
      if(sum>total&&sum)for(let i=0;i<values.length;i++)values[i]*=total/sum;
      return [...values,missing];
    });
    if(unknown)series.push({key:'unknown',label:'未记录状态',color:'#aaa49a'});else for(const values of counts)values.pop();
    const values=percent?counts.map((v,i)=>v.map(n=>number(rows[i][type])?n/rows[i][type]*100:0)):counts;
    return {mode:'stack',type,series,rows,counts,values,end,max:percent?100:niceMax(max),percent};
  }
  function nearest(rows,time){let lo=0,hi=rows.length;while(lo<hi){const m=(lo+hi)>>1;if(rows[m].time<=time)lo=m+1;else hi=m;}if(lo===0)return 0;if(lo===rows.length)return lo-1;return time-rows[lo-1].time<=rows[lo].time-time?lo-1:lo;}
  function mount(){
    const $=id=>document.getElementById(id),chart=$('history'),legend=$('history-legend'),stateLegend=$('history-states'),readout=$('history-readout'),percent=$('history-percent');
    let current=null,recordingScale=0,hoverTime=null,lastLegend='',view=null;
    const translate=text=>globalThis.CellLabI18n?.translate(text,document.documentElement.lang==='en'?'en':'zh')||text;
    for(const [key,label,color] of types){const item=document.createElement('label'),input=document.createElement('input'),swatch=document.createElement('i'),name=document.createElement('span');input.type='checkbox';input.checked=true;input.dataset.population=key;input.setAttribute('aria-label',label);swatch.style.background=color;name.textContent=label;item.append(input,swatch,name);legend.append(item);input.addEventListener('change',()=>draw());}
    percent.addEventListener('change',()=>draw());
    const selected=()=>[...legend.querySelectorAll('input:checked')].map(input=>input.dataset.population);
    chart.addEventListener('pointermove',e=>{if(!current)return;const box=chart.getBoundingClientRect();hoverTime=Math.max(0,Math.min(1,((e.clientX-box.left)-34)/(box.width-42)))*current.time;draw();});
    chart.addEventListener('pointerleave',()=>{hoverTime=null;draw();});chart.addEventListener('blur',()=>{hoverTime=null;draw();});
    chart.addEventListener('keydown',event=>{if(!view?.rows.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();let at=nearest(view.rows,hoverTime??current.time);at=event.key==='Home'?0:event.key==='End'?view.rows.length-1:Math.max(0,Math.min(view.rows.length-1,at+(event.key==='ArrowLeft'?-1:1)));hoverTime=view.rows[at].time;draw();});
    $('language').addEventListener('change',()=>draw());
    function draw(){
      if(!current)return;
      view=plan(current.history||[],selected(),percent.checked,current.time);
      const c=chart.getContext('2d'),w=Math.max(240,chart.clientWidth||320),h=Math.max(85,chart.clientHeight||110),dpr=Math.max(devicePixelRatio||1,recordingScale),left=34,right=w-8,top=14,bottom=h-21;
      if(chart.width!==Math.round(w*dpr)||chart.height!==Math.round(h*dpr)){chart.width=Math.round(w*dpr);chart.height=Math.round(h*dpr);}c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
      chart.dataset.mode=view.mode;chart.dataset.type=view.type||'';chart.dataset.max=String(view.max);
      $('history-percent-option').hidden=view.mode!=='stack';
      $('history-mode').parentElement.hidden=view.mode!=='stack';
      const caption=view.mode==='stack'?types.find(t=>t[0]===view.type)[1]+'状态':'细胞数量';$('history-mode').textContent=caption;
      const key=JSON.stringify([view.mode,view.type,view.series.map(s=>s.key)]);
      if(key!==lastLegend){lastLegend=key;stateLegend.replaceChildren();if(view.mode==='stack')for(const s of view.series){const label=document.createElement('span'),swatch=document.createElement('i'),name=document.createElement('span');swatch.style.background=s.color;name.textContent=s.label;label.append(swatch,name);stateLegend.append(label);}}
      stateLegend.hidden=view.mode!=='stack';
      const X=t=>left+t/Math.max(1,view.end)*(right-left),Y=v=>bottom-v/view.max*(bottom-top);
      c.font='10px Consolas,monospace';c.lineWidth=1;
      for(const value of [0,view.max/2,view.max]){const y=Y(value);c.strokeStyle=value?'#d6c8ad':'#ac9974';c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.fillStyle='#766953';c.textAlign='right';c.fillText((Number.isInteger(value)?value:Number(value.toFixed(1)))+(view.percent?'%':''),left-5,y+3);}
      c.fillStyle='#766953';c.textAlign='left';c.fillText('0 MCS',left,h-5);c.textAlign='right';c.fillText(view.end+' MCS',right,h-5);c.textAlign='left';
      c.save();c.beginPath();c.rect(left,top,right-left,bottom-top);c.clip();
      if(view.mode==='lines')for(const s of view.series){c.beginPath();c.strokeStyle=s.color;c.lineWidth=1.5;view.rows.forEach((r,i)=>{i?c.lineTo(X(r.time),Y(number(r[s.key]))):c.moveTo(X(r.time),Y(number(r[s.key])));});c.stroke();}
      if(view.mode==='stack'&&view.rows.length){const base=new Float64Array(view.rows.length);for(let k=0;k<view.series.length;k++){c.beginPath();view.rows.forEach((r,i)=>{const x=X(r.time),y=Y(base[i]+view.values[i][k]);i?c.lineTo(x,y):c.moveTo(x,y);});for(let i=view.rows.length-1;i>=0;i--)c.lineTo(X(view.rows[i].time),Y(base[i]));c.closePath();c.fillStyle=view.series[k].color;c.globalAlpha=.78;c.fill();c.globalAlpha=1;c.strokeStyle=view.series[k].color;c.lineWidth=1;c.beginPath();view.rows.forEach((r,i)=>{base[i]+=view.values[i][k];i?c.lineTo(X(r.time),Y(base[i])):c.moveTo(X(r.time),Y(base[i]));});c.stroke();}
        c.beginPath();c.strokeStyle='#36302b';c.lineWidth=1.5;view.rows.forEach((r,i)=>{i?c.lineTo(X(r.time),Y(base[i])):c.moveTo(X(r.time),Y(base[i]));});c.stroke();}
      c.restore();
      if(view.mode==='empty'){c.fillStyle='#766953';c.fillText(translate('勾选图例显示细胞'),left+4,(top+bottom)/2);readout.textContent='勾选图例显示细胞';}
      else if(view.rows.length){const index=nearest(view.rows,hoverTime??current.time),row=view.rows[index];
        if(hoverTime!==null){c.strokeStyle='#806747';c.setLineDash([3,3]);c.beginPath();c.moveTo(X(row.time),top);c.lineTo(X(row.time),bottom);c.stroke();c.setLineDash([]);}
        const details=view.series.map((s,k)=>{const n=view.mode==='stack'?view.counts[index][k]:number(row[s.key]),total=view.type?number(row[view.type]):0;return translate(s.label)+' '+Number(n.toFixed(1))+(view.mode==='stack'?' ('+(total?100*n/total:0).toFixed(0)+'%)':'');});
        readout.textContent=row.time+' MCS · '+details.join(' · ');
      }
      $('history-range').textContent=`全程 0 — ${view.end.toLocaleString()} MCS`;
      $('order').textContent='极性一致度 '+(view.rows.at(-1)?.order||0).toFixed(2);
      chart.setAttribute('aria-label',translate(caption)+' · 0 — '+view.end+' MCS · '+readout.textContent);
    }
    return {update(snapshot,scale=0){current=snapshot;recordingScale=scale;draw();},get view(){return view;}};
  }
  globalThis.CellLabHistory={types,states,niceMax,plan,nearest,mount};
})();
