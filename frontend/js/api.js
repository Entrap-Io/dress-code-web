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
  }
};
