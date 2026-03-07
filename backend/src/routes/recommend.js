import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getOutfitRecommendations } from '../services/gemini.js';

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const ITEMS_FILE = path.join(__dirname, '../../data/items.json');

function readItems() {
  try {
    return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// POST /api/recommend
// Body: { itemId: "uuid" }
router.post('/', async (req, res) => {
  const { itemId } = req.body;

  if (!itemId) {
    return res.status(400).json({ success: false, error: 'itemId is required' });
  }

  try {
    const items = readItems();
    const targetItem = items.find(i => i.id === itemId);

    if (!targetItem) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    if (items.length < 2) {
      return res.json({
        success: true,
        recommendations: [],
        message: 'Add more items to your closet to get recommendations!',
      });
    }

    console.log(`👗 Getting recommendations for: ${targetItem.subcategory}`);
    const recommendations = await getOutfitRecommendations(targetItem, items);

    // Enrich recommendations with full item data
    const enriched = recommendations
      .map(rec => {
        const item = items.find(i => i.id === rec.itemId);
        if (!item) return null;
        return { ...item, reason: rec.reason, outfitScore: rec.outfitScore };
      })
      .filter(Boolean)
      .sort((a, b) => b.outfitScore - a.outfitScore);

    res.json({ success: true, targetItem, recommendations: enriched });
  } catch (err) {
    console.error('❌ Recommendation error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
