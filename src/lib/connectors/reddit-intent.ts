import { callLLM } from '../llm';

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
   * Scrapes live high-intent opportunities asking for web dev, marketing, SEO, or agency help
   */
  async search(queryKeyword: string = 'web design marketing agency'): Promise<IntentLead[]> {
    const leads: IntentLead[] = [];

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
          const fullContent = `${title}\n${selftext}`;

          // Only pick posts looking to hire or looking for services ([Hiring], "looking for agency", "need website")
          if (/\[hiring\]|need (a )?(website|agency|designer|marketer)|looking for (agency|web dev|marketing)/i.test(title)) {
            const author = p.author !== '[deleted]' ? p.author : 'Community Member';
            const postUrl = `https://reddit.com${p.permalink}`;

            // Extract email/phone if present in post body
            const emailMatch = selftext.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const domainMatch = selftext.match(/https?:\/\/(www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

            leads.push({
              company_name: title.length > 50 ? `${title.substring(0, 47)}...` : title,
              contact_name: author !== 'Community Member' ? `u/${author}` : undefined,
              industry: 'Digital Client / RFP Project',
              location: 'Remote / Online Community',
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
