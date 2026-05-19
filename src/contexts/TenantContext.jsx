import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from './AuthContext';

const TenantContext = createContext(null);

const SLUG_KEY = 'vektor_gym_slug';

function hexToRgbChannels(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyBranding(tenant) {
  const root = document.documentElement;
  if (tenant) {
    root.style.setProperty('--color-brand', tenant.brand_color_primary);
    root.style.setProperty('--color-brand-rgb', hexToRgbChannels(tenant.brand_color_primary));
    root.style.setProperty('--color-action-dark', tenant.brand_color_secondary);
  } else {
    root.style.removeProperty('--color-brand');
    root.style.removeProperty('--color-brand-rgb');
    root.style.removeProperty('--color-action-dark');
  }
}

async function fetchBySlug(slug) {
  const { data } = await supabase
    .from('gym_tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();
  return data || null;
}

async function fetchById(id) {
  const { data } = await supabase
    .from('gym_tenants')
    .select('*')
    .eq('id', id)
    .single();
  return data || null;
}

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);

  // Capture ?gym=slug from URL on any page load
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('gym');
    if (slug) localStorage.setItem(SLUG_KEY, slug);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Authenticated: prefer tenant_id from user profile
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('tenant_id')
          .eq('created_by', user.id)
          .single();

        if (!cancelled && profile?.tenant_id) {
          const t = await fetchById(profile.tenant_id);
          if (!cancelled && t) {
            setTenant(t);
            applyBranding(t);
            return;
          }
        }
      }

      // Fall back to stored slug (pre-auth, or profile not yet linked)
      const slug = localStorage.getItem(SLUG_KEY);
      if (!slug) return;

      const t = await fetchBySlug(slug);
      if (cancelled) return;
      setTenant(t);
      applyBranding(t);

      // Lazy-link tenant to user profile if not yet set
      if (user && t) {
        await supabase
          .from('user_profiles')
          .update({ tenant_id: t.id })
          .eq('created_by', user.id)
          .is('tenant_id', null);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <TenantContext.Provider value={{ tenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
