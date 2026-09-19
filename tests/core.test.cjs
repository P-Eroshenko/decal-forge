const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../core.js');
const trace=require('../tracing.js');
const tracer=require('imagetracerjs');
function fixture(){const data=new Uint8ClampedArray(7*7*4).fill(255);for(let y=1;y<6;y++)for(let x=1;x<6;x++){const i=(y*7+x)*4;data[i]=data[i+1]=data[i+2]=0;}const i=(3*7+3)*4;data[i]=data[i+1]=data[i+2]=255;return {width:7,height:7,data};}
const settings={mode:'color',colors:8,threshold:160,alpha:128,detail:.3,noise:0};
test('border flood fill preserves enclosed matching detail and source',()=>{const s=fixture(),out=core.removeBackground(s,[255,255,255],0,true);assert.equal(out.data[3],0);assert.equal(out.data[(3*7+3)*4+3],255);assert.equal(s.data[3],255);});
test('global removal clears enclosed matching colors too',()=>{const out=core.removeBackground(fixture(),[255,255,255],0,false);assert.equal(out.data[(3*7+3)*4+3],0);assert.equal(out.data[(2*7+2)*4+3],255);});
test('reverse and out-of-bounds crop is normalized',()=>assert.deepEqual(core.normalizeRect({x:12,y:9},{x:-3,y:2},10,8),{x:0,y:2,w:10,h:6}));
test('brightness and alpha thresholds are independent',()=>{const out=core.prepareTrace({width:3,height:1,data:new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,50])},'mask',160,128);assert.deepEqual(Array.from(out.data),[0,0,0,255,0,0,0,0,0,0,0,0]);});
test('transparent SVG retains opaque black contour and hole',()=>{const svg=trace(core.removeBackground(fixture(),[255,255,255],0,false),settings,tracer,core);assert.match(svg,/viewBox="0 0 7 7"/);assert.match(svg,/<path/);assert.match(svg,/rgb\(0,0,0\)/);assert.doesNotMatch(svg,/<image|opacity="0"|NaN/);assert.ok((svg.match(/M /g)||[]).length>=2,'outer contour and hole');});
test('empty image produces valid SVG without shapes',()=>{const svg=trace({width:5,height:3,data:new Uint8ClampedArray(60)},settings,tracer,core);assert.match(svg,/width="5" height="3"/);assert.doesNotMatch(svg,/<path/);});
test('tracing is deterministic',()=>assert.equal(trace(fixture(),settings,tracer,core),trace(fixture(),settings,tracer,core)));
