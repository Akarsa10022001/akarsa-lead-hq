import { NextRequest, NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractUsername(urlOrHandle: string): string {
  const m = urlOrHandle.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) return m[1].replace(/\/$/, '');
  return urlOrHandle.replace(/^@/, '').replace(/\/$/, '').trim();
}

function extractContacts(bio: string) {
  const email = bio.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || null;
  const rawPhone = bio.match(/(?:\+|00)?[\d\s\-().]{9,18}(?=\s|$|[\n,|📞☎️📱])/)?.[0] || null;
  const phone = rawPhone ? rawPhone.replace(/[\s\-().]/g, '').trim() : null;
  const wa = bio.match(/(?:wa\.me\/|whatsapp[:\s]+)[\+\d]{7,15}/i)?.[0] || null;
  return {
    email,
    phone,
    whatsapp: wa ? wa.replace(/(?:wa\.me\/|whatsapp[:\s]+)/i, '+') : null,
  };
}

function isBusinessLike(item: any): boolean {
  if (item.isBusinessAccount || item.businessCategoryName) return true;
  if (item.businessEmail || item.publicEmail || item.businessContactMethod) return true;
  if (item.externalUrl) return true;
  const bio = item.biography || item.bio || '';
  if (/@[\w.]+\.[a-z]{2,}/i.test(bio)) return true;
  if (/\+[\d\s]{9,}/i.test(bio)) return true;
  return false;
}

function parseLead(item: any, source: string) {
  const bio = item.biography || item.bio || '';
  const contacts = extractContacts(bio);
  const username = item.username || item.ownerUsername || '';
  return {
    username,
    fullName: item.fullName || item.ownerFullName || username,
    biography: bio,
    category: item.businessCategoryName || null,
    externalUrl: item.externalUrl || null,
    email: item.businessEmail || item.publicEmail || contacts.email,
    phone: contacts.phone,
    whatsapp: contacts.whatsapp,
    followerCount: item.followersCount || 0,
    location: item.city || item.location || null,
    hasMetaPixel: false,
    hasGoogleAnalytics: false,
    isBusinessAccount: !!(item.isBusinessAccount),
    profilePicUrl: item.profilePicUrl || item.profilePicUrlHD || null,
    source,
    classifiedAs: 'small_business',
    isGoodTarget: true,
    igUrl: `https://instagram.com/${username}`,
  };
}

// ── POST: Run agent, stream results via SSE ───────────────────────────────────
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) { controller = c; },
  });

  const send = (event: object) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {}
  };

  (async () => {
    try {
      const { targetUrl, apifyToken, sources = { comments: true, related: true }, maxLeads = 100 } = await req.json();

      const token = apifyToken || process.env.APIFY_API_TOKEN;
      if (!token) {
        send({ type: 'error', message: 'Apify API token is required.' });
        controller.close();
        return;
      }
      if (!targetUrl) {
        send({ type: 'error', message: 'Target URL is required.' });
        controller.close();
        return;
      }

      const username = extractUsername(targetUrl);
      const igUrl = `https://www.instagram.com/${username}/`;
      const client = new ApifyClient({ token });

      send({ type: 'log', message: `🎯 Targeting @${username} via Apify...` });

      // ── Step 1: Fetch target profile details ───────────────────────────────
      send({ type: 'log', message: '📋 Fetching profile details...' });
      const profileRun = await client.actor('apify/instagram-scraper').call({
        directUrls: [igUrl],
        resultsType: 'details',
        resultsLimit: 1,
      }, { waitSecs: 120 });

      const { items: profileItems } = await client.dataset(profileRun.defaultDatasetId).listItems();
      const targetProfile = profileItems.find((p: any) => p.username === username) || profileItems[0] || null;

      if (!targetProfile) {
        send({ type: 'error', message: `❌ Could not fetch profile for @${username}. Check if the account is public.` });
        controller.close();
        return;
      }

      send({ type: 'profile', data: targetProfile });
      send({ type: 'log', message: `✅ Found @${username} — ${(targetProfile.followersCount || 0).toLocaleString()} followers` });

      const discovered: any[] = [];
      const seen = new Set<string>();

      // ── Step 2: Mine commenters from recent posts ──────────────────────────
      if (sources.comments) {
        send({ type: 'log', message: `\n💬 Mining active commenters from recent posts...` });

        const commentRun = await client.actor('apify/instagram-scraper').call({
          directUrls: [igUrl],
          resultsType: 'comments',
          resultsLimit: maxLeads,
        }, { waitSecs: 180 });

        const { items: commentItems } = await client.dataset(commentRun.defaultDatasetId).listItems();
        send({ type: 'log', message: `📝 Found ${commentItems.length} comments. Extracting unique accounts...` });

        // Collect unique commenter usernames
        const commenterUsernames = [...new Set(
          commentItems
            .map((c: any) => c.ownerUsername)
            .filter((u: any) => u && u !== username)
        )].slice(0, Math.min(maxLeads, 80)) as string[];

        send({ type: 'log', message: `👥 ${commenterUsernames.length} unique commenters found. Profiling business accounts...` });

        if (commenterUsernames.length > 0) {
          // Batch profile lookup for commenters
          const commenterUrls = commenterUsernames.map(u => `https://www.instagram.com/${u}/`);
          const batchSize = 20;

          for (let i = 0; i < commenterUrls.length; i += batchSize) {
            const batch = commenterUrls.slice(i, i + batchSize);
            send({ type: 'log', message: `🔍 Profiling commenters ${i + 1}–${Math.min(i + batchSize, commenterUrls.length)}...` });

            try {
              const batchRun = await client.actor('apify/instagram-scraper').call({
                directUrls: batch,
                resultsType: 'details',
                resultsLimit: batch.length,
              }, { waitSecs: 180 });

              const { items: batchProfiles } = await client.dataset(batchRun.defaultDatasetId).listItems();

              for (const profile of batchProfiles) {
                const profileUsername = String(profile.username || '');
                if (!profileUsername || seen.has(profileUsername)) continue;
                seen.add(profileUsername);

                if (isBusinessLike(profile)) {
                  const lead = parseLead(profile, 'comments');
                  discovered.push(lead);
                  send({ type: 'lead', data: lead });
                  send({ type: 'log', message: `📌 [Commenter] @${profile.username} — ${profile.fullName || ''} ${profile.businessCategoryName ? `(${profile.businessCategoryName})` : ''}` });
                }
              }
            } catch (err: any) {
              send({ type: 'log', message: `⚠️ Batch profile error: ${err.message}` });
            }

            if (i + batchSize < commenterUrls.length) {
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }

        send({ type: 'log', message: `✅ Commenters: ${discovered.filter(d => d.source === 'comments').length} business leads found` });
      }

      // ── Step 3: Mine related/similar profiles ─────────────────────────────
      if (sources.related) {
        send({ type: 'log', message: `\n🔗 Mining related profiles...` });

        try {
          const relatedRun = await client.actor('apify/instagram-scraper').call({
            searchType: 'user',
            search: username,
            resultsType: 'details',
            resultsLimit: 20,
          }, { waitSecs: 120 });

          const { items: relatedItems } = await client.dataset(relatedRun.defaultDatasetId).listItems();

          for (const profile of relatedItems) {
            const profileUsername = String(profile.username || '');
            if (!profileUsername || seen.has(profileUsername) || profileUsername === username) continue;
            seen.add(profileUsername);

            if (isBusinessLike(profile)) {
              const lead = parseLead(profile, 'related');
              discovered.push(lead);
              send({ type: 'lead', data: lead });
              send({ type: 'log', message: `📌 [Related] @${profile.username} — ${profile.fullName || ''} ${profile.businessCategoryName ? `(${profile.businessCategoryName})` : ''}` });
            }
          }
          send({ type: 'log', message: `✅ Related: ${discovered.filter(d => d.source === 'related').length} similar business profiles found` });
        } catch (err: any) {
          send({ type: 'log', message: `⚠️ Related profiles error: ${err.message}` });
        }
      }

      send({ type: 'log', message: `\n🎯 COMPLETE! Found ${discovered.length} business leads from @${username}.` });
      send({ type: 'done', total: discovered.length });
    } catch (err: any) {
      send({ type: 'error', message: `Unexpected error: ${err.message}` });
    } finally {
      controller.close();
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── PUT: Save leads to Supabase ───────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const { leads } = await req.json();
    if (!leads?.length) return NextResponse.json({ error: 'No leads' }, { status: 400 });

    const rows = leads.map((l: any) => ({
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
        },
      },
      runs_ads: l.hasMetaPixel || false,
      has_pixel: l.hasMetaPixel || false,
      is_test: false,
    }));

    const { data, error } = await supabase.from('leads').insert(rows).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, saved: data?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
