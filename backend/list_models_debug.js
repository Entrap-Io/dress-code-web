import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function list() {
  try {
    // Try different ways to list models based on this specific SDK
    console.log('Keys in ai:', Object.keys(ai));
    console.log('Keys in ai.models:', Object.keys(ai.models));
    
    if (typeof ai.models.list === 'function') {
      const models = await ai.models.list();
      console.log('Models found:', JSON.stringify(models, null, 2));
    }
  } catch (err) {
    console.error('Error listing models:', err);
  }
}

list();
