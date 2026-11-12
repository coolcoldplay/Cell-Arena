// Deliberately cognate experimental cultures for existing contact/biomechanics
// assays. Production scenarios keep their diverse, finite receptor repertoires.
export function peptide(s,m,level=1){
  const r=s.immunity.repertoire[0];
  s.immunity.alter(m,g=>{g.peptides.forEach((p,i)=>{p.sequence=i?s.immunity.self[i]:r.sequence;p.channel=i?i%2:r.channel;p.present=true;p.base=i?.7:level;p.stress=0;p.inflammation=0;});g.presentation=[1,1];g.brake={base:0,response:0};});
  m.expression.peptides=[level,.7,.7,.7];m.expression.presentation=[1,1];m.expression.checkpoint=0;s.immunity.summarize(m);return m;
}
export function receptor(s,m){const r=s.immunity.repertoire[0];s.immunity.alter(m,g=>{g.receptor={sequence:r.sequence,channel:r.channel};g.candidate=r.id;});m.primed=true;return m;}
export function trait(s,m,key,value){s.immunity.alter(m,g=>{g.traits[key]=value;});return m;}
export function cognateCulture(s){
  const register=s.register.bind(s);
  s.register=(id,kind)=>{const m=register(id,kind);if(!s.divisionParent){if(kind===2)peptide(s,m,m.genome.antigen);if(kind===3)receptor(s,m);}return m;};
  return s;
}
