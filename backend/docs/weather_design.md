# Phase 3.7: Environmental Awareness Design

To make the AI truly "Smart," we will feed it real-time environmental data during the deliberation phase.

## 📡 Data Sources
1. **Location**: Browser Geolocation API (Latitude/Longitude).
2. **Weather**: [Open-Meteo API](https://open-meteo.com/) (Free, no API key required).
3. **Geocoding**: Reverse geocode coordinates to get the `City` and `Country`.

## 🧠 AI Prompt Integration
When asking Gemini for an outfit, we will inject a `Context Block`:

```json
{
  "environmentalContext": {
    "location": "London, UK",
    "temperature": "8°C",
    "condition": "Light Rain",
    "forecast": "Expected to drop to 4°C tonight",
    "localTime": "22:55"
  }
}
```

## 🛠️ Implementation Steps
1. **Frontend (`app.js`)**:
   - On load, request location.
   - Fetch current weather from Open-Meteo.
   - Store weather in a global `currentContext` object.
2. **Backend (`recommend.js` & `search.js`)**:
   - Update routes to accept `context` body/query parameter.
3. **AI Logic (`gemini.js`)**:
   - Inject the context into the system prompt for `searchCloset` and `getOutfitRecommendations`.
   - Explicitly instruct Gemini: *"Respect the local weather. If it is raining, prioritize outerwear and water-resistant materials. If it's a cold night in London, adjust the formality and warmth accordingly."*
