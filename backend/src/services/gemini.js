import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import { getTextChain, getImageChain } from '../config/models.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Fallback Engine ─────────────────────────────────────────────
// Tries each model in the chain. On 429 (rate limit), skips to next.
// Any other error is thrown immediately (no point retrying a bad prompt).

async function callWithFallback(chain, callFn, label = 'API') {
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const result = await callFn(model);
      if (i > 0) console.log(`⤴️  Succeeded with fallback: ${model.name}`);
      return result;
    } catch (err) {
      // For debugging, print the raw message from the API.
      const rawMsg = err?.message || JSON.stringify(err);

      const shouldFallback = err?.status === 429
        || err?.message?.includes('429')
        || err?.message?.includes('RESOURCE_EXHAUSTED')
        || err?.message?.includes('rate limit')
        || err?.message?.includes('503')
        || err?.message?.includes('504')
        || err?.message?.includes('410');

      if (shouldFallback && i < chain.length - 1) {
        console.warn(`⚠️  [${label}] ${model.name} failed (${shouldFallback ? 'recoverable' : 'rate limited'}) → trying ${chain[i + 1].name}...`);
        continue;
      }

      // If Not Rate Limited or out of models, throw rich error
      throw new Error(`[${model.name}] API Error: ${rawMsg}`);
    }
  }
  throw new Error(`All ${label} models exhausted.`);
}

// ── Clothing Analysis ───────────────────────────────────────────

export async function analyzeClothingImage(imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const mimeType = getMimeType(imagePath);

  const prompt = `You are a professional fashion analyst AI. Analyze the clothing item in this image and return ONLY a valid JSON object — no markdown, no explanation, no prose. Just raw JSON.

Context: The image background has been removed. You may see a person wearing the item on a transparent background, or just the garment alone (flat-lay).

Rules:
- Focus on the primary clothing item; ignore accessories unless they ARE the main item
- For season and occasionTags: only include values that genuinely apply — do NOT list all options
- For colors: use common, human-readable names (e.g. "navy blue" not "dark blue", "olive green" not "dark green")
- For description: be specific and vivid — mention the garment type, key design details, and feel

Return this exact JSON structure:
{
  "hasHuman": true,
  "category": "top",
  "subcategory": "crew-neck t-shirt",
  "primaryColor": "washed black",
  "secondaryColor": null,
  "colorTone": "cool",
  "pattern": "solid",
  "material": "cotton jersey",
  "style": "streetwear",
  "season": ["spring", "summer"],
  "occasionTags": ["casual", "outdoor"],
  "description": "A relaxed-fit crew-neck tee in washed black with subtle distressing, giving it a lived-in streetwear feel.",
  "fit": "regular"
}

Field definitions:
- hasHuman: boolean — true if a person's body is visible, false if garment only
- category: one of top | bottom | shoes | outerwear | accessory | dress | suit
- subcategory: specific garment name (t-shirt, chinos, Chelsea boot, parka, tote bag, etc.)
- primaryColor: most dominant color, human-readable
- secondaryColor: second color if clearly present, otherwise null
- colorTone: warm | cool | neutral
- pattern: solid | striped | checkered | plaid | floral | geometric | abstract | animal-print | tie-dye | none
- material: best-guess fabric (cotton, denim, leather, wool, linen, polyester, silk, etc.)
- style: casual | formal | smart-casual | sporty | bohemian | streetwear | vintage | minimalist
- season: array — only seasons where this item is genuinely appropriate
- occasionTags: array — only genuinely relevant occasions from: work | casual | dinner | party | outdoor | sport | beach | date | travel | wedding
- description: one vivid sentence describing the item
- fit: slim | regular | oversized | loose | fitted | cropped`;

  const chain = getTextChain();

  return callWithFallback(chain, async (model) => {
    const modelId = model.id;
    console.log(`   using model: ${modelId}`);
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: base64Image } },
            { text: prompt },
          ],
        },
      ],
    });

    const text = response.candidates[0].content.parts[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }, 'TextAnalysis');
}

// ── Product Image Generation (Imagen) ───────────────────────────

/**
 * Generates a clean Pinterest-style product photo from clothing metadata.
 * Uses Imagen 4 with auto-fallback across tiers.
 *
 * @param {object} metadata - Gemini's clothing analysis result
 * @returns {{ imageBuffer: Buffer, model: string } | null}
 */
export async function generateProductImage(metadata) {
  const { subcategory, primaryColor, secondaryColor, material, pattern, fit, style, description } = metadata;

  const colorDesc = secondaryColor
    ? `${primaryColor} with ${secondaryColor} accents`
    : primaryColor;

  // ── Prompt Engineering for Exact Replication & Alignment ──
  const prompt = `Official e-commerce flat-lay product photograph of a single ${subcategory}.
Design and Silhouette: ${description}. It must strictly preserve this exact shape.
Color: Precise ${colorDesc}.
Pattern: ${pattern !== 'solid' ? `${pattern} pattern` : 'Solid color, no pattern'}.
Material: ${material || 'texture'}. ${fit ? `${fit} fit.` : ''} ${style} style.

CRITICAL VISUAL RULES:
1. Alignment: The garment MUST be laid out perfectly straight and upright (oriented vertically, right-side up). Do NOT fold it, do NOT angle it, do NOT place it horizontally.
2. Complete View: Show the uncropped, full-length shape of the garment exactly as described.
3. Aesthetic: Clean, high-end e-commerce product photography for a premium brand. Shot perfectly from above (bird's-eye view).
4. Environment: Absolute pure solid white background. NO shadows, NO gradients, NO floor textures. The background must be completely flat white to allow for perfect digital extraction.
5. Exclusions: ONLY the garment itself. No humans, no mannequins, no hangers, no props, no text, no watermarks, no accessories.

Keep it highly realistic with ultra-sharp fabric textures and true-to-life colors.

${`RAW GARMENT METADATA JSON SCHEMA TO REPLICATE:\n` + JSON.stringify((() => {
  const m = { ...metadata };
  delete m.hasHuman; delete m.imageUrl; delete m.id; delete m.filename; delete m.dateAdded;
  return m;
})(), null, 2)}`;

  const chain = getImageChain();

  return callWithFallback(chain, async (model) => {
    console.log(`   using image model: ${model.id} (${model.provider})`);

    // ── Hugging Face Provider (FLUX.1, etc.) ─────────
    if (model.provider === 'huggingface') {
      if (!process.env.HF_TOKEN) throw new Error('HF_TOKEN not set in .env');

      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HF API error ${response.status}: ${text}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return { imageBuffer: Buffer.from(arrayBuffer), model: model.id };
    }
    // ── Stability AI Provider (SD3) ──────────────────
    else if (model.provider === 'stability') {
      if (!process.env.STABILITY_API_KEY) throw new Error('STABILITY_API_KEY not set in .env');

      const form = new FormData();
      form.append('prompt', prompt);
      form.append('output_format', 'png');

      const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/sd3`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
          'Accept': 'image/*',
        },
        body: form,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Stability API error ${response.status}: ${text}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return { imageBuffer: Buffer.from(arrayBuffer), model: model.id };
    }
    // ── Google Provider (Imagen) ─────────────────────
    else {
      const response = await ai.models.generateImages({
        model: model.id,
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
        },
      });

      if (!response.generatedImages?.length) {
        throw new Error('Imagen returned no images');
      }

      const base64 = response.generatedImages[0].image.imageBytes;
      return {
        imageBuffer: Buffer.from(base64, 'base64'),
        model: model.id,
      };
    }
  }, 'ImageGen');
}
// ── Image-to-Image Beautification (fal.ai / ControlNet) ─────────────

import { createRequire } from 'module';
const imglyRequire = createRequire(
  new URL('../../node_modules/@imgly/background-removal-node/package.json', import.meta.url)
);
const sharp = imglyRequire('sharp');

/**
 * Heals jagged edges and applies studio lighting to a physical cutout
 * using Image-to-Image (ControlNet/Inpainting) via fal.ai
 */
export async function generateProductImageI2I(metadata, imageBuffer, maskBuffer = null) {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY not set in .env');

  const { subcategory, primaryColor, secondaryColor, material, pattern, fit, style, description } = metadata;
  const colorDesc = secondaryColor ? `${primaryColor} with ${secondaryColor} accents` : primaryColor;

  const prompt = `Official e-commerce flat-lay product photograph of a single ${subcategory}.
Design and Silhouette: ${description}. It must strictly preserve this exact shape.
Color: Precise ${colorDesc}.
Pattern: ${pattern !== 'solid' ? `${pattern} pattern` : 'Solid color, no pattern'}.
Material: ${material || 'texture'}. ${fit ? `${fit} fit.` : ''} ${style} style.

CRITICAL VISUAL RULES:
1. Complete View: Show the garment perfectly centered exactly as structured.
2. Aesthetic: Clean, high-end e-commerce product photograph. Shot perfectly from above. Smooth, natural edges.
3. Environment: Absolute pure solid white background. NO shadows, NO gradients, NO floor textures. The background must be completely flat white.
4. Exclusions: ONLY the garment itself. No humans, no mannequins, no hangers, no props, no text, no watermarks, no accessories. I emphasize: ABSOLUTELY NO VISIBLE HUMAN BODY PARTS.

HEALING INSTRUCTION: I have provided a cutout of a garment on a white background. Some parts of the garment are missing or choppy where a person used to be. Your ONLY job is to HEAL and INPAINT those missing pieces of fabric so the garment looks complete, while strictly keeping the existing fabric exactly as it is. Do NOT change the texture or color of the existing fabric. Do NOT add a human.

Keep it highly realistic with ultra-sharp fabric textures and true-to-life colors.

${`RAW GARMENT METADATA JSON SCHEMA TO REPLICATE:\n` + JSON.stringify((() => {
  const m = { ...metadata };
  delete m.hasHuman; delete m.imageUrl; delete m.id; delete m.filename; delete m.dateAdded;
  return m;
})(), null, 2)}`;

  // Pre-composite the transparent image onto a solid white background 
  // so the AI sees an e-commerce layout, rather than a jagged silhouette floating in blackness.
  const { width, height } = await sharp(imageBuffer).metadata();
  const whiteBgBuffer = await sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([{ input: imageBuffer, blend: 'over' }])
    .png()
    .toBuffer();

  const b64 = `data:image/png;base64,${whiteBgBuffer.toString('base64')}`;

  const isInpainting = !!maskBuffer;
  const endpoint = isInpainting 
    ? 'https://fal.run/fal-ai/flux/dev/inpainting'
    : 'https://fal.run/fal-ai/flux/dev/image-to-image';
    
  console.log(`   using image model: ${isInpainting ? 'fal-ai/flux/dev/inpainting' : 'fal-ai/flux/dev/image-to-image'}`);
  
  const payload = {
    image_url: b64,
    prompt: prompt,
    strength: isInpainting ? 0.85 : 0.40 // Inpainting needs high strength to heal holes, I2I needs low strength to preserve structure
  };
  
  if (isInpainting) {
    payload.mask_url = `data:image/png;base64,${maskBuffer.toString('base64')}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fal.ai API error ${response.status}: ${text}`);
  }

  const result = await response.json();
  if (!result.images || result.images.length === 0) throw new Error('Fal.ai returned no images');

  const imageUrl = result.images[0].url;
  const imgResponse = await fetch(imageUrl);
  const finalBuffer = await imgResponse.arrayBuffer();

  return { imageBuffer: Buffer.from(finalBuffer), model: 'fal-ai/flux/dev (I2I)' };
}

// ── Outfit Recommendations ──────────────────────────────────────

export async function getOutfitRecommendations(targetItem, closet) {
  const candidates = closet.filter(
    item => item.id !== targetItem.id && item.category !== targetItem.category
  );

  if (candidates.length === 0) return [];

  const targetSummary = {
    category: targetItem.category,
    subcategory: targetItem.subcategory,
    primaryColor: targetItem.primaryColor,
    secondaryColor: targetItem.secondaryColor,
    colorTone: targetItem.colorTone,
    pattern: targetItem.pattern,
    style: targetItem.style,
    season: targetItem.season,
    occasionTags: targetItem.occasionTags,
    fit: targetItem.fit,
    description: targetItem.description,
  };

  const closetSummary = candidates.map(item => ({
    id: item.id,
    category: item.category,
    subcategory: item.subcategory,
    primaryColor: item.primaryColor,
    secondaryColor: item.secondaryColor,
    colorTone: item.colorTone,
    pattern: item.pattern,
    style: item.style,
    season: item.season,
    occasionTags: item.occasionTags,
    description: item.description,
  }));

  const prompt = `You are an expert fashion stylist. Recommend items from a user's closet to pair with their selected piece.

SELECTED ITEM:
${JSON.stringify(targetSummary, null, 2)}

CLOSET (candidates to pair with):
${JSON.stringify(closetSummary, null, 2)}

Pairing rules:
- Color harmony: complementary colors, neutrals with anything, or tonal dressing — avoid clashing
- Style match: keep the overall vibe consistent (don't pair a formal blazer with athletic shorts)
- Occasion overlap: items should share at least one occasion tag
- Season compatibility: avoid pairing summer-only with winter-only items
- Pattern discipline: if the selected item has a bold pattern, prefer solids as pairings
- Consider colorTone: warm tones pair better with warm, cool with cool, neutrals work with both

Select 3–5 items that genuinely pair well. Skip items that clash or are redundant.

Return ONLY a valid JSON array, no markdown:
[
  {
    "itemId": "the item id from the closet",
    "reason": "One sentence: specific reason this works (mention color, style, or occasion harmony)",
    "outfitScore": 85
  }
]

outfitScore is 0–100. Only include items with score above 65. Sort by score descending.`;

  const chain = getTextChain();

  return callWithFallback(chain, async (model) => {
    const modelId = model.id;
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ parts: [{ text: prompt }] }],
    });

    const text = response.candidates[0].content.parts[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }, 'Recommendations');
}

// ── Closet Search ───────────────────────────────────────────────

export async function searchCloset(query, closet) {
  if (closet.length === 0) {
    return { outfitItems: [], reasoning: 'Your closet is empty. Add some items first!' };
  }

  const closetSummary = closet.map(item => ({
    id: item.id,
    category: item.category,
    subcategory: item.subcategory,
    primaryColor: item.primaryColor,
    colorTone: item.colorTone,
    pattern: item.pattern,
    style: item.style,
    occasionTags: item.occasionTags,
    season: item.season,
    description: item.description,
  }));

  const prompt = `You are an expert personal stylist with access to a user's wardrobe. Build a complete outfit for their request.

USER REQUEST: "${query}"

THEIR WARDROBE:
${JSON.stringify(closetSummary, null, 2)}

Instructions:
- Build a complete, cohesive outfit that best matches the request
- Aim to cover different categories (top, bottom, shoes; add outerwear or accessory only if it meaningfully enhances the outfit)
- Prioritise style, color harmony, and occasion fit over completeness — a well-matched 2-piece beats a mismatched 4-piece
- If the wardrobe lacks something key (e.g. no shoes), acknowledge it briefly in reasoning
- outfitName should be evocative and short (3–5 words), like a fashion editorial title

Return ONLY a valid JSON object, no markdown:
{
  "outfitItems": [
    { "itemId": "id from wardrobe", "role": "e.g. base layer / statement piece / bottom / footwear" }
  ],
  "outfitName": "Creative short outfit name",
  "reasoning": "2–3 sentences: why this outfit works for the request, what makes it cohesive, and any styling tip."
}`;

  const chain = getTextChain();

  return callWithFallback(chain, async (model) => {
    const modelId = model.id;
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ parts: [{ text: prompt }] }],
    });

    const text = response.candidates[0].content.parts[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }, 'Search');
}

// ── Helpers ─────────────────────────────────────────────────────

function getMimeType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const types = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return types[ext] || 'image/jpeg';
}
