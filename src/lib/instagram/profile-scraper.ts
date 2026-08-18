/**
 * Instagram Profile Scraper
 * Multi-fallback approach:
 * 1. Try Instagram's web GraphQL endpoint (works with session cookie from same region)
 * 2. Fall back to scraping the public HTML page (no auth needed for public accounts)
 * 3. Extract from embedded __additionalDataLoaded JSON in page
 */

export interface InstagramProfile {
  username: string;
  fullName: string;
  biography: string;
  category: string | null;
  externalUrl: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isBusinessAccount: boolean;
  publicEmail: string | null;
  publicPhone: string | null;
  profilePicUrl: string | null;
  isPrivate: boolean;
  userId: string;
  location: string | null;
  igtvCount: number;
}

function extractUsername(usernameOrUrl: string): string {
  let username = usernameOrUrl.trim();
  const urlMatch = username.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) username = urlMatch[1];
  return username.replace(/^@/, '').replace(/\/$/, '');
}

// Method 1: Instagram's web profile info API (needs session cookie, same-region)
async function tryMobileApi(username: string, sessionid: string): Promise<InstagramProfile | null> {
  try {
    // URL-decode the session cookie in case user copied it with %3A etc.
    const decodedSession = decodeURIComponent(sessionid);
    
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://www.instagram.com/${username}/`,
          'Cookie': `sessionid=${decodedSession}`,
        },
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!res.ok) return null;
    const json = await res.json();
    const u = json?.data?.user;
    if (!u) return null;
    return parseUserObject(u);
  } catch {
    return null;
  }
}

// Method 2: Scrape public HTML page — works for ALL public accounts, no auth needed
async function tryHtmlScrape(username: string): Promise<InstagramProfile | null> {
  try {
    const res = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extract profile data from embedded JSON scripts
    // Instagram embeds data in <script type="application/ld+json"> and window.__additionalDataLoaded
    
    // Try ld+json schema first (always present for public pages)
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const ldJson = JSON.parse(ldMatch[1]);
        // Also try to grab follower count from meta tags
        const followerMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
        const followingMatch = html.match(/"edge_follow":\{"count":(\d+)\}/);
        const postCountMatch = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)\}/);
        const bioMatch = html.match(/"biography":"([^"]*?)"/);
        const externalUrlMatch = html.match(/"external_url":"([^"]*?)"/);
        const isPrivateMatch = html.match(/"is_private":(true|false)/);
        const isBusinessMatch = html.match(/"is_business_account":(true|false)/);
        const categoryMatch = html.match(/"category_name":"([^"]*?)"/);
        const userIdMatch = html.match(/"id":"(\d+)"/);
        const picMatch = html.match(/"profile_pic_url_hd":"([^"]+?)"/);

        return {
          username,
          fullName: ldJson.name || ldJson.alternateName || username,
          biography: ldJson.description || (bioMatch ? bioMatch[1].replace(/\\n/g, '\n').replace(/\\u[\dA-F]{4}/gi, c => String.fromCharCode(parseInt(c.replace(/\\u/i,''), 16))) : ''),
          category: categoryMatch ? categoryMatch[1] : null,
          externalUrl: externalUrlMatch ? externalUrlMatch[1].replace(/\\/g, '') : null,
          followerCount: followerMatch ? parseInt(followerMatch[1]) : 0,
          followingCount: followingMatch ? parseInt(followingMatch[1]) : 0,
          postCount: postCountMatch ? parseInt(postCountMatch[1]) : 0,
          isBusinessAccount: isBusinessMatch ? isBusinessMatch[1] === 'true' : false,
          publicEmail: null,
          publicPhone: null,
          profilePicUrl: picMatch ? picMatch[1].replace(/\\/g, '') : (ldJson.image?.[0]?.url || null),
          isPrivate: isPrivateMatch ? isPrivateMatch[1] === 'true' : false,
          userId: userIdMatch ? userIdMatch[1] : '',
          location: null,
          igtvCount: 0,
        };
      } catch {
        // continue to next fallback
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Method 3: Instagram oEmbed API — basic info only, no auth needed
async function tryOEmbed(username: string): Promise<InstagramProfile | null> {
  try {
    // oEmbed only works for post URLs, not profiles. Skip this and use a different endpoint.
    const res = await fetch(
      `https://www.instagram.com/${username}/?__a=1&__d=dis`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const u = json?.graphql?.user || json?.data?.user;
    if (!u) return null;
    return parseUserObject(u);
  } catch {
    return null;
  }
}

function parseUserObject(u: any): InstagramProfile {
  return {
    username: u.username,
    fullName: u.full_name || '',
    biography: u.biography || '',
    category: u.category_name || null,
    externalUrl: u.external_url || null,
    followerCount: u.edge_followed_by?.count || u.follower_count || 0,
    followingCount: u.edge_follow?.count || u.following_count || 0,
    postCount: u.edge_owner_to_timeline_media?.count || u.media_count || 0,
    isBusinessAccount: !!u.is_business_account,
    publicEmail: u.business_email || null,
    publicPhone: u.business_phone_number || null,
    profilePicUrl: u.profile_pic_url_hd || u.profile_pic_url || null,
    isPrivate: !!u.is_private,
    userId: u.id || u.pk || '',
    location: u.business_address_json
      ? (() => { try { const a = JSON.parse(u.business_address_json); return [a.city_name, a.country_code].filter(Boolean).join(', '); } catch { return null; } })()
      : null,
    igtvCount: u.edge_felix_video_timeline?.count || 0,
  };
}

export async function fetchInstagramProfile(
  usernameOrUrl: string,
  sessionid: string
): Promise<InstagramProfile | null> {
  const username = extractUsername(usernameOrUrl);
  if (!username) return null;

  console.log(`[Instagram] Fetching profile for @${username}`);

  // Try all methods in sequence, use first success
  if (sessionid && sessionid.length > 10) {
    const mobileResult = await tryMobileApi(username, sessionid);
    if (mobileResult) {
      console.log(`[Instagram] ✅ Mobile API success for @${username}`);
      return mobileResult;
    }
    console.log(`[Instagram] Mobile API failed, trying HTML scrape...`);
  }

  const htmlResult = await tryHtmlScrape(username);
  if (htmlResult) {
    console.log(`[Instagram] ✅ HTML scrape success for @${username}`);
    return htmlResult;
  }

  console.log(`[Instagram] HTML scrape failed, trying oEmbed...`);
  const oembedResult = await tryOEmbed(username);
  if (oembedResult) {
    console.log(`[Instagram] ✅ oEmbed success for @${username}`);
    return oembedResult;
  }

  console.warn(`[Instagram] ❌ All methods failed for @${username}`);
  return null;
}

export async function fetchUserIdFromUsername(
  username: string,
  sessionid: string
): Promise<string | null> {
  const profile = await fetchInstagramProfile(username, sessionid);
  return profile?.userId || null;
}
