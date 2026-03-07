import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { searchCloset } from '../services/gemini.js';

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

// POST /api/search
// Body: { query: "smart casual for Friday dinner" }
router.post('/', async (req, res) => {
  const { query } = req.body;

  if (!query || query.trim() === '') {
    return res.status(400).json({ success: false, error: 'Search query is required' });
  }

  try {
    const items = readItems();

    if (items.length === 0) {
      return res.json({
        success: true,
        outfit: null,
        message: 'Your closet is empty. Add some items first!',
      });
    }

    console.log(`🔎 Searching closet for: "${query}"`);
    const result = await searchCloset(query, items);

    // Enrich outfit items with full data
    const enrichedItems = result.outfitItems
      .map(outfitItem => {
        const item = items.find(i => i.id === outfitItem.itemId);
        if (!item) return null;
        return { ...item, role: outfitItem.role };
      })
      .filter(Boolean);

    res.json({
      success: true,
      query,
      outfit: {
        name: result.outfitName,
        reasoning: result.reasoning,
        items: enrichedItems,
      },
    });
  } catch (err) {
    console.error('❌ Search error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
