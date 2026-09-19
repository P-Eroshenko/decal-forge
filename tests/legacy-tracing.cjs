(function(root){
  function traceSVG(source,settings,tracer,core){
    const input=core.prepareTrace(source,settings.mode,settings.threshold,settings.alpha);
    // Quantize only visible pixels. Transparent pixels never contaminate the palette.
    const histogram=new Map();
    for(let i=0;i<input.data.length;i+=4){if(!input.data[i+3])continue;const r=input.data[i],g=input.data[i+1],b=input.data[i+2],key=(r>>4)*256+(g>>4)*16+(b>>4);let bin=histogram.get(key);if(!bin){bin={r:0,g:0,b:0,n:0};histogram.set(key,bin);}bin.r+=r;bin.g+=g;bin.b+=b;bin.n++;}
    const palette=[...histogram.values()].sort((a,b)=>b.n-a.n).slice(0,settings.colors).map(c=>({r:Math.round(c.r/c.n),g:Math.round(c.g/c.n),b:Math.round(c.b/c.n),a:255}));
    const transparent=palette.length;palette.push({r:0,g:0,b:0,a:0});
    const w=input.width,h=input.height,array=Array.from({length:h+2},()=>new Int32Array(w+2).fill(-1)),cache=new Map();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;if(!input.data[i+3]){array[y+1][x+1]=transparent;continue;}
      const r=input.data[i],g=input.data[i+1],b=input.data[i+2],key=r*65536+g*256+b;let best=cache.get(key);
      if(best===undefined){let distance=Infinity;best=0;for(let p=0;p<transparent;p++){const c=palette[p],d=(r-c.r)**2+(g-c.g)**2+(b-c.b)**2;if(d<distance){distance=d;best=p;}}cache.set(key,best);}array[y+1][x+1]=best;
    }
    const options=tracer.checkoptions({ltres:settings.detail,qtres:settings.detail,pathomit:settings.noise,rightangleenhance:true});
    const ii={array,palette},layers=[];
    for(let p=0;p<transparent;p++)layers.push(tracer.batchtracepaths(tracer.internodes(tracer.pathscan(tracer.layeringstep(ii,p),options.pathomit),options),options.ltres,options.qtres));
    layers.push([]);
    return tracer.getsvgstring({layers,palette,width:w,height:h},{scale:1,roundcoords:2,viewbox:true,desc:false,strokewidth:0,linefilter:false}).replace('<svg ',`<svg width="${w}" height="${h}" `);
  }
  if(typeof module!=='undefined')module.exports=traceSVG;else root.traceSVG=traceSVG;
})(globalThis);
