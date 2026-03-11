import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jnynfpqneytabccplphc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_pYNWNHK7hKrTIJd0IzePuQ_uysAe1vd'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
