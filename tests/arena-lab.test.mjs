import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/experiment.js','src/trajectories.js','src/i18n.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(scene,extra={})=>new CellLab.Simulation({scene,worldWidth:240,worldHeight:180,refinement:1,warmup:0,...extra});

test('oncogenesis fills the entire dish with connected normal bodies and twelve internal patrols',()=>{
 for(const worldWidth of [192,240,384]){const s=make('oncogenesis',{worldWidth,worldHeight:worldWidth*.75}),snap=s.snapshot();
  assert.ok(snap.grid.every(id=>id>0));assert.equal(snap.cells.filter(c=>c.kind===3).length,12);assert.ok(snap.cells.every(c=>c.kind!==2&&c.state!=='abnormal'));
  for(const m of s.live()){assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));assert.equal(s.components(m.id).length,1);if(m.kind===3){assert.ok(m.x>s.width*.1&&m.x<s.width*.9&&m.y>s.height*.1&&m.y<s.height*.9);assert.ok(s.contacts.get(m.id).size>=2);}}
 }
});
function reachable(s){const f=s.fields.trail,start=f.index(s.maze.cx/s.fieldScale,s.maze.cy/s.fieldScale),seen=new Set([start]),queue=[start];for(let head=0;head<queue.length;head++){const i=queue[head],x=i%f.width,y=Math.floor(i/f.width);for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const j=f.index(xx,yy);if(j>=0&&!f.blocked[j]&&!seen.has(j)){seen.add(j);queue.push(j);}}}return seen;}
test('maze corridors are narrower than a resting immune body and every entrance requires a substantial detour',()=>{
 const s=make('maze',{worldWidth:384,worldHeight:288,seed:17}),m=s.maze;
 assert.ok(m.corridor>=5&&m.corridor<=7,`corridor width ${m.corridor}`);assert.ok(m.rings>=12);
 // Test-only geometry search: the cells themselves never receive these distances.
 const f=s.fields.trail,dist=new Int32Array(f.values.length).fill(-1),start=s.fieldIndex(m.cx,m.cy),queue=[start];dist[start]=0;
 for(let h=0;h<queue.length;h++){const i=queue[h],x=i%f.width,y=Math.floor(i/f.width);for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const j=f.index(xx,yy);if(j>=0&&!f.blocked[j]&&dist[j]<0){dist[j]=dist[i]+1;queue.push(j);}}}
 for(const racer of m.racers){const route=dist[s.fieldIndex(racer.x,racer.y)]*s.fieldScale/s.scale;assert.ok(route>m.radius/s.scale*2.2,`entrance ${racer.number} has a short route: ${route}`);}
});
test('smooth maze curves share their geometry with the physical wall raster',()=>{
 const s=make('maze',{worldWidth:192,worldHeight:144}),m=s.maze;
 assert.ok(m.curves?.some(c=>c[0]===0),'maze must contain real circular arcs');assert.ok(m.curves.some(c=>c[0]===1));
 for(const c of m.curves){for(const t of [.25,.5,.75]){let x,y;if(c[0]===0){const a=c[2]+t*(c[3]-c[2]);x=m.cx+c[1]*Math.cos(a);y=m.cy+c[1]*Math.sin(a);}else{x=m.cx+c[1]+t*(c[3]-c[1]);y=m.cy+c[2]+t*(c[4]-c[2]);}assert.equal(s.C.cellKind(s.C.pixt([Math.floor(x),Math.floor(y)])),4,'visible curve must be solid');}}
});
test('maze signal permeability toggles only recruitment diffusion and preserves the race and physical walls',()=>{
 const s=make('maze',{worldWidth:192,worldHeight:144}),before=s.C.grid._pixels.slice(),time=s.C.time,cells=s.snapshot().cells,constrained=s.fields.trail.values.slice();
 assert.equal(typeof s.setMazeSignalMode,'function');s.setMazeSignalMode(true);
 assert.ok(s.maze.signalThroughWalls);assert.ok(s.fields.trail.blocked.every(v=>v===0));assert.ok(s.fields.oxygen.blocked.some(Boolean));assert.deepEqual(s.C.grid._pixels,before);assert.deepEqual(s.snapshot().cells,cells);assert.equal(s.C.time,time);
 assert.ok(s.fields.trail.values.some((v,i)=>s.fields.oxygen.blocked[i]&&v>0));assert.notDeepEqual(s.fields.trail.values,constrained);
 const profile=CellLabExperiment.parse({scene:'maze',maze:s.maze,settings:s.settings,seed:17,boundary:'solid',worldWidth:192,worldHeight:144,refinement:1});assert.ok(profile.config.mazeSignalThroughWalls);
 s.updateSignals(8);s.rebuildMask();assert.ok(s.fields.trail.blocked.every(v=>v===0));s.setMazeSignalMode(false);assert.deepEqual(s.fields.trail.blocked,s.fields.oxygen.blocked);assert.deepEqual(s.fields.trail.values,constrained);
});
test('circular maze has six equidistant traversable entrances and a wall-respecting persistent source',()=>{
 for(const [worldWidth,seed]of [[192,17],[240,17],[320,29],[384,77]]){const s=make('maze',{worldWidth,worldHeight:worldWidth*.75,seed}),m=s.maze,f=s.fields.trail,seen=reachable(s);
  assert.equal(s.live().length,6);assert.ok(s.live().every(c=>c.kind===3));assert.equal(m.racers.length,6);assert.ok(m.rings>=6);assert.ok(m.corridor>=5&&m.corridor<=7);
  for(const c of s.live()){assert.ok(s.section.fits(c,c.nucleusX,c.nucleusY));assert.ok(seen.has(s.fieldIndex(c.x,c.y)),`entrance ${c.id} disconnected for ${worldWidth}, ${seed}`);}
  assert.equal(Math.max(...f.values),30);assert.ok(f.values.every((v,i)=>v>=-1e-5&&v<=30.0001&&(!f.blocked[i]||v===0)));s.updateSignals(400);assert.equal(Math.max(...f.values),30);assert.ok(s.live().every(c=>c.activation===0&&c.recruitment===0));
 }
});
test('arrival uses the current founder nucleus and persists after departure, without scoring new cells',()=>{
 const s=make('maze'),m=s.maze,c=s.cells[m.racers[2].id];s.C.time=120;c.nucleusX=m.cx;c.nucleusY=m.cy;s.updateScenarioState();assert.deepEqual(m.arrivals,[{number:3,time:120}]);c.nucleusX=0;s.C.time=200;s.updateScenarioState();assert.equal(m.arrivals.length,1);s.eraseCell(c.id,{manual:true});assert.equal(s.snapshot().maze.racers[2].arrivedAt,120);
});
test('an immune entrant reaches the center by continuous motion without crossing or changing any solid wall',async t=>{
 const s=make('maze',{worldWidth:384,worldHeight:288,refinement:1.5}),walls=[];for(const [p,id]of s.C.pixels())if(s.C.cellKind(id)===4)walls.push(s.C.grid.p2i(p));
 await CellLabWasm.install(s,await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')));
 for(let n=0;n<10000&&!s.maze.arrivals.length;n++){const previous=s.live().map(c=>[c.id,c.nucleusX,c.nucleusY]);s.advance(1);for(const [id,x,y]of previous){const c=s.cells[id];assert.ok(c&&!c.dying);assert.ok(Math.hypot(c.nucleusX-x,c.nucleusY-y)<=Math.SQRT2+.001,'nucleus never teleports');assert.ok(s.section.fits(c,c.nucleusX,c.nucleusY));}}
 t.diagnostic('First narrow-maze arrival: '+s.maze.arrivals[0]?.time+' MCS');
 assert.ok(s.maze.arrivals.length);assert.ok(walls.every(i=>s.C.pixti(i)===s.wallID));assert.ok(s.live().every(c=>s.components(c.id).length===1&&c.activation===0));
});
test('persistent sources change real fields, can be erased, and survive parameter round trips',()=>{
 const s=make('empty'),id=s.addSource(30,30,'danger',8);assert.ok(id);assert.equal(s.addSource(31,30,'danger',8),id);s.addSource(80,70,'nutrient',8);s.addSource(130,70,'hostile',8);s.advance(40);
 const i=s.fieldIndex(30,30),n=s.fieldIndex(80,70),h=s.fieldIndex(130,70);assert.equal(s.fields.danger.values[i],30);assert.equal(s.fields.trail.values[i],0);assert.equal(s.fields.oxygen.values[n],1);assert.equal(s.fields.glucose.values[n],1);assert.ok(Math.abs(s.fields.oxygen.values[h]-.06)<1e-6);assert.ok(s.fields.acid.values[h]>.94);
 const data={scene:'empty',settings:s.settings,seed:17,boundary:'solid',worldWidth:240,worldHeight:180,refinement:1,sources:s.sources.map(v=>({type:v.type,x:v.x,y:v.y,radius:v.radius})),display:{flags:{'show-tracks':true},trackDuration:800}},profile=CellLabExperiment.parse(data),copy=new CellLab.Simulation(profile.config);assert.equal(copy.sources.length,3);assert.equal(profile.display.trackDuration,800);assert.ok(profile.display.flags['show-tracks']);
 s.removeSources(30,30,2);s.updateSignals(40);assert.ok(s.fields.danger.values[i]<30);assert.throws(()=>CellLabExperiment.parse({...data,sources:[{type:'invalid',x:1,y:1,radius:8}]}));
});
test('trails expire in model time, break at periodic seams and do not connect recycled IDs or daughters',()=>{
 const t=new CellLabTrajectories();t.configure(true,100);const snap=(time,x,birth=1,revision=1)=>({time,width:100,height:80,boundary:'wrap',revision,cells:[{id:2,birth,kind:3,x,y:20}]});t.sample(snap(0,90));t.sample(snap(20,97));t.sample(snap(40,2));assert.ok(t.paths.get(1).points.at(-1).break);for(let i=0;i<20;i++)t.sample(snap(40,2));assert.equal(t.paths.get(1).points.length,3);
 t.sample(snap(50,4,2));assert.equal(t.paths.get(2).points.length,1);t.sample(snap(150,8,2));assert.ok(!t.paths.has(1));assert.ok([...t.paths.values()].every(p=>p.points.every(v=>v.time>=50)));t.sample(snap(0,4,3,2));assert.equal(t.paths.size,1);t.configure(false,400);assert.equal(t.paths.size,0);
});
test('generation P labels and laboratory controls have English translations',()=>{
 assert.equal(CellLabI18n.translate('子代 P3 · 沿谱系分裂 3 次'),'Generation P3 · 3 divisions along lineage');for(const label of ['招募扩散：沿通道','招募扩散：穿墙','免疫细胞迷宫','＋ 持续场源','氧糖补给','乏氧高酸','显示运动轨迹','轨迹保留时长','首达 #3 · 120 MCS'])assert.doesNotMatch(CellLabI18n.translate(label),/\p{Script=Han}/u);
});
