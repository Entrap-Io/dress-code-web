// ─── LOCAL DATABASE (Dexie.js / IndexedDB) ───────────────────
// This is the browser-side cache of items returned by the backend.
// It allows the closet to load instantly without a server call.

const db = new Dexie('DressCodeDB');

db.version(1).stores({
  // Each clothing item saved to the closet
  // Indexed fields listed here — everything else is stored but not indexed
  items: '++localId, id, category, style, *season, *occasionTags, dateAdded',
});

// Helper: sync all items from backend into local DB
async function syncItemsFromServer(items) {
  await db.items.clear();
  if (items.length > 0) {
    await db.items.bulkAdd(items);
  }
}

// Helper: add a single item locally (after upload)
async function saveItemLocally(item) {
  // Avoid duplicates
  const existing = await db.items.where('id').equals(item.id).first();
  if (!existing) {
    await db.items.add(item);
  }
}

// Helper: remove item locally
async function removeItemLocally(itemId) {
  await db.items.where('id').equals(itemId).delete();
}

// Helper: get all items from local DB
async function getLocalItems() {
  return db.items.orderBy('dateAdded').reverse().toArray();
}

// Helper: get items by category
async function getLocalItemsByCategory(category) {
  if (category === 'all') return getLocalItems();
  return db.items.where('category').equals(category).reverse().sortBy('dateAdded');
}
