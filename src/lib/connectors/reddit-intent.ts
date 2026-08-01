export interface IntentLead {
  company_name: string;
  contact_name?: string;
  industry: string;
  location: string;
  source_url: string;
  evidence_text: string;
  signal_type: 'reddit_hiring' | 'freelancer_rfp' | 'community_intent';
  email?: string;
  phone?: string;
  domain?: string;
}

export class CommunityIntentConnector {
  /**
   * Scrapes live high-intent opportunities asking for web dev, marketing, SEO, or agency help.
   * location is passed through so leads aren't hardcoded to "Remote".
   */
  async search(queryKeyword: string = 'web design marketing agency', location?: string): Promise<IntentLead[]> {
    const leads: IntentLead[] = [];

    // Resolve canonical location label
    const resolvedLocation = location && location.trim() ? location.trim() : 'Remote / Online Community';

    // 1. Fetch Reddit JSON for hiring/seeking subreddits
    const subreddits = ['forhire', 'smallbusiness', 'webdev', 'marketing', 'agency'];
    
    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(queryKeyword)}&sort=new&restrict_sr=1&limit=10`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
        });

        if (!res.ok) continue;

        const data = await res.json();
        const posts = data?.data?.children || [];

        for (const post of posts) {
          const p = post.data;
          const title = p.title || '';
          const selftext = (p.selftext || '').substring(0, 1000);

          // Only pick posts looking to hire or looking for services ([Hiring], "looking for agency", "need website")
          if (/\[hiring\]|need (a )?(website|agency|designer|marketer)|looking for (agency|web dev|marketing)/i.test(title)) {
            const author = p.author !== '[deleted]' ? p.author : 'Community Member';
            const postUrl = `https://reddit.com${p.permalink}`;

            // Extract email if present in post body
            const emailMatch = selftext.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            // Extract domain if present in post body
            const domainMatch = selftext.match(/https?:\/\/(www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

            // FIX: Use resolved location from config instead of hardcoded "Remote / Online Community"
            // Derive a cleaner company_name: strip [Hiring] / [Paid] / [For Hire] tags from title
            const cleanTitle = title.replace(/^\[(hiring|paid|for hire|seeking|freelance)\]\s*/i, '').trim();
            const companyName = cleanTitle.length > 50 ? `${cleanTitle.substring(0, 47)}...` : cleanTitle;

            leads.push({
              company_name: companyName,
              contact_name: author !== 'Community Member' ? `u/${author}` : undefined,
              // FIX: Industry derived from subreddit context
              industry: sub === 'smallbusiness' ? 'Corporate & General Business' : 'Digital Client / RFP Project',
              // FIX: Pass actual location config rather than hardcoded 'Remote'
              location: resolvedLocation,
              source_url: postUrl,
              evidence_text: `Reddit Post in r/${sub}: "${title}" — ${selftext.substring(0, 150)}...`,
              signal_type: 'reddit_hiring',
              email: emailMatch ? emailMatch[0] : undefined,
              domain: domainMatch ? domainMatch[2] : undefined
            });
          }
        }
      } catch (err) {
        console.warn(`[RedditIntent] Error scanning r/${sub}:`, err);
      }
    }

    return leads;
  }
}
