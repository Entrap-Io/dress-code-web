// ── Segment Worker ─────────────────────────────────────────────
// Runs in a SEPARATE process from the main backend to avoid ONNX
// runtime conflicts with @imgly/background-removal-node.
//
// Usage: node segmentWorker.js <inputJpeg> <outputBin> <width> <height>
//
// Outputs: a raw binary file (width * height bytes) where 255 = clothing
// pixel and 0 = body/background pixel. Main process applies this as alpha.

import { pipeline } from '@huggingface/transformers';
import fs from 'fs';

const CLOTHING_LABELS = new Set([
  'Upper-clothes',
  'Skirt',
  'Pants',
  'Dress',
  'Belt',
  'Left-shoe',
  'Right-shoe',
  'Hat',
  'Sunglasses',
  'Bag',
  'Scarf',
]);

const [,, inputPath, outputBinPath, targetWidthStr, targetHeightStr] = process.argv;
const targetWidth = parseInt(targetWidthStr, 10);
const targetHeight = parseInt(targetHeightStr, 10);

if (!inputPath || !outputBinPath || !targetWidth || !targetHeight) {
  console.error('[segmentWorker] Usage: segmentWorker.js <input> <output> <width> <height>');
  process.exit(1);
}

async function run() {
  // Model is cached in ~/.cache/huggingface/hub after first download
  const model = await pipeline(
    'image-segmentation',
    'mattmdjaga/segformer_b2_clothes',
    { device: 'cpu' }
  );

  const segments = await model(inputPath);

  // Build combined clothing mask at the target image dimensions
  const combinedMask = new Uint8Array(targetWidth * targetHeight);

  for (const seg of segments) {
    if (!CLOTHING_LABELS.has(seg.label)) {
      process.stderr.write(`   skipping: ${seg.label}\n`);
      continue;
    }
    process.stderr.write(`   keeping: ${seg.label} (score: ${seg.score?.toFixed(3)})\n`);

    const { data: maskData, width: mW, height: mH } = seg.mask;

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        // Nearest-neighbour scale if mask doesn't match image dimensions
        const srcX = Math.min(Math.round((x * mW) / targetWidth), mW - 1);
        const srcY = Math.min(Math.round((y * mH) / targetHeight), mH - 1);
        if (maskData[srcY * mW + srcX] > 128) {
          combinedMask[y * targetWidth + x] = 255;
        }
      }
    }
  }

  // Write raw binary mask — parent process reads this back
  fs.writeFileSync(outputBinPath, Buffer.from(combinedMask.buffer));
}

run().catch(err => {
  process.stderr.write(`[segmentWorker] ERROR: ${err.message}\n`);
  process.exit(1);
});
