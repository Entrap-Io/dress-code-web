import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use imgly's bundled sharp — avoids dual libvips conflict
const imglyRequire = createRequire(
  new URL('../../node_modules/@imgly/background-removal-node/package.json', import.meta.url)
);
const sharp = imglyRequire('sharp');

// Worker runs @huggingface/transformers in a SEPARATE process so its ONNX
// runtime never touches imgly's ONNX runtime — they each own their own instance
const WORKER_PATH = path.join(__dirname, '../workers/segmentWorker.js');

const CLOTHING_LABELS = new Set([
  'Upper-clothes', 'Skirt', 'Pants', 'Dress', 'Belt',
  'Left-shoe', 'Right-shoe', 'Hat', 'Sunglasses', 'Bag', 'Scarf',
]);

/**
 * Spawns the segment worker as a child process and waits for it to finish.
 * The worker writes a raw binary mask to outputBinPath.
 */
function runSegmentWorker(inputJpegPath, outputBinPath, width, height) {
  return new Promise((resolve, reject) => {
    const worker = spawn(
      process.execPath,
      [WORKER_PATH, inputJpegPath, outputBinPath, String(width), String(height)],
      { stdio: ['ignore', 'inherit', 'inherit'] } // show worker logs in our terminal
    );

    worker.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Segmentation worker exited with code ${code}`));
    });

    worker.on('error', reject);
  });
}

/**
 * Isolates ONLY clothing pixels from a bg-removed RGBA PNG by running
 * the segformer_b2_clothes model in an isolated child process.
 *
 * @param {string} bgRemovedPath - Absolute path to the imgly-processed PNG
 * @returns {{ buffer: Buffer, method: string }}
 */
export async function isolateClothing(bgRemovedPath) {
  const { width, height } = await sharp(bgRemovedPath).metadata();

  // Model needs RGB (no transparency) — flatten to white
  const rgbBuffer = await sharp(bgRemovedPath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92 })
    .toBuffer();

  // Temp files in system tmpdir — auto-cleaned in finally block
  const id = `dc_${Date.now()}`;
  const tempInputPath = path.join(os.tmpdir(), `${id}_input.jpg`);
  const tempMaskPath  = path.join(os.tmpdir(), `${id}_mask.bin`);

  fs.writeFileSync(tempInputPath, rgbBuffer);

  try {
    console.log('✂️  Running segmentation worker (isolated process)...');
    await runSegmentWorker(tempInputPath, tempMaskPath, width, height);

    // Read raw binary mask: one byte per pixel, 255 = keep, 0 = remove
    const maskFile = fs.readFileSync(tempMaskPath);
    let combinedMask = new Uint8Array(maskFile.buffer, maskFile.byteOffset, maskFile.byteLength);

    // ✨ Smooth and feather the hard jagged edges produced by the worker
    console.log('✨ Applying anti-aliasing to clothing edges...');
    combinedMask = await sharp(combinedMask, { raw: { width, height, channels: 1 } })
      .blur(8) // Strong Gaussian blur to feather out jagged/blocky stair-steps
      .extractChannel(0) // Ensure it returns a 1-channel buffer
      .raw()
      .toBuffer();

    // Apply soft mask as alpha channel using imgly's bundled sharp (no ONNX involved)
    const { data: rgba, info } = await sharp(bgRemovedPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const ch = info.channels; // 4
    for (let i = 0; i < width * height; i++) {
      // Math.min perfectly applies the feathered gradient to the final physical cutout
      rgba[i * ch + 3] = Math.min(rgba[i * ch + 3], combinedMask[i]);
    }

    const buffer = await sharp(rgba, { raw: { width, height, channels: ch } })
      .png()
      .toBuffer();

    // Create an inpainting mask (white = inpaint holes, black = keep garment)
    // combinedMask currently has 255 for garment, 0 for holes/background
    const invertedMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      // Threshold and invert: anything > 128 is garment mapping to 0 (keep)
      invertedMask[i] = combinedMask[i] > 128 ? 0 : 255; 
    }

    const maskBuffer = await sharp(invertedMask, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();

    return { buffer, maskBuffer, method: 'local-segformer' };
  } finally {
    if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
    if (fs.existsSync(tempMaskPath))  fs.unlinkSync(tempMaskPath);
  }
}

/**
 * Takes a perfectly cut-out transparent PNG of a garment and runs "Studio Magic":
 * 1. Auto-crops it to remove all dead space
 * 2. Creates a realistic matching drop-shadow using the alpha channel
 * 3. Scales it into a perfect 800x1000 (4:5 ratio) premium canvas
 * 4. Centers it with the shadow slightly offset
 * 
 * @param {string} imagePath - Absolute path to the transparent PNG
 * @returns {Buffer} - The final 800x1000 PNG buffer
 */
export async function applyStudioMagic(imagePath) {
  // 1. Trim away dead transparent space
  const trimmedBuffer = await sharp(imagePath).trim().toBuffer();
  const { width: tWidth, height: tHeight } = await sharp(trimmedBuffer).metadata();

  // 2. Create a solid black silhouette of the garment for the shadow
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

  // 3. Apply heavy gaussian blur to the silhouette to create soft shadow spread
  const shadowBuffer = await sharp(blackSilhouette)
    .blur(15) 
    .toBuffer();

  // 4. Define premium canvas size (4:5 ratio, perfect for Pinterest/mobile grids)
  const canvasW = 800;
  const canvasH = 1000;
  
  // Create a padding buffer (leave 10% breathing room on the edges)
  const paddingX = Math.floor(canvasW * 0.15); // 15% horizontal padding
  const paddingY = Math.floor(canvasH * 0.1);  // 10% vertical padding
  const fitSize = { width: canvasW - paddingX * 2, height: canvasH - paddingY * 2 };

  // 5. Scale both the garment and its shadow down to fit beautifully in the safe zone
  const finalGarment = await sharp(trimmedBuffer).resize({ ...fitSize, fit: 'inside' }).toBuffer();
  const finalShadow = await sharp(shadowBuffer).resize({ ...fitSize, fit: 'inside' }).toBuffer();

  const { width: fgW, height: fgH } = await sharp(finalGarment).metadata();

  // 6. Natural lighting offsets (shadow falls slightly down and to the right)
  const shadowOffsetX = 12;
  const shadowOffsetY = 18;

  // 7. Composite everything together onto a pure transparent canvas!
  const finalCanvasBuffer = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Completely transparent
    }
  })
    .composite([
      {
        input: finalShadow,
        left: Math.floor((canvasW - fgW) / 2) + shadowOffsetX,
        top: Math.floor((canvasH - fgH) / 2) + shadowOffsetY,
      },
      {
        input: finalGarment,
        left: Math.floor((canvasW - fgW) / 2),
        top: Math.floor((canvasH - fgH) / 2),
      }
    ])
    .png() // Must output PNG to preserve transparency block
    .toBuffer();

  return finalCanvasBuffer;
}
