/**
 * Instagram Comment Miner
 * Fetches comments from the latest posts of a target account.
 * Works WITHOUT session cookie for public accounts.
 */

import { isBusinessAccount } from './contact-extractor';

export interface CommentEntry {
  username: string;
  text: string;
  timestamp: number;
  isBusinessLike: boolean;
  userId: string;
}

const IG_HEADERS = (sessionid?: string) => ({
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json',
  'X-IG-App-ID': '936619743392459',
  ...(sessionid ? { 'Cookie': `sessionid=${sessionid}` } : {}),
});

export async function mineComments(
  userId: string,
  sessionid: string | undefined,
  maxPosts: number,
  onProgress: (msg: string) => void
): Promise<CommentEntry[]> {
  const allCommenters: CommentEntry[] = [];
  const seenUsernames = new Set<string>();

  try {
    // Step 1: Get the latest posts
    onProgress(`📸 Fetching latest posts...`);
    const postsRes = await fetch(
      `https://i.instagram.com/api/v1/feed/user/${userId}/?count=${maxPosts}`,
      { headers: IG_HEADERS(sessionid), signal: AbortSignal.timeout(12000) }
    );

    if (!postsRes.ok) {
      onProgress(`❌ Could not fetch posts: ${postsRes.status}`);
      return allCommenters;
    }

    const postsJson = await postsRes.json();
    const posts: any[] = postsJson.items || [];
    onProgress(`📸 Found ${posts.length} posts. Mining comments...`);

    // Step 2: For each post, fetch comments
    for (let i = 0; i < Math.min(posts.length, maxPosts); i++) {
      const post = posts[i];
      const mediaId = post.id || post.pk;
      if (!mediaId) continue;

      try {
        const commentsRes = await fetch(
          `https://i.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true&permalink_enabled=false`,
          { headers: IG_HEADERS(sessionid), signal: AbortSignal.timeout(10000) }
        );

        if (!commentsRes.ok) continue;

        const commentsJson = await commentsRes.json();
        const comments: any[] = commentsJson.comments || [];

        for (const comment of comments) {
          const user = comment.user || {};
          if (!user.username || seenUsernames.has(user.username)) continue;
          seenUsernames.add(user.username);

          allCommenters.push({
            username: user.username,
            text: comment.text || '',
            timestamp: comment.created_at || 0,
            userId: user.pk || user.id,
            isBusinessLike: isBusinessAccount({
              is_business_account: user.is_business,
              external_url: user.external_url,
              biography: user.biography,
              category: user.category,
            }),
          });
        }

        onProgress(`💬 Post ${i + 1}/${posts.length}: found ${comments.length} comments`);
        // Polite delay
        await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
      } catch {
        continue;
      }
    }
  } catch (err) {
    onProgress(`❌ Comment mining error: ${err}`);
  }

  return allCommenters;
}
