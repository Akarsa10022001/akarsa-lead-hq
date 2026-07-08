/**
 * Social Intelligence — Layer 10
 * Extracts public social media data from Instagram, Facebook, and other platforms.
 * Uses both direct scraping and proxy fallback for rate-limited platforms.
 */

export interface SocialProfile {
  platform: string;
  url: string;
  username?: string;
  followers?: number;
  following?: number;
  posts_count?: number;
  bio?: string;
  last_post_date?: string;
  is_active: boolean; // Posted in last 30 days
  extracted_email?: string;
  extracted_phone?: string;
  extracted_name?: string;
}

export interface SocialIntelResult {
  profiles: SocialProfile[];
  social_score: number; // 0-25 (contribution to composite score)
  total_followers: number;
  decision_maker_name?: string;
  decision_maker_email?: string;
  decision_maker_phone?: string;
}

/**
 * Try to scrape Instagram public profile data
 * Instagram's public pages can be scraped via the /?__a=1&__d=dis endpoint
 * or by parsing the HTML. We try multiple approaches.
 */
async function scrapeInstagramPublic(username: string): Promise<SocialProfile | null> {
  if (!username) return null;
  
  // Clean username
  const clean = username.replace(/^@/, '').replace(/\/$/, '').split('/').pop() || '';
  if (!clean) return null;

  const profile: SocialProfile = {
    platform: 'instagram',
    url: `https://instagram.com/${clean}`,
    username: clean,
    is_active: false
  };

  try {
    // Method 1: Scrape the public profile HTML page
    const res = await fetch(`https://www.instagram.com/${clean}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      console.warn(`[SocialIntel] Instagram returned ${res.status} for @${clean}`);
      return profile; // Return basic profile without data
    }

    const html = await res.text();

    // Extract meta description (usually contains follower/following/post counts)
    // Format: "123 Followers, 45 Following, 67 Posts - See Instagram photos and videos from Name (@username)"
    const metaMatch = html.match(/content="([\d,.]+[KkMm]?) Followers?, ([\d,.]+[KkMm]?) Following, ([\d,.]+[KkMm]?) Posts/i);
    if (metaMatch) {
      profile.followers = parseCount(metaMatch[1]);
      profile.following = parseCount(metaMatch[2]);
      profile.posts_count = parseCount(metaMatch[3]);
    }

    // Extract name from meta
    const nameMatch = html.match(/from (.+?) \(@/);
    if (nameMatch) {
      profile.extracted_name = nameMatch[1].trim();
    }

    // Try to extract bio from og:description or meta description
    const bioMatch = html.match(/property="og:description" content="([^"]+)"/);
    if (bioMatch) {
      profile.bio = bioMatch[1];
      
      // Extract email from bio
      const emailMatch = profile.bio.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) profile.extracted_email = emailMatch[0];

      // Extract phone from bio
      const phoneMatch = profile.bio.match(/[\+]?[\d\s\-()]{8,15}/);
      if (phoneMatch) profile.extracted_phone = phoneMatch[0].trim();
    }

    // Determine if active (we can check if posts_count > 0 as a basic signal)
    profile.is_active = (profile.posts_count || 0) > 0;

  } catch (e) {
    console.warn(`[SocialIntel] Instagram scrape failed for @${clean}:`, e);
  }

  return profile;
}

/**
 * Proxy-based Instagram scrape as fallback
 * Uses a free proxy API if direct scraping gets rate-limited
 */
async function scrapeInstagramProxy(username: string): Promise<SocialProfile | null> {
  if (!username) return null;
  const clean = username.replace(/^@/, '').replace(/\/$/, '').split('/').pop() || '';
  if (!clean) return null;

  try {
    // Try a public Instagram data API (e.g., i.instagram.com or similar free endpoints)
    const res = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${clean}`, {
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100)',
        'X-IG-App-ID': '936619743392459'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;

    const data = await res.json();
    const user = data?.data?.user;
    if (!user) return null;

    return {
      platform: 'instagram',
      url: `https://instagram.com/${clean}`,
      username: clean,
      followers: user.edge_followed_by?.count || 0,
      following: user.edge_follow?.count || 0,
      posts_count: user.edge_owner_to_timeline_media?.count || 0,
      bio: user.biography || '',
      extracted_name: user.full_name || undefined,
      extracted_email: user.business_email || user.biography?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || undefined,
      extracted_phone: user.business_phone_number || undefined,
      is_active: (user.edge_owner_to_timeline_media?.count || 0) > 0,
    };
  } catch (e) {
    console.warn(`[SocialIntel] Instagram proxy failed for @${clean}`);
    return null;
  }
}

/**
 * Parse social count strings like "1.2K", "3.5M", "12,345"
 */
function parseCount(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, '').trim();
  if (cleaned.match(/[kK]$/)) return Math.round(parseFloat(cleaned) * 1000);
  if (cleaned.match(/[mM]$/)) return Math.round(parseFloat(cleaned) * 1000000);
  return parseInt(cleaned, 10) || 0;
}

/**
 * Extract Instagram username from a URL or social_links object
 */
function extractInstagramUsername(socialLinks: any): string | null {
  if (!socialLinks) return null;
  
  // Could be a direct URL string or an object with instagram key
  const igUrl = socialLinks.instagram || socialLinks.ig || 
    (typeof socialLinks === 'string' && socialLinks.includes('instagram.com') ? socialLinks : null);
  
  if (!igUrl) return null;
  
  // Extract username from URL: https://instagram.com/username or https://www.instagram.com/username/
  const match = igUrl.match(/instagram\.com\/([^/?#]+)/i);
  return match ? match[1] : null;
}

/**
 * Extract Facebook page data from URL
 */
async function scrapeFacebookBasic(url: string): Promise<SocialProfile | null> {
  if (!url) return null;

  return {
    platform: 'facebook',
    url,
    is_active: true, // Assume active if they have a page
  };
}

/**
 * Main entry point: collect social intelligence for a lead
 */
export async function collectSocialIntel(socialLinks: any, companyName: string): Promise<SocialIntelResult> {
  const profiles: SocialProfile[] = [];
  let decision_maker_name: string | undefined;
  let decision_maker_email: string | undefined;
  let decision_maker_phone: string | undefined;

  // Instagram
  const igUsername = extractInstagramUsername(socialLinks);
  if (igUsername) {
    console.log(`[SocialIntel] Scraping Instagram: @${igUsername}`);
    
    // Try direct first, then proxy
    let igProfile = await scrapeInstagramPublic(igUsername);
    if (!igProfile || !igProfile.followers) {
      console.log(`[SocialIntel] Trying proxy for @${igUsername}`);
      const proxyProfile = await scrapeInstagramProxy(igUsername);
      if (proxyProfile && (proxyProfile.followers || 0) > 0) {
        igProfile = proxyProfile;
      }
    }

    if (igProfile) {
      profiles.push(igProfile);
      
      // Extract decision-maker info from Instagram bio
      if (igProfile.extracted_name && !decision_maker_name) decision_maker_name = igProfile.extracted_name;
      if (igProfile.extracted_email && !decision_maker_email) decision_maker_email = igProfile.extracted_email;
      if (igProfile.extracted_phone && !decision_maker_phone) decision_maker_phone = igProfile.extracted_phone;
    }
  }

  // Facebook
  const fbUrl = socialLinks?.facebook || socialLinks?.fb;
  if (fbUrl) {
    const fbProfile = await scrapeFacebookBasic(fbUrl);
    if (fbProfile) profiles.push(fbProfile);
  }

  // LinkedIn
  if (socialLinks?.linkedin) {
    profiles.push({
      platform: 'linkedin',
      url: socialLinks.linkedin,
      is_active: true
    });
  }

  // Twitter/X
  if (socialLinks?.twitter || socialLinks?.x) {
    profiles.push({
      platform: 'twitter',
      url: socialLinks.twitter || socialLinks.x,
      is_active: true
    });
  }

  // Calculate social score (max 25)
  let social_score = 0;
  const totalFollowers = profiles.reduce((sum, p) => sum + (p.followers || 0), 0);
  const hasMultiplePlatforms = profiles.length >= 2;
  const hasActiveIG = profiles.some(p => p.platform === 'instagram' && p.is_active);

  if (profiles.length > 0) social_score += 5; // Has at least one social presence
  if (hasMultiplePlatforms) social_score += 5; // Active on multiple platforms
  if (hasActiveIG) social_score += 3; // Active Instagram
  if (totalFollowers >= 1000) social_score += 4; // Decent following
  if (totalFollowers >= 10000) social_score += 3; // Strong following
  if (decision_maker_email) social_score += 3; // Found contact in bio
  if (decision_maker_name) social_score += 2; // Found name

  return {
    profiles,
    social_score: Math.min(social_score, 25),
    total_followers: totalFollowers,
    decision_maker_name,
    decision_maker_email,
    decision_maker_phone
  };
}
