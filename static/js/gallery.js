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

  // Load More button
  $('load-more-btn').addEventListener('click', () => {
    fetchBatch();
  });

  // Scroll listener for infinite scroll
  const scrollEl = $('g-scroll');
  scrollEl.addEventListener('scroll', () => {
    const scrollTop = scrollEl.scrollTop;
    const scrollHeight = scrollEl.scrollHeight;
    const clientHeight = scrollEl.clientHeight;
    const scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 300;

    if (scrolledToBottom && !loading && hasMore) {
      fetchBatch();
    }
  }, { passive: true });

  // Intersection observer for sentinel
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !loading && hasMore) {
      fetchBatch();
    }
  }, {rootMargin:'100px'}).observe($('sentinel'));

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

      const r = await fetch(`/api/media?offset=${offset}&limit=24`, {
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
      appendItems(d.items);
      updateGalleryDate();
    }
  } catch(e) {
    console.error('Error loading images:', e);
  } finally {
    loading = false;
    if ($('load-ind')) {
      $('load-ind').style.display = 'none';
    }
    if ($('load-more-btn')) {
      $('load-more-btn').style.display = hasMore ? 'block' : 'none';
    }
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

function appendItems(batch) {
  const grid = $('grid');
  batch.forEach(item => {
    const idx = items.length;
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
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = DEMO
      ? `https://picsum.photos/seed/${item.id+100}/300/300`
      : `/api/thumbnail/${item.id}`;
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
