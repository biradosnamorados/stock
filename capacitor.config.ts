import type { CapacitorConfig } from '@capacitor/cli';

// App nativa (iPhone/Android) da Bira Gestão: a mesma webapp, empacotada com o Capacitor.
const config: CapacitorConfig = {
  appId: 'pt.biradosnamorados.gestao',
  appName: 'Bira Gestão',
  webDir: 'dist',
  backgroundColor: '#ffffff',
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false },
};

export default config;
