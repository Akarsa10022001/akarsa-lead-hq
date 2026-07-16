import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST() {
  try {
    // 1. Check current count in dream_targets
    const { count: currentCount, error: countError } = await supabase
      .from('dream_targets')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const remainingSlots = 25 - (currentCount || 0);

    if (remainingSlots <= 0) {
      return NextResponse.json({
        success: true,
        message: 'Your Dream 25 queue is already full. Remove some targets first if you want to rotate.',
        promotedCount: 0
      });
    }

    // 2. Fetch already promoted lead_ids to prevent duplicates
    const { data: existingTargets } = await supabase
      .from('dream_targets')
      .select('lead_id')
      .not('lead_id', 'is', null);

    const existingLeadIds = existingTargets?.map(t => t.lead_id) || [];

    // 3. Fetch top leads that have valid personal contacts (A or B grades)
    const { data: topLeads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .in('score_grade', ['A', 'B'])
      .order('score_total', { ascending: false });

    if (leadsError) throw leadsError;

    if (!topLeads || topLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No A or B grade leads found in database to promote.',
        promotedCount: 0
      });
    }

    // 4. Filter out generic contacts and already promoted ones
    const genericTerms = ['n/a', 'info', 'support', 'contact', 'sales', 'team', 'office', 'generic', 'admin', 'hello'];
    
    const validLeads = topLeads.filter(lead => {
      if (existingLeadIds.includes(lead.id)) return false;
      
      const contact = (lead.contact_name || '').trim().toLowerCase();
      if (!contact) return false;

      const isGeneric = genericTerms.some(term => contact.includes(term));
      return !isGeneric;
    });

    if (validLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No leads passed the decision-maker name validation (found only generic contacts like info/team).',
        promotedCount: 0
      });
    }

    // Slice to only fill remaining slots
    const leadsToPromote = validLeads.slice(0, remainingSlots);
    const promotedList = [];

    for (const lead of leadsToPromote) {
      const social = lead.social_links || {};

      // Insert into dream_targets
      const { data: target, error: targetError } = await supabase
        .from('dream_targets')
        .insert({
          lead_id: lead.id,
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          contact_title: 'Owner',
          email: lead.email || null,
          phone: lead.phone || null,
          linkedin_url: social.linkedin || null,
          instagram_handle: social.instagram || null,
          notes: lead.ai_hook_draft || 'Auto-promoted based on high intel score grade.'
        })
        .select()
        .single();

      if (targetError) {
        console.error(`Failed promoting ${lead.company_name}:`, targetError.message);
        continue;
      }

      // Seed WhatsApp Consent
      await supabase
        .from('consents')
        .insert({
          target_id: target.id,
          channel: 'whatsapp',
          opted_in: false,
          source: 'auto_promotion'
        });

      // Assign sequence
      await supabase
        .from('target_sequences')
        .insert({
          target_id: target.id,
          sequence_id: 'd3b07384-d113-4c9b-8c5d-2b47d3d19117',
          current_step: 0,
          status: 'active'
        });

      promotedList.push(target.company_name);
    }

    return NextResponse.json({
      success: true,
      promotedCount: promotedList.length,
      promotedTargets: promotedList,
      message: `Successfully auto-promoted ${promotedList.length} high-value leads to your Dream 25.`
    });

  } catch (error: any) {
    console.error('[AutoPromote] Crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
