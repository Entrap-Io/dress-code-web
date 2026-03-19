import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BACKEND_URL = 'http://localhost:3001/api';
const FEEDBACK_FILE = path.join(process.cwd(), 'data/feedback.json');

async function testFeedback() {
  console.log('🧪 Testing AI Feedback System...');

  try {
    // 1. Submit Mock Feedback
    console.log('\n📡 Submitting mock feedback...');
    const res = await axios.post(`${BACKEND_URL}/feedback`, {
      context: 'test-recommendation',
      query: 'test query',
      result: 'test result',
      feedback: 1, // Thumbs up
      itemId: 'test-item-id'
    });

    if (res.data.success) {
      console.log('✅ Feedback API returned success.');
    } else {
      console.error('❌ Feedback API failed!');
    }

    // 2. Verify File Content
    console.log('\n📁 Verifying data/feedback.json...');
    if (fs.existsSync(FEEDBACK_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
      const last = data[data.length - 1];
      if (last && last.context === 'test-recommendation') {
        console.log('✅ Feedback correctly saved to file.');
        console.log(`📝 Last Entry: [${last.timestamp}] ${last.context} -> ${last.feedback}`);
      } else {
        console.error('❌ Feedback NOT found in file or mismatch!');
      }
    } else {
      console.error('❌ feedback.json NOT found!');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testFeedback();
