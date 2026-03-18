// ─── DRESS-CODE APP ───────────────────────────────────────────
// BACKEND_BASE is already defined in api.js

// ── State ──────────────────────────────────────────────────────
let currentFilter = localStorage.getItem('dc_filter') || 'all';
let currentStorageFilter = 'all';
let currentView = localStorage.getItem('dc_view') || 'closet';
let allItems = [];
let userProfile = null;
let currentWeather = null;

// ── DOM refs ───────────────────────────────────────────────────
const closetGrid = document.getElementById('closetGrid');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');

// Laundry refs
const laundryGrid = document.getElementById('laundryGrid');
const laundryCount = document.getElementById('laundryCount');
const laundryEmptyState = document.getElementById('laundryEmptyState');
const washAllBtn = document.getElementById('washAllBtn');

// Analytics refs
const analyticsContainer = document.getElementById('analyticsContainer');
const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');

// Add modal
const addModalOverlay = document.getElementById('addModalOverlay');
const uploadZone = document.getElementById('uploadZone');
const imageInput = document.getElementById('imageInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreview = document.getElementById('uploadPreview');
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzingState = document.getElementById('analyzingState');
const modalActions = document.querySelector('.modal-actions');

// Item modal
const itemModalOverlay = document.getElementById('itemModalOverlay');
const itemModalBody = document.getElementById('itemModalBody');

// ── Init ───────────────────────────────────────────────────────
async function init() {
  try {
    console.log('💎 App Init Starting...');
    
    // Load profile first as it provides context
    await loadProfile();

    await loadItems();
    
    // Restore view
    switchView(currentView);
  } catch (err) {
    console.error('💥 Critical Load Error:', err);
  } finally {
    setupEventListeners();
    console.log('✅ UI Event Listeners Ready');
  }
}

function switchView(viewName) {
  currentView = viewName;
  localStorage.setItem('dc_view', viewName);
  
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewName);
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });

  if (viewName === 'closet') renderCloset();
  if (viewName === 'laundry') renderLaundry();
  if (viewName === 'storage') renderStorage();
  if (viewName === 'analytics') loadAnalytics();
  if (viewName === 'profile') renderProfile();
}

async function loadProfile() {
  try {
    userProfile = await api.getProfile();
  } catch (err) {
    console.warn('Could not load profile, using defaults');
    userProfile = { gender: 'unisex', height: 175, weight: 70, bodyType: 'mesomorph' };
  }
}

async function loadItems() {
  // 1. Fast Load from Local Cache (IndexedDB)
  try {
    if (typeof getLocalItems === 'function') {
      const local = await getLocalItems();
      if (local && local.length > 0) {
        allItems = local;
        renderCloset();
      }
    }
  } catch (err) {
    console.warn('Local cache load failed:', err.message);
  }

  // 2. Background Sync from Server
  try {
    const serverItems = await api.getItems();
    allItems = serverItems;
    renderCloset();
    // Update cache
    if (typeof syncItemsFromServer === 'function') {
      await syncItemsFromServer(serverItems);
    }
  } catch (err) {
    console.error('Server sync failed:', err.message);
    if (!allItems || allItems.length === 0) {
      closetGrid.innerHTML = `<div class="search-empty" style="color:var(--red)">
        <p>⚠️ Offline / Server Error</p>
        <p style="font-size:0.8rem; margin-top:5px;">${err.message}</p>
      </div>`;
    }
  }

  // 3. Initialize Weather
  try {
    if (typeof weatherService !== 'undefined' && typeof weatherService.getCurrentWeather === 'function') {
      currentWeather = await weatherService.getCurrentWeather();
      updateWeatherWidget(currentWeather);
    }
  } catch (err) {
    console.warn('Weather initialization failed:', err.message);
  }

  // Set initial filter chip state
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === currentFilter);
  });
}

// ── Sorting Logic ──────────────────────────────────────────────
function sortItemsByWear(items) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  return [...items].sort((a, b) => {
    const aLastStr = a.lastWorn ? a.lastWorn.split('T')[0] : null;
    const bLastStr = b.lastWorn ? b.lastWorn.split('T')[0] : null;

    // 1. Worn Today Group
    if (aLastStr === today && bLastStr !== today) return -1;
    if (bLastStr === today && aLastStr !== today) return 1;
    if (aLastStr === today && bLastStr === today) {
      // Both worn today: newest wear first
      return new Date(b.lastWorn) - new Date(a.lastWorn);
    }

    // 2. Just Unworn Today Group (Positioned right after Worn Today)
    if (a.justUnwornToday && !b.justUnwornToday) {
      if (bLastStr === today) return 1;
      return -1;
    }
    if (b.justUnwornToday && !a.justUnwornToday) {
      if (aLastStr === today) return -1;
      return 1;
    }
    if (a.justUnwornToday && b.justUnwornToday) {
      // Both just unworn: newest toggle first
      return (b.toggleTimestamp || 0) - (a.toggleTimestamp || 0);
    }

    // 3. Worn Yesterday -> Bottom
    if (aLastStr === yesterday && bLastStr !== yesterday) return 1;
    if (bLastStr === yesterday && aLastStr !== yesterday) return -1;

    // 4. Fallback: newest added first
    return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
  });
}

// ── Render Closet ──────────────────────────────────────────────
function renderCloset(filter = currentFilter) {
  const activeItems = allItems.filter(item => 
    !['laundry', 'winter-store', 'summer-store'].includes(item.status)
  );

  const filtered = filter === 'all'
    ? activeItems
    : activeItems.filter(item => item.category === filter);

  const sorted = sortItemsByWear(filtered);

  // Update count
  itemCount.textContent = `${activeItems.length} item${activeItems.length !== 1 ? 's' : ''}`;

  // Empty state
  if (activeItems.length === 0) {
    closetGrid.innerHTML = '';
    if (allItems.length > 0) {
      closetGrid.innerHTML = `<p style="color:var(--text-muted); font-style:italic; padding:2rem 0;">All your clothes are in laundry or storage!</p>`;
    } else {
      emptyState.classList.add('visible');
    }
    return;
  }
  emptyState.classList.remove('visible');

  if (filtered.length === 0) {
    closetGrid.innerHTML = `<p style="color:var(--text-muted); font-style:italic; padding:2rem 0;">No items in this category yet.</p>`;
    return;
  }

  closetGrid.innerHTML = (sorted || []).map(item => `
    <div class="item-card" data-id="${item.id}">
      <img
        class="item-card-img"
        src="${BACKEND_BASE}${item.imageUrl}"
        alt="${item.subcategory}"
      />
      ${item.lastWorn && item.lastWorn.split('T')[0] === new Date().toISOString().split('T')[0] ? '<div class="item-badge" style="top:20px; left:20px; transform:none; font-size:0.6rem; padding:0.2rem 0.5rem;">WORN TODAY</div>' : ''}
      <div class="item-card-body">
        <div class="item-card-sub">${item.subcategory || item.category}</div>
        <div class="item-card-meta">${item.primaryColor}${item.secondaryColor ? ' · ' + item.secondaryColor : ''}</div>
        <div class="item-card-tags">
          <span class="tag style">${item.style}</span>
          ${(item.occasionTags || []).slice(0, 2).map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
      <div class="card-actions-overlay">
        <button class="action-btn" data-action="laundry" data-id="${item.id}" title="Laundry">🧺 Laundry</button>
        <button class="action-btn secondary" data-action="worn" data-id="${item.id}">👟 Worn</button>
      </div>
      <button class="item-card-delete" data-delete="${item.id}" title="Remove item">✕</button>
    </div>
  `).join('');
}

// ── Render Laundry ──────────────────────────────────────────────
function renderLaundry() {
  const laundryItems = allItems.filter(item => item.status === 'laundry');
  laundryCount.textContent = `${laundryItems.length} item${laundryItems.length !== 1 ? 's' : ''} need washing`;

  if (laundryItems.length === 0) {
    laundryGrid.innerHTML = '';
    laundryEmptyState.style.display = 'block';
    washAllBtn.style.display = 'none';
    return;
  }

  laundryEmptyState.style.display = 'none';
  washAllBtn.style.display = 'block';

  laundryGrid.innerHTML = laundryItems.map(item => `
    <div class="item-card laundry" data-id="${item.id}">
      <img
        class="item-card-img"
        src="${BACKEND_BASE}${item.imageUrl}"
        alt="${item.subcategory}"
      />
      <div class="item-badge">IN LAUNDRY</div>
      <div class="item-card-body">
        <div class="item-card-sub">${item.subcategory || item.category}</div>
      </div>
      <div class="card-actions-overlay" style="opacity: 1; background: rgba(0,0,0,0.4);">
        <button class="action-btn" data-action="wash" data-id="${item.id}">🧼 Wash & Move to Closet</button>
      </div>
    </div>
  `).join('');
}

// ── Render Storage ──────────────────────────────────────────────
function renderStorage(filter = currentStorageFilter) {
  const allStorageItems = allItems.filter(item => ['winter-store', 'summer-store'].includes(item.status));
  
  const storageItems = filter === 'all' 
    ? allStorageItems 
    : allStorageItems.filter(item => item.status === filter);

  const storageGrid = document.getElementById('storageGrid');
  const storageCount = document.getElementById('storageCount');
  const storageEmptyState = document.getElementById('storageEmptyState');

  storageCount.textContent = `${allStorageItems.length} item${allStorageItems.length !== 1 ? 's' : ''} stored`;

  if (storageItems.length === 0) {
    storageGrid.innerHTML = '';
    storageEmptyState.style.display = 'block';
    return;
  }
  storageEmptyState.style.display = 'none';

  storageGrid.innerHTML = storageItems.map(item => `
    <div class="item-card" data-id="${item.id}">
      <img
        class="item-card-img"
        src="${BACKEND_BASE}${item.imageUrl}"
        alt="${item.subcategory}"
      />
      <div class="item-badge" style="top:20px; left:20px; transform:none; font-size:0.6rem; padding:0.2rem 0.5rem; background:var(--accent); color:var(--black);">
        ${item.status === 'winter-store' ? '❄️ WINTER' : '☀️ SUMMER'}
      </div>
      <div class="item-card-body">
        <div class="item-card-sub">${item.subcategory || item.category}</div>
        <div class="item-card-meta">${item.primaryColor}</div>
      </div>
      <div class="card-actions-overlay">
        <button class="action-btn" data-action="restore" data-id="${item.id}">🧥 Back to Closet</button>
      </div>
      <button class="item-card-delete" data-delete="${item.id}" title="Remove item">✕</button>
    </div>
  `).join('');
}

// ── Render Profile ─────────────────────────────────────────────
function renderProfile() {
  const form = document.getElementById('profileForm');
  if (!form || !userProfile) return;

  // Populate form fields
  for (const [key, value] of Object.entries(userProfile)) {
    const input = form.elements[key];
    if (input) {
      input.value = value;
    } else {
      // Check for option card grids
      const grid = form.querySelector(`.option-card-grid[data-select-name="${key}"]`);
      if (grid) {
        const hiddenInput = form.querySelector(`input[name="${key}"]`);
        if (hiddenInput) hiddenInput.value = value;
        
        // Mark active card
        grid.querySelectorAll('.option-card').forEach(card => {
          card.classList.toggle('active', card.dataset.value === value);
        });
      }
    }
  }
}

// ── Event Listeners ────────────────────────────────────────────
function setupEventListeners() {
  // View navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      localStorage.setItem('dc_filter', currentFilter);
      renderCloset(currentFilter);
    });
  });

  // Open add modal
  document.getElementById('openAddModal').addEventListener('click', openAddModal);
  document.getElementById('emptyAddBtn').addEventListener('click', openAddModal);

  // Close add modal
  document.getElementById('closeAddModal').addEventListener('click', closeAddModal);
  document.getElementById('cancelAddBtn').addEventListener('click', closeAddModal);
  addModalOverlay.addEventListener('click', e => { if (e.target === addModalOverlay) closeAddModal(); });

  // Upload zone click → trigger file input
  uploadZone.addEventListener('click', () => imageInput.click());

  // Drag & drop
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent)'; });
  uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageSelected(file);
  });

  // File input change
  imageInput.addEventListener('change', () => {
    if (imageInput.files[0]) handleImageSelected(imageInput.files[0]);
  });

  // Analyze button
  analyzeBtn.addEventListener('click', handleAnalyze);

  const optI2I = document.getElementById('optI2I');
  const optT2I = document.getElementById('optT2I');
  const optDirectAI = document.getElementById('optDirectAI');
  const t2iContainer = document.getElementById('t2iModelContainer');
  const directContainer = document.getElementById('directAiModelContainer');

  optI2I.addEventListener('change', () => {
    if (optI2I.checked) {
      optT2I.checked = false;
      optDirectAI.checked = false;
      t2iContainer.style.display = 'none';
      directContainer.style.display = 'none';
    }
  });

  // Profile form
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    // Option card click handling
    profileForm.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        const grid = card.closest('.option-card-grid');
        const selectName = grid.dataset.selectName;
        const hiddenInput = profileForm.querySelector(`input[name="${selectName}"]`);
        
        grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        if (hiddenInput) hiddenInput.value = card.dataset.value;
      });
    });

    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('saveProfileBtn');
      const btnText = saveBtn.querySelector('.btn-text');
      const btnSpinner = saveBtn.querySelector('.btn-spinner');

      // Loading state
      saveBtn.disabled = true;
      btnText.textContent = 'Saving...';
      btnSpinner.style.display = 'inline-block';

      const formData = new FormData(profileForm);
      const updatedProfile = Object.fromEntries(formData.entries());
      
      // Convert numeric fields
      if (updatedProfile.height) updatedProfile.height = Number(updatedProfile.height);
      if (updatedProfile.weight) updatedProfile.weight = Number(updatedProfile.weight);

      try {
        userProfile = await api.updateProfile(updatedProfile);
        showToast('Profile saved successfully!', 'success');
      } catch (err) {
        showToast('Failed to save profile', 'error');
      } finally {
        saveBtn.disabled = false;
        btnText.textContent = 'Save Changes';
        btnSpinner.style.display = 'none';
      }
    });
  }

  // Storage filter chips
  document.querySelectorAll('[data-storage-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-storage-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStorageFilter = chip.dataset.storageFilter;
      renderStorage(currentStorageFilter);
    });
  });

  optT2I.addEventListener('change', () => {
    if (optT2I.checked) {
      optI2I.checked = false;
      optDirectAI.checked = false;
      t2iContainer.style.display = 'block';
      directContainer.style.display = 'none';
    } else {
      t2iContainer.style.display = 'none';
    }
  });

  optDirectAI.addEventListener('change', () => {
    if (optDirectAI.checked) {
      optI2I.checked = false;
      optT2I.checked = false;
      t2iContainer.style.display = 'none';
      directContainer.style.display = 'block';
    } else {
      directContainer.style.display = 'none';
    }
  });

  // Laundry and Worn actions (delegation)
  document.addEventListener('click', async e => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const { action, id } = actionBtn.dataset;
    
    try {
      if (action === 'laundry') {
        await api.updateItemStatus(id, 'laundry');
        const item = allItems.find(i => i.id === id);
        if (item) item.status = 'laundry';
        renderCloset();
        showToast('Moved to laundry', 'info');
      } 
      else if (action === 'worn') {
        const item = await api.markItemWorn(id);
        const idx = allItems.findIndex(i => i.id === id);
        
        const isNowWorn = item.lastWorn && item.lastWorn.includes(new Date().toISOString().split('T')[0]);
        item.toggleTimestamp = Date.now();
        item.justUnwornToday = !isNowWorn;

        if (idx !== -1) allItems[idx] = item;
        
        const msg = isNowWorn ? 'Marked as worn!' : 'Dress-code removed!';
        showToast(msg, 'success');
        renderCloset();
      }
      else if (action === 'wash') {
        await api.updateItemStatus(id, 'closet');
        const item = allItems.find(i => i.id === id);
        if (item) item.status = 'closet';
        renderLaundry();
        showToast('Clean and back in closet!', 'success');
      }
      else if (action === 'winter-store' || action === 'summer-store') {
        await api.updateItemStatus(id, action);
        const item = allItems.find(i => i.id === id);
        if (item) item.status = action;
        renderCloset();
        showToast(`Moved to ${action === 'winter-store' ? 'Winter' : 'Summer'} Store`, 'info');
      }
      else if (action === 'restore') {
        await api.updateItemStatus(id, 'closet');
        const item = allItems.find(i => i.id === id);
        if (item) item.status = 'closet';
        renderStorage();
        showToast('Cleaned and back in closet!', 'success');
      }
      else if (action === 'worn-outfit') {
        const ids = id.split(',');
        for (const itemId of ids) {
          const updatedItem = await api.markItemWorn(itemId);
          const idx = allItems.findIndex(i => i.id === itemId);
          if (idx !== -1) allItems[idx] = updatedItem;
        }
        showToast(`Full outfit marked as worn!`, 'success');
        actionBtn.disabled = true;
        actionBtn.textContent = '✅ Outfit Worn';
        renderCloset(); 
      }

      // Close modal if action was taken from inside it
      const modal = e.target.closest('#itemModalOverlay');
      if (modal && (action === 'laundry' || action === 'wash' || action === 'winter-store' || action === 'summer-store' || action === 'restore')) {
        closeItemModal();
      }
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    }
  });

  // Wash All
  document.getElementById('washAllBtn').addEventListener('click', async () => {
    try {
      await api.washAllLaundry();
      allItems.forEach(i => { if (i.status === 'laundry') i.status = 'closet'; });
      renderLaundry();
      showToast('All items are now clean!', 'success');
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    }
  });

  // Refresh Analytics
  document.getElementById('refreshAnalyticsBtn').addEventListener('click', loadAnalytics);

  // Closet grid — delegate clicks for card open and delete
  closetGrid.addEventListener('click', e => {
    // 1. Ignore if clicking action buttons
    if (e.target.closest('.card-actions-overlay') || e.target.closest('[data-action]')) {
      return; 
    }

    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
      e.stopPropagation();
      handleDeleteItem(deleteBtn.dataset.delete);
      return;
    }
    const card = e.target.closest('.item-card');
    if (card) openItemModal(card.dataset.id);
  });

  // Close item modal
  document.getElementById('closeItemModal').addEventListener('click', closeItemModal);
  itemModalOverlay.addEventListener('click', e => { if (e.target === itemModalOverlay) closeItemModal(); });

  // Search
  document.getElementById('searchBtn').addEventListener('click', handleSearch);
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('searchInput').value = chip.dataset.query;
      handleSearch();
    });
  });
}

// ── Add Item Flow ──────────────────────────────────────────────
let selectedFile = null;

function openAddModal() {
  selectedFile = null;
  imageInput.value = '';
  uploadPreview.classList.remove('visible');
  uploadPreview.src = '';
  uploadPlaceholder.classList.remove('hidden');
  uploadZone.classList.remove('has-image');
  analyzeBtn.disabled = true;
  analyzingState.classList.remove('visible');
  modalActions.style.display = 'flex';
  document.getElementById('uploadOptions').style.display = 'none';
  addModalOverlay.classList.add('open');
}

function closeAddModal() {
  addModalOverlay.classList.remove('open');
}

function handleImageSelected(file) {
  selectedFile = file;
  const url = URL.createObjectURL(file);
  uploadPreview.src = url;
  uploadPreview.classList.add('visible');
  uploadPlaceholder.classList.add('hidden');
  uploadZone.classList.add('has-image');
  document.getElementById('uploadOptions').style.display = 'block';
  analyzeBtn.disabled = false;
}

async function handleAnalyze() {
  if (!selectedFile) return;

  // Show loading state
  modalActions.style.display = 'none';
  analyzingState.classList.add('visible');
  analyzingState.querySelector('p').textContent = 'Processing your image...';

  try {
    // Gather the pipeline toggle options from the UI
    const options = {
      removeBg: document.getElementById('optRemoveBg').checked,
      useSegformer: document.getElementById('optSegformer').checked,
      useI2I: document.getElementById('optI2I').checked,
      useT2I: document.getElementById('optT2I').checked,
      t2iModel: document.getElementById('optT2IModel').value,
      useDirectAI: document.getElementById('optDirectAI').checked,
      directModel: document.getElementById('optDirectModel').value
    };

    // Upload raw file + options — backend handles background removal + AI analysis
    const item = await api.uploadItem(selectedFile, options);
    if (typeof saveItemLocally === 'function') {
      await saveItemLocally(item);
    }
    allItems.unshift(item);
    closeAddModal();
    // Reset to 'all' filter so the new item is always visible
    currentFilter = 'all';
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
    renderCloset('all');
    showToast(`✅ Added ${item.subcategory} to your closet!`, 'success');
  } catch (err) {
    console.error('Analysis Error:', err);
    modalActions.style.display = 'flex';
    analyzingState.classList.remove('visible');
    analyzingState.querySelector('p').textContent = 'AI is analyzing your item...';
    showToast(`❌ ${err.message}`, 'error');
  }
}

// ── Delete Item ────────────────────────────────────────────────
async function handleDeleteItem(itemId) {
  if (!confirm('Remove this item from your closet?')) return;

  try {
    await api.deleteItem(itemId);
    if (typeof removeItemLocally === 'function') {
      await removeItemLocally(itemId);
    }
    allItems = allItems.filter(i => i.id !== itemId);
    renderCloset();
    showToast('Item removed from closet', 'info');
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  }
}

// ── Item Detail Modal + Recommendations ───────────────────────
async function openItemModal(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  // Render item details
  itemModalBody.innerHTML = `
    <div>
      <img class="item-modal-image" src="${BACKEND_BASE}${item.imageUrl}" alt="${item.subcategory}" />
    </div>
    <div class="item-modal-info">
      <div class="item-modal-category">${item.category}</div>
      <h2 class="item-modal-name">${item.subcategory}</h2>
      <p class="item-modal-desc">${item.description || ''}</p>

      <div class="item-attrs">
        <div class="item-attr"><label>Color</label><span>${item.primaryColor}${item.secondaryColor ? ' / ' + item.secondaryColor : ''}</span></div>
        <div class="item-attr"><label>Tone</label><span>${item.colorTone || '—'}</span></div>
        <div class="item-attr"><label>Style</label><span>${item.style}</span></div>
        <div class="item-attr"><label>Pattern</label><span>${item.pattern}</span></div>
        <div class="item-attr"><label>Material</label><span>${item.material || '—'}</span></div>
        <div class="item-attr"><label>Fit</label><span>${item.fit || '—'}</span></div>
        <div class="item-attr"><label>Season</label><span>${(item.season || []).join(', ')}</span></div>
      </div>

        ${(item.occasionTags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>

      <div class="item-modal-actions" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:2rem;">
        <button class="action-btn" data-action="laundry" data-id="${item.id}">🧺 Laundry</button>
        <button class="action-btn" data-action="winter-store" data-id="${item.id}">❄️ Winter Store</button>
        <button class="action-btn" data-action="summer-store" data-id="${item.id}">☀️ Summer Store</button>
        <button class="action-btn secondary" data-action="worn" data-id="${item.id}">👟 Mark as Worn Today</button>
      </div>

      <div class="rec-section">
        <h3 class="rec-title">Pairs Well With</h3>
        <div class="rec-loading">
          <div class="spinner" style="width:20px;height:20px;border-width:2px"></div>
          <span>Finding outfit pairings...</span>
        </div>
        <div class="rec-grid" id="recGrid" style="display:none"></div>
        <p id="recEmpty" style="display:none; color:var(--text-muted); font-style:italic; font-size:0.85rem;">
          Add more items to your closet to get pairing suggestions!
        </p>
      </div>
    </div>
  `;

  itemModalOverlay.classList.add('open');

  // Load recommendations
  try {
    // Use gender from profile
    const gender = userProfile?.gender || 'unisex';
    const { recommendations } = await api.getRecommendations(item.id, gender, currentWeather);
    const recGrid = document.getElementById('recGrid');
    const recLoading = itemModalBody.querySelector('.rec-loading');
    const recEmpty = document.getElementById('recEmpty');

    recLoading.style.display = 'none';

    if (!recommendations || recommendations.length === 0) {
      recEmpty.style.display = 'block';
    } else {
      recGrid.style.display = 'grid';
      recGrid.innerHTML = (recommendations || []).map(rec => `
        <div class="rec-card">
          <img src="${BACKEND_BASE}${rec.imageUrl}" alt="${rec.subcategory}" loading="lazy" />
          <div class="rec-card-info">
            <div class="rec-card-name">${rec.subcategory}</div>
            <div class="rec-score-row">
              <span class="score-tag vis" title="Visual Similarity">V: ${((rec.visualSimilarity || 0) * 100).toFixed(0)}%</span>
              <span class="score-tag logic" title="Logic Compatibility">L: ${((rec.logicScore || 0) * 100).toFixed(0)}%</span>
            </div>
            <div class="rec-card-reason">${rec.reason || 'No reason provided.'}</div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    const recLoading = itemModalBody.querySelector('.rec-loading');
    if (recLoading) recLoading.innerHTML = `<span style="color:var(--red)">Could not load recommendations</span>`;
  }
}

function closeItemModal() {
  itemModalOverlay.classList.remove('open');
}

// ── Search ─────────────────────────────────────────────────────
// ── Search & Visualization ─────────────────────────────────────────
async function handleSearch() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('searchResults');
  const searchBtn = document.getElementById('searchBtn');

  resultsDiv.innerHTML = `
    <div class="searching-indicator">
      <div class="spinner"></div>
      <span>AI is styling your outfit...</span>
    </div>
  `;
  searchBtn.disabled = true;

  try {
    // Use gender from profile
    const gender = userProfile?.gender || 'unisex';
    const data = await api.searchOutfit(query, gender, currentWeather);
    const outfit = data.outfit;
    const message = data.message;

    if (!outfit || !outfit.items || outfit.items.length === 0) {
      resultsDiv.innerHTML = `<div class="search-empty">
        <p>${message || 'No matching items found.'}</p>
        <p style="font-size:0.9rem; margin-top:10px;">Try adding more clothes or adjusting your styling mode!</p>
      </div>`;
      return;
    }

    // Capture IDs for visualization
    const itemIds = (outfit.items || []).map(i => i.id);

    resultsDiv.innerHTML = `
      <div class="outfit-result">
        <div class="outfit-result-header">
          <div class="outfit-result-name">${outfit.outfitName || "Your Curated Look"}</div>
          <div class="visualize-toggle-container">
            <div class="view-tabs">
              <button class="view-tab active" data-view="products">Product View</button>
              <button class="view-tab" data-view="ai-visual">✨ AI Visualizer</button>
            </div>
            <div class="outfit-scores">
              <span class="score-tag vis" title="Visual Cohesion">V: ${((outfit.visualCohesion || 0) * 100).toFixed(0)}%</span>
              <span class="score-tag logic" title="Logical Harmony">L: ${((outfit.logicHarmony || 0) * 100).toFixed(0)}%</span>
            </div>
          </div>
          <p class="outfit-result-reasoning">${outfit.reasoning || "Crafted specifically for your request."}</p>
        </div>

        <div class="outfit-views">
          <div class="outfit-items-grid" id="productGrid">
            ${(outfit.items || []).map(item => `
              <div class="outfit-item-card">
                <img src="${BACKEND_BASE}${item.imageUrl}" alt="${item.subcategory}" onerror="this.src='https://via.placeholder.com/150?text=Error'" />
                <div class="outfit-item-info">
                  <div class="outfit-item-role">${item.role || item.subcategory}</div>
                  <div class="outfit-item-name">${item.subcategory}</div>
                  <button class="action-btn tiny" data-action="worn" data-id="${item.id}" style="margin-top:5px; font-size:0.6rem;">👟 Wear</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="visualize-view" id="aiVisualView" style="display:none">
            <div class="viz-placeholder">
              <div class="spinner"></div>
              <p>Preparing professional visualization...</p>
            </div>
            <img class="viz-image" id="vizImage" src="" alt="Outfit Visualization" style="display:none" />
            <div class="viz-actions" id="vizActions" style="display:none">
              <p class="viz-accuracy-tip">Accuracy: Verified against style vectors.</p>
            </div>
          </div>
          </div>
        </div>
        
        <div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1rem; display: flex; justify-content: flex-end;">
          <button class="btn-primary" data-action="worn-outfit" data-id="${itemIds.join(',')}">👞 Mark Full Outfit Worn</button>
        </div>
      </div>
    `;

    // Attach local listeners to the newly rendered tabs
    const productGrid = resultsDiv.querySelector('#productGrid');
    const aiVisualView = resultsDiv.querySelector('#aiVisualView');
    const tabs = resultsDiv.querySelectorAll('.view-tab');

    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        const view = tab.getAttribute('data-view');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (view === 'products') {
          if (productGrid) productGrid.style.display = 'grid';
          if (aiVisualView) aiVisualView.style.display = 'none';
        } else {
          if (productGrid) productGrid.style.display = 'none';
          if (aiVisualView) aiVisualView.style.display = 'flex';
          
          const vizImage = aiVisualView.querySelector('#vizImage');
          // Only trigger if image is empty or has been reset
          if (!vizImage.src || vizImage.src === window.location.href || vizImage.src.endsWith('/')) {
            await handleVisualize(itemIds, aiVisualView);
          }
        }
      });
    });

  } catch (err) {
    resultsDiv.innerHTML = `<div class="search-empty" style="color:var(--red)">
      <p>❌ Search Failed</p>
      <p style="font-size:0.8rem; margin-top:5px;">${err.message}</p>
    </div>`;
  } finally {
    searchBtn.disabled = false;
  }
}

async function handleVisualize(itemIds, parentEl) {
  const vizPlaceholder = parentEl.querySelector('.viz-placeholder');
  const vizImage = parentEl.querySelector('#vizImage');
  const vizActions = parentEl.querySelector('#vizActions');
  const stylingMode = document.getElementById('stylingMode').value;

  try {
    const { imageUrl } = await api.visualizeOutfit(itemIds, stylingMode, currentWeather);
    
    if (imageUrl) {
      vizImage.src = `${BACKEND_BASE}${imageUrl}`;
      vizImage.onload = () => {
        vizPlaceholder.style.display = 'none';
        vizImage.style.display = 'block';
        vizActions.style.display = 'flex';
      };
    } else {
      throw new Error("No image URL returned from AI.");
    }
  } catch (err) {
    vizPlaceholder.innerHTML = `<p style="color:var(--red); font-size:0.9rem;">❌ Visualization Failed: ${err.message}</p>`;
  }
}

// ── Toast ──────────────────────────────────────────────────────
let toastTimer;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

function updateWeatherWidget(weather) {
  const widget = document.getElementById('weatherWidget');
  if (!weather) return;

  const icons = {
    'Clear sky': '☀️',
    'Mainly clear': '🌤️', 'Partly cloudy': '⛅', 'Overcast': '☁️',
    'Fog': '😶‍🌫️', 'Drizzle': '🌦️', 'Rain': '🌧️', 'Snow': '❄️', 'Thunderstorm': '⛈️'
  };

  const genericCondition = Object.keys(icons).find(key => weather.conditionText.includes(key)) || 'Clear sky';
  
  widget.querySelector('.weather-icon').textContent = icons[genericCondition];
  widget.querySelector('.weather-temp').textContent = `${weather.temp}°C`;
  widget.querySelector('.weather-city').textContent = weather.city;
  widget.style.display = 'flex';
}

// ── Analytics ──────────────────────────────────────────────────
async function loadAnalytics() {
  analyticsContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Crunching the numbers with AI...</p>
    </div>
  `;

  try {
    const data = await api.getAnalytics();
    if (data.success) {
      renderAnalyticsData(data.analytics);
    }
  } catch (err) {
    analyticsContainer.innerHTML = `<p style="color:var(--red); padding:2rem; text-align:center;">❌ Analytics Error: ${err.message}</p>`;
  }
}

function renderAnalyticsData(data) {
  if (data.message) {
    analyticsContainer.innerHTML = `<p style="color:var(--text-muted); padding:2rem; text-align:center;">${data.message}</p>`;
    return;
  }

  const { stats, colors, categories, dormant, topWorn } = data;

  analyticsContainer.innerHTML = `
    <!-- Stats Card -->
    <div class="analytics-card">
      <div class="analytics-card-header">
        <h3 class="analytics-card-title">Closet Overview</h3>
      </div>
      <div class="analytics-stat-grid">
        <div class="stat-item">
          <div class="stat-value">${stats.totalItems}</div>
          <div class="stat-label">Total Items</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.totalWears}</div>
          <div class="stat-label">Total Wears</div>
        </div>
      </div>
    </div>

    <!-- Favorite Colors -->
    <div class="analytics-card">
      <div class="analytics-card-header">
        <h3 class="analytics-card-title">Most Worn Colors</h3>
      </div>
      <div class="chart-list">
        ${Object.entries(colors.worn)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([color, count]) => {
            const percent = stats.totalWears > 0 ? (count / stats.totalWears) * 100 : 0;
            return `
              <div class="chart-row">
                <div class="chart-row-header">
                  <span>${color}</span>
                  <span>${count} wears</span>
                </div>
                <div class="chart-bar-bg">
                  <div class="chart-bar-fill" style="width: ${percent}%"></div>
                </div>
              </div>
            `;
          }).join('') || '<p style="font-size:0.8rem;color:var(--text-muted)">No wear data yet.</p>'}
      </div>
    </div>

    <!-- Top Categories -->
    <div class="analytics-card">
      <div class="analytics-card-header">
        <h3 class="analytics-card-title">Category Usage</h3>
      </div>
      <div class="chart-list">
        ${Object.entries(categories.owned)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, ownedCount]) => {
            const wornCount = categories.worn[cat] || 0;
            const values = Object.values(categories.owned);
            const max = values.length > 0 ? Math.max(...values) : 1;
            const ownedPercent = (ownedCount / max) * 100;
            return `
              <div class="chart-row">
                <div class="chart-row-header">
                  <span>${cat}</span>
                  <span>${ownedCount} owned / ${wornCount} worn</span>
                </div>
                <div class="chart-bar-bg">
                  <div class="chart-bar-fill worn" style="width: ${ownedPercent}%"></div>
                </div>
              </div>
            `;
          }).join('')}
      </div>
    </div>

    <!-- Dormant Items -->
    <div class="analytics-card">
      <div class="analytics-card-header">
        <h3 class="analytics-card-title">Dormant Items</h3>
      </div>
      <div class="dormant-list">
        ${dormant.map(item => `
          <div class="dormant-item">
            <span>${item.name}</span>
            <span class="dormant-reason">${item.reason}</span>
          </div>
        `).join('') || '<p style="font-size:0.8rem;color:var(--accent)">Everything is being worn! Great job.</p>'}
      </div>
    </div>

    <!-- Hall of Fame -->
    <div class="analytics-card">
      <div class="analytics-card-header">
        <h3 class="analytics-card-title">Most Worn Clothes</h3>
      </div>
      <div class="top-worn-grid">
        ${topWorn.map(item => `
          <img class="top-worn-img" src="${BACKEND_BASE}${item.image}" title="${item.name}: ${item.count} wears" />
        `).join('') || '<p style="font-size:0.8rem;color:var(--text-muted)">Keep wearing to see rankings.</p>'}
      </div>
    </div>
  `;
}

// ── Start ──────────────────────────────────────────────────────
init();
