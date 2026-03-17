import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(new URL('../node_modules/', import.meta.url));
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DB_PATH = path.join(__dirname, '../data/items.json');

async function migrate() {
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  console.log(`🚀 Migrating ${data.length} items for gender...`);

  for (let item of data) {
    if (item.gender) {
      console.log(`⏩ Skipping ${item.subcategory} (already tagged)`);
      continue;
    }

    console.log(`🧠 Classifying: ${item.subcategory} (${item.id})`);
    
    // Use text-based classification first for speed/cost since we have descriptions
    const prompt = `Based on the following clothing description, classify its intended gender as exactly one of: man, woman, or unisex.
    
    Category: ${item.category}
    Subcategory: ${item.subcategory}
    Description: ${item.description}
    
    Return ONLY the word: man, woman, or unisex.`;

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-1.5-flash-latest',
        contents: [{ parts: [{ text: prompt }] }]
      });
      const gender = result.response.text().trim().toLowerCase();
      
      if (['man', 'woman', 'unisex'].includes(gender)) {
        item.gender = gender;
        console.log(`   ✅ Result: ${gender}`);
      } else {
        item.gender = 'unisex';
        console.log(`   ⚠️  Ambiguous result: "${gender}" -> defaulting to unisex`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      item.gender = 'unisex';
    }
    
    // Save every 5 items to prevent data loss
    if (data.indexOf(item) % 5 === 0) {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  console.log('✅ Gender migration complete.');
}

migrate();
