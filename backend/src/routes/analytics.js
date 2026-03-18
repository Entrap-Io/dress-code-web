import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.get('/', (req, res) => {
  const scriptPath = path.join(__dirname, '../../scripts/analytics.py');
  
  const py = spawn('python3', [scriptPath]);
  
  let dataString = '';
  py.stdout.on('data', (data) => {
    dataString += data.toString();
  });
  
  py.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
  
  py.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ success: false, error: 'Python script failed' });
    }
    try {
      const result = JSON.parse(dataString);
      res.json({ success: true, analytics: result });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to parse analytics output' });
    }
  });
});

export default router;
