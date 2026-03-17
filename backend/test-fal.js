import fs from 'fs';
import 'dotenv/config';

async function test() {
  const b64 = `data:image/png;base64,${fs.readFileSync('uploads/test.png').toString('base64')}`;

  const response = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: b64,
      prompt: "A beautiful red dress on a white background, flat lay. No human.",
      strength: 0.5, 
    })
  });

  const res = await response.text();
  console.log(res);
}
// test().catch(console.error);
