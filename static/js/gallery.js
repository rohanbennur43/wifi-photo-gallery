// Gallery module
import { $, sleep, updateDate, pdist } from './utils.js';
import { DEMO, COL_STEPS } from './config.js';
import { openLb } from './lightbox.js';

// State
export let items = [];
export let total = 0;
let offset = 0;
let loading = false;
let hasMore = true;
export let cols = +(localStorage.getItem('g_cols') || 3);

// Demo data
const DEMO_POOL = Array.from({length:72}, (_,i) => ({
  id: i+1,
  name: (i%7===0) ? `VID_${String(i+1).padStart(4,'0')}.MP4`
                  : `IMG_${String(4200+i).padStart(4,'0')}.HEIC`,
  is_video: i%7===0,
  mtime: Date.now()/1000 - i*5400,
  _dur: `0:${String(6+(i%52)).padStart(2,'0')}`
}));

export function startGallery() {
  // Reset state to ensure fresh start
  loading = false;
  hasMore = true;
  offset = 0;
  items = [];
  total = 0;
  $('grid').innerHTML = '';

  $('gallery').classList.add('visible');
  fetchBatch();
  setupZoomButtons();
  setupPinchZoom();

  // Scroll listener for infinite scroll - very aggressive on WiFi
  const scrollEl = $('g-scroll');
  scrollEl.addEventListener('scroll', () => {
    const scrollTop = scrollEl.scrollTop;
    const scrollHeight = scrollEl.scrollHeight;
    const clientHeight = scrollEl.clientHeight;
    // Trigger when 1500px from bottom (load next batch very early)
    const scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 1500;

    if (scrolledToBottom && !loading && hasMore) {
      fetchBatch();
    }
  }, { passive: true });

  // Intersection observer for sentinel - extremely aggressive prefetch
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !loading && hasMore) {
      fetchBatch();
    }
  }, {rootMargin:'1000px'}).observe($('sentinel'));

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));
}

async function fetchBatch() {
  if (loading || !hasMore) return;
  loading = true;
  try {
    if (DEMO) {
      await fetchDemo();
    } else {
      const token = localStorage.getItem('auth_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const r = await fetch(`/api/media?offset=${offset}&limit=500`, {
        credentials: 'same-origin',
        headers
      });
      if (r.status === 401) {
        // Session expired - show login again
        localStorage.removeItem('auth_token');
        loading = false;
        $('gallery').classList.remove('visible');
        $('login').classList.remove('out');
        $('login').style.display = 'flex';
        return;
      }
      const d = await r.json();
      total = d.total;
      hasMore = d.hasMore;
      offset += d.items.length;
      await appendItems(d.items);
      updateGalleryDate();
    }
  } catch(e) {
    console.error('Error loading images:', e);
  } finally {
    loading = false;
  }
}

async function fetchDemo() {
  await sleep(160);
  const batch = DEMO_POOL.slice(items.length, items.length+30);
  total = 72;
  hasMore = items.length+batch.length < 72;
  appendItems(batch);
  updateGalleryDate();
}

// Batch fetch thumbnails (50 at a time for WiFi performance)
const thumbnailCache = new Map();

async function fetchThumbnailsBatch(ids) {
  if (DEMO) return; // Demo uses picsum.photos URLs

  const token = localStorage.getItem('auth_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const idsStr = ids.join(',');
  const r = await fetch(`/api/thumbnails/batch?ids=${idsStr}`, {
    credentials: 'same-origin',
    headers
  });

  if (r.ok) {
    const data = await r.json();
    // Cache thumbnails
    Object.entries(data.thumbnails).forEach(([id, base64]) => {
      thumbnailCache.set(parseInt(id), `data:image/jpeg;base64,${base64}`);
    });
  }
}

async function appendItems(batch) {
  const grid = $('grid');
  const startIdx = items.length;

  // Prefetch thumbnails in batches of 50
  if (!DEMO) {
    const ids = batch.map(item => item.id);
    const BATCH_SIZE = 50;
    const batchPromises = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
      batchPromises.push(fetchThumbnailsBatch(batchIds));
    }

    // Fetch all batches in parallel
    await Promise.all(batchPromises);
  }

  // Now render with cached thumbnails
  batch.forEach((item, i) => {
    const idx = startIdx + i;
    items.push(item);
    const el = document.createElement('div');
    el.className = 'thumb';
    el.dataset.i = idx;
    el.style.background = '#1c1c1e';

    const img = document.createElement('img');
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    img.decoding = 'async';

    // Use cached thumbnail or fallback to API
    if (thumbnailCache.has(item.id)) {
      img.src = thumbnailCache.get(item.id);
    } else {
      img.loading = 'eager';
      img.src = DEMO
        ? `https://picsum.photos/seed/${item.id+100}/400/400`
        : `/api/thumbnail/${item.id}`;
    }
    img.alt = item.name;

    el.appendChild(img);

    if (item.is_video) {
      const b = document.createElement('div');
      b.className = 'vid-badge';
      b.innerHTML = `<svg width="9" height="10" viewBox="0 0 9 10" fill="white" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.9))"><polygon points="0,0 9,5 0,10"/></svg><span>${item._dur||'0:07'}</span>`;
      el.appendChild(b);
    }

    el.addEventListener('click', () => openLb(idx));
    grid.appendChild(el);
  });
}

function updateGalleryDate() {
  if (!items.length) return;
  const d = new Date(items[0].mtime*1000);
  $('g-date').textContent = d.toLocaleDateString('en-US', {
    month:'long',
    day:'numeric',
    year:'numeric'
  });
}

// Grid zoom controls
function setCols(n) {
  cols = n;
  document.documentElement.style.setProperty('--cols', cols);
  localStorage.setItem('g_cols', cols);
  updateZoomButtons();
}

function updateZoomButtons() {
  $('zoom-out').disabled = cols >= COL_STEPS[COL_STEPS.length - 1];
  $('zoom-in').disabled = cols <= COL_STEPS[0];
}

function setupZoomButtons() {
  const grid = $('grid');

  $('zoom-in').addEventListener('click', () => {
    const idx = COL_STEPS.indexOf(cols);
    if (idx > 0) {
      grid.classList.add('transitioning');
      setCols(COL_STEPS[idx - 1]);
      setTimeout(() => grid.classList.remove('transitioning'), 200);
    }
  });

  $('zoom-out').addEventListener('click', () => {
    const idx = COL_STEPS.indexOf(cols);
    if (idx < COL_STEPS.length - 1) {
      grid.classList.add('transitioning');
      setCols(COL_STEPS[idx + 1]);
      setTimeout(() => grid.classList.remove('transitioning'), 200);
    }
  });

  updateZoomButtons();
}

function setupPinchZoom() {
  const scr = $('g-scroll');
  const grid = $('grid');
  let d0 = null, c0 = cols;
  let isPinching = false;

  scr.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      d0 = pdist(e.touches);
      c0 = cols;
      isPinching = true;
      grid.classList.remove('transitioning');
    }
  }, {passive: true});

  scr.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !d0 || !isPinching) return;

    const currentDist = pdist(e.touches);
    const ratio = d0 / currentDist;
    const targetCols = c0 * ratio;

    const s = COL_STEPS.reduce((a, b) =>
      Math.abs(b - targetCols) < Math.abs(a - targetCols) ? b : a
    );

    if (s !== cols) {
      cols = s;
      document.documentElement.style.setProperty('--cols', cols);
      localStorage.setItem('g_cols', cols);
      updateZoomButtons();
    }
  }, {passive: true});

  scr.addEventListener('touchend', e => {
    if (e.touches.length < 2 && isPinching) {
      isPinching = false;
      d0 = null;
      grid.classList.add('transitioning');
      setTimeout(() => {
        grid.classList.remove('transitioning');
      }, 200);
    }
  }, {passive: true});
}
