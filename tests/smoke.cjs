const { _electron: electron } = require('playwright');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
  const output=path.resolve('test-output',String(Date.now()));await fs.mkdir(output,{recursive:true});
  const app=await electron.launch({executablePath:path.resolve(process.env.DECAL_PACKAGED||'node_modules/electron/dist/electron.exe'),args:process.env.DECAL_PACKAGED?[]:['.'],env:{...process.env,DECAL_TEST:'1'}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#emptyImport');console.log('Window ready');
    const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,400);x.fillStyle='black';x.fillRect(45,65,140,140);x.fillStyle='white';x.fillRect(85,105,60,60);x.fillStyle='#e35f34';x.beginPath();x.moveTo(290,210);x.lineTo(370,60);x.lineTo(450,210);x.closePath();x.fill();return c.toDataURL();});
    const input=path.join(output,'trim-sheet.png');await fs.writeFile(input,Buffer.from(fixture.split(',')[1],'base64'));
    await app.evaluate(({dialog},{input,output})=>{dialog.showOpenDialog=async (_win,opts)=>({canceled:false,filePaths:[opts.properties.includes('openFile')?input:output]});},{input,output});
    await page.click('#import');await page.waitForFunction(()=>document.querySelector('#imageInfo').textContent.includes('600 × 400'));
    await page.check('#bgEnabled');await page.uncheck('#connected');
    async function region(x1,y1,x2,y2){const b=await page.locator('#canvas').boundingBox();await page.mouse.move(b.x+x1*b.width/600,b.y+y1*b.height/400);await page.mouse.down();await page.mouse.move(b.x+x2*b.width/600,b.y+y2*b.height/400,{steps:8});await page.mouse.up();}
    await region(30,40,210,230);await region(260,35,470,240);assert.equal(await page.locator('.region').count(),2);
    await page.screenshot({path:path.join(output,'workspace.png')});await page.click('#preview');await page.waitForFunction(()=>!document.querySelector('#vectorStage').hidden,{timeout:30000});
    await page.screenshot({path:path.join(output,'preview.png')});await page.click('#export');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Сохранено'),{timeout:30000});
    const files=await fs.readdir(output);assert.equal(files.filter(f=>f.endsWith('.svg')).length,2);
    const svg=await fs.readFile(path.join(output,files.find(f=>f.endsWith('.svg'))),'utf8');assert.ok(svg.includes('<path'));assert.ok(!svg.includes('<image'));assert.deepEqual(errors,[]);
    // A second export must preserve earlier files and choose new names.
    await page.click('#export');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Сохранено'),{timeout:30000});
    assert.equal((await fs.readdir(output)).filter(f=>f.endsWith('.svg')).length,4);
    await page.selectOption('#preset','logo');assert.equal(await page.inputValue('#smoothing'),'0');assert.equal(await page.inputValue('#noise'),'0');
    await page.selectOption('#preset','geometry');assert.equal(await page.inputValue('#smoothing'),'1');
    const sample=path.resolve('examples/TrimSheet_Source_01.png');
    await app.evaluate(({dialog},{sample,output})=>{dialog.showOpenDialog=async(_win,opts)=>({canceled:false,filePaths:[opts.properties.includes('openFile')?sample:output]});},{sample,output});
    await page.click('#import');await page.waitForFunction(()=>document.querySelector('#imageInfo').textContent.includes('182 × 210'));
    await page.click('#preview');await page.waitForFunction(()=>!document.querySelector('#vectorStage').hidden);
    const coverage=await page.evaluate(()=>{
      const source=document.querySelector('#canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d');x.drawImage(document.querySelector('#vectorImage'),0,0);
      const pixels=x.getImageData(0,0,c.width,c.height).data,original=source.getContext('2d').getImageData(0,0,c.width,c.height).data;let missing=0,interior=0;
      for(let y=1;y<c.height-1;y++)for(let xx=1;xx<c.width-1;xx++){let opaque=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(original[((y+dy)*c.width+xx+dx)*4+3]<128)opaque=false;if(opaque){interior++;if(pixels[(y*c.width+xx)*4+3]<254)missing++;}}
      return {interior,missing};
    });assert.ok(coverage.interior>30000);assert.equal(coverage.missing,0);
    await page.click('#zoomIn');await page.click('#zoomIn');await page.click('#zoomIn');
    await page.screenshot({path:path.join(output,'real-example-preview.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: import, background removal, two crops, vector preview, SVG + PNG export, collision protection, presets, real example in Chromium; no renderer errors.');
    console.log('Real example coverage:',coverage);
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
