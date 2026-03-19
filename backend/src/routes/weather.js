import express from 'express';
import axios from 'axios';

const router = express.Router();

const weatherCodeMap = {
  0: { text: 'Clear Sky', icon: '☀️' },
  1: { text: 'Mainly Clear', icon: '🌤️' },
  2: { text: 'Partly Cloudy', icon: '⛅' },
  3: { text: 'Overcast', icon: '☁️' },
  45: { text: 'Foggy', icon: '🌫️' },
  48: { text: 'Foggy', icon: '🌫️' },
  51: { text: 'Light Drizzle', icon: '🌦️' },
  61: { text: 'Rainy', icon: '🌧️' },
  71: { text: 'Snowy', icon: '❄️' },
  95: { text: 'Thunderstorm', icon: '⛈️' }
};

router.get('/', async (req, res) => {
  const { lat, lon, city, date, hourly } = req.query;
  
  let latitude = lat || 40.71;
  let longitude = lon || -74.01;

  try {
    // If date is provided (YYYY-MM-DD), use it for historical/forecast fetch
    // Open-Meteo allows start_date/end_date
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Base URL
    let url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}`;
    
    if (hourly === 'true') {
      url += `&hourly=temperature_2m,weathercode&start_date=${targetDate}&end_date=${targetDate}`;
    } else {
      url += `&current_weather=true`;
    }

    console.log(`🌍 Fetching ${hourly === 'true' ? 'HOURLY' : 'REAL'} weather for ${targetDate} at ${latitude}, ${longitude}`);
    
    const response = await axios.get(url);
    const data = response.data;

    if (hourly === 'true') {
      // Return hourly array
      const h = data.hourly;
      const hourlyData = h.time.map((t, idx) => {
        const mapping = weatherCodeMap[h.weathercode[idx]] || { text: 'Mixed', icon: '🌤️' };
        return {
          time: t, // ISO string
          temp: Math.round(h.temperature_2m[idx]),
          condition: mapping.text,
          icon: mapping.icon
        };
      });
      return res.json({ success: true, hourly: hourlyData });
    }

    const curr = data.current_weather;
    const mapping = weatherCodeMap[curr.weathercode] || { text: 'Mixed', icon: '🌤️' };

    res.json({
      success: true,
      city: city || 'Current Location',
      temp: Math.round(curr.temperature),
      conditionText: mapping.text,
      icon: mapping.icon,
      lat: latitude,
      lon: longitude,
      date: targetDate
    });
  } catch (err) {
    console.error('❌ Weather fetch failed:', err.message);
    res.status(500).json({ success: false, error: 'Weather service unavailable' });
  }
});

// GET /api/weather/reverse-geocode?lat=...&lon=...
router.get('/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ success: false, error: 'lat/lon required' });

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    console.log(`📡 Backend Proxy: Geocoding ${lat}, ${lon} via Axios...`);
    
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const data = response.data;
    const addr = data.address || {};
    // Prioritize City -> Town -> Village -> Province (for Ankara/TR case)
    const city = addr.city || addr.province || addr.state || addr.town || addr.village || addr.suburb || 'Unknown City';
    
    console.log(`✅ Geocode Success: ${city}`);
    res.json({ success: true, city });
  } catch (err) {
    console.error('❌ Reverse Geocode Proxy Failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to reverse geocode' });
  }
});

export default router;
