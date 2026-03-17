import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testNanoBasic() {
  try {
    console.log('Testing gemini-2.5-flash-image with generateContent...');
    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [{ text: "Generate a simple blue square on a white background" }] }],
    });
    console.log('Response parts:', resp.candidates[0].content.parts.map(p => ({
      hasImage: !!p.inlineData,
      hasText: !!p.text
    })));
  } catch (err) {
    console.error('Error with generateContent:', err.message);
  }
}

testNanoBasic();
