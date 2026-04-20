// Main initialization
import { updateDate } from './utils.js';
import { initAuth } from './auth.js';
import { initLightbox } from './lightbox.js';
import { cols } from './gallery.js';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Set initial state
  document.documentElement.style.setProperty('--cols', cols);
  updateDate();

  // Initialize modules
  initAuth();
  initLightbox();
});
