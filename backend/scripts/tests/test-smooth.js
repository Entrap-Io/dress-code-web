import { createRequire } from 'module';
import fs from 'fs';

const imglyRequire = createRequire(
  new URL('../../../node_modules/@imgly/background-removal-node/package.json', import.meta.url)
);
const sharp = imglyRequire('sharp');

async function test() {
  const width = 100;
  const height = 100;
  const hardMask = new Uint8Array(width * height);
  for (let y=20; y<80; y++) {
    for (let x=20; x<80; x++) hardMask[y*100+x] = 255;
  }
  
  const smoothedMask = await sharp(hardMask, { raw: { width, height, channels: 1 } })
    .blur(5)
    .extractChannel(0)
    .raw()
    .toBuffer();
    
   console.log("Success! size:", smoothedMask.length, smoothedMask.slice(5000, 5010));
}
test().catch(console.error);
