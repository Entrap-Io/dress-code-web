import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testGen() {
  try {
    console.log('Testing gemini-3-pro-image-preview...');
    const resp = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [{ parts: [{ text: "Generate a simple white circle on a black background" }] }],
    });
    console.log('Response types:', resp.candidates[0].content.parts.map(p => Object.keys(p)));
    console.log('Text result:', resp.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error('Error with generateContent:', err.message);
  }

  try {
    console.log('\nTesting generateImages with gemini-3-pro-image-preview...');
    const resp = await ai.models.generateImages({
      model: 'gemini-3-pro-image-preview',
      prompt: "Generate a simple white circle on a black background",
    });
    console.log('generateImages success!');
  } catch (err) {
    console.error('Error with generateImages:', err.message);
  }
}

testGen();
