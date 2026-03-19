import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const FEEDBACK_FILE = path.join(__dirname, '../../data/feedback.json');

// Initialize feedback file if it doesn't exist
if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([], null, 2));
}

router.post('/', (req, res) => {
  try {
    const { context, query, result, feedback, itemId } = req.body;
    
    if (feedback === undefined) {
      return res.status(400).json({ success: false, error: 'Feedback value is required' });
    }

    const feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    
    const newFeedback = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      context: context || 'unknown',
      query: query || null,
      itemId: itemId || null,
      result: result || null, // Can be the outfit name or item name
      feedback: feedback // 1 for up, -1 for down
    };

    feedbacks.push(newFeedback);
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbacks, null, 2));

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (err) {
    console.error('❌ Feedback error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feedback (for analytics/debugging)
router.get('/', (req, res) => {
  try {
    const feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    res.json({ success: true, count: feedbacks.length, feedbacks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
