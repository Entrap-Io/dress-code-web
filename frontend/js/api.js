// ─── API CLIENT ──────────────────────────────────────────────
const BACKEND_BASE = 'http://localhost:3001';
const API_BASE = `${BACKEND_BASE}/api`;

const api = {
  async _fetch(url, options = {}) {
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`🌐 API Error [${url}]:`, err.message);
      throw err;
    }
  },

  // Upload a clothing image and get AI metadata back
  async uploadItem(imageFile, options = {}) {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('options', JSON.stringify(options));

    const data = await this._fetch(`${API_BASE}/items`, {
      method: 'POST',
      body: formData,
    });
    return data.item;
  },

  // Get all items from the backend
  async getItems() {
    const data = await this._fetch(`${API_BASE}/items`);
    return data.items || [];
  },

  // Delete an item by ID
  async deleteItem(itemId) {
    return await this._fetch(`${API_BASE}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  // Get outfit recommendations for an item
  async getRecommendations(itemId, stylingMode = 'unisex', weatherContext = null) {
    const queryParams = new URLSearchParams({ stylingMode });
    if (weatherContext) queryParams.append('weather', JSON.stringify(weatherContext));

    return await this._fetch(`${API_BASE}/recommend?${queryParams.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
  },

  // Search with a natural language prompt
  async searchOutfit(query, stylingMode = 'unisex', weatherContext = null) {
    return await this._fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, stylingMode, weather: weatherContext }),
    });
  },

  // Visualize a full outfit (Phase 4)
  async visualizeOutfit(itemIds, stylingMode = 'unisex', weatherContext = null) {
    return await this._fetch(`${API_BASE}/recommend/visualize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds, stylingMode, weather: weatherContext }),
    });
  },

  // Update item status (closet vs laundry)
  async updateItemStatus(itemId, status) {
    const data = await this._fetch(`${API_BASE}/items/${itemId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return data.item;
  },

  // Record a wear event
  async markItemWorn(itemId, date = null) {
    const data = await this._fetch(`${API_BASE}/items/${itemId}/worn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    return data.item;
  },

  // Bulk wash action
  async washAllLaundry() {
    return await this._fetch(`${API_BASE}/items/wash-all`, {
      method: 'POST',
    });
  },

  // Get advanced analytics
  async getAnalytics() {
    return await this._fetch(`${API_BASE}/analytics`);
  },

  async getEvents(date = null) {
    const url = date ? `${API_BASE}/calendar/events?date=${date}` : `${API_BASE}/calendar/events`;
    return await this._fetch(url);
  },

  async getWeather(lat, lon, city = null, date = null, hourly = false) {
    const params = new URLSearchParams();
    if (lat) params.append('lat', lat);
    if (lon) params.append('lon', lon);
    if (city) params.append('city', city);
    if (date) params.append('date', date);
    if (hourly) params.append('hourly', 'true');
    return await this._fetch(`${API_BASE}/weather?${params.toString()}`);
  },

  // Profile management
  async getProfile() {
    const data = await this._fetch(`${API_BASE}/profile`);
    return data.profile;
  },

  async updateProfile(profile) {
    const data = await this._fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return data.profile;
  },

  async submitFeedback(feedbackData) {
    return await this._fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackData),
    });
  }
};
