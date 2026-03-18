import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { removeBackground } from '@imgly/background-removal-node';
import { getOutfitRecommendations, searchCloset, visualizeOutfit } from '../services/gemini.js';

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const ITEMS_FILE = path.join(__dirname, '../../data/items.json');
const PROFILE_FILE = path.join(__dirname, '../../data/profile.json');

function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  } catch {
    return { gender: 'unisex' };
  }
}

function readItems() {
  try {
    return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// ── Search Handler Logic ──────────────────────────────
async function handleSearch(req, res) {
  try {
    const { query, stylingMode, weather } = req.body;
    const items = readItems();
    const profile = readProfile();
    const finalMode = stylingMode || profile.gender || 'unisex';

    const outfit = await searchCloset(query, items, finalMode, weather, profile);
    res.json({ success: true, outfit });
  } catch (err) {
    console.error('❌ Search error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/recommend (Base) or /api/search (Base)
router.post('/', async (req, res) => {
  // If this is hitting /api/search directly, treat it as /search
  if (req.baseUrl === '/api/search') {
    return handleSearch(req, res);
  }

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

    const profile = readProfile();
    const finalMode = req.body.stylingMode || req.query.stylingMode || profile.gender || 'unisex';
    
    let weather = null;
    try {
      if (req.body.weather) {
        weather = typeof req.body.weather === 'string' ? JSON.parse(req.body.weather) : req.body.weather;
      } else if (req.query.weather) {
        weather = typeof req.query.weather === 'string' ? JSON.parse(req.query.weather) : req.query.weather;
      }
    } catch (e) {
      console.warn('⚠️ Could not parse weather context:', e.message);
    }

    console.log(`👗 Getting recommendations for: ${targetItem.subcategory} (Mode: ${finalMode})`);
    const recommendations = await getOutfitRecommendations(targetItem, items, finalMode, weather, profile);

    // Enrich recommendations with full item data
    const enriched = (recommendations || [])
      .map(rec => {
        const item = items.find(i => i.id === rec.itemId);
        if (!item) return null;
        return { 
          ...item, 
          reason: rec.reason, 
          outfitScore: rec.outfitScore,
          visualSimilarity: rec.visualSimilarity,
          logicScore: rec.logicScore
        };
      })
      .filter(Boolean);

    res.json({ success: true, targetItem, recommendations: enriched });
  } catch (err) {
    console.error('❌ Recommendation error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias for search
router.post('/search', handleSearch);

// POST /api/recommend/visualize
router.post('/visualize', async (req, res) => {
  try {
    const { itemIds, stylingMode, weather } = req.body;
    const items = readItems();
    const outfitItems = (itemIds || []).map(id => items.find(i => i.id === id)).filter(Boolean);

    if (outfitItems.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid items provided for visualization' });
    }

    const { imageBuffer } = await visualizeOutfit(outfitItems, weather, stylingMode || 'unisex');

    // Save the visualization to a permanent file
    const filename = `viz_${Date.now()}.png`;
    const uploadsDir = path.join(__dirname, '../../uploads');
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, imageBuffer);

    // [PHASE 4] Background Removal for clean finish
    console.log(`🧼 Removing background from visualization: ${filename}`);
    try {
      const fileUrl = pathToFileURL(filePath).toString();
      const bgBlob = await removeBackground(fileUrl);
      const bgBuffer = Buffer.from(await bgBlob.arrayBuffer());
      fs.writeFileSync(filePath, bgBuffer); // Overwrite with transparent version
      console.log(`✅ Visualization background removed`);
    } catch (bgErr) {
      console.warn(`⚠️ Background removal failed for visualization: ${bgErr.message}`);
    }

    res.json({ 
      success: true, 
      imageUrl: `/uploads/${filename}`
    });
  } catch (err) {
    console.error('❌ Visualization error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
