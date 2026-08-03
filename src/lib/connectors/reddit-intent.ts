export interface IntentLead {
  company_name: string;
  contact_name?: string;
  industry: string;
  location: string;
  source_url: string;
  evidence_text: string;
  signal_type: 'reddit_hiring' | 'telegram_intent' | 'discord_intent' | 'fb_group_intent' | 'community_intent';
  email?: string;
  phone?: string;
  domain?: string;
}

export class CommunityIntentConnector {
  /**
   * Scrapes live high-intent opportunities across social communities:
   * - Reddit (r/forhire, r/smallbusiness, r/agency, r/freelance, r/marketing)
   * - Telegram Public Groups & Channels (t.me)
   * - Discord Hiring & Project Channels (discord.gg / disboard)
   * - Facebook Public Business Groups
   */
  async search(queryKeyword: string = 'web design marketing agency', location?: string): Promise<IntentLead[]> {
    const leads: IntentLead[] = [];
    const resolvedLocation = location && location.trim() ? location.trim() : 'Global / Online Community';

    // 1. Scan Reddit Subreddits
    const redditLeads = await this.scanReddit(queryKeyword, resolvedLocation);
    leads.push(...redditLeads);

    // 2. Scan Telegram Public Channels & Groups (site:t.me)
    const telegramLeads = await this.scanTelegram(queryKeyword, resolvedLocation);
    leads.push(...telegramLeads);

    // 3. Scan Facebook Public Business Groups & Discord Communities via SerpAPI
    const socialLeads = await this.scanSocialGroups(queryKeyword, resolvedLocation);
    leads.push(...socialLeads);

    return leads;
  }

  private async scanReddit(queryKeyword: string, location: string): Promise<IntentLead[]> {
    const leads: IntentLead[] = [];
    const subreddits = ['forhire', 'smallbusiness', 'webdev', 'marketing', 'agency', 'freelance'];

    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(queryKeyword)}&sort=new&restrict_sr=1&limit=10`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
          signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) continue;

        const data = await res.json();
        const posts = data?.data?.children || [];

        for (const post of posts) {
          const p = post.data;
          const title = p.title || '';
          const selftext = (p.selftext || '').substring(0, 1000);

          if (/\[hiring\]|need (a )?(website|agency|designer|marketer)|looking for (agency|web dev|marketing)/i.test(title)) {
            const author = p.author !== '[deleted]' ? p.author : 'Community Member';
            const postUrl = `https://reddit.com${p.permalink}`;

            const emailMatch = selftext.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const domainMatch = selftext.match(/https?:\/\/(www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

            const cleanTitle = title.replace(/^\[(hiring|paid|for hire|seeking|freelance)\]\s*/i, '').trim();
            const companyName = cleanTitle.length > 50 ? `${cleanTitle.substring(0, 47)}...` : cleanTitle;

            leads.push({
              company_name: companyName,
              contact_name: author !== 'Community Member' ? `u/${author}` : undefined,
              industry: sub === 'smallbusiness' ? 'Corporate & General Business' : 'Digital Client / RFP Project',
              location,
              source_url: postUrl,
              evidence_text: `Reddit Post in r/${sub}: "${title}" — ${selftext.substring(0, 150)}...`,
              signal_type: 'reddit_hiring',
              email: emailMatch ? emailMatch[0] : undefined,
              domain: domainMatch ? domainMatch[2] : undefined
            });
          }
        }
      } catch (err) {
        console.warn(`[CommunityIntent] Reddit scan error for r/${sub}:`, err);
      }
    }
    return leads;
  }

  private async scanTelegram(queryKeyword: string, location: string): Promise<IntentLead[]> {
    const leads: IntentLead[] = [];
    const serpKey = process.env.SERPAPI_KEY;
    if (!serpKey) return leads;

    try {
      // Dorking public Telegram channels for business hiring & leads
      const q = `site:t.me "${queryKeyword}" ("hiring" OR "need website" OR "looking for agency" OR "contact")`;
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${serpKey}&num=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return leads;

      const data = await res.json();
      const items = data.organic_results || [];

      for (const item of items) {
        const title = item.title || 'Telegram Group Listing';
        const snippet = item.snippet || '';
        const link = item.link || '';

        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const phoneMatch = snippet.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        const cleanName = title.replace(/Telegram: Contact @|Telegram: /gi, '').trim();

        leads.push({
          company_name: cleanName || 'Telegram Business Prospect',
          industry: 'Telegram Community Lead',
          location,
          source_url: link,
          evidence_text: `Telegram Channel Signal: "${title}" — ${snippet.substring(0, 150)}`,
          signal_type: 'telegram_intent',
          email: emailMatch ? emailMatch[0] : undefined,
          phone: phoneMatch ? phoneMatch[0] : undefined
        });
      }
    } catch (e) {
      console.warn('[CommunityIntent] Telegram scan error:', e);
    }
    return leads;
  }

  private async scanSocialGroups(queryKeyword: string, location: string): Promise<IntentLead[]> {
    const leads: IntentLead[] = [];
    const serpKey = process.env.SERPAPI_KEY;
    if (!serpKey) return leads;

    try {
      // Dorking Facebook B2B Groups & Discord server hiring listings
      const q = `(site:facebook.com/groups OR site:discord.gg) "${queryKeyword}" ("hiring" OR "need website" OR "looking for agency")`;
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${serpKey}&num=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return leads;

      const data = await res.json();
      const items = data.organic_results || [];

      for (const item of items) {
        const title = item.title || 'Social Group RFP';
        const snippet = item.snippet || '';
        const link = item.link || '';
        const isFB = link.includes('facebook.com');

        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

        leads.push({
          company_name: title.substring(0, 45),
          industry: isFB ? 'Facebook Group B2B Lead' : 'Discord Community RFP',
          location,
          source_url: link,
          evidence_text: `Social Group Post (${isFB ? 'FB Group' : 'Discord'}): "${title}" — ${snippet.substring(0, 150)}`,
          signal_type: isFB ? 'fb_group_intent' : 'discord_intent',
          email: emailMatch ? emailMatch[0] : undefined
        });
      }
    } catch (e) {
      console.warn('[CommunityIntent] Social groups scan error:', e);
    }
    return leads;
  }
}
