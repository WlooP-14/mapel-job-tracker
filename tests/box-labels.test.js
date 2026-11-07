import {test} from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {boxLabelValue,scannedMouldCode} from '../lib/box-labels.js';

test('a printed box QR decodes to the exact mould code',()=>{
 const code='1420BAEM0926';
 const {modules}=QRCode.create(boxLabelValue(code),{errorCorrectionLevel:'M'});
 const margin=4,scale=6,width=(modules.size+2*margin)*scale;
 const pixels=new Uint8ClampedArray(width*width*4).fill(255);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const row=Math.floor(y/scale)-margin,column=Math.floor(x/scale)-margin;
  if(row>=0&&column>=0&&row<modules.size&&column<modules.size&&modules.get(row,column)){
   const index=4*(y*width+x);
   pixels.fill(0,index,index+3);
  }
 }
 assert.equal(scannedMouldCode(jsQR(pixels,width,width).data),code);
});

test('scanner accepts a typed mould code and rejects URLs and arbitrary text',()=>{
 assert.equal(scannedMouldCode('  1420baem0926  '),'1420BAEM0926');
 assert.equal(scannedMouldCode('https://example.com/1420BAEM0926'),null);
 assert.equal(scannedMouldCode('ordinary text'),null);
});
