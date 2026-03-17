if (typeof Dexie === 'undefined') {
  console.error('❌ Dexie.js not found. Local caching disabled.');
} else {
  const db = new Dexie('DressCodeDB');

  db.version(1).stores({
    items: '++localId, id, category, style, *season, *occasionTags, dateAdded',
  });

  // Helper: sync all items from backend into local DB
  window.syncItemsFromServer = async function (items) {
    await db.items.clear();
    if (items.length > 0) {
      await db.items.bulkAdd(items);
    }
  };

  // Helper: add a single item locally (after upload)
  window.saveItemLocally = async function (item) {
    const existing = await db.items.where('id').equals(item.id).first();
    if (!existing) {
      await db.items.add(item);
    }
  };

  // Helper: remove item locally
  window.removeItemLocally = async function (itemId) {
    await db.items.where('id').equals(itemId).delete();
  };

  // Helper: get all items from local DB
  window.getLocalItems = async function () {
    return db.items.orderBy('dateAdded').reverse().toArray();
  };

  // Helper: get items by category
  window.getLocalItemsByCategory = async function (category) {
    if (category === 'all') return getLocalItems();
    return db.items.where('category').equals(category).reverse().sortBy('dateAdded');
  };
}
