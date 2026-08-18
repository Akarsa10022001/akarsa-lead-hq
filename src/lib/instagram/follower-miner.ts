/**
 * Instagram Follower & Following Miner
 * Paginates through follower/following lists and returns business account candidates.
 */

import { isBusinessAccount } from './contact-extractor';

export interface FollowerEntry {
  username: string;
  fullName: string;
  isPrivate: boolean;
  profilePicUrl: string;
  userId: string;
  isBusinessLike: boolean;
}

const IG_HEADERS = (sessionid: string) => ({
  'User-Agent': 'Instagram 269.0.0.18.75 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; ONEPLUS A3003; OnePlus3; qcom; en_US; 314665256)',
  'Accept': 'application/json',
  'X-IG-App-ID': '936619743392459',
  'Cookie': `sessionid=${sessionid}`,
});

async function mineList(
  userId: string,
  endpoint: 'followers' | 'following',
  sessionid: string,
  maxCount: number,
  onProgress: (msg: string) => void
): Promise<FollowerEntry[]> {
  const results: FollowerEntry[] = [];
  let nextMaxId: string | null = null;
  let fetched = 0;
  const batchSize = 50;

  while (fetched < maxCount) {
    const url: string = `https://i.instagram.com/api/v1/friendships/${userId}/${endpoint}/?count=${batchSize}${nextMaxId ? `&max_id=${nextMaxId}` : ''}`;

    try {
      const res = await fetch(url, {
        headers: IG_HEADERS(sessionid),
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        onProgress(`⚠️ Rate limited. Pausing 30 seconds...`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }

      if (!res.ok) {
        onProgress(`❌ Error fetching ${endpoint} list: ${res.status}`);
        break;
      }

      const json = await res.json();
      const users: any[] = json.users || [];

      for (const u of users) {
        const entry: FollowerEntry = {
          username: u.username,
          fullName: u.full_name || '',
          isPrivate: !!u.is_private,
          profilePicUrl: u.profile_pic_url || '',
          userId: u.pk || u.id,
          isBusinessLike: isBusinessAccount({
            biography: u.biography,
            category: u.category,
            is_business_account: u.is_business,
            external_url: u.external_url,
            public_email: u.public_email,
            public_phone_number: u.public_phone_number,
          }),
        };
        results.push(entry);
        fetched++;
      }

      onProgress(`📋 Scraped ${fetched} ${endpoint}...`);

      nextMaxId = json.next_max_id || null;
      if (!nextMaxId || users.length === 0) break;

      // Polite delay to avoid rate limits
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    } catch (err) {
      onProgress(`⚠️ Timeout/error, retrying...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  return results;
}

export async function mineFollowers(
  userId: string,
  sessionid: string,
  maxCount: number,
  onProgress: (msg: string) => void
): Promise<FollowerEntry[]> {
  return mineList(userId, 'followers', sessionid, maxCount, onProgress);
}

export async function mineFollowing(
  userId: string,
  sessionid: string,
  maxCount: number,
  onProgress: (msg: string) => void
): Promise<FollowerEntry[]> {
  return mineList(userId, 'following', sessionid, maxCount, onProgress);
}
