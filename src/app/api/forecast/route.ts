import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import ARIMA from 'arima';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch all leads to compute daily counts
    const { data: leads, error } = await supabase
      .from('leads')
      .select('created_at')
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    if (!leads || leads.length === 0) {
      return NextResponse.json({ historyDays: 0, forecast: null });
    }

    // Group by YYYY-MM-DD
    const dailyCounts: Record<string, number> = {};
    leads.forEach(lead => {
      const date = new Date(lead.created_at).toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    const sortedDates = Object.keys(dailyCounts).sort();
    const historyDays = sortedDates.length;

    // Fill in missing days with 0 (optional, but good for time series)
    if (historyDays > 0) {
      const firstDate = new Date(sortedDates[0]);
      const lastDate = new Date(sortedDates[sortedDates.length - 1]);
      for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!dailyCounts[dateStr]) dailyCounts[dateStr] = 0;
      }
    }

    const completeDates = Object.keys(dailyCounts).sort();
    const tsData = completeDates.map(date => dailyCounts[date]);
    const actualHistoryDays = tsData.length;

    if (actualHistoryDays < 14) {
      return NextResponse.json({ historyDays: actualHistoryDays, forecast: null });
    }

    // Run ARIMA(1,1,1)
    const arima = new ARIMA({ p: 1, d: 1, q: 1, verbose: false }).train(tsData);
    const [predValues] = arima.predict(30);

    const forecastData = [];
    let predictedTotal = 0;

    // Start dates from tomorrow
    const lastDate = new Date(completeDates[completeDates.length - 1]);
    for (let i = 0; i < 30; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + i + 1);
      const predictedLeads = Math.max(0, Math.round(predValues[i] || 0));
      predictedTotal += predictedLeads;
      
      forecastData.push({
        date: nextDate.toISOString().split('T')[0],
        predicted_leads: predictedLeads
      });
    }

    return NextResponse.json({
      historyDays: actualHistoryDays,
      forecast: {
        summary: {
          predicted_total_30d: predictedTotal,
          predicted_avg_daily: Math.round(predictedTotal / 30)
        },
        forecast: forecastData
      }
    });

  } catch (err: any) {
    console.error("[Forecast API Error]", err);
    return NextResponse.json({ historyDays: 0, forecast: null, error: err.message }, { status: 500 });
  }
}
