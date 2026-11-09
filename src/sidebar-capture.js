/* Record this app's visible sidebar using the browser's actual layout. Wrapped
 * text is measured with DOM ranges; no second layout engine or iframe is used. */
(() => {
  'use strict';
  const intersects=(a,b)=>a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
  const intersection=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
  const visible=color=>color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)';
  function capture(element,scale){
    const bounds=element.getBoundingClientRect(),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(bounds.width*scale));canvas.height=Math.max(1,Math.ceil(bounds.height*scale));
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.translate(-bounds.left,-bounds.top);
    const styleCache=new Map(),sticky=[];
    const css=e=>{if(!styleCache.has(e))styleCache.set(e,getComputedStyle(e));return styleCache.get(e);};
    function text(value,r,style){
      if(!value||r.width<=0||r.height<=0)return;
      ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.color;ctx.textAlign='left';ctx.textBaseline='alphabetic';
      if('letterSpacing' in ctx)ctx.letterSpacing=style.letterSpacing==='normal'?'0px':style.letterSpacing;
      const m=ctx.measureText(value),a=m.fontBoundingBoxAscent??m.actualBoundingBoxAscent,d=m.fontBoundingBoxDescent??m.actualBoundingBoxDescent;
      ctx.fillText(value,r.left,r.top+(r.height-a-d)/2+a,r.width+.5);
      if(style.textDecorationLine.includes('underline'))ctx.fillRect(r.left,r.bottom-1,Math.min(r.width,m.width),.7);
    }
    function textNode(node,clip){
      const style=css(node.parentElement),range=document.createRange();let line=null;
      const flush=()=>{if(line&&intersects(line,clip))text(line.value,{...line,width:line.right-line.left,height:line.bottom-line.top},style);line=null;};
      // This preserves grid/flex wrapping and skips collapsed whitespace.
      for(let i=0;i<node.length;){const n=node.data.codePointAt(i)>0xffff?2:1;range.setStart(node,i);range.setEnd(node,i+n);const r=range.getBoundingClientRect(),value=node.data.slice(i,i+n);i+=n;
        if(!r.width||!r.height)continue;
        if(!line||Math.abs(line.top-r.top)>1||r.left<line.left-1){flush();line={left:r.left,top:r.top,right:r.right,bottom:r.bottom,value};}
        else{line.value+=value;line.right=r.right;line.bottom=Math.max(line.bottom,r.bottom);}
      }
      flush();range.detach();
    }
    function box(r,style){
      if(visible(style.backgroundColor)){ctx.fillStyle=style.backgroundColor;ctx.fillRect(r.left,r.top,r.width,r.height);}
      if(style.backgroundImage.startsWith('linear-gradient')){
        const colors=style.backgroundImage.match(/rgba?\([^)]+\)|#[\da-f]+/gi)||[];
        if(colors.length>1){const gradient=ctx.createLinearGradient(r.left,0,r.right,0);colors.forEach((c,i)=>gradient.addColorStop(i/(colors.length-1),c));ctx.fillStyle=gradient;ctx.fillRect(r.left,r.top,r.width,r.height);}
      }
      for(const [side,x,y,w,h]of [['Top',r.left,r.top,r.width,parseFloat(style.borderTopWidth)],['Bottom',r.left,r.bottom-parseFloat(style.borderBottomWidth),r.width,parseFloat(style.borderBottomWidth)],['Left',r.left,r.top,parseFloat(style.borderLeftWidth),r.height],['Right',r.right-parseFloat(style.borderRightWidth),r.top,parseFloat(style.borderRightWidth),r.height]]){
        if(w>0&&h>0&&style['border'+side+'Style']!=='none'){ctx.fillStyle=style['border'+side+'Color'];ctx.fillRect(x,y,w,h);}
      }
    }
    function control(el,r,style){
      if(el.type==='range'){
        const tw=12,th=15,y=r.top+r.height/2,f=Math.max(0,Math.min(1,(Number(el.value)-(Number(el.min)||0))/((Number(el.max)||100)-(Number(el.min)||0)||1)));
        ctx.fillStyle='#c7b58e';ctx.fillRect(r.left,y-3,r.width,6);ctx.strokeStyle='#a59475';ctx.strokeRect(r.left+.5,y-2.5,r.width-1,5);
        for(let x=r.left+13;x<r.right;x+=15){ctx.fillStyle='#dcd0b7';ctx.fillRect(x,y-2,2,4);}
        ctx.fillStyle='#80653f';ctx.fillRect(r.left+f*(r.width-tw),y-th/2,tw,th);ctx.strokeStyle='#55442c';ctx.strokeRect(r.left+f*(r.width-tw)+.5,y-th/2+.5,tw-1,th-1);return;
      }
      if(el.type==='checkbox'){
        ctx.fillStyle=el.checked?'#74543a':'#f7f0e3';ctx.fillRect(r.left,r.top,r.width,r.height);ctx.strokeStyle='#a59475';ctx.strokeRect(r.left+.5,r.top+.5,r.width-1,r.height-1);
        if(el.checked){ctx.strokeStyle='#fff8eb';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(r.left+r.width*.2,r.top+r.height*.5);ctx.lineTo(r.left+r.width*.43,r.top+r.height*.75);ctx.lineTo(r.left+r.width*.8,r.top+r.height*.25);ctx.stroke();}return;
      }
      if(el.type==='color'){ctx.fillStyle=el.value;ctx.fillRect(r.left+3,r.top+3,r.width-6,r.height-6);return;}
      const left=r.left+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth),right=r.right-parseFloat(style.paddingRight)-(el.tagName==='SELECT'?16:2);
      text(el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:el.value,{left,top:r.top,width:right-left,height:r.height,bottom:r.bottom},style);
      if(el.tagName==='SELECT'){ctx.strokeStyle=style.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(r.right-15,r.top+r.height/2-2);ctx.lineTo(r.right-11,r.top+r.height/2+2);ctx.lineTo(r.right-7,r.top+r.height/2-2);ctx.stroke();}
    }
    function paint(el,clip,alpha=1,overlay=false){
      const r=el.getBoundingClientRect(),style=css(el);
      if(style.display==='none'||style.visibility==='hidden'||!r.width||!r.height||!intersects(r,clip))return;
      if(style.position==='sticky'&&!overlay){sticky.push({el,clip,alpha});return;}
      ctx.save();ctx.beginPath();ctx.rect(clip.left,clip.top,clip.right-clip.left,clip.bottom-clip.top);ctx.clip();ctx.globalAlpha=alpha*Number(style.opacity);box(r,style);
      let childClip=clip;
      if(['auto','scroll','hidden','clip'].includes(style.overflowY)||['auto','scroll','hidden','clip'].includes(style.overflowX)){childClip=intersection(clip,r);ctx.beginPath();ctx.rect(childClip.left,childClip.top,childClip.right-childClip.left,childClip.bottom-childClip.top);ctx.clip();}
      if(el.tagName==='CANVAS'){if(el.width&&el.height)ctx.drawImage(el,r.left,r.top,r.width,r.height);}
      else if(el.tagName==='INPUT'||el.tagName==='SELECT')control(el,r,style);
      else{
        if(el.tagName==='SUMMARY'){
          const content=getComputedStyle(el,'::before').content,symbol=content&&content!=='none'&&content!=='normal'?content.replace(/^['"]|['"]$/g,''):(style.display==='list-item'?(el.parentElement.open?'▾':'▸'):'');
          if(symbol)text(symbol,{left:r.left+parseFloat(style.paddingLeft),top:r.top,width:12,height:r.height,bottom:r.bottom},style);
        }
        for(const node of el.childNodes){
          if(el.tagName==='DETAILS'&&!el.open&&node.nodeName!=='SUMMARY')continue;
          if(node.nodeType===1)paint(node,childClip,ctx.globalAlpha);else if(node.nodeType===3)textNode(node,childClip);
        }
      }
      ctx.restore();
    }
    paint(element,bounds);for(const item of sticky)paint(item.el,item.clip,item.alpha,true);
    return Promise.resolve(canvas);
  }
  globalThis.CellLabSidebarCapture={capture};
})();
