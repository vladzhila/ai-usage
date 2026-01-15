// OpenAI API Dashboard scraper
// Runs on platform.openai.com to scrape billing/usage data

const SCRAPE_DELAY_MS = 2000;
const SCRAPE_INTERVAL_MS = 30000;

function parseAmount(text) {
  if (!text) {
    return null;
  }
  // Extract number from text like "$12.40" or "12.40 USD"
  const match = text.match(/[\d,]+\.?\d*/);
  if (match) {
    return parseFloat(match[0].replace(',', ''));
  }
  return null;
}

function scrapeUsage() {
  // Try multiple selectors
  const selectors = [
    // Usage page specific
    '[data-testid="usage-value"]',
    '.usage-value',
    // Billing page specific
    '[data-testid="billing-total"]',
    '.billing-total',
    // Generic patterns
    '[class*="usage"] [class*="value"]',
    '[class*="billing"] [class*="amount"]',
    // Text content search
    'span:contains("$")',
    'div:contains("Total")',
  ];

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent;
        const amount = parseAmount(text);
        if (amount !== null && amount > 0) {
          return amount;
        }
      }
    } catch {
      // Selector might be invalid, continue
    }
  }

  // Fallback: search all elements for dollar amounts on usage pages
  if (window.location.pathname.includes('usage') || window.location.pathname.includes('billing')) {
    const allText = document.body.innerText;
    const matches = allText.match(/\$[\d,]+\.?\d*/g);
    if (matches && matches.length > 0) {
      // Return the largest amount found (likely total)
      const amounts = matches.map((m) => parseAmount(m)).filter((a) => a !== null);
      if (amounts.length > 0) {
        return Math.max(...amounts);
      }
    }
  }

  return null;
}

function sendUsageToBackground(spend) {
  chrome.runtime.sendMessage({
    type: 'UPDATE_API_SPEND',
    service: 'openaiApi',
    spend,
  });
  console.log('[AI Usage Tracker] OpenAI API spend updated:', spend);
}

function attemptScrape() {
  const spend = scrapeUsage();
  if (spend !== null) {
    sendUsageToBackground(spend);
  }
}

// Initial scrape after page loads
setTimeout(attemptScrape, SCRAPE_DELAY_MS);

// Periodic scrape in case of dynamic updates
setInterval(attemptScrape, SCRAPE_INTERVAL_MS);

// Also scrape on visibility change (user switches back to tab)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    setTimeout(attemptScrape, 500);
  }
});

console.log('[AI Usage Tracker] OpenAI dashboard scraper initialized');
