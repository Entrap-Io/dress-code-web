require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const itemsRouter = require('./routes/items');
const recommendRouter = require('./routes/recommend');
const searchRouter = require('./routes/search');


const app = express();
const PORT = process.env.PORT || 3001;

// Ensure required directories exist
const dirs = [
  path.join(__dirname, '../data'),
  path.join(__dirname, '../uploads'),
];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Ensure items.json exists
const itemsFile = path.join(__dirname, '../data/items.json');
if (!fs.existsSync(itemsFile)) {
  fs.writeFileSync(itemsFile, JSON.stringify([], null, 2));
}

// Middleware
app.use(cors());

// Serve frontend (one level up, then into frontend/)
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// SPA-style fallback: send index.html for any non-API route
app.get('/', (req, res) => {
  // Don't swallow API routes
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });

  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'index.html'));
});

app.use(express.json());

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/items', itemsRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/search', searchRouter);


// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Dress-Code backend is running 👗' });
});

app.listen(PORT, () => {
  console.log(`\n🎽 Dress-Code backend running on http://localhost:${PORT}`);
  console.log(`📁 Uploads served at http://localhost:${PORT}/uploads`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health\n`);
});
