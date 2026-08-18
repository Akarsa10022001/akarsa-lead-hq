/**
 * Instagram Profile Scraper
 * Fetches a public Instagram profile using the private mobile API endpoint.
 * Requires a valid sessionid cookie for follower/following access.
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

const IG_HEADERS = (sessionid: string) => ({
  'User-Agent': 'Instagram 269.0.0.18.75 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; ONEPLUS A3003; OnePlus3; qcom; en_US; 314665256)',
  'Accept': '*/*',
  'Accept-Language': 'en-US',
  'X-IG-App-ID': '936619743392459',
  'Cookie': `sessionid=${sessionid}`,
});

export async function fetchInstagramProfile(
  usernameOrUrl: string,
  sessionid: string
): Promise<InstagramProfile | null> {
  // Extract username from URL if full URL provided
  let username = usernameOrUrl.trim();
  const urlMatch = username.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) username = urlMatch[1];
  username = username.replace(/^@/, '');

  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      {
        headers: IG_HEADERS(sessionid),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!res.ok) {
      console.warn(`[Instagram] Profile fetch failed for @${username}: ${res.status}`);
      return null;
    }

    const json = await res.json();
    const u = json?.data?.user;
    if (!u) return null;

    return {
      username: u.username,
      fullName: u.full_name || '',
      biography: u.biography || '',
      category: u.category_name || null,
      externalUrl: u.external_url || null,
      followerCount: u.edge_followed_by?.count || 0,
      followingCount: u.edge_follow?.count || 0,
      postCount: u.edge_owner_to_timeline_media?.count || 0,
      isBusinessAccount: !!u.is_business_account,
      publicEmail: u.business_email || null,
      publicPhone: u.business_phone_number || null,
      profilePicUrl: u.profile_pic_url_hd || u.profile_pic_url || null,
      isPrivate: !!u.is_private,
      userId: u.id,
      location: u.business_address_json
        ? (() => { try { const a = JSON.parse(u.business_address_json); return [a.city_name, a.country_code].filter(Boolean).join(', '); } catch { return null; } })()
        : null,
      igtvCount: u.edge_felix_video_timeline?.count || 0,
    };
  } catch (err) {
    console.warn(`[Instagram] Error fetching profile @${username}:`, err);
    return null;
  }
}

export async function fetchUserIdFromUsername(
  username: string,
  sessionid: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      { headers: IG_HEADERS(sessionid), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.user?.id || null;
  } catch {
    return null;
  }
}
