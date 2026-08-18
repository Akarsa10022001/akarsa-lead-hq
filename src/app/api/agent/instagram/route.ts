import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramProfile, fetchUserIdFromUsername } from '@/lib/instagram/profile-scraper';
import { mineFollowers, mineFollowing } from '@/lib/instagram/follower-miner';
import { mineComments } from '@/lib/instagram/comment-miner';
import { extractContactsFromBio, isBusinessAccount } from '@/lib/instagram/contact-extractor';
import { checkWebsiteTechStack } from '@/lib/enrichment/pixel-scraper';
import { classifyBusinessSize } from '@/lib/filters/business-size-classifier';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export interface MiningResult {
  username: string;
  fullName: string;
  biography: string;
  category: string | null;
  externalUrl: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  followerCount: number;
  location: string | null;
  hasMetaPixel: boolean;
  hasGoogleAnalytics: boolean;
  isBusinessAccount: boolean;
  profilePicUrl: string | null;
  source: 'followers' | 'following' | 'comments';
  classifiedAs: string;
  isGoodTarget: boolean;
  igUrl: string;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) { controller = c; }
  });

  const send = (event: { type: string; data?: any; message?: string }) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {}
  };

  // Run the actual mining asynchronously
  (async () => {
    try {
      const body = await req.json();
      const { targetUrl, sessionCookie, sources, maxLeads = 100 } = body;

      if (!targetUrl) {
        send({ type: 'error', message: 'Target URL is required' });
        controller.close();
        return;
      }

      // Extract username from URL
      let username = targetUrl.trim();
      const urlMatch = username.match(/instagram\.com\/([^/?#]+)/i);
      if (urlMatch) username = urlMatch[1];
      username = username.replace(/^@/, '');

      send({ type: 'progress', message: `🎯 Targeting @${username}...` });

      // Fetch target profile
      const targetProfile = await fetchInstagramProfile(username, sessionCookie || '');
      if (!targetProfile) {
        send({ type: 'error', message: `Could not fetch profile for @${username}. Check the URL and session cookie.` });
        controller.close();
        return;
      }

      send({ type: 'profile', data: targetProfile });
      send({ type: 'progress', message: `✅ Found @${username} (${targetProfile.followerCount.toLocaleString()} followers). Starting mining...` });

      const userId = targetProfile.userId;
      if (!userId) {
        send({ type: 'error', message: 'Could not get user ID from profile.' });
        controller.close();
        return;
      }

      // Collect all candidate usernames from requested sources
      const candidates: { username: string; source: 'followers' | 'following' | 'comments' }[] = [];
      const seenUsernames = new Set<string>();

      const onProgress = (msg: string) => send({ type: 'progress', message: msg });
      const perSourceMax = Math.floor(maxLeads / (sources?.length || 1));

      if (sources?.includes('followers')) {
        send({ type: 'progress', message: `👥 Mining followers (up to ${perSourceMax})...` });
        const followers = await mineFollowers(userId, sessionCookie, perSourceMax, onProgress);
        for (const f of followers) {
          if (!seenUsernames.has(f.username)) {
            seenUsernames.add(f.username);
            candidates.push({ username: f.username, source: 'followers' });
          }
        }
        send({ type: 'progress', message: `✅ Done mining followers. Found ${followers.length} accounts.` });
      }

      if (sources?.includes('following')) {
        send({ type: 'progress', message: `👣 Mining following (up to ${perSourceMax})...` });
        const following = await mineFollowing(userId, sessionCookie, perSourceMax, onProgress);
        for (const f of following) {
          if (!seenUsernames.has(f.username)) {
            seenUsernames.add(f.username);
            candidates.push({ username: f.username, source: 'following' });
          }
        }
        send({ type: 'progress', message: `✅ Done mining following. Found ${following.length} accounts.` });
      }

      if (sources?.includes('comments')) {
        send({ type: 'progress', message: `💬 Mining post comments...` });
        const commenters = await mineComments(userId, sessionCookie, 12, onProgress);
        for (const c of commenters) {
          if (!seenUsernames.has(c.username)) {
            seenUsernames.add(c.username);
            candidates.push({ username: c.username, source: 'comments' });
          }
        }
        send({ type: 'progress', message: `✅ Done mining comments. Found ${commenters.length} unique commenters.` });
      }

      send({ type: 'progress', message: `🔬 Deep-scanning ${candidates.length} accounts for business signals...` });

      // Deep scan each candidate
      const results: MiningResult[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        
        try {
          const profile = await fetchInstagramProfile(candidate.username, sessionCookie || '');
          if (!profile || profile.isPrivate) continue;

          const isBusiness = isBusinessAccount({
            biography: profile.biography,
            category: profile.category ?? undefined,
            is_business_account: profile.isBusinessAccount,
            external_url: profile.externalUrl ?? undefined,
            public_email: profile.publicEmail ?? undefined,
            public_phone_number: profile.publicPhone ?? undefined,
          });

          if (!isBusiness) continue;

          // Extract contacts from bio
          const contacts = extractContactsFromBio(profile.biography);
          const email = profile.publicEmail || contacts.emails[0] || null;
          const phone = profile.publicPhone || contacts.phones[0] || null;
          const whatsapp = contacts.whatsapp || null;

          // Tech stack check if they have a website
          let hasMetaPixel = false;
          let hasGoogleAnalytics = false;
          if (profile.externalUrl) {
            try {
              const tech = await checkWebsiteTechStack(profile.externalUrl);
              hasMetaPixel = tech.hasMetaPixel;
              hasGoogleAnalytics = tech.hasGoogleAnalytics;
            } catch {}
          }

          // Business size classification
          const classification = classifyBusinessSize({
            company_name: profile.fullName,
            review_count: 0,
            domain: profile.externalUrl || undefined,
            email: email || undefined,
            phone: phone || undefined,
          });

          const result: MiningResult = {
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            category: profile.category,
            externalUrl: profile.externalUrl,
            email,
            phone,
            whatsapp,
            followerCount: profile.followerCount,
            location: profile.location,
            hasMetaPixel,
            hasGoogleAnalytics,
            isBusinessAccount: profile.isBusinessAccount,
            profilePicUrl: profile.profilePicUrl,
            source: candidate.source,
            classifiedAs: classification.size,
            isGoodTarget: classification.isGoodTarget,
            igUrl: `https://instagram.com/${profile.username}`,
          };

          results.push(result);
          send({ type: 'lead', data: result });

          if (i % 10 === 0 && i > 0) {
            send({ type: 'progress', message: `🔬 Scanned ${i + 1}/${candidates.length} accounts. Found ${results.length} business leads so far...` });
          }

          // Polite delay between profile fetches
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
        } catch {
          continue;
        }
      }

      send({ type: 'complete', data: { totalFound: results.length, totalScanned: candidates.length } });
    } catch (err: any) {
      send({ type: 'error', message: `Fatal error: ${err?.message || 'Unknown error'}` });
    } finally {
      controller.close();
    }
  })();

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Bulk save leads to Supabase
export async function PUT(req: NextRequest) {
  try {
    const { leads }: { leads: MiningResult[] } = await req.json();
    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
    }

    const rows = leads.map(l => ({
      company_name: l.fullName || l.username,
      email: l.email,
      phone: l.phone,
      domain: l.externalUrl,
      industry: l.category || 'Social Media / Instagram',
      location: l.location,
      status: 'New',
      source_url: l.igUrl,
      social_links: { instagram: l.igUrl, whatsapp: l.whatsapp },
      score_factors: {
        instagram: {
          username: l.username,
          followerCount: l.followerCount,
          biography: l.biography,
          source: l.source,
          hasMetaPixel: l.hasMetaPixel,
          hasGoogleAnalytics: l.hasGoogleAnalytics,
        }
      },
      runs_ads: l.hasMetaPixel,
      has_pixel: l.hasMetaPixel || l.hasGoogleAnalytics,
      is_test: false,
    }));

    const { data, error } = await supabase.from('leads').insert(rows).select('id');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, saved: data?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
