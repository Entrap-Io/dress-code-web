import fs from 'fs';
import 'dotenv/config';

async function test() {
  if (!process.env.STABILITY_API_KEY) {
    console.log("No key");
    return;
  }
  
  const imgBuffer = fs.readFileSync('test-image.png'); // I need an image
}
