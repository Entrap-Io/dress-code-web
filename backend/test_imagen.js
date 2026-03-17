import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testImagen() {
  try {
    console.log('Testing imagen-4.0-generate-001 with generateImages...');
    const resp = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: "Generate a simple white circle on a black background",
    });
    console.log('generateImages success! Images count:', resp.generatedImages?.length);
  } catch (err) {
    console.error('Error with generateImages:', err.message);
  }
}

testImagen();
