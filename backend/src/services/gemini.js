import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import { getTextChain, getT2IChain, getI2IChain, getDirectAiChain } from '../config/models.js';
import { calculateSimilarity, scoreOutfitCompatibility } from './huggingface.js';

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
  "fit": "regular",
  "gender": "unisex"
}

Field definitions:
- hasHuman: boolean — true if a person's body is visible, false if garment only
- gender: man | woman | unisex — classify the garment's target audience or cut
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

    const text = response.candidates[0].content.parts[0].text;
    return extractJSON(text);
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
export async function generateProductImage(metadata, modelChoice = null) {
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

  let chain = getT2IChain();
  if (modelChoice) {
    // Map the dropdown ID back to the real model ID if necessary
    const mappedId = modelChoice === 'flux' ? 'black-forest-labs/FLUX.1-schnell' :
                     modelChoice === 'nanobana-basic' ? 'gemini-2.5-flash-image' :
                     modelChoice === 'nanobana-pro' ? 'gemini-3-pro-image-preview' :
                     modelChoice === 'imagen-fast' ? 'imagen-4.0-fast-generate-001' :
                     modelChoice === 'imagen-standard' ? 'imagen-4.0-generate-001' :
                     modelChoice === 'imagen-ultra' ? 'imagen-4.0-ultra-generate-001' : modelChoice;

    const preferred = chain.find(m => m.id === mappedId);
    if (preferred) {
      chain = [preferred, ...chain.filter(m => m.id !== mappedId)];
    }
  }

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
    // ── Google Provider (Imagen / Nanobana) ─────────────────────
    else {
      // Nanobana family (gemini-) uses generateContent to produce images
      if (model.id.startsWith('gemini-')) {
        const response = await ai.models.generateContent({
          model: model.id,
          contents: [{
            parts: [{ text: prompt }]
          }],
        });

        // Find the image part in the interleaved response
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart) {
          throw new Error('Nanobana returned no image part');
        }

        return {
          imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
          model: model.id,
        };
      } 
      // Traditional Imagen family (imagen-) uses generateImages
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

  return { imageBuffer: Buffer.from(finalBuffer), model: 'Fal.ai (Flux Dev)' };
}

/**
 * Takes the ORIGINAL uncleaned image and asks AI to do everything:
 * Remove background, remove person, isolate garment, heal gaps.
 */
export async function generateProductImageDirect(metadata, imageBuffer, modelChoice = 'nanobana-basic') {
  const isNanobana = modelChoice === 'nanobana-pro' || modelChoice === 'nanobana-basic';
  
  if (!isNanobana && !process.env.FAL_KEY) {
    throw new Error('FAL_KEY not set in .env (required for Flux)');
  }
  if (isNanobana && !process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in .env (required for Nanobana)');
  }

  const { subcategory, primaryColor, secondaryColor, material, pattern, fit, style, description } = metadata;
  const colorDesc = secondaryColor ? `${primaryColor} with ${secondaryColor} accents` : primaryColor;

  const prompt = `STUDIO DIRECTIVE: REPLACE EVERYTHING EXCEPT GARMENT SHAPE.
Transform this messy amateur photo into a professional, high-end e-commerce product photograph.

GARMENT TO GENERATE:
A single ${subcategory} in precise ${colorDesc}. Style is ${style} with ${material} texture.

MANDATORY RULES:
1. COMPLETELY REMOVE the person, their skin, their hair, and their limbs.
2. COMPLETELY REMOVE the original background.
3. ISOLATION: The garment must be the ONLY item in the frame, centered on a PURE #FFFFFF SOLID WHITE BACKGROUND.
4. VIEW: Bird's-eye view, perfectly flat-lay or ghost mannequin style.
5. QUALITY: Ultra-high resolution fabric textures, professional studio flash lighting, neutral shadows.

EXCLUSIONS: NO HUMANS, NO MANNEQUINS, NO HANDS, NO FEET, NO SKIN, NO FACE, NO CLUTTER.
EXECUTION: You must strictly overwrite any human body parts with the background or more fabric. Only the garment remains.
FINAL DIRECTIVE: The resulting image must be an EMPTY white studio containing ONLY the garment. No exceptions.`;

  const b64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  let response;
  let modelNameUsed;

  if (isNanobana) {
    const modelId = modelChoice === 'nanobana-pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    const variantLabel = modelChoice === 'nanobana-pro' ? 'Pro' : 'Basic';
    console.log(`   using image model: ${modelId} (Nanobana ${variantLabel} via AI Studio)`);
    
    const resp = await ai.models.generateContent({
      model: modelId,
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: imageBuffer.toString('base64')
            }
          },
          { text: prompt }
        ]
      }],
    });

    const imagePart = resp.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart) {
      throw new Error(`Nanobana ${variantLabel} returned no image part`);
    }

    return {
      imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
      model: `${modelId} (Direct)`
    };
  } else {
    console.log(`   using image model: Fal.ai (Flux Dev Direct)`);
    modelNameUsed = 'Fal.ai (Flux Dev)';
    response = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: b64,
        prompt,
        strength: 0.95, 
        num_inference_steps: 40,
        guidance_scale: 7.5
      })
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fal.ai API error ${response.status}: ${text}`);
  }

  const result = await response.json();
  if (!result.images || result.images.length === 0) throw new Error('Fal.ai returned no images');

  const imageUrl = result.images[0].url;
  const imgResponse = await fetch(imageUrl);
  const finalBuffer = await imgResponse.arrayBuffer();

  return { imageBuffer: Buffer.from(finalBuffer), model: 'Fal.ai (Flux Dev)' };
}

// ── Outfit Recommendations ──────────────────────────────────────

export async function getOutfitRecommendations(targetItem, closet, stylingMode = 'unisex', weather = null, userProfile = null) {
  const candidates = closet.filter(item => {
    if (item.id === targetItem.id) return false;
    if (item.category === targetItem.category) return false;
    if (item.status === 'laundry') return false; 
    if (item.status === 'winter-store') return false;
    if (item.status === 'summer-store') return false;

    // Gender Filtering Logic
    if (stylingMode === 'man' && item.gender === 'woman') return false;
    if (stylingMode === 'woman' && item.gender === 'man') return false;
    
    return true;
  });

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
    styleVector: !!targetItem.styleVector ? 'AVAILABLE' : 'MISSING'
  };

  // ── Phase 1 & 2: Pre-rank by Vision & Logic ──────────────────
  const scoredCandidates = candidates.map(item => {
    const visualSimilarity = targetItem.styleVector && item.styleVector
      ? calculateSimilarity(targetItem.styleVector, item.styleVector)
      : 0.5;

    // Apply recency penalty (e.g., if worn in last 7 days)
    let penalty = 0;
    if (item.lastWorn) {
      const lastWornDate = new Date(item.lastWorn);
      const diffDays = (new Date() - lastWornDate) / (1000 * 60 * 60 * 24);
      if (diffDays < 7) {
        // Linear penalty: higher for more recent wears.
        // 0 days ago = 0.5 reduction, 7 days ago = 0 reduction
        penalty = Math.max(0, (7 - diffDays) / 14);
      }
    }

    const baseLogicScore = visualSimilarity * 0.8;
    const logicScore = Math.max(0.1, baseLogicScore - penalty); // Never drop below 0.1 if it's a structural match

    return {
      ...item,
      visualSimilarity,
      logicScore: Math.min(1, logicScore)
    };
  })
  .sort((a, b) => b.logicScore - a.logicScore)
  .slice(0, 15); // Send more candidates to Gemini to choose from

  const closetSummary = scoredCandidates.map(item => ({
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
    visualSimilarity: item.visualSimilarity.toFixed(2),
    logicScore: item.logicScore.toFixed(2)
  }));

  const weatherContext = weather 
    ? `ENVIRONMENTAL CONTEXT in ${weather.city}: Current temp is ${weather.temp}°C and the sky is ${weather.conditionText}.`
    : "";

  const prompt = `You are an expert fashion stylist. Recommend items from a user's closet to pair with their selected piece.
  
  CONTEXT: I have pre-calculated "Visual Similarity" and "Logic Compatibility" scores for these items using a specialized fashion engine. Use these scores as a guide, but make the final creative decision.

SELECTED ITEM:
${JSON.stringify(targetSummary, null, 2)}

STYLING MODE: ${stylingMode}
USER PROFILE: ${userProfile ? JSON.stringify(userProfile, null, 2) : 'None provided'}
${weatherContext}

CLOSET (top 15 candidates filtered by AI logic):
${JSON.stringify(closetSummary, null, 2)}

Pairing rules:
- Color harmony: complementary colors, neutrals with anything, or tonal dressing
- Style match: keep the overall vibe consistent
- Occasion/Season match: must be appropriate for the same context. Respect the ENVIRONMENTAL CONTEXT above (e.g., if it's raining or cold, prioritize suitable layers).
- Use 'logicScore' (0-1) as a strong indicator of technical compatibility.
- Use 'visualSimilarity' (0-1) to understand how well the textures and colors match visually.

Select 3–5 items that genuinely pair well.

Return ONLY a valid JSON array, no markdown:
[
  {
    "itemId": "the item id from the closet",
    "reason": "Specific stylistic reason (mention color, texture, silhouette, and how it fits the weather/mode)",
    "outfitScore": 85,
    "visualSimilarity": 0.92,
    "logicScore": 0.88
  }
]

outfitScore is 0–100. Combine your expert judgment with the technical scores provided.`;

  const chain = getTextChain();

  return callWithFallback(chain, async (model) => {
    const modelId = model.id;
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ parts: [{ text: prompt }] }],
    });

    let recs = [];
    try {
      const text = response.candidates[0].content.parts[0].text;
      recs = extractJSON(text);
      if (!Array.isArray(recs)) {
        // If it returned a single object, wrap it
        recs = typeof recs === 'object' && recs !== null ? [recs] : [];
      }
    } catch (e) {
      console.error(`❌ Failed to parse recommendations JSON: ${e.message}`);
      return [];
    }

    // Attach technical scores back from our scoredCandidates to the final Gemini choices
    return (recs || []).map(rec => {
      const itemId = rec.itemId || rec.id; // Support both naming conventions
      const technical = (scoredCandidates || []).find(c => c.id === itemId);
      return {
        itemId: itemId,
        reason: rec.reason || "Matched by style similarity.",
        outfitScore: rec.outfitScore || 70,
        visualSimilarity: technical?.visualSimilarity || 0,
        logicScore: technical?.logicScore || 0
      };
    }).filter(r => r.itemId); // Ensure we have an ID
  }, 'Recommendations');
}

// ── Closet Search ───────────────────────────────────────────────

export async function searchCloset(query, closet, stylingMode = 'unisex', weather = null, userProfile = null) {
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
    gender: item.gender,
    status: item.status,
    lastWorn: item.lastWorn
  })).filter(item => {
    if (item.status === 'laundry') return false;
    if (item.status === 'winter-store') return false;
    if (item.status === 'summer-store') return false;
    if (stylingMode === 'man' && item.gender === 'woman') return false;
    if (stylingMode === 'woman' && item.gender === 'man') return false;
    return true;
  });

  const prompt = `You are an expert personal stylist with access to a user's wardrobe. Build a complete outfit for their request.

USER REQUEST: "${query}"
STYLING MODE: ${stylingMode}
${weather ? `CURRENT WEATHER in ${weather.city}: ${weather.temp}°C, ${weather.conditionText}.` : ""}

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

    let result;
    try {
      const text = response.candidates[0].content.parts[0].text;
      result = extractJSON(text);
    } catch (e) {
      console.error(`❌ Failed to parse searchCloset JSON: ${e.message}`);
      return { items: [], reasoning: "Could not parse AI response." };
    }

    // [ROBUSTNESS] Multi-layer normalization for LLM output
    let rawOutfit = [];
    if (Array.isArray(result)) {
      rawOutfit = result;
      result = { outfitItems: result, outfitName: "Suggested Outfit", reasoning: "Curated based on your query." };
    } else if (result && result.outfitItems && Array.isArray(result.outfitItems)) {
      rawOutfit = result.outfitItems;
    } else if (result && typeof result === 'object') {
      // Handle "top", "bottom", "shoes" style object
      rawOutfit = Object.entries(result)
        .filter(([key, value]) => value && (typeof value === 'string' || value.itemId))
        .map(([key, value]) => (typeof value === 'string' ? { itemId: value, role: key } : value));
    }

    const enrichedItems = (rawOutfit || [])
      .map(oi => {
        const id = typeof oi === 'string' ? oi : (oi.itemId || oi.id);
        const item = closet.find(c => c.id === id);
        if (!item) return null;
        return { ...item, role: oi.role || item.subcategory };
      })
      .filter(Boolean);

    // Calculate Aggregate Outfit Cohesion (V & L) using items with styleVector
    let totalSim = 0;
    let totalLogic = 0;
    let pairs = 0;

    for (let i = 0; i < enrichedItems.length; i++) {
      for (let j = i + 1; j < enrichedItems.length; j++) {
        const a = enrichedItems[i];
        const b = enrichedItems[j];
        if (a && b && a.styleVector && b.styleVector) {
          const sim = calculateSimilarity(a.styleVector, b.styleVector);
          if (typeof sim === 'number' && !isNaN(sim)) {
            totalSim += sim;
            const isComp = a.category !== b.category;
            totalLogic += isComp ? 0.9 : 0.4; 
            pairs++;
          }
        }
      }
    }

    return {
      outfitName: result.outfitName || "Suggested Outfit",
      reasoning: result.reasoning || "An ensemble curated by your AI stylist.",
      items: enrichedItems,
      visualCohesion: pairs > 0 ? (totalSim / pairs) : 0,
      logicHarmony: pairs > 0 ? (totalLogic / pairs) : 0
    };
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

/**
 * Robustly extracts JSON even if wrapped in markdown or thinking blocks
 */
function extractJSON(text) {
  try {
    // 1. Try direct parse first
    return JSON.parse(text.trim());
  } catch (e) {
    // 2. Try stripping markdown blocks
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (e2) {
      // 3. Try finding first { and last }
      try {
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first !== -1 && last !== -1) {
          return JSON.parse(text.substring(first, last + 1));
        }
        // Try finding [ and ] for arrays
        const firstArr = text.indexOf('[');
        const lastArr = text.lastIndexOf(']');
        if (firstArr !== -1 && lastArr !== -1) {
          return JSON.parse(text.substring(firstArr, lastArr + 1));
        }
      } catch (e3) {
        throw new Error(`Failed to extract valid JSON: ${e3.message}`);
      }
    }
  }
  throw new Error("No JSON structure found in response.");
}

// ── Outfit Visualization (Phase 4) ───────────────────────────

export async function visualizeOutfit(outfitItems, weather = null, stylingMode = 'unisex') {
  const itemDescriptions = (outfitItems || []).map(item => 
    `${item.subcategory} (${item.primaryColor}, ${item.style} style, ${item.material || ''} ${item.pattern || ''})`
  ).join(', ');

  const weatherContext = weather 
    ? `The setting is ${weather.city} at ${weather.temp}°C (${weather.conditionText}).`
    : "";

  const prompt = `Create a high-fidelity, professional fashion studio photograph of a full outfit ensemble.
  
OUTFIT ITEMS: ${itemDescriptions}.
STYLING MODE: ${stylingMode}.
${weatherContext}

STYLE INSTRUCTIONS:
- [CRITICAL] NO HUMANS, NO MODELS, NO SKIN, NO VISIBLE BODY PARTS.
- Use a "Ghost Mannequin" or "Floating Ensemble" style where the clothes look as if they are being worn but the person is invisible.
- The outfit elements must be perfectly aligned and layered as a complete wearable look.
- Maintain high accuracy for the colors and materials described: ${itemDescriptions}.
- The lighting should be soft, professional studio lighting.
- The background must be pure, solid white (#FFFFFF).
- The overall look should be high-end, clean e-commerce catalog photography.`;

  console.log(`📸 Visualizing outfit via Nanobana Fast...`);

  const modelId = 'gemini-2.5-flash-image'; // Nanobana Fast

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts: [{ text: prompt }] }],
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!imagePart) {
    throw new Error('Nanobana returned no image data');
  }

  return {
    imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    model: modelId
  };
}
