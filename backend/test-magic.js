import { createRequire } from 'module';
import fs from 'fs';

const imglyRequire = createRequire(
  new URL('file://' + process.cwd() + '/node_modules/@imgly/background-removal-node/package.json')
);
const sharp = imglyRequire('sharp');

async function test() {
  const input = Buffer.from(
    '<svg width="400" height="400"><circle cx="200" cy="200" r="100" fill="red"/></svg>'
  );
  
  const trimmedBuffer = await sharp(input).png().trim().toBuffer();
  const { width: tWidth, height: tHeight } = await sharp(trimmedBuffer).metadata();

  const blackSilhouette = await sharp({
    create: {
      width: tWidth,
      height: tHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
    .joinChannel(await sharp(trimmedBuffer).extractChannel('alpha').toBuffer())
    .png()
    .toBuffer();

  const shadowBuffer = await sharp(blackSilhouette)
    .blur(15)
    .toBuffer();

  const canvasW = 800;
  const canvasH = 1000;
  const padding = 200;
  
  const fitSize = { width: canvasW - padding * 2, height: canvasH - padding * 2 };
  
  const finalGarment = await sharp(trimmedBuffer).resize({ ...fitSize, fit: 'inside' }).toBuffer();
  const finalShadow = await sharp(shadowBuffer).resize({ ...fitSize, fit: 'inside' }).toBuffer();

  const { width: fgW, height: fgH } = await sharp(finalGarment).metadata();

  const canvas = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: finalShadow,
        left: Math.floor((canvasW - fgW) / 2) + 20,
        top: Math.floor((canvasH - fgH) / 2) + 30,
      },
      {
        input: finalGarment,
        left: Math.floor((canvasW - fgW) / 2),
        top: Math.floor((canvasH - fgH) / 2),
      }
    ])
    .png()
    .toBuffer();
    
   console.log("Success! size:", canvas.length);
}
test().catch(console.error);
