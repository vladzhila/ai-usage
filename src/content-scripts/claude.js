// Claude message tracking via fetch interception
// Runs on claude.ai

const CONVERSATION_ENDPOINTS = [
  '/api/organizations/',
  '/api/append_message',
  '/api/chat_conversations/',
];

const MESSAGE_INDICATORS = ['chat_conversations', 'completion', 'append_message'];

// Track already counted request IDs to avoid duplicates
const countedRequests = new Set();

// Intercept fetch to detect conversation requests
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const [url, options] = args;
  const urlString = typeof url === 'string' ? url : url?.url || '';

  // Only count POST requests to conversation-related endpoints
  const isConversationEndpoint = CONVERSATION_ENDPOINTS.some((endpoint) =>
    urlString.includes(endpoint)
  );
  const hasMessageIndicator = MESSAGE_INDICATORS.some((indicator) => urlString.includes(indicator));
  const isPost = options?.method === 'POST';

  const isConversation = isPost && isConversationEndpoint && hasMessageIndicator;

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
        service: 'claude',
      });

      console.log('[AI Usage Tracker] Claude message counted');
    }
  }

  return originalFetch.apply(this, args);
};

console.log('[AI Usage Tracker] Claude tracking initialized');
