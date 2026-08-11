import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { parsePasswordRecoveryUrl } from '../services/authRecovery';

export function usePasswordRecoveryLink() {
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    const readyTimeout = setTimeout(() => {
      // A platform URL provider can hang while opening the app from a system
      // notification/link. Recovery must never keep the entire app blank.
      if (mounted) setReady(true);
    }, 5_000);

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const payload = parsePasswordRecoveryUrl(url);
      if (!payload) return;
      if ('error' in payload) {
        Alert.alert('Link de senha', payload.error);
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      });
      if (error) {
        Alert.alert('Link de senha', 'Nao foi possivel validar o link. Solicite uma nova redefinicao.');
      } else if (mounted) {
        setActive(true);
      }
    };

    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(readyTimeout);
        if (mounted) setReady(true);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    return () => {
      mounted = false;
      clearTimeout(readyTimeout);
      subscription.remove();
    };
  }, []);

  return { ready, active, clear: () => setActive(false) };
}
