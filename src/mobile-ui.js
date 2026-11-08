/* Responsive controls only. Moving existing DOM nodes preserves input state,
 * listeners, selected tools and the running simulation. */
(() => {
  'use strict';
  function protectRange(range){
    let gesture=null;
    // Native range inputs jump on touch-down, before the browser can decide
    // that a gesture is a vertical scroll. Hold that tentative value locally;
    // only a tap or a deliberate horizontal drag reaches simulation listeners.
    range.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch'){gesture={id:event.pointerId,x:event.clientX,y:event.clientY,original:range.value,candidate:range.value,horizontal:false,vertical:false};range.dataset.touchEditing='true';}
    },true);
    range.addEventListener('pointermove',event=>{
      if(!gesture||event.pointerId!==gesture.id||gesture.horizontal||gesture.vertical)return;
      const dx=Math.abs(event.clientX-gesture.x),dy=Math.abs(event.clientY-gesture.y);
      if(dy>8&&dy>=dx)gesture.vertical=true;
      else if(dx>8&&dx>dy*1.25)gesture.horizontal=true;
    },true);
    range.addEventListener('input',event=>{
      if(!gesture||gesture.horizontal)return;
      gesture.candidate=range.value;range.value=gesture.original;event.stopImmediatePropagation();
    },true);
    range.addEventListener('pointerup',event=>{
      if(!gesture||event.pointerId!==gesture.id)return;
      const current=gesture;gesture=null;delete range.dataset.touchEditing;
      if(current.vertical){range.value=current.original;return;}
      if(!current.horizontal){range.value=current.candidate;range.dispatchEvent(new Event('input',{bubbles:true}));}
    },true);
    for(const event of ['pointercancel','lostpointercapture'])range.addEventListener(event,()=>{
      if(gesture&&!gesture.horizontal)range.value=gesture.original;gesture=null;delete range.dataset.touchEditing;
    },true);
  }
  function mount(){
    const $=id=>document.getElementById(id),query=matchMedia('(max-width:850px)'),workspace=document.querySelector('.workspace');
    const moves=[
      [document.querySelector('.scenes'),$('mobile-scenes-host')],
      [$('reset'),$('mobile-session-actions')],[$('shuffle'),$('mobile-session-actions')],
      [$('about'),$('mobile-session-actions')],[document.querySelector('.quick-tools'),$('mobile-tools-host')]
    ].map(([node,host])=>{const anchor=document.createComment('desktop control position');node.before(anchor);return{node,host,anchor};});
    let expanded=false;
    for(const range of document.querySelectorAll('input[type=range]'))protectRange(range);
    function expand(value){
      expanded=!!value&&query.matches;document.body.classList.toggle('panel-expanded',expanded);
      $('mobile-expand').setAttribute('aria-expanded',String(expanded));
      $('mobile-expand').textContent=expanded?'↓ 返回画布':'↑ 展开面板';
    }
    function selectTab(id){for(const button of document.querySelectorAll('[data-panel]'))button.setAttribute('aria-pressed',String(button.dataset.panel===id));}
    function scrollTo(target){
      requestAnimationFrame(()=>{const pane=$('sidebar-scroll'),offset=query.matches&&target.classList.contains('section')?$('mobile-module-nav').getBoundingClientRect().height:0;
        pane.scrollTo({top:pane.scrollTop+target.getBoundingClientRect().top-pane.getBoundingClientRect().top-offset-5,behavior:'auto'});
      });
    }
    function focus(id){
      const target=$(id);if(!target)return;if(target.tagName==='DETAILS'&&!target.open)target.open=true;
      if(query.matches)expand(id!=='mobile-tools');selectTab(id);scrollTo(target);
    }
    function focusModule(id){
      const target=$(id);if(!target)return;if(!target.open)target.open=true;if(!query.matches)return;
      expand(true);selectTab('parameter-groups');scrollTo(target);
    }
    function fitKeyboard(){
      const v=window.visualViewport;workspace.style.height=query.matches&&v&&v.scale===1?Math.round(v.height)+'px':'';
    }
    function layout(){
      for(const {node,host,anchor}of moves)if(query.matches)host.append(node);else anchor.after(node);
      if(!query.matches){expand(false);if($('mobile-tools-tab').getAttribute('aria-pressed')==='true')selectTab('parameter-groups');}
      fitKeyboard();
    }
    $('mobile-expand').addEventListener('click',()=>expand(!expanded));
    for(const button of document.querySelectorAll('[data-module]'))button.addEventListener('click',()=>focusModule(button.dataset.module));
    for(const section of document.querySelectorAll('#parameter-groups>details'))section.addEventListener('toggle',()=>{
      for(const button of document.querySelectorAll('[data-module]'))button.setAttribute('aria-pressed',String($(button.dataset.module).open));
      if(query.matches&&section.open)focusModule(section.id);
    });
    query.addEventListener('change',layout);window.visualViewport?.addEventListener('resize',fitKeyboard);
    layout();expand(false);
    return {focus,expand,get expanded(){return expanded;},get isMobile(){return query.matches;}};
  }
  globalThis.CellLabMobile={mount};
})();
