import { supabase } from './supabase';

export const setupAuthErrorHandler = () => {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);

      if (response.status === 401 || response.status === 400) {
        const url = args[0]?.toString() || '';

        if (url.includes('token?grant_type=refresh_token')) {
          console.warn('Token de refresh inválido, a limpar sessão...');
          await supabase.auth.signOut();
          window.location.href = '/login';
        }
      }

      return response;
    } catch (error) {
      console.error('Erro na requisição:', error);
      throw error;
    }
  };
};
