import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEventsForDate } from '../services/calendarService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILE_FILE = path.join(__dirname, '../../data/profile.json');

const router = express.Router();

function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// GET /api/calendar/events?date=YYYY-MM-DD
router.get('/events', async (req, res) => {
  const profile = readProfile();
  const icalUrl = profile.icalUrl;
  const { date } = req.query; // YYYY-MM-DD

  if (!icalUrl) {
    return res.json({ success: true, events: [], message: 'No iCal URL configured.' });
  }

  try {
    // defaults to today if no date provided
    const targetDateStr = date || new Date().toISOString().split('T')[0];
    
    console.log(`📅 Fetching events for ${targetDateStr} (OOTD Context)`);
    const events = await getEventsForDate(icalUrl, targetDateStr);
    
    res.json({ success: true, events });
  } catch (err) {
    console.error('❌ iCal Route Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backward compatibility
router.get('/today', (req, res) => {
  res.redirect(`/api/calendar/events`);
});

export default router;
