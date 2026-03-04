// ─── API CLIENT ──────────────────────────────────────────────
const API_BASE = 'http://localhost:3001/api';

const api = {
  // Upload a clothing image and get AI metadata back
  async uploadItem(imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);

    const res = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.item;
  },

  // Get all items from the backend
  async getItems() {
    const res = await fetch(`${API_BASE}/items`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load items');
    return data.items;
  },

  // Delete an item by ID
  async deleteItem(itemId) {
    const res = await fetch(`${API_BASE}/items/${itemId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Delete failed');
    return data;
  },

  // Get outfit recommendations for an item
  async getRecommendations(itemId) {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Recommendation failed');
    return data;
  },

  // Search with a natural language prompt
  async searchOutfit(query) {
    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Search failed');
    return data;
  },
};
