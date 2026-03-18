import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath, pathToFileURL } from 'url';
import { removeBackground } from '@imgly/background-removal-node';

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { analyzeClothingImage, generateProductImage, generateProductImageI2I, generateProductImageDirect } from '../services/gemini.js';
import { isolateClothing, applyStudioMagic } from '../services/imageProcessing.js';
import { generateFashionEmbedding } from '../services/huggingface.js';

const router = express.Router();

// File paths
const ITEMS_FILE = path.join(__dirname, '../../data/items.json');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Multer config — save with original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Helpers
function readItems() {
  try {
    return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeItems(items) {
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
}

// GET /api/items — list all items
router.get('/', (req, res) => {
  try {
    const items = readItems();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/items/:id — get single item
router.get('/:id', (req, res) => {
  try {
    const items = readItems();
    const item = items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/items — upload + analyze a new clothing item
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }

  let bgRemovedPath = null;
  let cleanPath = null;
  let originalPath = null;

  try {
    const optsRaw = req.body.options;
    const options = optsRaw ? JSON.parse(optsRaw) : { removeBg: true, useSegformer: true, useI2I: false, useT2I: false };

    const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
    const cleanFilename = `${baseName}_clean.png`;
    const bgRemovedFilename = `${baseName}_bgremoved.png`;
    bgRemovedPath = path.join(UPLOADS_DIR, bgRemovedFilename);

    originalPath = path.join(UPLOADS_DIR, `${baseName}_original${path.extname(req.file.filename)}`);
    if (options.useDirectAI) {
      fs.copyFileSync(req.file.path, originalPath);
    }

    // ── Step 1: Remove background (imgly) ────────────────────────
    if (options.removeBg || options.useDirectAI) {
      console.log(`🖼️  Removing background: ${req.file.filename}`);
      const fileUrl = pathToFileURL(req.file.path).toString();
      const bgBlob = await removeBackground(fileUrl);
      const bgBuffer = Buffer.from(await bgBlob.arrayBuffer());
      fs.writeFileSync(bgRemovedPath, bgBuffer);
    } else {
      console.log(`🖼️  Skipping background removal (user disabled).`);
      fs.copyFileSync(req.file.path, bgRemovedPath);
    }

    // ── Step 2: Gemini analyzes image ─────────────────
    // Returns hasHuman + all clothing attributes in ONE call
    console.log(`🔍 Analyzing with Gemini: ${bgRemovedFilename}`);
    const metadata = await analyzeClothingImage(bgRemovedPath);
    console.log(`👤 hasHuman: ${metadata.hasHuman} | ${metadata.subcategory} (${metadata.primaryColor})`);

    // Only delete original raw file after we might have copied it for Direct AI
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    // ── Step 3: Remove person (Segformer) ────────────────────────
    cleanPath = path.join(UPLOADS_DIR, cleanFilename);
    let isolatedPath = bgRemovedPath; // keep track of the most "cleaned" version
    let maskPath = null;
    let segformerSuccess = false;

    // ── Step 3: Remove person (Segformer) ────────────────────────
    if (options.useSegformer && metadata.hasHuman) {
      try {
        console.log('✂️  Running segformer to remove person from image...');
        const { buffer: clothingBuffer, maskBuffer, method } = await isolateClothing(bgRemovedPath);
        fs.writeFileSync(cleanPath, clothingBuffer); // temporarily save choppy image
        
        if (maskBuffer) {
          maskPath = path.join(UPLOADS_DIR, `${baseName}_mask.png`);
          fs.writeFileSync(maskPath, maskBuffer);
        }

        isolatedPath = cleanPath; // the choppy image is now our best physical version
        segformerSuccess = true;
        console.log(`✅ Person removed via [${method}]`);
      } catch (hfErr) {
        console.warn(`⚠️  Segformer failed: ${hfErr.message}`);
        // keep isolatedPath as bgRemovedPath
      }
    } else if (!options.useSegformer && metadata.hasHuman) {
      console.log('✂️  Skipping Segformer (user disabled).');
    }

    // ── Step 4: AI Generations (Direct, T2I, or I2I) ──────────────
    let aiSuccess = false;

    if (options.useDirectAI || options.useI2I || options.useT2I) {
      try {
        let aiResult = null;

        if (options.useDirectAI) {
          const directModel = options.directModel || 'nanobana-basic';
          const fileSource = options.useSegformer && metadata.hasHuman ? 'LOCAL SEGFORMER CUTOUT' : 'CLEANED BACKGROUND';
          console.log(`🎨 Generating Direct AI Transformation via AI Studio [${directModel}] using ${fileSource}...`);
          const inputBuffer = fs.readFileSync(isolatedPath); 
          aiResult = await generateProductImageDirect(metadata, inputBuffer, directModel);
          if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
        } else if (options.useI2I) {
          console.log('🎨 Generating Image-to-Image (healing borders & lighting) via fal.ai...');
          const currentBuffer = fs.readFileSync(isolatedPath);
          const currentMaskBuffer = maskPath ? fs.readFileSync(maskPath) : null;
          aiResult = await generateProductImageI2I(metadata, currentBuffer, currentMaskBuffer)
        } else if (options.useT2I) {
          const t2iModel = options.t2iModel || 'nanobana-basic';
          console.log(`🎨 Generating Text-to-Image via [${t2iModel}]...`);
          aiResult = await generateProductImage(metadata, t2iModel);
        }

        if (aiResult?.imageBuffer) {
          // Temporarily save the AI image with the solid white background
          fs.writeFileSync(cleanPath, aiResult.imageBuffer);

          try {
            // ALWAYS run AI generation output through imgly to strip the white studio floor
            console.log(`🧼 Removing background from AI generated image...`);
            const aiImgUrl = pathToFileURL(cleanPath).toString();
            const cleanBlob = await removeBackground(aiImgUrl);
            const cleanBuffer = Buffer.from(await cleanBlob.arrayBuffer());
            fs.writeFileSync(cleanPath, cleanBuffer); // Overwrite with transparent version
            console.log(`✅ Final transparent image ready via [${aiResult.model}]`);
          } catch (bgErr) {
            console.warn(`⚠️  Background removal on AI image failed, keeping solid background: ${bgErr.message}`);
          }

          if (isolatedPath === bgRemovedPath) fs.unlinkSync(bgRemovedPath);
          else if (bgRemovedPath && fs.existsSync(bgRemovedPath)) fs.unlinkSync(bgRemovedPath);

          if (maskPath && fs.existsSync(maskPath)) fs.unlinkSync(maskPath);

          isolatedPath = cleanPath;
          aiSuccess = true;
        }
      } catch (aiErr) {
        console.warn(`⚠️  AI Generation failed: ${aiErr.message}`);
      }
    }

    // ── Step 5: Local Studio Magic (Only if AI was skipped or failed) ────
    if (!aiSuccess) {
      // If we don't have AI giving us a pro studio background, we run our Local Studio Magic 
      // EXCEPT when the user explicitly turned off imgly background removal (because then it's just a raw photo block)
      if (options.removeBg) {
        console.log(`✨ Applying Local Studio Magic (Auto-crop, 4:5 padding, Drop Shadow)...`);
        try {
          const magicBuffer = await applyStudioMagic(isolatedPath);
          fs.writeFileSync(cleanPath, magicBuffer);

          if (isolatedPath === bgRemovedPath && fs.existsSync(bgRemovedPath)) {
            fs.unlinkSync(bgRemovedPath);
          }
          console.log(`✅ Local Studio Magic applied successfully.`);
        } catch (magicErr) {
          console.warn(`⚠️  Studio Magic failed: ${magicErr.message}`);
          // Fallbacks:
          if (isolatedPath === bgRemovedPath) {
            console.log(`🪆 Using raw (bg-removed) image as fallback`);
            fs.renameSync(bgRemovedPath, cleanPath);
          } else {
            console.log(`🪆 Using physical chopped image as fallback`);
            if (fs.existsSync(bgRemovedPath)) fs.unlinkSync(bgRemovedPath);
          }
        }
      } else {
        // Did not remove background, use as is
        fs.renameSync(bgRemovedPath, cleanPath);
      }
    }

    // Explicitly nullify
    bgRemovedPath = null;
    if (maskPath && fs.existsSync(maskPath)) fs.unlinkSync(maskPath);
    maskPath = null;

    // ── Step 6: Generate Visual Embedding (Fashion-CLIP) ─────────
    let styleVector = null;
    try {
      console.log(`🧠 Generating Fashion-CLIP embedding: ${bgRemovedFilename}`);
      const bgRemovedBuffer = fs.readFileSync(isolatedPath); 
      styleVector = await generateFashionEmbedding(bgRemovedBuffer);
      console.log(`✅ Style vector generated (${styleVector?.length || 0} dims)`);
    } catch (hfErr) {
      console.warn(`⚠️  Fashion-CLIP failed: ${hfErr.message}`);
    }

    // ── Step 7: Save item record ──────────────────────────────────
    const newItem = {
      id: uuidv4(),
      filename: cleanFilename,
      imageUrl: `/uploads/${cleanFilename}`,
      ...metadata,
      styleVector,
      dateAdded: new Date().toISOString(),
      status: 'closet',
      wornHistory: [],
      lastWorn: null
    };

    const items = readItems();
    items.push(newItem);
    writeItems(items);

    console.log(`✅ Item saved: ${newItem.subcategory} (${newItem.primaryColor})`);
    res.json({ success: true, item: newItem });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (bgRemovedPath && fs.existsSync(bgRemovedPath)) fs.unlinkSync(bgRemovedPath);
    if (cleanPath && fs.existsSync(cleanPath)) fs.unlinkSync(cleanPath);
    if (originalPath && fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
    console.error('❌ Error processing item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/items/:id — remove an item
router.delete('/:id', (req, res) => {
  try {
    const items = readItems();
    const item = items.find(i => i.id === req.params.id);

    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    // Delete image file
    const imagePath = path.join(UPLOADS_DIR, item.filename);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    // Remove from items.json
    const updated = items.filter(i => i.id !== req.params.id);
    writeItems(updated);

    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/items/:id/status — toggle between closet and laundry
router.put('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['closet', 'laundry', 'winter-store', 'summer-store'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const items = readItems();
    const index = items.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Item not found' });

    items[index].status = status;
    writeItems(items);

    res.json({ success: true, item: items[index] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/items/:id/worn — record a wear event
router.post('/:id/worn', (req, res) => {
  try {
    const { date } = req.body;
    const wearDate = date ? new Date(date).toISOString() : new Date().toISOString();

    const items = readItems();
    const index = items.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Item not found' });

    if (!items[index].wornHistory) items[index].wornHistory = [];
    
    // Check if worn today (same UTC day)
    const today = new Date().toISOString().split('T')[0];
    const existingIndex = items[index].wornHistory.findIndex(d => d.split('T')[0] === today);

    if (existingIndex !== -1) {
      // Toggle off: remove today's entry
      items[index].wornHistory.splice(existingIndex, 1);
      // Update lastWorn to previous entry if it exists
      items[index].lastWorn = items[index].wornHistory.length > 0 
        ? items[index].wornHistory[items[index].wornHistory.length - 1] 
        : null;
    } else {
      // Toggle on: add today's entry
      const wearDate = new Date().toISOString();
      items[index].wornHistory.push(wearDate);
      items[index].lastWorn = wearDate;
    }
    
    writeItems(items);
    res.json({ success: true, item: items[index] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/items/wash-all — move all items from laundry to closet
router.post('/wash-all', (req, res) => {
  try {
    const items = readItems();
    let count = 0;
    items.forEach(item => {
      if (item.status === 'laundry') {
        item.status = 'closet';
        count++;
      }
    });
    writeItems(items);
    res.json({ success: true, message: `Washed ${count} items.`, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
