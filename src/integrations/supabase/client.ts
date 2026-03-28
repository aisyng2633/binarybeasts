// Supabase client - auto-generated
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ymmpwauxwgzqsejoviig.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltbXB3YXV4d2d6cXNlam92aWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjkwNzQsImV4cCI6MjA5MDI0NTA3NH0.MMv0p_eOf_Kru3ln1N9U0Y2i3DL7Nl5vzR0xwvL_Nzk";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
