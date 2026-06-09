// Supabase client utilities are split by environment:
//   lib/supabase-browser.ts   → Client Components
//   lib/supabase-server.ts    → Server Components & Route Handlers
//   lib/supabase-middleware.ts → Middleware
export { createClient } from './supabase-browser'
