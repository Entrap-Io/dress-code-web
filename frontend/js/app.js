// ─── DRESS-CODE APP ───────────────────────────────────────────
// BACKEND_BASE is already defined in api.js

// ── State ──────────────────────────────────────────────────────
let currentFilter = 'all';
let allItems = [];
let currentWeather = null;

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
  try {
    console.log('💎 App Init Starting...');
    await loadItems();
  } catch (err) {
    console.error('💥 Critical Load Error:', err);
  } finally {
    setupEventListeners();
    console.log('✅ UI Event Listeners Ready');
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

  closetGrid.innerHTML = (filtered || []).map(item => `
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
    const stylingMode = document.getElementById('stylingMode').value;
    const { recommendations } = await api.getRecommendations(item.id, stylingMode, currentWeather);
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
    const stylingMode = document.getElementById('stylingMode').value;
    const data = await api.searchOutfit(query, stylingMode, currentWeather);
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

// ── Start ──────────────────────────────────────────────────────
init();
