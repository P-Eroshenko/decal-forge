const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let source=null,processed=null,baseName='decal',regions=[],selected=-1,scale=1,drawing=null,picking=false,busy=false,vectorURL=null,lastFolder=null,serial=0,revision=0;
const worker=new Worker('trace-worker.js');const jobs=new Map();
worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.svg);};
worker.onerror=e=>{for(const job of jobs.values())job.reject(new Error(e.message||'Ошибка векторизации'));jobs.clear();};
const settings=()=>({mode:$('mode').value,colors:+$('colors').value,detail:+$('detail').value,smoothing:+$('smoothing').value,noise:+$('noise').value,threshold:+$('threshold').value,alpha:+$('alpha').value});
const trace=pixels=>new Promise((resolve,reject)=>{const id=++serial;jobs.set(id,{resolve,reject});worker.postMessage({id,pixels,settings:settings()});});
function status(text){$('status').textContent=text;}
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);document.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);}
async function run(action){if(busy)return;setBusy(true);try{await action();}catch(e){status(`Ошибка: ${e.message}`);}finally{setBusy(false);}}
function raster(){ $('stage').hidden=!source;$('vectorStage').hidden=true;$('rasterTab').classList.add('active');$('preview').classList.remove('active');}
function invalidate(){revision++;raster();}
async function openImage(file){
  if(!file)return;
  const img=new Image();img.src=file.url;await img.decode();
  if(img.width*img.height>25000000)throw new Error('Лимит — 25 мегапикселей. Уменьшите исходное изображение.');
  canvas.width=img.width;canvas.height=img.height;ctx.clearRect(0,0,img.width,img.height);ctx.drawImage(img,0,0);source=ctx.getImageData(0,0,img.width,img.height);baseName=file.name;regions=[];selected=-1;
  $('bgEnabled').checked=false;$('empty').hidden=true;$('imageInfo').textContent=`${baseName}.png · ${img.width} × ${img.height} px`;
  updateImage();renderRegions();fit();status('PNG загружен. Выделите один или несколько фрагментов.');
}
function importImage(){run(async()=>{await openImage(await window.desktop.importPNG());});}
$('import').onclick=importImage;$('emptyImport').onclick=importImage;
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();if(busy)return;const f=e.dataTransfer.files[0];if(!f)return;if(f.type!=='image/png'){status('Перетащите файл в формате PNG.');return;}if(f.size>100*1024*1024){status('Лимит размера файла — 100 МБ.');return;}run(async()=>{const url=URL.createObjectURL(f);try{await openImage({name:f.name.replace(/\.png$/i,''),url});}finally{URL.revokeObjectURL(url);}});});
function updateImage(){
  if(!source)return;invalidate();
  const color=$('bgColor').value.match(/\w\w/g).map(v=>parseInt(v,16));
  processed=$('bgEnabled').checked?DecalCore.removeBackground(source,color,+$('tolerance').value,$('connected').checked):{width:source.width,height:source.height,data:new Uint8ClampedArray(source.data)};
  ctx.putImageData(new ImageData(processed.data,processed.width,processed.height),0,0);
}
for(const id of ['bgEnabled','bgColor','connected','tolerance'])$(id).addEventListener('change',()=>{updateImage();status('Обработка фона применена ко всему изображению.');});
for(const id of ['tolerance','threshold','alpha'])$(id).addEventListener('input',()=>{$(`${id}Value`).value=$(id).value;});
for(const id of ['mode','colors','detail','smoothing','noise','threshold','alpha'])$(id).addEventListener('change',()=>{$('preset').value='custom';invalidate();});
$('preset').onchange=()=>{
  const presets={geometry:{colors:16,detail:.3,smoothing:1,noise:4},logo:{colors:8,detail:.3,smoothing:0,noise:0},detailed:{colors:32,detail:.3,smoothing:0,noise:0}};
  const preset=presets[$('preset').value];if(!preset)return;
  for(const [key,value] of Object.entries(preset))$(key).value=String(value);
  $('mode').value='color';$('alpha').value='128';$('alphaValue').value='128';invalidate();status('Профиль применён. Проверьте результат в предпросмотре SVG.');
};
$('restore').onclick=()=>{$('bgEnabled').checked=false;updateImage();status('Исходные пиксели восстановлены.');};
$('eyedropper').onclick=()=>{if(!source){status('Сначала откройте PNG.');return;}raster();picking=!picking;$('eyedropper').classList.toggle('active',picking);status(picking?'Нажмите на цвет фона в изображении.':'Пипетка выключена.');};
function zoom(next){if(!source)return;scale=Math.max(.05,Math.min(8,next));$('stage').style.width=`${source.width*scale}px`;$('stage').style.height=`${source.height*scale}px`;$('zoomLabel').textContent=`${Math.round(scale*100)}%`;if($('vectorImage').naturalWidth){$('vectorImage').style.width=`${$('vectorImage').naturalWidth*scale}px`;}drawRegions();}
function fit(){if(!source)return;raster();zoom(Math.min(($('viewport').clientWidth-64)/source.width,($('viewport').clientHeight-64)/source.height,1));}
$('fit').onclick=fit;$('zoomIn').onclick=()=>zoom(scale*1.25);$('zoomOut').onclick=()=>zoom(scale/1.25);$('rasterTab').onclick=raster;
function point(e){const bounds=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(source.width,(e.clientX-bounds.left)/scale)),y:Math.max(0,Math.min(source.height,(e.clientY-bounds.top)/scale))};}
$('stage').addEventListener('pointerdown',e=>{
  if(!source||busy||e.button!==0)return;
  const p=point(e);
  if(picking){const i=(Math.min(source.height-1,Math.floor(p.y))*source.width+Math.min(source.width-1,Math.floor(p.x)))*4;$('bgColor').value='#'+Array.from(source.data.slice(i,i+3)).map(v=>v.toString(16).padStart(2,'0')).join('');$('bgEnabled').checked=true;picking=false;$('eyedropper').classList.remove('active');updateImage();status('Цвет фона выбран. Настройте допуск при необходимости.');return;}
  drawing={start:p,end:p};$('stage').setPointerCapture(e.pointerId);drawRegions();
});
$('stage').addEventListener('pointermove',e=>{if(!drawing)return;drawing.end=point(e);drawRegions();});
$('stage').addEventListener('pointerup',e=>{if(!drawing)return;const r=DecalCore.normalizeRect(drawing.start,point(e),source.width,source.height);drawing=null;if(r.w>=2&&r.h>=2){regions.push({...r,name:`${baseName}_${String(regions.length+1).padStart(2,'0')}`});selected=regions.length-1;invalidate();renderRegions();status(`Добавлен фрагмент ${r.w} × ${r.h} px.`);}drawRegions();});
$('stage').addEventListener('pointercancel',()=>{drawing=null;drawRegions();});
function drawRegions(){
  const svg=$('selectionLayer');svg.replaceChildren();if(!source)return;svg.setAttribute('viewBox',`0 0 ${source.width} ${source.height}`);
  function add(r,index,active){const ns='http://www.w3.org/2000/svg',rect=document.createElementNS(ns,'rect');for(const k of ['x','y'])rect.setAttribute(k,r[k]);rect.setAttribute('width',r.w);rect.setAttribute('height',r.h);rect.setAttribute('fill',active?'#b6f36b22':'#83b8ff15');rect.setAttribute('stroke',active?'#b6f36b':'#83b8ff');rect.setAttribute('stroke-width',2/scale);svg.append(rect);const text=document.createElementNS(ns,'text');text.setAttribute('x',r.x+5/scale);text.setAttribute('y',r.y+16/scale);text.setAttribute('font-size',12/scale);text.setAttribute('font-family','Segoe UI');text.setAttribute('fill','#111');text.setAttribute('stroke','#b6f36b');text.setAttribute('stroke-width',3/scale);text.setAttribute('paint-order','stroke');text.textContent=index===null?`${r.w} × ${r.h}`:String(index+1).padStart(2,'0');svg.append(text);}
  regions.forEach((r,i)=>add(r,i,i===selected));if(drawing)add(DecalCore.normalizeRect(drawing.start,drawing.end,source.width,source.height),null,true);
}
function renderRegions(){
  $('count').textContent=regions.length;const list=$('regionList');list.replaceChildren();
  if(!regions.length){const p=document.createElement('p');p.className='list-empty';p.textContent='Пока нет фрагментов. Нарисуйте прямоугольник на изображении.';list.append(p);}
  regions.forEach((r,i)=>{
    const card=document.createElement('div');card.className='region'+(selected===i?' selected':'');
    card.onclick=()=>{if(selected!==i){selected=i;invalidate();renderRegions();}};
    const title=document.createElement('div');title.className='region-title';const index=document.createElement('span');index.textContent=String(i+1).padStart(2,'0');
    const name=document.createElement('input');name.type='text';name.value=r.name;name.setAttribute('aria-label','Имя фрагмента');name.onclick=e=>e.stopPropagation();name.oninput=()=>{r.name=name.value;};
    const del=document.createElement('button');del.textContent='×';del.title='Удалить фрагмент';del.onclick=e=>{e.stopPropagation();regions.splice(i,1);selected=Math.min(selected,regions.length-1);invalidate();renderRegions();};title.append(index,name,del);card.append(title);
    const coords=document.createElement('div');coords.className='coords';for(const [key,label] of [['x','X'],['y','Y'],['w','Ш'],['h','В']]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type='number';input.min=key==='x'||key==='y'?0:1;input.value=r[key];input.onclick=e=>e.stopPropagation();input.onchange=()=>{const v=Number(input.value);if(!Number.isFinite(v))return;const max=key==='x'?source.width-r.w:key==='y'?source.height-r.h:key==='w'?source.width-r.x:source.height-r.y;r[key]=Math.max(+input.min,Math.min(max,Math.round(v)));input.value=r[key];invalidate();drawRegions();};l.append(input);coords.append(l);}card.append(coords);list.append(card);
  });drawRegions();
}
$('addFull').onclick=()=>{if(!source)return;regions.push({x:0,y:0,w:source.width,h:source.height,name:`${baseName}_full`});selected=regions.length-1;invalidate();renderRegions();};
$('clear').onclick=()=>{regions=[];selected=-1;invalidate();renderRegions();};
function whole(){return {x:0,y:0,w:source.width,h:source.height,name:baseName};}
function crop(r){const c=document.createElement('canvas');c.width=r.w;c.height=r.h;const context=c.getContext('2d');context.drawImage(canvas,r.x,r.y,r.w,r.h,0,0,r.w,r.h);return {pixels:context.getImageData(0,0,r.w,r.h),png:() => c.toDataURL('image/png')};}
$('preview').onclick=()=>run(async()=>{
  if(!source){status('Сначала откройте PNG.');return;}const r=regions[selected]||whole();status('Строю векторный предпросмотр…');const svg=await trace(crop(r).pixels);
  if(vectorURL)URL.revokeObjectURL(vectorURL);vectorURL=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));$('vectorImage').src=vectorURL;await $('vectorImage').decode();$('vectorImage').style.width=`${r.w*scale}px`;$('stage').hidden=true;$('vectorStage').hidden=false;$('preview').classList.add('active');$('rasterTab').classList.remove('active');status(`Предпросмотр: ${r.name} · ${(new Blob([svg]).size/1024).toFixed(1)} КБ`);
});
$('export').onclick=()=>run(async()=>{
  if(!source){status('Сначала откройте PNG.');return;}const items=regions.length?regions:[whole()],files=[];
  for(let i=0;i<items.length;i++){const r=items[i];status(`Векторизация ${i+1} / ${items.length}: ${r.name}…`);const c=crop(r);files.push({name:r.name,type:'svg',data:await trace(c.pixels)});if($('alsoPNG').checked)files.push({name:r.name,type:'png',data:c.png()});}
  const result=await window.desktop.exportFiles(files);if(!result){status('Экспорт отменён.');return;}lastFolder=result.folder;$('openFolder').hidden=false;status(`Сохранено ${result.saved.length} файлов в ${result.folder}`);
});
$('openFolder').onclick=()=>window.desktop.showFolder(lastFolder);
document.addEventListener('keydown',e=>{
  if(busy||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(e.key==='Escape'){drawing=null;picking=false;$('eyedropper').classList.remove('active');drawRegions();raster();}
  if(e.key==='Delete'&&selected>=0){regions.splice(selected,1);selected=Math.min(selected,regions.length-1);invalidate();renderRegions();}
  if(e.ctrlKey&&e.key.toLowerCase()==='o'){e.preventDefault();importImage();}
});
