// Firebase Hosting frontend → Railway Flask API, with automatic local fallback for Electron Desktop App.
if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
  window.AOS_AI_API_URL = 'http://localhost:8000/api/chat';
} else {
  window.AOS_AI_API_URL = 'https://aos-ai-operating-sysytem-production.up.railway.app/api/chat';
}
