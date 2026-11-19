import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase du navigateur.
 * N'utilise que l'URL et la clé "anon" (publiques) : toute la sécurité
 * repose sur les règles RLS de la base. La clé service_role ne doit
 * jamais apparaître dans le code du frontend.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    'Supabase non configuré : copie .env.example en .env.local, remplis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY, puis redémarre "npm run dev".'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // liens de réinitialisation du mot de passe
      },
    })
  : null;
