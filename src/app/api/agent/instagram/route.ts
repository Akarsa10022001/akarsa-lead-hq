import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// ── Server-side Instagram API proxy ──────────────────────────────────────────
// We proxy calls through our server because CORS blocks browser → instagram.com
// The user's sessionid cookie is forwarded, which Instagram validates.

function igHeaders(sessionid: string, csrftoken?: string) {
  // IMPORTANT: URL-decode the session cookie (Chrome DevTools shows %3A which is ':')
  const decoded = decodeURIComponent(sessionid.trim());
  const cookieParts = [`sessionid=${decoded}`];
  if (csrftoken) cookieParts.push(`csrftoken=${csrftoken}`);
  
  return {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
    'Cookie': cookieParts.join('; '),
  };
}

async function igFetch(url: string, sessionid: string, csrftoken?: string) {
  const res = await fetch(url, {
    headers: igHeaders(sessionid, csrftoken),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.log(`[IG Proxy] ${url} → ${res.status} ${res.statusText}`);
    return null;
  }
  return res.json();
}

// POST: Proxy any Instagram API call
export async function POST(req: NextRequest) {
  try {
    const { endpoint, sessionid, csrftoken } = await req.json();
    if (!endpoint || !sessionid) {
      return NextResponse.json({ error: 'endpoint and sessionid required' }, { status: 400 });
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://www.instagram.com${endpoint}`;
    const data = await igFetch(url, sessionid, csrftoken);

    if (!data) {
      return NextResponse.json({ error: 'Instagram API returned no data. Check session cookie.' }, { status: 401 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Save leads to Supabase
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
      score_factors: { instagram: { username: l.username, followerCount: l.followerCount, biography: l.biography, source: l.source } },
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
