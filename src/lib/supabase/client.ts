import { createClient } from '@supabase/supabase-js'

// Next.js evaluates this during build time. We provide a placeholder to prevent build crashes
// when environment variables are not yet injected.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
