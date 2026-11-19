import { createClient } from 'npm:@supabase/supabase-js@2.89.0';
import { galleryHandler } from './handler.ts';

const database = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(galleryHandler(database, {
  password: Deno.env.get('GALLERY_ACCESS_PASSWORD') ?? '',
  adminPassword: Deno.env.get('GALLERY_ADMIN_PASSWORD') ?? '',
  origins: (Deno.env.get('GALLERY_ALLOWED_ORIGINS') ?? 'https://xiaoyazhai.github.io').split(',').map(s => s.trim()),
}));
