import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function list() {
  try {
    const models = await ai.listModels();
    console.log(JSON.stringify(models, null, 2));
  } catch (err) {
    console.error(err);
  }
}

list();
