const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { analyzeClothingImage } = require('../services/gemini');

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

  try {
    console.log(`🔍 Analyzing image: ${req.file.filename}`);

    // Analyze with Gemini
    const metadata = await analyzeClothingImage(req.file.path);

    // Build item record
    const newItem = {
      id: uuidv4(),
      filename: req.file.filename,
      imageUrl: `/uploads/${req.file.filename}`,
      ...metadata,
      dateAdded: new Date().toISOString(),
    };

    // Save to items.json
    const items = readItems();
    items.push(newItem);
    writeItems(items);

    console.log(`✅ Item saved: ${newItem.subcategory} (${newItem.primaryColor})`);
    res.json({ success: true, item: newItem });

  } catch (err) {
    // Clean up uploaded file if analysis failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('❌ Error analyzing item:', err.message);
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

module.exports = router;
