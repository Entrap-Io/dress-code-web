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

    // Load agenda if URL exists
    if (userProfile?.icalUrl) await loadAgenda();

    // Check for OOTD
    checkOOTD();
    loadWeather();
    
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
  if (viewName === 'ootd') checkOOTD();
  
  // Persistence
  localStorage.setItem('dresscode_view', viewName);
}

async function loadProfile() {
  try {
    userProfile = await api.getProfile();
    updateProfileUI();
    // Refresh agenda if profile updated
    if (userProfile?.icalUrl) loadAgenda();
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
      
      // Ensure lat/lon are numbers if present
      if (updatedProfile.lat) updatedProfile.lat = Number(updatedProfile.lat);
      if (updatedProfile.lon) updatedProfile.lon = Number(updatedProfile.lon);
      // Convert numeric fields
      if (updatedProfile.height) updatedProfile.height = Number(updatedProfile.height);
      if (updatedProfile.weight) updatedProfile.weight = Number(updatedProfile.weight);

      try {
        userProfile = await api.updateProfile(updatedProfile);
        showToast('Profile saved successfully!', 'success');
        updateProfileUI(); // Ensure toggle logic updates
        if (userProfile.icalUrl) loadAgenda();
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
      else if (action === 'feedback') {
        const { type, context, query: q, result, id: itemId } = actionBtn.dataset;
        const feedbackValue = type === 'up' ? 1 : -1;
        
        // Visual feedback
        const container = actionBtn.closest('.feedback-container');
        container.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('active'));
        actionBtn.classList.add('active');

        await api.submitFeedback({
          context,
          query: q,
          result,
          itemId,
          feedback: feedbackValue
        });
        
        showToast(type === 'up' ? 'Thanks! We love it too ✨' : 'Got it. We will improve! 🛠️', 'info');
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
            <div class="feedback-container">
              <span class="feedback-label">Match?</span>
              <button class="feedback-btn up" data-action="feedback" data-type="up" data-context="recommendation" data-id="${rec.itemId}" data-result="${rec.subcategory}" title="Good match!">👍</button>
              <button class="feedback-btn down" data-action="feedback" data-type="down" data-context="recommendation" data-id="${rec.itemId}" data-result="${rec.subcategory}" title="Bad match...">👎</button>
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
            <div class="feedback-container" style="margin-left: auto;">
              <span class="feedback-label">Outfit Goal?</span>
              <button class="feedback-btn up" data-action="feedback" data-type="up" data-context="search" data-query="${query}" data-result="${outfit.outfitName}" title="Nailed it!">👍</button>
              <button class="feedback-btn down" data-action="feedback" data-type="down" data-context="search" data-query="${query}" data-result="${outfit.outfitName}" title="Not quite...">👎</button>
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
                  <div class="rec-score-row" style="margin-top:4px;">
                    <span class="score-tag vis" style="font-size:0.5rem; padding:1px 4px;">V: ${((item.visualSimilarity || 0) * 100).toFixed(0)}%</span>
                    <span class="score-tag logic" style="font-size:0.5rem; padding:1px 4px;">L: ${((item.logicScore || 0) * 100).toFixed(0)}%</span>
                  </div>
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

// ── OOTD (Outfit of the Day) ───────────────────────────────────
function checkOOTD() {
  const saved = localStorage.getItem('dresscode_ootd');
  const now = new Date();
  
  // Get Preferences
  const [prefHour, prefMin] = (userProfile.ootdTime || "21:00").split(':').map(Number);
  const triggerTime = new Date(now);
  triggerTime.setHours(prefHour, prefMin, 0, 0);

  let targetDate = now;
  let isNextDay = false;
  
  if (now >= triggerTime) {
    targetDate = new Date(now);
    targetDate.setDate(now.getDate() + 1);
    isNextDay = true;
  }
  
  const targetDateStr = targetDate.toDateString();

  if (saved) {
    const parsed = JSON.parse(saved);
    // [FIX] Aggressive Invalidation: if it's London stale OR 15C mock OR mentions London in reasoning
    const mentionsLondon = (parsed.outfit?.reasoning || "").includes('London') || (parsed.outfit?.outfitName || "").includes('London');
    if (parsed.city === 'London' || mentionsLondon || (parsed.weather && parsed.weather.temp === 15)) {
      console.log('🚮 Discarding stale/London OOTD');
      localStorage.removeItem('dresscode_ootd');
      generateOOTD(targetDate, isNextDay);
      return;
    }
    
    if (parsed.date === targetDateStr) {
      renderOOTD(parsed.outfit, isNextDay, parsed.weather, parsed.eventsCount);
      return;
    }
  }

  generateOOTD(targetDate, isNextDay);
}

async function generateOOTD(targetDate = new Date(), isNextDay = false) {
  const reasoningEl = document.getElementById('ootdHeroReasoning');
  if (!reasoningEl) return;

  const strategy = userProfile.ootdCountMode || 'single';
  reasoningEl.textContent = `Curating your ${strategy === 'multiple' ? 'outfits' : 'look'} for ${isNextDay ? 'tomorrow' : 'today'}...`;

  try {
    const dateStr = targetDate.toISOString().split('T')[0];
    const lat = userProfile?.lat || null;
    const lon = userProfile?.lon || null;
    const city = userProfile?.location || '';

    // Fetch correctly synced context
    const weather = await api.getWeather(lat, lon, city, dateStr, true);
    const res = await api.getEvents(dateStr);
    const events = res.events || [];

    const effectiveStrategy = (events.length > 0) ? strategy : 'single';
    const eventSummaries = events.map(e => e.summary);

    // Map events to their specific hourly weather for AI precision
    if (weather.hourly && events.length > 0) {
      weather.events = events.map(ev => {
        const hour = new Date(ev.start).getHours();
        const hWeather = weather.hourly[hour] || weather.hourly[12];
        return {
          event: ev.summary,
          time: new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          temp: hWeather.temp,
          condition: hWeather.condition
        };
      });
      console.log(`🧠 AI Context: Mapped ${events.length} events to Ankara hourly weather.`);
    }

    const query = isNextDay 
      ? `curate ${effectiveStrategy === 'multiple' ? 'multiple outfits' : 'a perfect outfit'} for tomorrow (${dateStr}) in ${city} based on schedule: ${eventSummaries.join(', ')} and hourly weather.`
      : `curate ${effectiveStrategy === 'multiple' ? 'multiple outfits' : 'a perfect outfit'} for today (${dateStr}) in ${city} based on schedule: ${eventSummaries.join(', ')} and weather.`;
      
    const searchRes = await api.searchOutfit(query, null, weather);
    
    if (searchRes.success && searchRes.outfit) {
      const ootd = {
        date: targetDate.toDateString(),
        dateStr: dateStr,
        outfit: searchRes.outfit,
        weather: weather,
        eventsCount: events.length,
        strategy: effectiveStrategy,
        city: city
      };
      localStorage.setItem('dresscode_ootd', JSON.stringify(ootd));
      renderOOTD(searchRes.outfit, isNextDay, weather, events.length);
    }
  } catch (err) {
    console.warn('OOTD Generation failed:', err);
    reasoningEl.textContent = "Could not generate OOTD. Please check your connection.";
  }
}

function renderOOTD(outfitData, isNextDay = false, weather = null, eventsCount = 0) {
  const badgeEl = document.getElementById('ootdHeroBadge');
  const nameEl = document.getElementById('ootdHeroName');
  const reasoningEl = document.getElementById('ootdHeroReasoning');
  const itemsEl = document.getElementById('ootdHeroItems');
  const weatherEl = document.getElementById('ootdWeatherInfo');
  const agendaEl = document.getElementById('ootdAgendaInfo');

  if (!badgeEl) return; // Not on the right view yet

  // Handle both single outfit and array of outfits
  const outfits = Array.isArray(outfitData) ? outfitData : [outfitData];
  
  badgeEl.textContent = isNextDay ? "Tomorrow's Sneak Peek" : "Stylist's Pick";
  
  if (weather) {
    let displayTemp = weather.temp;
    let displayCond = weather.conditionText;
    
    // If it's an hourly payload, pick the most relevant hour
    if (weather.hourly && weather.hourly.length > 0) {
      const now = new Date();
      const currentHour = now.getHours();
      // If today, use current hour. If tomorrow, use noon.
      let targetHour = 12; // Default for tomorrow
      if (!isNextDay) {
        // Today logic: if too early, show a more relevant daytime start (e.g. 8:30 AM)
        targetHour = (currentHour < 7) ? 8 : currentHour;
      }
      
      const hourData = weather.hourly[targetHour] || weather.hourly[0];
      displayTemp = hourData.temp;
      displayCond = hourData.condition;
      
      // [ENHANCEMENT] If early morning, show a "Daytime" temp too if requested
      if (!isNextDay && currentHour < 7) {
        const middayData = weather.hourly[12];
        if (middayData) {
          console.log(`🌦️ Early birds: Using 8:30 AM (${displayTemp}C) + Midday (${middayData.temp}C) logic`);
          // Optionally display both if you want to be fancy
          displayTemp = `${displayTemp}° (Day: ${middayData.temp}°)`;
        }
      }
    }
    
    if (displayTemp !== undefined) {
      weatherEl.textContent = `🌡️ ${displayTemp}°C, ${displayCond}`;
    }
  }
  agendaEl.textContent = `📅 ${eventsCount} events scheduled`;

  // Clear and render all outfits
  itemsEl.innerHTML = '';
  nameEl.textContent = outfits.length > 1 ? "Your Scheduled Ensembles" : (outfits[0].outfitName || "Your Daily Ensemble");
  reasoningEl.textContent = outfits.length > 1 ? "I've curated a sequence of looks tailored to your specific events today." : (outfits[0].reasoning || "");

  outfits.forEach((outfit, idx) => {
    const card = document.createElement('div');
    card.className = 'ootd-hero-subcard';
    const itemIds = (outfit.items || []).map(i => i.id);
    
    card.innerHTML = `
      <div class="ootd-subcard-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h3 class="ootd-subcard-title">${outfit.outfitName}</h3>
          <div class="outfit-scores" style="margin-top: 5px;">
            <span class="score-tag vis" title="Visual Cohesion">V: ${((outfit.visualCohesion || 0) * 100).toFixed(0)}%</span>
            <span class="score-tag logic" title="Logical Harmony">L: ${((outfit.logicHarmony || 0) * 100).toFixed(0)}%</span>
          </div>
          <div class="feedback-container">
            <span class="feedback-label">Love it?</span>
            <button class="feedback-btn up" data-action="feedback" data-type="up" data-context="ootd" data-result="${outfit.outfitName}" title="Yes!">👍</button>
            <button class="feedback-btn down" data-action="feedback" data-type="down" data-context="ootd" data-result="${outfit.outfitName}" title="No...">👎</button>
          </div>
          <p class="ootd-subcard-reasoning" style="margin-top: 8px;">${outfit.reasoning}</p>
        </div>
        <button class="btn-viz-ootd" data-ids="${itemIds.join(',')}">✨ Visualize</button>
      </div>
      <div class="ootd-subcard-body">
        <div class="ootd-subcard-items">
          ${(outfit.items || []).map(item => `
            <img src="${BACKEND_BASE}${item.imageUrl || item.image}" class="ootd-item-thumb" title="${item.role || ''}: ${item.subcategory || ''} (V: ${((item.visualSimilarity || 0) * 100).toFixed(0)}%, L: ${((item.logicScore || 0) * 100).toFixed(0)}%)" />
          `).join('')}
        </div>
        <div class="ootd-viz-container" id="viz-container-${idx}">
          <div class="searching-indicator tiny" style="margin:2rem 0;">
            <div class="spinner"></div>
            <span>AI is painting your look...</span>
          </div>
          <img class="ootd-viz-image" style="display:none" />
        </div>
      </div>
    `;

    // Handle visualization for this specific card
    const vizBtn = card.querySelector('.btn-viz-ootd');
    const itemsGrid = card.querySelector('.ootd-subcard-items');
    const vizContainer = card.querySelector('.ootd-viz-container');
    const vizImg = vizContainer.querySelector('img');
    const indicator = vizContainer.querySelector('.searching-indicator');

    vizBtn.onclick = async (e) => {
      e.stopPropagation();
      const isVisible = vizContainer.style.display === 'flex';
      
      if (isVisible) {
        vizContainer.style.display = 'none';
        itemsGrid.style.display = 'flex';
        vizBtn.textContent = '✨ Visualize';
      } else {
        vizContainer.style.display = 'flex';
        itemsGrid.style.display = 'none';
        vizBtn.textContent = '🔙 Back to Items';
        
        if (!vizImg.src) {
          try {
            const gender = userProfile?.gender || 'unisex';
            const { imageUrl } = await api.visualizeOutfit(itemIds, gender, currentWeather);
            vizImg.src = `${BACKEND_BASE}${imageUrl}`;
            vizImg.onload = () => {
              indicator.style.display = 'none';
              vizImg.style.display = 'block';
            };
          } catch (err) {
            indicator.innerHTML = `<span style="color:var(--red)">Failed to visualize</span>`;
          }
        }
      }
    };

    itemsEl.appendChild(card);
  });

  const strategy = userProfile.ootdCountMode || 'single';
  const targetDate = new Date();
  if (isNextDay) targetDate.setDate(targetDate.getDate() + 1);
  const targetDateStr = targetDate.toDateString();

  const strategyBtns = document.querySelectorAll('.strategy-btn');
  strategyBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.strategy === (strategy === 'multiple' ? 'multiple' : 'single'));
    btn.onclick = (e) => {
      e.stopPropagation();
      userProfile.ootdCountMode = btn.dataset.strategy;
      generateOOTD(new Date(targetDateStr), isNextDay);
    };
  });

  document.getElementById('refreshHeroOotdBtn').onclick = () => {
    const now = new Date();
    const [prefHour, prefMin] = (userProfile.ootdTime || "21:00").split(':').map(Number);
    const trigger = new Date(now);
    trigger.setHours(prefHour, prefMin, 0, 0);
    
    let target = now;
    if (now >= trigger) {
      target = new Date(now);
      target.setDate(now.getDate() + 1);
    }
    generateOOTD(target, now >= trigger);
  };

  document.getElementById('markHeroOotdWornBtn').onclick = async () => {
    const outfitItems = outfits.flatMap(o => o.items || []);
    const nowStr = new Date().toISOString();
    
    for (const item of outfitItems) {
      if (item.id) {
        await api.markItemWorn(item.id);
        // Reactive local update
        const localItem = allItems.find(i => i.id === item.id);
        if (localItem) {
          localItem.lastWorn = nowStr;
        }
      }
    }
    showToast('Outfit marked as worn today!', 'success');
    renderCloset();
    renderLaundry();
  };
}

// ── Agenda / Calendar ──────────────────────────────────────────
async function loadAgenda() {
  const widget = document.getElementById('agendaWidget');
  const list = document.getElementById('agendaList');
  if (!widget || !list) return;

  try {
    const res = await api.getTodayEvents();
    const events = res.events || [];
    if (events && events.length > 0) {
      widget.style.display = 'block';
      list.innerHTML = events.map(ev => `
        <div class="agenda-event">
          <span class="time">${new Date(ev.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          <span>${ev.summary}</span>
        </div>
      `).join('');
    } else {
      widget.style.display = 'none';
    }
  } catch (err) {
    console.warn('Could not load agenda:', err.message);
    widget.style.display = 'none';
  }
}

// ── Start ──────────────────────────────────────────────────────
init();

function updateProfileUI() {
  const form = document.getElementById('profileForm');
  if (!form || !userProfile) return;

  // Fill standard inputs
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (userProfile[input.name] !== undefined) {
      input.value = userProfile[input.name];
    }
  });

  // Handle custom selectors (option-cards)
  form.querySelectorAll('.option-card-grid').forEach(grid => {
    const val = userProfile[grid.dataset.selectName];
    if (val) {
      grid.querySelectorAll('.option-card').forEach(c => {
        c.classList.toggle('active', c.dataset.value === val);
      });
      const hidden = grid.querySelector('input[type="hidden"]');
      if (hidden) hidden.value = val;
    }
  });

  const modeSelect = document.getElementById('ootdCountModeSelect');
  const multipleBtn = document.getElementById('heroMultiBtn');

  if (modeSelect) {
    if (!userProfile.icalUrl) {
      modeSelect.value = 'single';
      modeSelect.disabled = true;
      document.getElementById('ootdCountTip').textContent = "⚠️ Sync your calendar to enable Multi-Outfit mode.";
    } else {
      modeSelect.disabled = false;
      document.getElementById('ootdCountTip').textContent = "AI will curate multiple looks if your schedule is busy.";
    }
  }

  if (multipleBtn) {
    multipleBtn.disabled = !userProfile.icalUrl;
    if (!userProfile.icalUrl) {
      multipleBtn.classList.remove('active');
      document.querySelector('[data-strategy="single"]')?.classList.add('active');
    }
  }
}

async function loadWeather() {
  const widget = document.getElementById('weatherWidget');
  if (!widget) return;
  
  try {
    let lat = null, lon = null;

    // Use browser geolocation for "real" local data
    const getPos = () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
    
    try {
      const pos = await getPos();
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
      
      // Critical: Update in-memory profile immediately so OOTD logic has it
      if (userProfile) {
        userProfile.lat = lat;
        userProfile.lon = lon;
      }
      
      console.log(`🌐 Geolocation detected: ${lat}, ${lon}`);
      
      // Attempt reverse geocoding via our backend proxy to avoid CORS
      try {
        const geoRes = await fetch(`${API_BASE}/weather/reverse-geocode?lat=${lat}&lon=${lon}`);
        const geoData = await geoRes.json();
        if (geoData.success && geoData.city) {
          const detectedCity = geoData.city;
          userProfile.location = detectedCity;
          if (document.getElementById('profileLocationInput')) {
            document.getElementById('profileLocationInput').value = detectedCity;
          }
          console.log(`📍 Reverse Geocoded City (Proxy): ${detectedCity}`);
        }
      } catch (e) { console.warn('Reverse geocoding (proxy) failed'); }
      
      // Populate hidden inputs for persistence
      if (document.getElementById('profileLat')) document.getElementById('profileLat').value = lat;
      if (document.getElementById('profileLon')) document.getElementById('profileLon').value = lon;
    } catch (geoErr) {
      console.warn('Geolocation denied or failed, falling back to profile location');
    }

    const city = userProfile?.location || '';
    const data = await api.getWeather(lat, lon, userProfile?.location);
    
    currentWeather = data;
    widget.style.display = 'flex';
    widget.querySelector('.weather-icon').textContent = data.icon;
    widget.querySelector('.weather-temp').textContent = `${data.temp}°C`;
    widget.querySelector('.weather-city').textContent = data.city && data.city !== 'Current Location' ? data.city : 'Ankara';
    
    return data;
  } catch (err) {
    console.warn('Weather fetch failed:', err.message);
    widget.style.display = 'none';
  }
}
