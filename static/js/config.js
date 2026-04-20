// Configuration and constants
export const DEMO = !(
  /^192\.168\./.test(location.hostname) ||
  /^10\./.test(location.hostname) ||
  /^172\.(1[6-9]|2[0-9]|3[01])\./.test(location.hostname) ||
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname.endsWith('.local')
);

export const COL_STEPS = [2, 3, 4, 5, 6];
export const SWIPE_THRESHOLD = 50;
