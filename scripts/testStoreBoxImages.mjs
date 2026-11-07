import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { fitBoxImage, imageDataUrlBytes, optimizeBoxImage } from '../src/services/storeBoxImage.js';
import { compressBoxPhoto, replacementRecord } from './optimizeBoxCatalogImages.mjs';

assert.deepEqual(fitBoxImage(2400,1600),{width:1200,height:800});
assert.deepEqual(fitBoxImage(900,1600),{width:675,height:1200});
assert.deepEqual(fitBoxImage(320,200),{width:320,height:200});
for (const dimensions of [[0,20],[NaN,20],[Infinity,40],[8000,8000]]) assert.throws(()=>fitBoxImage(...dimensions));
for (const length of [1,2,3,101,102]) assert.equal(imageDataUrlBytes('data:image/png;base64,'+Buffer.alloc(length).toString('base64')),length);

// Real encoder checks for alpha, aspect ratio, small files and EXIF rotation.
const transparent = await sharp({create:{width:2000,height:1000,channels:4,background:{r:180,g:20,b:30,alpha:0.5}}}).png().toBuffer();
const optimized = await compressBoxPhoto(transparent);
assert.equal(optimized.metadata.format,'webp');
assert.equal(optimized.metadata.width,1200);
assert.equal(optimized.metadata.height,600);
assert.equal(optimized.metadata.hasAlpha,true);
const alpha=(await sharp(optimized.bytes).raw().toBuffer())[3];
assert.ok(Math.abs(alpha-128)<=1,'Alpha must not be flattened');
assert.ok(optimized.bytes.length < transparent.length);
const small = await sharp({create:{width:60,height:40,channels:3,background:'#bb3322'}}).png().toBuffer();
assert.equal((await compressBoxPhoto(small)).metadata.width,60);
const rotated = await sharp(small).jpeg().withMetadata({orientation:6}).toBuffer();
const rotatedOutput = await compressBoxPhoto(rotated);
assert.equal(rotatedOutput.metadata.width,40);
assert.equal(rotatedOutput.metadata.height,60);
await assert.rejects(()=>compressBoxPhoto(Buffer.from('broken image')));

const current={code:'BOX_test',name:'Original name',boxSale:{sourceCode:'00476',poundsPerBox:30,pricePerPound:140.01},price:4200.3,active:true,image:'old',imageStoragePath:'old-path',branchSettings:{granada:{active:true}},inventory:20};
const entry={code:current.code,originalImage:'old',originalPath:'old-path'};
const copy=structuredClone(current);
assert.deepEqual(replacementRecord(current,entry,'new','new-path'),{...copy,image:'new',imageStoragePath:'new-path'});
assert.deepEqual(current,copy,'Migration does not mutate business data');
assert.equal(replacementRecord({...current,image:'concurrent'},entry,'new','new-path'),null);
assert.equal(replacementRecord({...current,imageStoragePath:'concurrent'},entry,'new','new-path'),null);
assert.equal(replacementRecord({...current,boxSale:null},entry,'new','new-path'),null);
assert.equal(replacementRecord({...current,code:'00476'},{...entry,code:'00476'},'new','new-path'),null);
assert.equal(replacementRecord({...current,price:4400},entry,'new','new-path').price,4400,'Preserve latest price');

// Canvas orchestration is mocked: no browser or live Firebase required.
let scenario, canvases, images, encodings;
const setup = (options={}) => {
  scenario={width:2400,height:1600,sizes:[400000,250000],alpha:false,...options};
  canvases=[]; images=[]; encodings=[];
};
globalThis.Image=class {
  constructor(){this.naturalWidth=scenario.width;this.naturalHeight=scenario.height;images.push(this);}
  set src(value){this.value=value;if(value)queueMicrotask(()=>scenario.loadError?this.onerror?.():this.onload?.());}
};
globalThis.FileReader=class {
  readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();});}
};
globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');
  const canvas={width:0,height:0,getContext(){return scenario.noContext?null:{drawImage(_image,x,y,w,h){assert.equal(x,0);assert.equal(y,0);assert.equal(w,canvas.width);assert.equal(h,canvas.height);scenario.drawn={width:w,height:h};},getImageData(){return {data:new Uint8ClampedArray([20,30,40,scenario.alpha?0:255])};}};},
    toBlob(callback,type,quality){
      encodings.push({type,quality});
      const index=Math.max(0,[0.86,0.82,0.8].indexOf(quality));
      const bytes=scenario.sizes[index]??scenario.sizes.at(-1);
      queueMicrotask(()=>callback(scenario.encodeError?null:new Blob([Buffer.alloc(bytes,scenario.fill||1)],{type:scenario.noWebp&&type==='image/webp'?'image/png':type})));
    }};
  canvases.push(canvas);return canvas;
}};
const source='data:image/png;base64,'+Buffer.alloc(500000,9).toString('base64');
setup();
const result=await optimizeBoxImage(source);
assert.ok(result.startsWith('data:image/webp;base64,'));
assert.equal(imageDataUrlBytes(result),250000);
assert.deepEqual(scenario.drawn,{width:1200,height:800});
assert.deepEqual(encodings.map(e=>e.quality),[0.86,0.82]);
assert.equal(canvases[0].width,0,'Release canvas memory');
assert.equal(images[0].value,'','Release decoded image');
setup({width:320,height:200,sizes:[600000]});
assert.equal(await optimizeBoxImage(source),source,'Do not enlarge a file to optimize it');
assert.deepEqual(scenario.drawn,{width:320,height:200});
assert.deepEqual(encodings.map(e=>e.quality),[0.86,0.82,0.8],'Never drop below quality 80');
setup({noWebp:true,sizes:[100000]});
assert.ok((await optimizeBoxImage(source)).startsWith('data:image/jpeg;base64,'),'Opaque fallback');
setup({noWebp:true,alpha:true,sizes:[100000]});
assert.ok((await optimizeBoxImage(source)).startsWith('data:image/png;base64,'),'Transparent fallback');
assert.ok(!encodings.some(e=>e.type==='image/jpeg'));
for(const options of [{loadError:true},{encodeError:true},{noContext:true},{width:8000,height:8000}]) {
  setup(options);await assert.rejects(()=>optimizeBoxImage(source));
}
setup();
assert.equal(await optimizeBoxImage('https://example.test/existing.webp'),'https://example.test/existing.webp');
assert.equal(images.length,0,'Existing URLs are never recompressed');
await assert.rejects(()=>optimizeBoxImage('data:image/gif;base64,YQ=='));

// Test actual upload routing, content hash and cache policy without remote writes.
await mkdir('tmp',{recursive:true});
await build({entryPoints:['src/services/storeMedia.js'],outfile:'tmp/box-image-upload-tests.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'mock-storage',setup(build){
  build.onLoad({filter:/[\\/]src[\\/]firebase\.js$/},()=>({contents:'export const storage={};',loader:'js'}));
  build.onResolve({filter:/^firebase\/storage$/},()=>({path:'storage',namespace:'mock'}));
  build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const ref=(_storage,path)=>({path});export const uploadString=async(ref,data,format,metadata)=>{globalThis.uploads.push({ref,data,format,metadata});};export const getDownloadURL=async ref=>'https://example.test/'+ref.path;`,loader:'js'}));
}}]});
globalThis.uploads=[];
const {uploadCatalogImage,uploadPromotionImage}=createRequire(import.meta.url)('../tmp/box-image-upload-tests.cjs');
setup({sizes:[100000]});
const first=await uploadCatalogImage({code:'BOX_test',image:source,hashHint:'stale-hash'});
assert.ok(first.path.endsWith('.webp'));
assert.ok(!first.path.includes('stale-hash'));
assert.equal(uploads[0].metadata.cacheControl,'public, max-age=31536000, immutable');
assert.equal(imageDataUrlBytes(uploads[0].data),100000);
setup({sizes:[100000],fill:2});
const next=await uploadCatalogImage({code:'BOX_test',image:source,hashHint:first.hash});
assert.notEqual(next.path,first.path,'A changed photo must get a fresh immutable URL');
setup();
await uploadCatalogImage({code:'00476',image:source,hashHint:'normal-hash'});
await uploadPromotionImage({id:'promo',image:source,hashHint:'promo-hash'});
assert.equal(images.length,0,'Other catalog photos and campaign artwork are unchanged');
assert.equal(uploads[2].data,source);
assert.equal(uploads[3].data,source);
assert.equal(uploads[2].metadata,undefined);
assert.ok(uploads[2].ref.path.endsWith('/normal-hash.png'));
const uploadCount=uploads.length;
setup({loadError:true});
await assert.rejects(()=>uploadCatalogImage({code:'BOX_test',image:source}));
assert.equal(uploads.length,uploadCount,'Invalid photos must not reach storage');
console.log('PASS: real WebP/alpha/orientation; browser resize/quality/fallback/errors; box-only uploads, immutable hashes/cache; migration protects prices and concurrent edits. No production writes.');
