// ── CLIP Worker ─────────────────────────────────────────────
// Runs in a SEPARATE process to avoid ONNX runtime conflicts.
// Usage: node clipWorker.js <inputImagePath> <outputJsonPath>
// Outputs: a JSON file containing the 512-dimensional embedding vector.

import { pipeline, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';
import fs from 'fs';

const [,, inputPath, outputJsonPath] = process.argv;

if (!inputPath || !outputJsonPath) {
  console.error('[clipWorker] Usage: clipWorker.js <input> <output>');
  process.exit(1);
}

async function run() {
  // We use Xenova/clip-vit-base-patch32 which is widely supported in Transformers.js
  const modelId = 'Xenova/clip-vit-base-patch32';
  
  process.stderr.write(`[clipWorker] Loading model: ${modelId}...\n`);
  
  const model = await CLIPVisionModelWithProjection.from_pretrained(modelId, { device: 'cpu' });
  const processor = await AutoProcessor.from_pretrained(modelId);

  // Read and process image
  const image = await RawImage.read(inputPath);
  const inputs = await processor(image);

  // Generate embeddings
  const { image_embeds } = await model(inputs);
  
  // Convert Tensor to standard Array
  const vector = Array.from(image_embeds.data);

  // Write JSON output
  fs.writeFileSync(outputJsonPath, JSON.stringify(vector));
  process.stderr.write(`[clipWorker] Successfully generated ${vector.length} dimensional vector.\n`);
}

run().catch(err => {
  process.stderr.write(`[clipWorker] ERROR: ${err.message}\n`);
  process.exit(1);
});
