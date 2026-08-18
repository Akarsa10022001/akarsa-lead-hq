import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_OWNER = 'Akarsa10022001';
const DEFAULT_REPO = 'akarsa-lead-hq';
const WORKFLOW_ID = 'instagram-miner.yml';

// ── GET: Check latest workflow run status from GitHub ─────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || process.env.GITHUB_TOKEN;
  const owner = searchParams.get('owner') || DEFAULT_OWNER;
  const repo = searchParams.get('repo') || DEFAULT_REPO;

  if (!token) {
    return NextResponse.json({
      configured: false,
      message: 'Provide a GitHub Token (PAT) to check live workflow statuses',
      runs: [],
    });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_ID}/runs?per_page=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({
        configured: true,
        error: err.message || `GitHub returned HTTP ${res.status}`,
        runs: [],
      });
    }

    const data = await res.json();
    const runs = (data.workflow_runs || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      html_url: r.html_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
      run_number: r.run_number,
      event: r.event,
    }));

    return NextResponse.json({ configured: true, runs });
  } catch (err: any) {
    return NextResponse.json({ configured: true, error: err.message, runs: [] });
  }
}

// ── POST: Dispatch a new mining run on GitHub Actions ─────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      token = process.env.GITHUB_TOKEN,
      owner = DEFAULT_OWNER,
      repo = DEFAULT_REPO,
      targets = '',
      keywords = '',
      maxLeads = '30',
      dryRun = false,
    } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub Personal Access Token (PAT) is required to trigger workflows.' },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            targets: String(targets),
            keywords: String(keywords),
            max_leads: String(maxLeads),
            dry_run: dryRun,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.status === 204 || res.ok) {
      return NextResponse.json({
        success: true,
        message: '🚀 Successfully dispatched GitHub Actions Miner job!',
        actionUrl: `https://github.com/${owner}/${repo}/actions/workflows/${WORKFLOW_ID}`,
      });
    }

    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: err.message || `GitHub error: HTTP ${res.status}` },
      { status: res.status }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
