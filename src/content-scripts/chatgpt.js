// ChatGPT message tracking via fetch interception
// Runs on chat.openai.com and chatgpt.com

const CONVERSATION_ENDPOINTS = ['/backend-api/conversation', '/backend-api/sentinel/chat-'];

// Track already counted request IDs to avoid duplicates
const countedRequests = new Set();

// Intercept fetch to detect conversation requests
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const [url, options] = args;
  const urlString = typeof url === 'string' ? url : url?.url || '';

  // Only count POST requests to conversation endpoints
  const isConversation =
    options?.method === 'POST' &&
    CONVERSATION_ENDPOINTS.some((endpoint) => urlString.includes(endpoint));

  if (isConversation) {
    // Generate unique ID from URL and timestamp
    const requestId = `${urlString}-${Date.now()}`;

    if (!countedRequests.has(requestId)) {
      countedRequests.add(requestId);

      // Clean old entries (keep last 100)
      if (countedRequests.size > 100) {
        const entries = Array.from(countedRequests);
        entries.slice(0, 50).forEach((id) => countedRequests.delete(id));
      }

      // Send message to service worker to increment count
      chrome.runtime.sendMessage({
        type: 'INCREMENT_COUNT',
        service: 'chatgpt',
      });

      console.log('[AI Usage Tracker] ChatGPT message counted');
    }
  }

  return originalFetch.apply(this, args);
};

console.log('[AI Usage Tracker] ChatGPT tracking initialized');
