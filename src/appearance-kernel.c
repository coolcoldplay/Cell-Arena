/* Read-only optical chamfer transform, identical to cell-appearance.js.
 * This memory never contains mechanical or biological state. No RNG, no GPU
 * readback, no resolution change. Compile without fast-math or FP contraction. */
typedef unsigned int u32;
typedef unsigned short u16;
typedef unsigned char u8;
#define MAX 1048576
static u16 grid[MAX];
static float depth[MAX],work[9*MAX],fade[65536],maximum[65536];
static u8 interior[MAX],live[65536];
__attribute__((export_name("pointer"))) u32 pointer(int k){
  switch(k){case 0:return(u32)grid;case 1:return(u32)live;case 2:return(u32)fade;case 3:return(u32)depth;default:return(u32)interior;}
}
static inline double min(double a,double b){return a<b?a:b;}
static inline double max(double a,double b){return a>b?a:b;}
__attribute__((export_name("render"))) void render(int w,int h,int wrap,int px,int py){
  int n=w*h,pw=w+2*px,ph=h+2*py;const double diagonal=1.4142135623730951;
  for(int id=0;id<65536;id++)maximum[id]=0;
  for(int y=0;y<h;y++){
    int start=y*w,up=y?start-w:wrap?(h-1)*w:-1,down=y<h-1?start+w:wrap?0:-1;
    for(int x=0;x<w;x++){
      int q=start+x,id=grid[q],l=x?q-1:wrap?start+w-1:-1,r=x<w-1?q+1:wrap?start:-1;
      depth[q]=!live[id]||l<0||r<0||up<0||down<0||grid[l]!=id||grid[r]!=id||grid[up+x]!=id||grid[down+x]!=id?.5f:1e9f;
    }
  }
  for(int y=0;y<ph;y++){
    int sy=(y-py+h)%h,start=sy*w,row=y*pw;
    for(int x=0;x<w;x++)work[row+px+x]=depth[start+x];
    for(int x=0;x<px;x++){work[row+x]=depth[start+w-px+x];work[row+px+w+x]=depth[start+x];}
  }
  for(int x=1;x<pw;x++)work[x]=min(work[x],(double)work[x-1]+1);
  for(int y=1;y<ph;y++){
    int start=y*pw,end=start+pw-1;
    work[start]=min(work[start],min((double)work[start-pw]+1,(double)work[start-pw+1]+diagonal));
    for(int q=start+1;q<end;q++)if(work[q]>.5)work[q]=min(work[q],min(min((double)work[q-1]+1,(double)work[q-pw]+1),min((double)work[q-pw-1]+diagonal,(double)work[q-pw+1]+diagonal)));
    work[end]=min(work[end],min((double)work[end-1]+1,min((double)work[end-pw]+1,(double)work[end-pw-1]+diagonal)));
  }
  for(int q=pw*ph-2;q>=pw*ph-pw;q--)work[q]=min(work[q],(double)work[q+1]+1);
  for(int y=ph-2;y>=0;y--){
    int start=y*pw,end=start+pw-1;
    work[end]=min(work[end],min((double)work[end+pw]+1,(double)work[end+pw-1]+diagonal));
    for(int q=end-1;q>start;q--)if(work[q]>.5)work[q]=min(work[q],min(min((double)work[q+1]+1,(double)work[q+pw]+1),min((double)work[q+pw-1]+diagonal,(double)work[q+pw+1]+diagonal)));
    work[start]=min(work[start],min((double)work[start+1]+1,min((double)work[start+pw]+1,(double)work[start+pw+1]+diagonal)));
  }
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    int q=y*w+x,id=grid[q];if(!live[id])continue;
    float value=depth[q]=work[(y+py)*pw+x+px];if(value>maximum[id])maximum[id]=value;
  }
  for(int id=0;id<65536;id++)if(live[id])fade[id]=1/max(.5,min(fade[id],maximum[id]));
  for(int q=0;q<n;q++){
    int id=grid[q];if(!live[id]){interior[q]=255;continue;}
    double t=min(1,(double)depth[q]*fade[id]);interior[q]=(u8)(255*t*t*(3-2*t)+.5);
  }
}
