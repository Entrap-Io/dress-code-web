import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const PROFILE_FILE = path.join(__dirname, '../../data/profile.json');

function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  } catch {
    return {
      gender: 'unisex',
      height: 175,
      weight: 70,
      bodyType: 'mesomorph',
      skinTone: 'neutral',
      stylePref: 'casual'
    };
  }
}

function writeProfile(profile) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

// GET /api/profile
router.get('/', (req, res) => {
  res.json({ success: true, profile: readProfile() });
});

// POST /api/profile
router.post('/', (req, res) => {
  try {
    const profile = req.body;
    writeProfile(profile);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
