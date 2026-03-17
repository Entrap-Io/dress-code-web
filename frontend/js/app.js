// ─── DRESS-CODE APP ───────────────────────────────────────────
const BACKEND_BASE = 'http://localhost:3001';

// ── State ──────────────────────────────────────────────────────
let currentFilter = 'all';
let allItems = [];

// ── DOM refs ───────────────────────────────────────────────────
const closetGrid = document.getElementById('closetGrid');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');

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
  await loadItems();
  setupEventListeners();
}

async function loadItems() {
  try {
    // Try server first, fall back to local DB
    const serverItems = await api.getItems();
    await syncItemsFromServer(serverItems);
    allItems = serverItems;
  } catch {
    // Server might be down — use cached local items
    allItems = await getLocalItems();
  }
  renderCloset();
}

// ── Render Closet ──────────────────────────────────────────────
function renderCloset(filter = currentFilter) {
  const filtered = filter === 'all'
    ? allItems
    : allItems.filter(item => item.category === filter);

  // Update count
  itemCount.textContent = `${allItems.length} item${allItems.length !== 1 ? 's' : ''}`;

  // Empty state
  if (allItems.length === 0) {
    closetGrid.innerHTML = '';
    emptyState.classList.add('visible');
    return;
  }
  emptyState.classList.remove('visible');

  if (filtered.length === 0) {
    closetGrid.innerHTML = `<p style="color:var(--text-muted); font-style:italic; padding:2rem 0;">No items in this category yet.</p>`;
    return;
  }

  closetGrid.innerHTML = filtered.map(item => `
    <div class="item-card" data-id="${item.id}">
      <img
        class="item-card-img"
        src="${BACKEND_BASE}${item.imageUrl}"
        alt="${item.subcategory}"
      />
      <div class="item-card-body">
        <div class="item-card-sub">${item.subcategory || item.category}</div>
        <div class="item-card-meta">${item.primaryColor}${item.secondaryColor ? ' · ' + item.secondaryColor : ''}</div>
        <div class="item-card-tags">
          <span class="tag style">${item.style}</span>
          ${(item.occasionTags || []).slice(0, 2).map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
      <button class="item-card-delete" data-delete="${item.id}" title="Remove item">✕</button>
    </div>
  `).join('');
}

// ── Event Listeners ────────────────────────────────────────────
function setupEventListeners() {
  // View navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${target}`).classList.add('active');
    });
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
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

  // Closet grid — delegate clicks for card open and delete
  closetGrid.addEventListener('click', e => {
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
      useT2I: document.getElementById('optT2I').checked
    };

    // Upload raw file + options — backend handles background removal + AI analysis
    const item = await api.uploadItem(selectedFile, options);
    await saveItemLocally(item);
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
    await removeItemLocally(itemId);
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

      <div class="item-card-tags" style="margin-bottom:1.5rem">
        ${(item.occasionTags || []).map(t => `<span class="tag">${t}</span>`).join('')}
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
    const { recommendations } = await api.getRecommendations(itemId);
    const recGrid = document.getElementById('recGrid');
    const recLoading = itemModalBody.querySelector('.rec-loading');
    const recEmpty = document.getElementById('recEmpty');

    recLoading.style.display = 'none';

    if (recommendations.length === 0) {
      recEmpty.style.display = 'block';
    } else {
      recGrid.style.display = 'grid';
      recGrid.innerHTML = recommendations.map(rec => `
        <div class="rec-card">
          <img src="${BACKEND_BASE}${rec.imageUrl}" alt="${rec.subcategory}" loading="lazy" />
          <div class="rec-card-info">
            <div class="rec-card-name">${rec.subcategory}</div>
            <div class="rec-card-reason">${rec.reason}</div>
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
async function handleSearch() {
  const query = document.getElementById('searchInput').value.trim();
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
    const { outfit, message } = await api.searchOutfit(query);

    if (!outfit || outfit.items.length === 0) {
      resultsDiv.innerHTML = `<p class="search-empty">${message || 'No matching items found. Try adding more clothes!'}</p>`;
      return;
    }

    resultsDiv.innerHTML = `
      <div class="outfit-result">
        <div class="outfit-result-header">
          <div class="outfit-result-name">${outfit.name}</div>
          <p class="outfit-result-reasoning">${outfit.reasoning}</p>
        </div>
        <div class="outfit-items-grid">
          ${outfit.items.map(item => `
            <div class="outfit-item-card">
              <img src="${BACKEND_BASE}${item.imageUrl}" alt="${item.subcategory}" loading="lazy" />
              <div class="outfit-item-info">
                <div class="outfit-item-role">${item.role}</div>
                <div class="outfit-item-name">${item.subcategory}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    resultsDiv.innerHTML = `<p class="search-empty" style="color:var(--red)">❌ ${err.message}</p>`;
  } finally {
    searchBtn.disabled = false;
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

// ── Start ──────────────────────────────────────────────────────
init();
