/**
 * Web Scraper for Meta Pixel & Tech Stack Detection
 */

export async function checkWebsiteTechStack(url: string): Promise<{
  hasMetaPixel: boolean;
  hasGoogleAnalytics: boolean;
  isShopify: boolean;
  isWordPress: boolean;
  scrapedSuccessfully: boolean;
}> {
  // Ensure protocol
  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const result = {
    hasMetaPixel: false,
    hasGoogleAnalytics: false,
    isShopify: false,
    isWordPress: false,
    scrapedSuccessfully: false
  };

  try {
    // We use a short timeout because local business sites can be very slow or dead
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return result;
    }

    const html = await response.text();
    result.scrapedSuccessfully = true;

    // Detect Meta/Facebook Pixel
    if (html.includes('fbevents.js') || html.includes('fbq(') || html.includes('connect.facebook.net/en_US/fbevents.js')) {
      result.hasMetaPixel = true;
    }

    // Detect Google Analytics / Tag Manager
    if (html.includes('gtag(') || html.includes('googletagmanager.com') || html.includes('google-analytics.com/analytics.js')) {
      result.hasGoogleAnalytics = true;
    }

    // Detect Shopify
    if (html.includes('cdn.shopify.com') || html.includes('Shopify.shop')) {
      result.isShopify = true;
    }

    // Detect WordPress
    if (html.includes('wp-content') || html.includes('wp-includes')) {
      result.isWordPress = true;
    }

    return result;
  } catch (error) {
    console.warn(`[Enrichment] Failed to scrape website ${targetUrl}:`, error);
    return result;
  }
}
