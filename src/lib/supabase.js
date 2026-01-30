// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nsbildrqcosormutvukw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zYmlsZHJxY29zb3JtdXR2dWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTEzOTAsImV4cCI6MjA4NTM2NzM5MH0.oQ_deYP8YzyZ0QPuV7zxPwekwDkwoFu4kKlkFFv2IAo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)