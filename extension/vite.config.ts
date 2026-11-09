import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath, type Plugin } from 'vite';

function extensionAdapters(): Plugin {
  const extensionRoot = normalizePath(
    fileURLToPath(new URL('./', import.meta.url)),
  );
  const replacements = new Map(
    [
      ['components/common/SiteIconPicker.tsx', 'privacy/SiteIconPicker.tsx'],
      ['services/site-icons.ts', 'permissions/site-icons.ts'],
      ['services/site-icon-discovery.ts', 'permissions/site-icon-discovery.ts'],
      ['services/bookmark-title.ts', 'permissions/bookmark-title.ts'],
    ].map(([source, target]) => [
      normalizePath(
        fileURLToPath(new URL(`../src/${source}`, import.meta.url)),
      ),
      fileURLToPath(new URL(`./${target}`, import.meta.url)),
    ]),
  );
  return {
    name: 'extension-permission-adapters',
    enforce: 'pre',
    async resolveId(source, importer) {
      // The privacy wrapper imports the original picker without replacing it again.
      if (!importer || normalizePath(importer).startsWith(extensionRoot))
        return;
      if (
        !/\/(?:SiteIconPicker|site-icons|site-icon-discovery|bookmark-title)(?:\.[jt]sx?)?$/.test(
          source,
        )
      )
        return;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved) return replacements.get(normalizePath(resolved.id));
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  base: '/',
  plugins: [extensionAdapters(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-extension', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
});
