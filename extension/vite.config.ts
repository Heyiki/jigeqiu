import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath, type Plugin } from 'vite';

function imagePrivacyNotice(): Plugin {
  const extensionRoot = normalizePath(
    fileURLToPath(new URL('./', import.meta.url)),
  );
  const sharedPicker = normalizePath(
    fileURLToPath(
      new URL('../src/components/common/SiteIconPicker.tsx', import.meta.url),
    ),
  );
  const privacyPicker = fileURLToPath(
    new URL('./privacy/SiteIconPicker.tsx', import.meta.url),
  );
  return {
    name: 'extension-image-privacy-notice',
    enforce: 'pre',
    async resolveId(source, importer) {
      // The privacy wrapper imports the original picker without replacing it again.
      if (!importer || normalizePath(importer).startsWith(extensionRoot))
        return;
      if (!/\/SiteIconPicker(?:\.[jt]sx?)?$/.test(source)) return;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved && normalizePath(resolved.id) === sharedPicker)
        return privacyPicker;
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  base: '/',
  plugins: [imagePrivacyNotice(), react(), tailwindcss()],
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
