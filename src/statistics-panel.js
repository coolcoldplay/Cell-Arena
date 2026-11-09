/* Focus the existing, live statistics. Never clone counters or reset biology. */
(() => {
  function mount(mobile,onLayout=()=>{}){
    const $=id=>document.getElementById(id),aside=document.querySelector('aside'),pane=$('sidebar-scroll');
    const record=$('record-options'),anchor=document.createComment('record settings position');record.before(anchor);
    let active=false,priorScroll=0,priorMobile=false,priorScenario=false;
    function set(value){
      value=!!value;if(value===active)return;
      if(value){priorScroll=pane.scrollTop;priorMobile=mobile.expanded;priorScenario=$('statistics-scenario').open;}
      active=value;aside.classList.toggle('statistics-focused',active);
      $('statistics-expand').setAttribute('aria-pressed',String(active));$('statistics-expand').textContent=active?'返回控制':'占满侧栏';
      if(active){
        $('statistics-panel').open=true;$('statistics-scenario').open=true;
        $('statistics-record-settings').append(record);mobile.expand(true);pane.scrollTop=0;
      }else{
        anchor.after(record);$('statistics-scenario').open=priorScenario;mobile.expand(priorMobile);pane.scrollTop=priorScroll;
      }
      onLayout();
    }
    $('statistics-expand').addEventListener('click',()=>set(!active));
    matchMedia('(max-width:850px)').addEventListener('change',()=>{if(active)mobile.expand(true);});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active&&!document.querySelector('dialog[open]')){set(false);$('statistics-expand').focus();}});
    return{set,get active(){return active;}};
  }
  globalThis.CellLabStatistics={mount};
})();
