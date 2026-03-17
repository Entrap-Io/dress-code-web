import { createRequire } from 'module';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch'; // need to use global fetch or node-fetch
import 'dotenv/config';

async function test() {
  if (!process.env.STABILITY_API_KEY) {
    console.log("No key");
    return;
  }
  
  // Create a dummy image
  const require = createRequire(import.meta.url);
  const sharp = require('sharp');
  const imgBuffer = await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  
  const form = new FormData();
  form.append('prompt', 'A beautiful red dress on a white background, studio lighting');
  form.append('output_format', 'png');
  form.append('image', imgBuffer, { filename: 'image.png', contentType: 'image/png' });
  form.append('strength', '0.5'); // I2I strength
  form.append('mode', 'image-to-image');

  const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/sd3`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
      ...form.getHeaders()
    },
    body: form,
  });

  if (!response.ok) {
    console.log("Error:", await response.text());
  } else {
    console.log("Success!");
  }
}
test().catch(console.error);
