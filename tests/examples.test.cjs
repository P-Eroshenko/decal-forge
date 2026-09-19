const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const trace=require('../tracing.js'),legacy=require('./legacy-tracing.cjs'),core=require('../core.js'),tracer=require('imagetracerjs');
const geometry={mode:'color',colors:16,detail:.3,smoothing:1,noise:4,threshold:160,alpha:128};
const output=path.resolve('test-output','examples-v1.1');
async function read(file){const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data:new Uint8ClampedArray(data),width:info.width,height:info.height};}
async function render(svg){return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();}
function alphaStats(source,rendered){
  let interior=0,missing=0,outside=0,leaks=0;
  for(let y=1;y<source.height-1;y++)for(let x=1;x<source.width-1;x++){
    let opaque=true,transparent=true;
    for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){const a=source.data[(yy*source.width+xx)*4+3];if(a<128)opaque=false;if(a>=128)transparent=false;}
    const a=rendered[(y*source.width+x)*4+3];if(opaque){interior++;if(a<254)missing++;}if(transparent){outside++;if(a>1)leaks++;}
  }
  return {interior,missing,outside,leaks};
}
async function comparison(file,oldSVG,newSVG){
  const col=500,row=560,composite=[];
  const checker=Buffer.alloc(col*(row-40)*4);
  for(let y=0;y<row-40;y++)for(let x=0;x<col;x++){const i=(y*col+x)*4,c=((x>>3)+(y>>3))%2?185:222;checker[i]=checker[i+1]=checker[i+2]=c;checker[i+3]=255;}
  const sources=[file,Buffer.from(oldSVG),Buffer.from(newSVG)];
  for(let i=0;i<3;i++){
    composite.push({input:await sharp(checker,{raw:{width:col,height:row-40,channels:4}}).png().toBuffer(),left:i*col,top:40});
    const resized=await sharp(sources[i],i?{density:216}:{}).resize(col-24,row-64,{fit:'inside',kernel:i?'lanczos3':'nearest'}).png().toBuffer();const meta=await sharp(resized).metadata();
    composite.push({input:resized,left:i*col+Math.floor((col-meta.width)/2),top:52});
  }
  const title=Buffer.from(`<svg width="1500" height="40"><rect width="1500" height="40" fill="#181e27"/><g font-family="Arial" font-size="17" fill="white"><text x="15" y="26">SOURCE PNG</text><text x="515" y="26">BEFORE / 64 colors</text><text x="1015" y="26">AFTER / Geometry / 16 colors</text></g></svg>`);
  composite.push({input:title,left:0,top:0});
  return sharp({create:{width:col*3,height:row,channels:4,background:'#181e27'}}).composite(composite).png().toBuffer();
}
test('all supplied PNGs: no interior alpha loss; real transparent regions remain empty',async()=>{
  await fs.mkdir(output,{recursive:true});const report=[];
  for(const name of await fs.readdir(path.resolve('examples'))){
    if(!name.endsWith('.png'))continue;
    const file=path.resolve('examples',name),source=await read(file);
    const oldSVG=legacy(source,{...geometry,colors:64,detail:.3,noise:4},tracer,core),oldStats=alphaStats(source,await render(oldSVG));
    for(const [profile,settings] of Object.entries({geometry,maximum:{...geometry,colors:64,detail:.3,smoothing:3,noise:24},logo:{...geometry,colors:8,detail:.3,smoothing:0,noise:0}})){
      const svg=trace(source,settings,tracer,core),stats=alphaStats(source,await render(svg));
      assert.equal(stats.missing,0,`${name} / ${profile}: lost opaque interior`);assert.equal(stats.leaks,0,`${name} / ${profile}: filled transparent area`);
      assert.ok(!svg.includes('<image'));await fs.writeFile(path.join(output,`${name}-${profile}.svg`),svg);
      report.push({name,profile,...stats,bytes:Buffer.byteLength(svg),oldMissing:oldStats.missing});
      if(profile==='geometry')await fs.writeFile(path.join(output,`${name}-comparison.png`),await comparison(file,oldSVG,svg));
    }
    // A crop that touches opaque geometry must not acquire a border or holes.
    const cropped=await sharp(file).extract({left:Math.floor(source.width/4),top:Math.floor(source.height/4),width:Math.floor(source.width/2),height:Math.floor(source.height/2)}).png().toBuffer();
    const crop=await read(cropped),stats=alphaStats(crop,await render(trace(crop,geometry,tracer,core)));
    assert.equal(stats.missing,0,`${name}: cropped interior`);assert.equal(stats.leaks,0,`${name}: cropped transparency`);
  }
  await fs.writeFile(path.join(output,'coverage-report.json'),JSON.stringify(report,null,2));console.table(report);
});
test('speckle cleanup retains an opaque panel and real hole at every strength',async()=>{
  const width=64,height=64,data=new Uint8ClampedArray(width*height*4);
  for(let y=2;y<62;y++)for(let x=2;x<62;x++){
    if(x>=25&&x<39&&y>=25&&y<39)continue;
    const i=(y*width+x)*4,c=(x%4===0&&y%4===0)?30:190;data.set([c,c,c,255],i);
  }
  const source={width,height,data};
  for(const noise of [0,4,12,24]){
    const result=await render(trace(source,{...geometry,noise},tracer,core)),stats=alphaStats(source,result);
    assert.equal(stats.missing,0);assert.equal(result[(32*width+32)*4+3],0);assert.equal(stats.leaks,0);
  }
});
