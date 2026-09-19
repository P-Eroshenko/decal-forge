(function(root){
  function smoothColors(input,strength){
    if(!strength)return input;
    const {width:w,height:h}=input,radius=Math.min(3,strength),limit=[0,32,52,76][radius];
    let data=new Uint8ClampedArray(input.data);
    // Edge-aware median: transparent RGB never enters the filter.
    for(let pass=0;pass<2;pass++){
      const out=new Uint8ClampedArray(data),rs=[],gs=[],bs=[];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;if(!data[i+3])continue;rs.length=gs.length=bs.length=0;
        for(let yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx++){
          const j=(yy*w+xx)*4;if(!data[j+3])continue;
          if(Math.max(Math.abs(data[j]-data[i]),Math.abs(data[j+1]-data[i+1]),Math.abs(data[j+2]-data[i+2]))>limit)continue;
          rs.push(data[j]);gs.push(data[j+1]);bs.push(data[j+2]);
        }
        rs.sort((a,b)=>a-b);gs.sort((a,b)=>a-b);bs.sort((a,b)=>a-b);const mid=rs.length>>1;
        out[i]=rs[mid];out[i+1]=gs[mid];out[i+2]=bs[mid];
      }
      data=out;
    }
    return {width:w,height:h,data};
  }
  function paletteFor(input,count){
    const histogram=new Map();
    for(let i=0;i<input.data.length;i+=4){
      if(!input.data[i+3])continue;
      const r=input.data[i],g=input.data[i+1],b=input.data[i+2],key=(r>>3)*1024+(g>>3)*32+(b>>3);
      let bin=histogram.get(key);if(!bin){bin={r:0,g:0,b:0,n:0};histogram.set(key,bin);}bin.r+=r;bin.g+=g;bin.b+=b;bin.n++;
    }
    const points=[...histogram.values()].map(c=>({r:c.r/c.n,g:c.g/c.n,b:c.b/c.n,n:c.n}));if(!points.length)return [];
    const box=items=>{
      let n=0;const lo=[255,255,255],hi=[0,0,0];
      for(const p of items){n+=p.n;['r','g','b'].forEach((k,i)=>{lo[i]=Math.min(lo[i],p[k]);hi[i]=Math.max(hi[i],p[k]);});}
      const ranges=hi.map((v,i)=>v-lo[i]),axis=ranges.indexOf(Math.max(...ranges));return {items,n,axis,score:Math.max(...ranges)*Math.sqrt(n)};
    };
    const boxes=[box(points)];
    // Weighted median cut preserves small accents as well as dominant colors.
    while(boxes.length<count){
      let index=-1;for(let i=0;i<boxes.length;i++)if(boxes[i].items.length>1&&(index<0||boxes[i].score>boxes[index].score))index=i;
      if(index<0)break;
      const current=boxes[index],key=['r','g','b'][current.axis];current.items.sort((a,b)=>a[key]-b[key]);
      let n=0,cut=1;for(;cut<current.items.length;cut++){n+=current.items[cut-1].n;if(n>=current.n/2)break;}
      cut=Math.min(cut,current.items.length-1);boxes.splice(index,1,box(current.items.slice(0,cut)),box(current.items.slice(cut)));
    }
    return boxes.map(b=>{const c={r:0,g:0,b:0,a:255};for(const p of b.items){c.r+=p.r*p.n;c.g+=p.g*p.n;c.b+=p.b*p.n;}c.r=Math.round(c.r/b.n);c.g=Math.round(c.g/b.n);c.b=Math.round(c.b/b.n);return c;});
  }
  function labelColors(input,palette){
    const labels=new Int16Array(input.width*input.height).fill(-1),cache=new Map();
    for(let p=0;p<labels.length;p++){
      const i=p*4;if(!input.data[i+3])continue;
      const r=input.data[i],g=input.data[i+1],b=input.data[i+2],key=r*65536+g*256+b;let best=cache.get(key);
      if(best===undefined){let distance=Infinity;best=0;for(let c=0;c<palette.length;c++){const color=palette[c],d=(r-color.r)**2+(g-color.g)**2+(b-color.b)**2;if(d<distance){distance=d;best=c;}}cache.set(key,best);}labels[p]=best;
    }
    return labels;
  }
  function mergeSpeckles(labels,w,h,palette,area){
    if(!area)return;
    const seen=new Uint8Array(labels.length),queue=new Int32Array(labels.length);
    // Reassign small islands, never delete them to transparency.
    for(let start=0;start<labels.length;start++){
      if(seen[start]||labels[start]<0)continue;
      const color=labels[start];let head=0,tail=1;queue[0]=start;seen[start]=1;
      const neighbors=new Map();let minX=w,maxX=0,minY=h,maxY=0;
      while(head<tail){
        const p=queue[head++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        const visit=q=>{const c=labels[q];if(c===color){if(!seen[q]){seen[q]=1;queue[tail++]=q;}}else if(c>=0)neighbors.set(c,(neighbors.get(c)||0)+1);};
        if(x)visit(p-1);if(x<w-1)visit(p+1);if(y)visit(p-w);if(y<h-1)visit(p+w);
      }
      // Preserve long thin lines and disconnected opaque components.
      if(tail>area||!neighbors.size||Math.max(maxX-minX+1,maxY-minY+1)>Math.max(4,Math.sqrt(area)*2))continue;
      let target=color,best=-Infinity;const c=palette[color];
      for(const [other,border] of neighbors){const n=palette[other],distance=Math.hypot(c.r-n.r,c.g-n.g,c.b-n.b),score=border/(1+distance/32);if(score>best){best=score;target=other;}}
      for(let j=0;j<tail;j++)labels[queue[j]]=target;
    }
  }
  function traceSVG(source,settings,tracer,core){
    const prepared=core.prepareTrace(source,settings.mode,settings.threshold,settings.alpha);
    const input=smoothColors(prepared,settings.smoothing||0),w=input.width,h=input.height;
    const palette=paletteFor(input,settings.colors),labels=labelColors(input,palette);
    const header=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    if(!palette.length)return header+'</svg>';
    mergeSpeckles(labels,w,h,palette,settings.noise||0);
    const counts=new Int32Array(palette.length);for(const c of labels)if(c>=0)counts[c]++;
    let dominant=0;for(let c=1;c<counts.length;c++)if(counts[c]>counts[dominant])dominant=c;
    const makeArray=mask=>{
      const array=Array.from({length:h+2},()=>new Int16Array(w+2).fill(-1));
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x;array[y+1][x+1]=mask?(prepared.data[p*4+3]?0:1):(labels[p]<0?palette.length:labels[p]);}
      return array;
    };
    function layer(ii,color,precision){
      const options=tracer.checkoptions({ltres:precision,qtres:precision,pathomit:0,rightangleenhance:true});
      return tracer.batchtracepaths(tracer.internodes(tracer.pathscan(tracer.layeringstep(ii,color),0),options),options.ltres,options.qtres);
    }
    function body(data,stroke){return tracer.getsvgstring(data,{scale:1,roundcoords:3,viewbox:true,desc:false,strokewidth:stroke,linefilter:false}).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');}
    // The alpha silhouette is never simplified with the color/noise controls.
    const silhouette=body({width:w,height:h,palette:[palette[dominant]],layers:[layer({array:makeArray(true),palette:[{a:255},{a:0}]},0,.1)]},0);
    const ii={array:makeArray(false),palette:[...palette,{r:0,g:0,b:0,a:0}]};
    const layers=palette.map((_,i)=>layer(ii,i,settings.detail));
    // Underpainting guarantees coverage. Overlap prevents antialias seams.
    // Clipping keeps strokes outside real holes and within the original silhouette.
    const colors=body({width:w,height:h,palette,layers},.6);
    return header+`<defs><clipPath id="silhouette" clipPathUnits="userSpaceOnUse">${silhouette}</clipPath></defs>`+silhouette+`<g clip-path="url(#silhouette)" stroke-linejoin="round">${colors}</g></svg>`;
  }
  if(typeof module!=='undefined')module.exports=traceSVG;else root.traceSVG=traceSVG;
})(globalThis);
