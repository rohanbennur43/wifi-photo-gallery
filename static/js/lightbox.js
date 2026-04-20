// Lightbox module
import { $ } from './utils.js';
import { DEMO, SWIPE_THRESHOLD } from './config.js';
import { items } from './gallery.js';

// State
let lbIdx = 0;
let lbTimer = null;
let lbUiVisible = false;
let lbZoom = { scale: 1, x: 0, y: 0, pinchDist: 0, lastTap: 0 };
let lbTouchStart = null;
let lbTouchCurrent = null;
let lbDragging = false;

export function initLightbox() {
  // Close button
  $('lb-close').addEventListener('click', e => {
    e.stopPropagation();
    closeLb();
  });

  // Tap anywhere to toggle UI
  $('lb-stage').addEventListener('click', e => {
    if (!$('lightbox').classList.contains('open')) return;
    if (e.target.tagName === 'VIDEO') return;
    toggleLbUI();
  });

  // Touch swipe handlers
  $('lb-stage').addEventListener('touchstart', handleTouchStart, {passive: true});
  $('lb-stage').addEventListener('touchmove', handleTouchMove, {passive: true});
  $('lb-stage').addEventListener('touchend', handleTouchEnd, {passive: true});

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!$('lightbox').classList.contains('open')) return;
    if (e.key === 'ArrowLeft') navLb(-1);
    if (e.key === 'ArrowRight') navLb(1);
    if (e.key === 'Escape') closeLb();
  });
}

export function openLb(idx) {
  lbIdx = idx;
  resetZoom();
  buildLb();
  $('lightbox').classList.add('open');
  showLbUI();
  prefetchAdjacentImages();
}

function buildLb() {
  const track = $('lb-track');
  track.classList.remove('animating');
  track.style.transform='';
  track.innerHTML='';
  resetZoom();

  [-1,0,1].forEach(d => {
    const i = lbIdx+d;
    const slide = document.createElement('div');
    slide.className='lb-slide';
    slide.dataset.index = i;

    if (i>=0 && i<items.length) {
      const item = items[i];
      if (item.is_video) {
        const v = document.createElement('video');
        v.src = DEMO ? 'https://www.w3schools.com/html/mov_bbb.mp4' : `/api/view/${item.id}`;
        v.controls=v.loop=v.playsInline=true;
        if (d===0) { v.autoplay=true; v.play().catch(()=>{}); }
        slide.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = DEMO
          ? `https://picsum.photos/seed/${item.id+100}/1200/1600`
          : `/api/view/${item.id}`;
        img.alt=item.name;
        img.draggable=false;

        if (d === 0) {
          setupImageZoom(img);
        }
        slide.appendChild(img);
      }
    }
    track.appendChild(slide);
  });

  track.style.transform='translateX(-100%)';
  $('lb-count').textContent = `${lbIdx+1} of ${items.length}`;
}

function prefetchAdjacentImages() {
  [-1, 1].forEach(d => {
    const i = lbIdx + d;
    if (i >= 0 && i < items.length && !items[i].is_video) {
      const img = new Image();
      img.src = DEMO
        ? `https://picsum.photos/seed/${items[i].id+100}/1200/1600`
        : `/api/view/${items[i].id}`;
    }
  });
}

function navLb(dir) {
  const nx = lbIdx+dir;
  if (nx<0||nx>=items.length) return;

  $('lb-track').querySelectorAll('video').forEach(v=>v.pause());
  const t=$('lb-track');
  t.classList.add('animating');
  t.style.transform = dir>0 ? 'translateX(-200%)' : 'translateX(0%)';

  setTimeout(() => {
    lbIdx=nx;
    buildLb();
    showLbUI();
    prefetchAdjacentImages();
  }, 350);
}

function resetZoom() {
  lbZoom = { scale: 1, x: 0, y: 0, pinchDist: 0, lastTap: 0 };
}

function applyZoom(img, smooth = false) {
  const { scale, x, y } = lbZoom;

  if (smooth) {
    img.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
  } else {
    img.style.transition = 'none';
  }

  img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function setupImageZoom(img) {
  let isPinching = false;
  let isDragging = false;
  let startDist = 0;
  let startScale = 1;
  let startX = 0, startY = 0;
  let lastX = 0, lastY = 0;

  // Double tap to zoom
  img.addEventListener('click', e => {
    const now = Date.now();
    if (now - lbZoom.lastTap < 300) {
      e.stopPropagation();
      if (lbZoom.scale > 1) {
        lbZoom.scale = 1;
        lbZoom.x = 0;
        lbZoom.y = 0;
      } else {
        lbZoom.scale = 2.5;
        const rect = img.getBoundingClientRect();
        const clickX = e.clientX - rect.left - rect.width / 2;
        const clickY = e.clientY - rect.top - rect.height / 2;
        lbZoom.x = -clickX * 0.5;
        lbZoom.y = -clickY * 0.5;
      }
      applyZoom(img, true);
    }
    lbZoom.lastTap = now;
  });

  // Pinch to zoom
  img.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      e.stopPropagation();
      isPinching = true;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      startDist = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      startScale = lbZoom.scale;
    } else if (e.touches.length === 1 && lbZoom.scale > 1) {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = lbZoom.x;
      lastY = lbZoom.y;
    }
  }, { passive: false });

  img.addEventListener('touchmove', e => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      e.stopPropagation();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      lbZoom.scale = Math.max(1, Math.min(4, startScale * (dist / startDist)));
      if (lbZoom.scale <= 1) {
        lbZoom.x = 0;
        lbZoom.y = 0;
      }
      applyZoom(img);
    } else if (isDragging && e.touches.length === 1 && lbZoom.scale > 1) {
      e.preventDefault();
      e.stopPropagation();
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      const maxX = (img.offsetWidth * (lbZoom.scale - 1)) / 2;
      const maxY = (img.offsetHeight * (lbZoom.scale - 1)) / 2;

      lbZoom.x = Math.max(-maxX, Math.min(maxX, lastX + dx));
      lbZoom.y = Math.max(-maxY, Math.min(maxY, lastY + dy));
      applyZoom(img);
    }
  }, { passive: false });

  img.addEventListener('touchend', e => {
    if (isPinching || isDragging) {
      if (e.cancelable) e.stopPropagation();
    }
    if (e.touches.length < 2) {
      isPinching = false;
    }
    if (e.touches.length === 0) {
      isDragging = false;
    }
  }, { passive: true });
}

function showLbUI() {
  lbUiVisible = true;
  $('lb-close').classList.add('visible');
  $('lb-count').classList.add('visible');
  clearTimeout(lbTimer);
  lbTimer = setTimeout(() => {
    lbUiVisible = false;
    $('lb-close').classList.remove('visible');
    $('lb-count').classList.remove('visible');
  }, 2500);
}

function toggleLbUI() {
  if (lbUiVisible) {
    clearTimeout(lbTimer);
    lbUiVisible = false;
    $('lb-close').classList.remove('visible');
    $('lb-count').classList.remove('visible');
  } else {
    showLbUI();
  }
}

function closeLb() {
  $('lb-track').querySelectorAll('video').forEach(v=>v.pause());
  $('lightbox').classList.remove('open');
  clearTimeout(lbTimer);
  lbUiVisible = false;

  lbTouchStart = null;
  lbTouchCurrent = null;
  lbDragging = false;
  resetZoom();

  const track = $('lb-track');
  track.classList.remove('animating');
  track.style.transform = '';

  $('g-scroll').style.overflow = 'hidden';
  $('g-scroll').offsetHeight;
  $('g-scroll').style.overflow = '';
}

// Touch handlers for swipe navigation
function handleTouchStart(e) {
  if (!$('lightbox').classList.contains('open')) return;
  if (e.target.tagName === 'VIDEO') return;
  if (lbZoom.scale > 1) return;
  if (e.touches.length !== 1) return;

  lbTouchStart = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY,
    time: Date.now()
  };
  lbTouchCurrent = {...lbTouchStart};
  lbDragging = false;
}

function handleTouchMove(e) {
  if (!$('lightbox').classList.contains('open')) return;
  if (!lbTouchStart || e.target.tagName === 'VIDEO') return;
  if (lbZoom.scale > 1) return;
  if (e.touches.length !== 1) return;

  lbTouchCurrent = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };

  const dx = lbTouchCurrent.x - lbTouchStart.x;
  const dy = lbTouchCurrent.y - lbTouchStart.y;

  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
    lbDragging = true;
    const track = $('lb-track');
    track.classList.remove('animating');
    let offset = -100 + (dx / window.innerWidth * 100);

    if ((lbIdx === 0 && dx > 0) || (lbIdx === items.length - 1 && dx < 0)) {
      offset = -100 + (dx / window.innerWidth * 30);
    }

    track.style.transform = `translateX(${offset}%)`;
  }
}

function handleTouchEnd(e) {
  if (!$('lightbox').classList.contains('open')) {
    lbTouchStart = null;
    lbTouchCurrent = null;
    lbDragging = false;
    return;
  }

  if (!lbTouchStart) return;

  const dx = lbTouchCurrent.x - lbTouchStart.x;
  const dy = lbTouchCurrent.y - lbTouchStart.y;
  const dt = Date.now() - lbTouchStart.time;
  const velocityX = Math.abs(dx) / dt;
  const velocityY = Math.abs(dy) / dt;

  // Swipe down to close
  if (lbZoom.scale <= 1 && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
    const shouldClose = dy > 60 || (velocityY > 0.4 && dy > 30);
    if (shouldClose) {
      closeLb();
      lbTouchStart = null;
      lbTouchCurrent = null;
      lbDragging = false;
      return;
    }
  }

  // Horizontal swipe for navigation
  if (lbZoom.scale <= 1 && lbDragging && Math.abs(dx) > Math.abs(dy)) {
    const threshold = velocityX > 0.3 ? 50 : 100;

    if (Math.abs(dx) > threshold) {
      navLb(dx < 0 ? 1 : -1);
    } else {
      const track = $('lb-track');
      track.classList.add('animating');
      track.style.transform = 'translateX(-100%)';
    }
  }

  lbTouchStart = null;
  lbTouchCurrent = null;
  lbDragging = false;
}
