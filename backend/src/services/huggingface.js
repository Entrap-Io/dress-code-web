import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.join(__dirname, '../workers/clipWorker.js');

/**
 * Generates a 512-dimensional fashion embedding for a clothing image.
 * Uses Xenova/clip-vit-base-patch32 locally via clipWorker.js.
 */
export async function generateFashionEmbedding(imageBuffer) {
  const id = `clip_${Date.now()}`;
  const tempInputPath = path.join(os.tmpdir(), `${id}_input.jpg`);
  const tempOutputPath = path.join(os.tmpdir(), `${id}_out.json`);

  fs.writeFileSync(tempInputPath, imageBuffer);

  return new Promise((resolve, reject) => {
    const worker = spawn(
      process.execPath,
      [WORKER_PATH, tempInputPath, tempOutputPath],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    );

    worker.on('close', code => {
      try {
        if (code === 0 && fs.existsSync(tempOutputPath)) {
          const vector = JSON.parse(fs.readFileSync(tempOutputPath, 'utf8'));
          resolve(vector);
        } else {
          reject(new Error(`CLIP worker exited with code ${code}`));
        }
      } catch (err) {
        reject(err);
      } finally {
        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      }
    });

    worker.on('error', reject);
  });
}

/**
 * Calculates a compatibility score (0-1) for an outfit set using OutfitTransformer logic.
 */
export async function scoreOutfitCompatibility(targetItem, candidateItem) {
  if (!process.env.HF_TOKEN) return 0.5;

  // This is a specialized model. If a direct API doesn't exist, we use a contrastive scoring
  // based on the Fashion-CLIP embeddings as a high-fidelity proxy for 'style harmony'.
  if (!targetItem.styleVector || !candidateItem.styleVector) return 0.5;
  
  const similarity = calculateSimilarity(targetItem.styleVector, candidateItem.styleVector);
  
  // OutfitTransformer specifically rewards 'complementary' items.
  // We can weight similarity by category rules (e.g., matching a Top with a Bottom).
  const isComplementary = targetItem.category !== candidateItem.category;
  return isComplementary ? (similarity * 1.2) : (similarity * 0.8);
}

/**
 * Calculates cosine similarity between two vectors.
 */
/**
 * Calculates both Visual (V) and Logic (L) scores for a candidate item relative to a target.
 * Matches the logic previously only found in gemini.js.
 */
export function calculateMatchingScores(targetItem, candidateItem) {
  const visualSimilarity = targetItem.styleVector && candidateItem.styleVector
    ? calculateSimilarity(targetItem.styleVector, candidateItem.styleVector)
    : 0.5;

  // Apply recency penalty (e.g., if worn in last 7 days)
  let penalty = 0;
  if (candidateItem.lastWorn) {
    const lastWornDate = new Date(candidateItem.lastWorn);
    const diffDays = (new Date() - lastWornDate) / (1000 * 60 * 60 * 24);
    if (diffDays < 7) {
      penalty = Math.max(0, (7 - diffDays) / 14);
    }
  }

  const baseLogicScore = visualSimilarity * 0.8;
  const logicScore = Math.max(0.1, Math.min(1, baseLogicScore - penalty));

  return {
    visualSimilarity: parseFloat(visualSimilarity.toFixed(2)),
    logicScore: parseFloat(logicScore.toFixed(2))
  };
}

export function calculateSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
