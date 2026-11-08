/* Sequential Artistoo copy loop specialized for this project's constraints.
 * No checkerboard approximation, skipped attempts, or parallel cell writes.
 * Double arithmetic, MT19937 and accepted-copy order match the JS reference.
 * JS replays accepted copies through Artistoo's original bookkeeping hooks. */
typedef unsigned int u32;
typedef unsigned short u16;
typedef unsigned char u8;
void *memset(void *p,int value,unsigned long n){volatile u8 *q=p;for(unsigned long i=0;i<n;i++)q[i]=(u8)value;return p;}
#define MAX 1048576
#define STRIDE 24
enum {PRESENT,KIND,DYING,VOLUME,PERIMETER,TARGET,LV,PT,LP,ACT,DRIVE,PX,PY,TARGET_ID,INVASION,HAS_NUCLEUS,NX,NY,NR,REACH,SOFT_REACH,MIN_AREA};
static u16 grid[MAX];static u8 activity[MAX],degree[MAX],nc[MAX],connected[256];
static int neighbors[MAX*8],rings[MAX*8],pool[MAX],where[MAX];
static u32 visited[MAX],goals[MAX],queue[MAX],logdata[MAX*2+2],mt[625];
static double cells[65536*STRIDE],params[64];
static u8 contact_present[65536];static int contact_table[32768],contact_data[16384*5],contact_count;
static u32 stamp=0;static int width,height,wrap,ybits,nraw,count,logcount,section;
__attribute__((import_module("math"),import_name("exp"))) extern double js_exp(double);
__attribute__((import_module("math"),import_name("pow"))) extern double js_pow(double,double);
__attribute__((export_name("pointer"))) u32 pointer(int k){switch(k){case 0:return(u32)grid;case 1:return(u32)activity;case 2:return(u32)degree;case 3:return(u32)nc;case 4:return(u32)neighbors;case 5:return(u32)rings;case 6:return(u32)pool;case 7:return(u32)mt;case 8:return(u32)cells;case 9:return(u32)params;case 10:return(u32)connected;case 12:return(u32)contact_data;case 13:return(u32)contact_present;default:return(u32)logdata;}}
__attribute__((export_name("init"))) void init(int w,int h,int wr,int bits,int n,int sec){width=w;height=h;wrap=wr;ybits=bits;nraw=n;section=sec;stamp=0;for(int i=0;i<n;i++){visited[i]=0;goals[i]=0;}}
static inline double random_value(){
  u32 y;int at=mt[624];if(at>=624){int k=0;for(;k<227;k++){y=(mt[k]&0x80000000u)|(mt[k+1]&0x7fffffffu);mt[k]=mt[k+397]^(y>>1)^((y&1u)?0x9908b0dfu:0);}
    for(;k<623;k++){y=(mt[k]&0x80000000u)|(mt[k+1]&0x7fffffffu);mt[k]=mt[k-227]^(y>>1)^((y&1u)?0x9908b0dfu:0);}y=(mt[623]&0x80000000u)|(mt[0]&0x7fffffffu);mt[623]=mt[396]^(y>>1)^((y&1u)?0x9908b0dfu:0);at=0;}
  y=mt[at++];mt[624]=at;y^=y>>11;y^=(y<<7)&0x9d2c5680u;y^=(y<<15)&0xefc60000u;y^=y>>18;return(double)y*(1./4294967296.);
}
static inline double *cell(int id){return cells+id*STRIDE;}
static inline double distance2(int i,double *m){double dx=(i>>ybits)-m[NX],dy=(i&((1<<ybits)-1))-m[NY];if(wrap){if(dx>width/2.)dx-=width;else if(dx< -width/2.)dx+=width;if(dy>height/2.)dy-=height;else if(dy< -height/2.)dy+=height;}return dx*dx+dy*dy;}
static inline int own(int j,int id,int tgt,int a){return j>=0&&(j==tgt?a:grid[j])==id;}
static inline int thick(int j,int id,int tgt,int a){int *r=rings+j*8;return(own(r[0],id,tgt,a)&&own(r[1],id,tgt,a)&&own(r[7],id,tgt,a))||(own(r[2],id,tgt,a)&&own(r[1],id,tgt,a)&&own(r[3],id,tgt,a))||(own(r[4],id,tgt,a)&&own(r[3],id,tgt,a)&&own(r[5],id,tgt,a))||(own(r[6],id,tgt,a)&&own(r[5],id,tgt,a)&&own(r[7],id,tgt,a));}
static inline int local_body(int j,int tgt,int a,int b){
  int id=j==tgt?a:grid[j];double *m=cell(id);if(!m[PRESENT]||m[DYING]||(id!=a&&id!=b))return 1;
  int *ring=rings+j*8,mask=0,faces=0;for(int k=0;k<8;k++)if(own(ring[k],id,tgt,a)){mask|=1<<k;if(k&1)faces++;}
  if(faces<2||connected[mask])return 1;
  for(int k=1;k<8;k+=2)if(mask&(1<<k)){int *r=rings+ring[k]*8,d=0;for(int f=1;f<8;f+=2)if(own(r[f],id,tgt,a))d++;if(d==1)mask&=~(1<<k);}
  return !mask||connected[mask];
}
static int section_allowed(int tgt,int a,int b){
  double *sa=cell(a),*tb=cell(b);
  if(tb[PRESENT]&&!tb[DYING]){if(tb[VOLUME]<=tb[MIN_AREA])return 0;if(tb[HAS_NUCLEUS]&&distance2(tgt,tb)<=tb[NR]*tb[NR])return 0;}
  int *r=rings+tgt*8;
  if(sa[PRESENT]&&!sa[DYING]){if(sa[HAS_NUCLEUS]&&distance2(tgt,sa)>sa[REACH]*sa[REACH])return 0;int anchored=0;for(int k=1;k<8;k+=2)if(r[k]>=0&&grid[r[k]]==a&&thick(r[k],a,tgt,a)){anchored=1;break;}if(!anchored)return 0;if(!local_body(tgt,tgt,a,b))return 0;}
  for(int k=1;k<8;k+=2)if(r[k]>=0&&!local_body(r[k],tgt,a,b))return 0;return 1;
}
static int topology(int tgt,int b){
  double *m=cell(b);if(!b||!m[PRESENT]||m[DYING])return 1;int *r=rings+tgt*8,mask=0;for(int k=0;k<8;k++)if(r[k]>=0&&grid[r[k]]==b)mask|=1<<k;
  if(connected[mask])return 1;if(!mask)return 0;
  if(++stamp==0xffffffffu){for(int i=0;i<nraw;i++){visited[i]=0;goals[i]=0;}stamp=1;}
  int needed=0,head=0,tail=0,seed=-1;for(int k=0;k<8;k++)if(mask&(1<<k)){needed++;goals[r[k]]=stamp;if(seed<0)seed=r[k];}
  queue[tail++]=seed;visited[seed]=stamp;
  while(head<tail){int i=queue[head++];if(goals[i]==stamp)needed--;if(!needed)return 1;
    if(section){int *ns=rings+i*8;for(int k=1;k<8;k+=2){int j=ns[k];if(j>=0&&j!=tgt&&grid[j]==b&&visited[j]!=stamp){visited[j]=stamp;queue[tail++]=j;}}}
    else{int *ns=neighbors+i*8;for(int k=0;k<nc[i];k++){int j=ns[k];if(j!=tgt&&grid[j]==b&&visited[j]!=stamp){visited[j]=stamp;queue[tail++]=j;}}}
  }return 0;
}
static inline double adhesion(int a,int b){double *ca=cell(a),*cb=cell(b);if(a&&b&&(ca[TARGET_ID]==b||cb[TARGET_ID]==a))return 2;
  if(ca[PRESENT]&&cb[PRESENT]&&ca[KIND]!=cb[KIND]){if(ca[KIND]==3||cb[KIND]==3)return 9;double *t=ca[KIND]==2?ca:cb[KIND]==2?cb:0;if(t){double j=19-3*t[INVASION];return j<9?9:j;}}
  return params[5+(int)ca[KIND]*5+(int)cb[KIND]];
}
static inline double activity_at(int i){int id=grid[i];double product=activity[i];if(!id||!product)return 0;int n=1,*ns=neighbors+i*8;for(int k=0;k<nc[i];k++){int j=ns[k];if(grid[j]==id){int v=activity[j];if(!v)return 0;product*=v;n++;}}return js_pow(product,1./n);}
static inline double shape_energy(int tgt,double *m){if(!m[HAS_NUCLEUS]||m[DYING])return 0;double d=__builtin_sqrt(distance2(tgt,m))/m[SOFT_REACH]-1;if(d<0)d=0;return(m[KIND]==1?5:m[KIND]==2?10:18)*(d*d);}
__attribute__((export_name("energy"))) double energy(int src,int tgt,int a,int b){
  double *ca=cell(a),*cb=cell(b),hs=0,ht=0;int da=0,db=0,*ns=neighbors+tgt*8;
  for(int k=0;k<nc[tgt];k++){int n=grid[ns[k]];if(n!=a)hs+=adhesion(n,a);if(n!=b)ht+=adhesion(n,b);da+=n==a?-1:1;db+=n==b?1:-1;}
  double h=hs-ht,per=0;
  if(ca[LP]){double hn=(ca[PERIMETER]+da)-ca[PT],ho=ca[PERIMETER]-ca[PT];per+=ca[LP]*(hn*hn-ho*ho);}
  if(cb[LP]){double hn=(cb[PERIMETER]+db)-cb[PT],ho=cb[PERIMETER]-cb[PT];per+=cb[LP]*(hn*hn-ho*ho);}h+=per;
  double *m=a?ca:cb;double act=m[ACT]?m[ACT]*(activity_at(tgt)-activity_at(src))/params[(int)m[KIND]]:0;h+=act;
  if(section)h+=shape_energy(tgt,ca)-shape_energy(tgt,cb);
  double vol=0;if(ca[PRESENT])vol+=ca[LV]*(2*(ca[VOLUME]-ca[TARGET])+1);if(cb[PRESENT])vol+=cb[LV]*(-2*(cb[VOLUME]-cb[TARGET])+1);h+=vol;
  double direction=0;if(ca[PRESENT]&&ca[DRIVE]&&!ca[DYING]){int mask=(1<<ybits)-1;double dx=(tgt>>ybits)-(src>>ybits),dy=(tgt&mask)-(src&mask);if(wrap){if(dx>1)dx-=width;else if(dx< -1)dx+=width;if(dy>1)dy-=height;else if(dy< -1)dy+=height;}direction=-ca[DRIVE]*(dx*ca[PX]+dy*ca[PY]);}return h+direction;
}
static inline void insert(int j){if(where[j]>=0)return;where[j]=count;pool[count++]=j;}
static inline void remove_pixel(int j){int slot=where[j];if(slot<0)return;where[j]=-1;int last=pool[--count];if(last!=j){pool[slot]=last;where[last]=slot;}}
static void setpixel(int i,int a,int b){
  double *ca=cell(a),*cb=cell(b);int da=0,db=0,*ns=neighbors+i*8;
  for(int k=0;k<nc[i];k++){int n=grid[ns[k]];da+=n==a?-1:1;db+=n==b?1:-1;}
  if(a){ca[VOLUME]++;ca[PERIMETER]+=da;}if(b){cb[VOLUME]--;cb[PERIMETER]+=db;if(cb[VOLUME]==0)cb[KIND]=0;}
  grid[i]=a;int was=degree[i]>0;degree[i]=0;
  for(int k=0;k<nc[i];k++){int j=ns[k],nt=grid[j];if(nt!=a)degree[i]++;if(nt==b){if(degree[j]++==0)insert(j);}if(nt==a){if(--degree[j]==0)remove_pixel(j);}}
  if(!was&&degree[i]>0)insert(i);if(was&&degree[i]==0)remove_pixel(i);activity[i]=(u8)params[(int)ca[KIND]];
  logdata[logcount*2]=i;logdata[logcount*2+1]=a;logcount++;
}
__attribute__((export_name("run"))) int run(int length){
  count=length;logcount=0;for(int i=0;i<nraw;i++)where[i]=-1;for(int i=0;i<count;i++)where[pool[i]]=i;
  double t=0;while(t<1&&count){t+=1./count;int tgt=pool[(int)(random_value()*count)],src=neighbors[tgt*8+(int)(random_value()*nc[tgt])],a=grid[src],b=grid[tgt];
    if(a==b||cell(a)[KIND]==4||cell(b)[KIND]==4)continue;if(section&&!section_allowed(tgt,a,b))continue;if(!topology(tgt,b))continue;
    double h=energy(src,tgt,a,b);if(h<0||random_value()<js_exp(-h/params[30]))setpixel(tgt,a,b);
  }return logcount;
}
static int add_contact(int a,int b,int dx,int dy){
  u32 key=((u32)a<<16)|(u32)b;int slot=(key*2654435761u)>>17;
  while(contact_table[slot]){int at=(contact_table[slot]-1)*5;if(contact_data[at]==a&&contact_data[at+1]==b){contact_data[at+2]++;contact_data[at+3]+=dx;contact_data[at+4]+=dy;return 1;}slot=(slot+1)&32767;}
  if(contact_count>=16384)return 0;int at=contact_count*5;contact_table[slot]=++contact_count;contact_data[at]=a;contact_data[at+1]=b;contact_data[at+2]=1;contact_data[at+3]=dx;contact_data[at+4]=dy;return 1;
}
__attribute__((export_name("contacts"))) int contacts(int length){
  for(int i=0;i<32768;i++)contact_table[i]=0;contact_count=0;
  // Same border traversal and first-insertion order as the reference Map path.
  for(int p=0;p<length;p++){int i=pool[p],a=grid[i];if(!contact_present[a])continue;int *r=rings+i*8;
    int b=r[3]<0?0:grid[r[3]];if(a!=b&&contact_present[b])if(!add_contact(a,b,1,0)||!add_contact(b,a,-1,0))return -1;
    b=r[5]<0?0:grid[r[5]];if(a!=b&&contact_present[b])if(!add_contact(a,b,0,1)||!add_contact(b,a,0,-1))return -1;
  }return contact_count;
}
