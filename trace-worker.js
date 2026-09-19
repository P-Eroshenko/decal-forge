importScripts('node_modules/imagetracerjs/imagetracer_v1.2.6.js','core.js','tracing.js');
self.onmessage=({data:{id,pixels,settings}})=>{
  try{
    const svg=traceSVG(pixels,settings,ImageTracer,DecalCore);
    self.postMessage({id,svg});
  }catch(e){self.postMessage({id,error:e.message});}
};
