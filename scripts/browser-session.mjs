import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export const delay = ms => new Promise(r=>setTimeout(r,ms));
export async function openBrowser(file,port=9354,{gpu=false,initScript}={}){
  const process=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',...(gpu?[]:['--disable-gpu']),'--no-first-run','--disable-background-networking','--remote-debugging-port='+port,'--remote-allow-origins=*','--user-data-dir='+path.resolve('.profile-'+port),'about:blank'],{windowsHide:true,stdio:'ignore'});
  let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break;}catch{await delay(100);}}
  if(!tabs){process.kill();throw Error('Chrome startup failed');}
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map(),errors=[],requests=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url))requests.push(m.params.request.url);};
  const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  if(initScript)await call('Page.addScriptToEvaluateOnNewDocument',{source:initScript});
  await call('Page.navigate',{url:file.startsWith('http')?file:pathToFileURL(path.resolve(file)).href});
  return {call,evaluate,errors,requests,close:async()=>{try{await call('Browser.close');}catch{}ws.close();process.kill();}};
}
