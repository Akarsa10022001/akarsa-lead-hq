/**
 * Intent Detector — Layer 9
 * Detects buying intent signals by searching Google (SerpAPI) and DuckDuckGo
 * for hiring posts, recent news, funding, and review complaints.
 * 
 * SerpAPI: Primary (100 free searches/month) — more accurate
 * DuckDuckGo: Fallback (unlimited) — always available
 */

export interface IntentSignal {
  signal_type: 'hiring' | 'funding' | 'expansion' | 'complaint' | 'news' | 'social_growth';
  evidence_text: string;
  confidence: number; // 0-100
  source_url?: string;
}

export interface IntentResult {
  signals: IntentSignal[];
  intent_score: number; // 0-25 (contribution to composite score)
  raw_snippets: string[];
}

// Keywords that indicate buying intent
const HIRING_KEYWORDS = [
  'hiring', 'job opening', 'we are looking for', 'vacancy', 'join our team',
  'social media manager', 'marketing manager', 'digital marketing', 'content creator',
  'graphic designer', 'web developer', 'seo specialist'
];

const GROWTH_KEYWORDS = [
  'funding', 'raised', 'investment', 'series a', 'series b', 'seed round',
  'new office', 'expanding', 'launched', 'new location', 'partnership',
  'milestone', 'award', 'recognition'
];

const COMPLAINT_KEYWORDS = [
  'no website', 'bad website', 'slow website', 'outdated', 'can\'t find online',
  'no social media', 'never responds', 'not active', 'dead page',
  'no online presence', 'impossible to find'
];

async function searchSerpAPI(query: string): Promise<{ snippets: string[]; urls: string[] }> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return { snippets: [], urls: [] };

  try {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { snippets: [], urls: [] };
    
    const data = await res.json();
    const results = data.organic_results || [];
    
    return {
      snippets: results.map((r: any) => `${r.title || ''} ${r.snippet || ''}`).filter(Boolean),
      urls: results.map((r: any) => r.link).filter(Boolean)
    };
  } catch (e) {
    console.warn('[IntentDetector] SerpAPI failed:', e);
    return { snippets: [], urls: [] };
  }
}

async function searchDuckDuckGo(query: string): Promise<{ snippets: string[]; urls: string[] }> {
  try {
    // DuckDuckGo Instant Answer API (free, no key needed)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { snippets: [], urls: [] };
    
    const data = await res.json();
    const snippets: string[] = [];
    const urls: string[] = [];

    if (data.Abstract) snippets.push(data.Abstract);
    if (data.AbstractURL) urls.push(data.AbstractURL);
    
    // Related topics often contain useful signals
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) snippets.push(topic.Text);
        if (topic.FirstURL) urls.push(topic.FirstURL);
      }
    }

    return { snippets, urls };
  } catch (e) {
    console.warn('[IntentDetector] DuckDuckGo failed:', e);
    return { snippets: [], urls: [] };
  }
}

function detectSignals(snippets: string[], urls: string[]): IntentSignal[] {
  const signals: IntentSignal[] = [];
  const combinedText = snippets.join(' ').toLowerCase();

  // Hiring signals
  for (const keyword of HIRING_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      const matchingSnippet = snippets.find(s => s.toLowerCase().includes(keyword));
      signals.push({
        signal_type: 'hiring',
        evidence_text: `Hiring signal detected: "${keyword}" found in search results. ${matchingSnippet ? `Context: "${matchingSnippet.substring(0, 120)}..."` : ''}`,
        confidence: 75,
        source_url: urls[0]
      });
      break; // One hiring signal is enough
    }
  }

  // Growth/funding signals
  for (const keyword of GROWTH_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      const matchingSnippet = snippets.find(s => s.toLowerCase().includes(keyword));
      signals.push({
        signal_type: combinedText.includes('funding') || combinedText.includes('raised') ? 'funding' : 'expansion',
        evidence_text: `Growth signal: "${keyword}" detected. ${matchingSnippet ? `Context: "${matchingSnippet.substring(0, 120)}..."` : ''}`,
        confidence: 60,
        source_url: urls[0]
      });
      break;
    }
  }

  // Complaint signals (from reviews)
  for (const keyword of COMPLAINT_KEYWORDS) {
    if (combinedText.includes(keyword)) {
      signals.push({
        signal_type: 'complaint',
        evidence_text: `Pain point detected in reviews/search: "${keyword}" — potential need for digital services`,
        confidence: 50,
        source_url: urls[0]
      });
      break;
    }
  }

  return signals;
}

export async function detectIntent(companyName: string, location: string): Promise<IntentResult> {
  const queries = [
    `"${companyName}" hiring marketing`,
    `"${companyName}" ${location} news`,
    `"${companyName}" reviews complaints`
  ];

  let allSnippets: string[] = [];
  let allUrls: string[] = [];

  // Try SerpAPI first (more accurate), then DuckDuckGo as fallback
  for (const query of queries) {
    const serpResult = await searchSerpAPI(query);
    if (serpResult.snippets.length > 0) {
      allSnippets.push(...serpResult.snippets);
      allUrls.push(...serpResult.urls);
    } else {
      // Fallback to DuckDuckGo
      const ddgResult = await searchDuckDuckGo(query);
      allSnippets.push(...ddgResult.snippets);
      allUrls.push(...ddgResult.urls);
    }
  }

  const signals = detectSignals(allSnippets, allUrls);

  // Calculate intent score (max 25)
  let intent_score = 0;
  for (const signal of signals) {
    switch (signal.signal_type) {
      case 'hiring': intent_score += 15; break;
      case 'funding': intent_score += 10; break;
      case 'expansion': intent_score += 8; break;
      case 'complaint': intent_score += 10; break;
      case 'news': intent_score += 5; break;
    }
  }

  return {
    signals,
    intent_score: Math.min(intent_score, 25),
    raw_snippets: allSnippets.slice(0, 5)
  };
}
