// Utility functions
export const $ = id => document.getElementById(id);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function updateDate() {
  $('g-date').textContent = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export function pdist(touches) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );
}
