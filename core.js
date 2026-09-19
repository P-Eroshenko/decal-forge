(function(root){
  function removeBackground(source,color,tolerance,connected){
    const {width:w,height:h}=source;const data=new Uint8ClampedArray(source.data);
    const matches=i=>Math.max(Math.abs(data[i*4]-color[0]),Math.abs(data[i*4+1]-color[1]),Math.abs(data[i*4+2]-color[2]))<=tolerance||data[i*4+3]===0;
    if(!connected){for(let i=0;i<w*h;i++)if(matches(i))data[i*4+3]=0;}
    else{
      const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
      const add=i=>{if(!seen[i]&&matches(i)){seen[i]=1;queue[tail++]=i;}};
      for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
      while(head<tail){const i=queue[head++],x=i%w;data[i*4+3]=0;if(x>0)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<w*(h-1))add(i+w);}
    }
    return {width:w,height:h,data};
  }
  function normalizeRect(a,b,w,h){const x=Math.max(0,Math.min(w,Math.floor(Math.min(a.x,b.x)))),y=Math.max(0,Math.min(h,Math.floor(Math.min(a.y,b.y))));return {x,y,w:Math.max(0,Math.min(w,Math.ceil(Math.max(a.x,b.x)))-x),h:Math.max(0,Math.min(h,Math.ceil(Math.max(a.y,b.y)))-y)};}
  function prepareTrace(source,mode,threshold,alpha){
    const data=new Uint8ClampedArray(source.data);
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]<alpha){data[i]=data[i+1]=data[i+2]=data[i+3]=0;continue;}
      if(mode==='mask'){const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];if(l>threshold){data[i]=data[i+1]=data[i+2]=data[i+3]=0;}else{data[i]=data[i+1]=data[i+2]=0;data[i+3]=255;}}
    }
    return {width:source.width,height:source.height,data};
  }
  const api={removeBackground,normalizeRect,prepareTrace};if(typeof module!=='undefined')module.exports=api;else root.DecalCore=api;
})(globalThis);
