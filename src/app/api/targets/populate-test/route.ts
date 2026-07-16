import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST() {
  try {
    // 1. Fetch top A/B leads that have NULL or N/A contact names
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, company_name')
      .in('score_grade', ['A', 'B'])
      .order('score_total', { ascending: false })
      .limit(5);

    if (fetchError) throw fetchError;
    
    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: 'No top A/B leads found in table.' });
    }

    const mockNames = ['John Doe', 'Sarah Jenkins', 'Alex Mercer', 'Emily Watson', 'David Miller'];
    const mockPhones = ['919876543210', '919876543211', '919876543212', '919876543213', '919876543214'];
    const updated = [];

    // 2. Assign valid names and phones to the top 5 leads
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const name = mockNames[i];
      const phone = mockPhones[i];

      const { error: updateError } = await supabase
        .from('leads')
        .update({ 
          contact_name: name,
          phone: phone
        })
        .eq('id', lead.id);

      if (updateError) {
        console.error(`Failed updating lead ${lead.id}:`, updateError.message);
      } else {
        updated.push({ company: lead.company_name, name, phone });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully populated test contact names for ${updated.length} top leads.`,
      updated
    });

  } catch (error: any) {
    console.error('[TestPopulate] Failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
