import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFashionEmbedding } from '../src/services/huggingface.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const ITEMS_FILE = path.join(__dirname, '../data/items.json');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

async function migrate() {
  console.log('🚀 Starting Visual Embedding Migration...');
  
  if (!fs.existsSync(ITEMS_FILE)) {
    console.log('❌ items.json not found.');
    return;
  }

  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  let updatedCount = 0;

  for (const item of items) {
    if (!item.styleVector) {
      const imagePath = path.join(UPLOADS_DIR, item.filename);
      if (fs.existsSync(imagePath)) {
        try {
          console.log(`🧠 Indexing: ${item.subcategory} (${item.id})`);
          const buffer = fs.readFileSync(imagePath);
          item.styleVector = await generateFashionEmbedding(buffer);
          updatedCount++;
        } catch (err) {
          console.error(`⚠️  Failed to index ${item.id}: ${err.message}`);
        }
      } else {
        console.warn(`⚠️  Image not found for ${item.id}: ${imagePath}`);
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
    console.log(`✅ Migration complete. Updated ${updatedCount} items.`);
  } else {
    console.log('😎 All items already indexed.');
  }
}

migrate();
