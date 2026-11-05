import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = new URL(env.VITE_SITE_URL || 'https://jigeqiu.com/');
  if (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password) {
    throw new Error('VITE_SITE_URL must be an HTTP or HTTPS URL without credentials');
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'deployment-site-url',
        transformIndexHtml(html) {
          const url = siteUrl.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
          return html
            .replace('<link rel="canonical" href="https://jigeqiu.com/"', `<link rel="canonical" href="${url}"`)
            .replace('<meta property="og:url" content="https://jigeqiu.com/"', `<meta property="og:url" content="${url}"`);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Optional switch for environments where file watching is unavailable.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
