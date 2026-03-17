// ─── WEATHER SERVICE ──────────────────────────────────────────
const weatherService = {
  async getCurrentWeather() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation not supported'));
      }

      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          // 1. Fetch Weather from Open-Meteo
          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const weatherData = await weatherRes.json();

          const current = weatherData.current_weather;

          // 2. Simple Reverse Geocoding (BigDataCloud - Free/No key for basic client-side)
          // Using this to get City name for cultural context
          let city = 'Your Area';
          try {
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
            const geoData = await geoRes.json();
            city = geoData.city || geoData.locality || 'Your Area';
          } catch (e) {
            console.warn('Geocoding failed, using generic location');
          }

          resolve({
            temp: Math.round(current.temperature),
            conditionCode: current.weathercode,
            conditionText: this.getConditionText(current.weathercode),
            city: city,
            isDay: current.is_day === 1
          });
        } catch (err) {
          reject(err);
        }
      }, (err) => {
        console.warn('Location error:', err.message);
        reject(new Error('Location access denied or timed out'));
      }, { timeout: 5000 });
    });
  },

  getConditionText(code) {
    const codes = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };
    return codes[code] || 'Unknown';
  }
};
