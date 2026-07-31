import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch leads created in the last 7 days
    const { data: recentLeads, error: recentErr } = await supabase
      .from('leads')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (recentErr) throw new Error(recentErr.message);

    // Fetch earliest lead date to check total history span
    const { data: oldestLead } = await supabase
      .from('leads')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!oldestLead) {
      return NextResponse.json({ historyDays: 0, forecast: null });
    }

    const firstDate = new Date(oldestLead.created_at);
    const historyDays = Math.ceil((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

    if (historyDays < 7) {
      return NextResponse.json({ historyDays, forecast: null });
    }

    const leads7dCount = recentLeads?.length || 0;
    const dailyAvg = leads7dCount / 7;
    const runRate30d = Math.round(dailyAvg * 30);

    const forecastData = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const nextDate = new Date(today);
      nextDate.setDate(nextDate.getDate() + i + 1);
      forecastData.push({
        date: nextDate.toISOString().split('T')[0],
        predicted_leads: Math.round(dailyAvg)
      });
    }

    return NextResponse.json({
      historyDays,
      forecast: {
        summary: {
          predicted_total_30d: runRate30d,
          predicted_avg_daily: Math.round(dailyAvg)
        },
        forecast: forecastData
      }
    });

  } catch (err: any) {
    console.error("[Forecast API Error]", err);
    return NextResponse.json({ historyDays: 0, forecast: null, error: err.message }, { status: 500 });
  }
}
