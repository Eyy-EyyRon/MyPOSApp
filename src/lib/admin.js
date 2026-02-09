import { createClient } from '@supabase/supabase-js'

// Your Project Credentials (ensure these are correct)
const supabaseUrl = 'https://nsbildrqcosormutvukw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zYmlsZHJxY29zb3JtdXR2dWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTEzOTAsImV4cCI6MjA4NTM2NzM5MH0.oQ_deYP8YzyZ0QPuV7zxPwekwDkwoFu4kKlkFFv2IAo'

// 🛡️ CUSTOM DUMMY STORAGE
// This prevents the temp client from overwriting the Manager's session in AsyncStorage
const InMemoryStorage = {
  getItem: (key) => null,
  setItem: (key, value) => null,
  removeItem: (key) => null,
};

export const createMerchantAccount = async (email, password, firstName, lastName, storeName, managerId) => {
  
  // 1. Create a strictly isolated client
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: InMemoryStorage, // 👈 KEY FIX: Forces RAM only
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    }
  });

  // 2. Sign up the Merchant (This happens in "Incognito Mode" now)
  const { data: authData, error: authError } = await tempClient.auth.signUp({
    email,
    password,
  });

  if (authError) return { error: authError };

  // 3. Add details to Profiles
  // We set 'is_new_user: true' so they ARE prompted when THEY log in
  const { error: profileError } = await tempClient 
    .from('profiles')
    .insert([{
      id: authData.user.id,
      role: 'merchant',
      first_name: firstName,
      last_name: lastName,
      store_name: storeName,
      is_verified: true, 
      created_by: managerId,
      is_new_user: true //  Triggers password change for MERCHANT only
    }]);

  // 4. Cleanup
  await tempClient.auth.signOut();

  return { data: authData.user, error: profileError };
};