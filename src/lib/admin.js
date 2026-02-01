import { createClient } from '@supabase/supabase-js'

// We need your URL and Key again here to create a temporary client
const supabaseUrl = 'https://nsbildrqcosormutvukw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zYmlsZHJxY29zb3JtdXR2dWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTEzOTAsImV4cCI6MjA4NTM2NzM5MH0.oQ_deYP8YzyZ0QPuV7zxPwekwDkwoFu4kKlkFFv2IAo'

export const createMerchantAccount = async (email, password, firstName, lastName, storeName, managerId) => {
  
  // 1. Create a temporary client just for this action
  // FIXED: Used 'supabaseAnonKey' correctly here
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // Don't save this session! Keep the Manager logged in.
      autoRefreshToken: false,
    }
  });

  // 2. Sign up the Merchant
  const { data: authData, error: authError } = await tempClient.auth.signUp({
    email,
    password,
  });

  if (authError) return { error: authError };

  // 3. Add their details to the Profiles table
  // We explicitly set 'is_password_changed' to FALSE so they must change it later.
  const { error: profileError } = await tempClient 
    .from('profiles')
    .insert([{
      id: authData.user.id,
      role: 'merchant',
      first_name: firstName,
      last_name: lastName,
      store_name: storeName,
      is_verified: true, // Merchants added by managers are auto-verified
      created_by: managerId,
      is_password_changed: false // <--- CRITICAL: Forces the password change screen
    }]);

  return { data: authData.user, error: profileError };
};