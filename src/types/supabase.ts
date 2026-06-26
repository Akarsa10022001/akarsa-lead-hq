export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string
          company_name: string
          domain: string | null
          industry: string | null
          contact_name: string | null
          contact_title: string | null
          email: string | null
          phone: string | null
          whatsapp_valid: boolean | null
          location: string | null
          status: 'New' | 'Contacted' | 'Engaged' | 'Meeting_Booked' | 'Won' | 'Lost'
          score_total: number
          score_grade: string | null
          ai_hook_draft: string | null
          opted_out: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_name: string
          domain?: string | null
          industry?: string | null
          contact_name?: string | null
          contact_title?: string | null
          email?: string | null
          phone?: string | null
          whatsapp_valid?: boolean | null
          location?: string | null
          status?: 'New' | 'Contacted' | 'Engaged' | 'Meeting_Booked' | 'Won' | 'Lost'
          score_total?: number
          score_grade?: string | null
          ai_hook_draft?: string | null
          opted_out?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          domain?: string | null
          industry?: string | null
          contact_name?: string | null
          contact_title?: string | null
          email?: string | null
          phone?: string | null
          whatsapp_valid?: boolean | null
          location?: string | null
          status?: 'New' | 'Contacted' | 'Engaged' | 'Meeting_Booked' | 'Won' | 'Lost'
          score_total?: number
          score_grade?: string | null
          ai_hook_draft?: string | null
          opted_out?: boolean
          updated_at?: string
        }
      }
      lead_signals: {
        Row: {
          id: string
          lead_id: string
          category: string
          signal_type: string
          evidence_text: string
          evidence_url: string | null
          raw_record_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          category: string
          signal_type: string
          evidence_text: string
          evidence_url?: string | null
          raw_record_id?: string | null
          created_at?: string
        }
        Update: {
          category?: string
          signal_type?: string
          evidence_text?: string
          evidence_url?: string | null
        }
      }
    }
  }
}
