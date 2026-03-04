const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Analyze a clothing image and return structured metadata.
 * @param {string} imagePath - Absolute path to the uploaded image file
 * @returns {object} Structured clothing metadata
 */
async function analyzeClothingImage(imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const mimeType = getMimeType(imagePath);

 const prompt = `You are a fashion expert AI. Analyze the main clothing item(s) in this image (the outfit may be worn by a person) and return ONLY a valid JSON object with no markdown, no explanation, just raw JSON.

Focus on the primary garment(s) that stand out, not the background.

Return this exact structure:
{
  "category": "top|bottom|shoes|outerwear|accessory|dress|suit",
  "subcategory": "e.g. t-shirt, jeans, sneakers, blazer, scarf, etc.",
  "primaryColor": "main color name",
  "secondaryColor": "secondary color name or null",
  "pattern": "solid|striped|checkered|floral|geometric|abstract|animal print|none",
  "material": "e.g. cotton, denim, leather, wool, synthetic, etc.",
  "style": "casual|formal|smart casual|sporty|bohemian|streetwear|vintage",
  "season": ["spring", "summer", "autumn", "winter"],
  "occasionTags": ["work", "casual", "dinner", "party", "outdoor", "sport", "beach", "date"],
  "description": "One sentence natural description of the item",
  "fit": "slim|regular|oversized|loose|fitted"
}`;


  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  const text = response.candidates[0].content.parts[0].text.trim();

  // Strip any accidental markdown fences
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/**
 * Generate outfit recommendations for a given item using the closet context.
 * @param {object} targetItem - The item to find pairings for
 * @param {Array} closet - All items in the user's closet
 * @returns {Array} Array of recommended item IDs with reasoning
 */
async function getOutfitRecommendations(targetItem, closet) {
  // Exclude same category items and the target item itself
  const candidates = closet.filter(
    item => item.id !== targetItem.id && item.category !== targetItem.category
  );

  if (candidates.length === 0) {
    return [];
  }

  const closetSummary = candidates.map(item => ({
    id: item.id,
    category: item.category,
    subcategory: item.subcategory,
    primaryColor: item.primaryColor,
    style: item.style,
    occasionTags: item.occasionTags,
    description: item.description,
  }));

  const prompt = `You are a fashion stylist AI. A user wants outfit recommendations to pair with this item:

TARGET ITEM:
${JSON.stringify(targetItem, null, 2)}

THEIR CLOSET (other items available):
${JSON.stringify(closetSummary, null, 2)}

Select the best 3-5 items from the closet that pair well with the target item. Consider:
- Color harmony (complementary, neutral, or tonal palettes)
- Style consistency (don't mix formal blazer with athletic shorts)
- Occasion matching (work items with work items, casual with casual)
- Season compatibility

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "itemId": "the item id",
    "reason": "short 1-sentence reason why this pairs well",
    "outfitScore": 85
  }
]

outfitScore is 0-100 representing how well it pairs. Only include items scoring above 60.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
  });

  const text = response.candidates[0].content.parts[0].text.trim();
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/**
 * Search the closet using a natural language prompt.
 * @param {string} query - Natural language search (e.g. "smart casual Friday dinner")
 * @param {Array} closet - All items in the user's closet
 * @returns {object} Curated outfit with reasoning
 */
async function searchCloset(query, closet) {
  if (closet.length === 0) {
    return { outfitItems: [], reasoning: 'Your closet is empty. Add some items first!' };
  }

  const closetSummary = closet.map(item => ({
    id: item.id,
    category: item.category,
    subcategory: item.subcategory,
    primaryColor: item.primaryColor,
    style: item.style,
    occasionTags: item.occasionTags,
    season: item.season,
    description: item.description,
  }));

  const prompt = `You are a fashion stylist AI. The user is looking for: "${query}"

Their closet:
${JSON.stringify(closetSummary, null, 2)}

Curate a complete outfit from their closet that best matches what they're looking for.
Try to include items from different categories (top, bottom, shoes, outerwear if needed, accessory if relevant).

Return ONLY a valid JSON object, no markdown:
{
  "outfitItems": [
    { "itemId": "id", "role": "what role this plays in the outfit, e.g. top/bottom/shoes" }
  ],
  "reasoning": "2-3 sentences explaining why this outfit works for the request",
  "outfitName": "A creative short name for this outfit"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
  });

  const text = response.candidates[0].content.parts[0].text.trim();
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

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

module.exports = { analyzeClothingImage, getOutfitRecommendations, searchCloset };
