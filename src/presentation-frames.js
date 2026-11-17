(() => {
  'use strict';
  const details=new WeakMap();
  function packDetails(cells,keys){
    const constants={},numeric=[],other={},count=cells.length;
    for(const key of keys){
      const first=cells[0]?.[key];let same=true,numbers=typeof first==='number';
      for(let i=1;i<count;i++){
        const value=cells[i][key];if(!Object.is(first,value))same=false;
        if(typeof value!=='number')numbers=false;
      }
      if(same)constants[key]=first;
      else if(numbers)numeric.push(key);
      else other[key]=cells.map(c=>c[key]);
    }
    const values=new Float64Array(count*numeric.length);
    for(let j=0;j<numeric.length;j++){const key=numeric[j];for(let i=0;i<count;i++)values[j*count+i]=cells[i][key];}
    return {constants,numeric,values,other};
  }
  function transfers(data){
    const buffers=[data.grid.buffer,data.activity.buffer];
    if(data.walls)buffers.push(data.walls.buffer,data.fieldMask.buffer);
    if(data.fields)for(const field of Object.values(data.fields))buffers.push(field.values.buffer);
    if(data.cellDetails)buffers.push(data.cellDetails.values.buffer);
    return buffers;
  }
  function receive(message,previous,lastFrame){
    const {data,baseFrame}=message;
    if(baseFrame&&(!previous||baseFrame!==lastFrame||data.revision!==previous.revision||data.width!==previous.width||data.height!==previous.height))return null;
    if(!data.walls||!data.fieldMask||!data.fields){
      if(!baseFrame)return null;
      data.walls??=previous.walls;data.fieldMask??=previous.fieldMask;data.fields??=previous.fields;
    }
    if(data.cellDetails){
      details.set(data,{columns:data.cellDetails});
      delete data.cellDetails;
    }
    return data;
  }
  function cellAt(s,index){
    const row=s.cells[index],columns=details.get(s)?.columns;
    if(!row||!columns)return row;
    const cell={...row,...columns.constants};
    for(let j=0;j<columns.numeric.length;j++)cell[columns.numeric[j]]=columns.values[j*s.cells.length+index];
    for(const key in columns.other)cell[key]=columns.other[key][index];
    return cell;
  }
  function complete(s){
    if(!s)return s;
    let entry=details.get(s);if(!entry){entry={};details.set(s,entry);}
    if(entry.complete)return entry.complete;
    const view={...s};
    function lazy(key,read){
      const set=value=>Object.defineProperty(view,key,{value,enumerable:true,configurable:true,writable:true});
      Object.defineProperty(view,key,{enumerable:true,configurable:true,get(){const value=read();set(value);return value;},set});
    }
    // Diagnostic callers can edit their copy without altering a later frame
    // that reuses the same wall mask or field buffers.
    lazy('walls',()=>s.walls.slice());lazy('fieldMask',()=>s.fieldMask.slice());lazy('fields',()=>structuredClone(s.fields));
    if(entry.columns)lazy('cells',()=>s.cells.map((_,i)=>cellAt(s,i)));
    return entry.complete=view;
  }
  globalThis.CellLabPresentation={packDetails,transfers,receive,cellAt,complete};
})();
