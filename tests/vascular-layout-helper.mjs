import assert from 'node:assert/strict';
// The old fully occupied sheet now has deliberate lumens and small curved
// vessel/tissue junction pores. Empty moats elsewhere remain a regression.
export function assertConfluentTissue(s){
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(!s.C.pixt([x,y]))assert.ok(s.vascular.reserved(x,y,2*s.scale),`unexpected tissue void at ${x},${y}`);
  for(const v of s.vascular.vessels){assert.ok(v.active);assert.equal(s.C.pixt([Math.round(v.x),Math.round(v.y)]),0,'initial lumen remains hollow');}
}
