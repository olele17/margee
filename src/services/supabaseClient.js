import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error(
    'Supabase non configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local, puis redémarrez le serveur de dev.'
  );
}

// Des valeurs de secours évitent un crash immédiat de createClient() (et donc un écran
// blanc) tant que .env.local n'est pas rempli — les appels échoueront proprement plus
// tard (erreur réseau) plutôt qu'au chargement du module.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key'
);
