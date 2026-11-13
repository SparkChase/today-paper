import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url))

function firefoxManifest() {
  return {
    name: 'today-paper-firefox-manifest',
    generateBundle() {
      const chromeManifest = JSON.parse(readFileSync(fromRoot('./public/manifest.json'), 'utf8'))
      const { minimum_chrome_version, side_panel, background, ...shared } = chromeManifest
      const manifest = {
        ...shared,
        description: '在 Firefox 侧栏随手写下今天的想法、待看链接和待办。',
        permissions: shared.permissions.filter((permission) => permission !== 'sidePanel'),
        background: { scripts: [background.service_worker], type: background.type },
        sidebar_action: {
          default_panel: side_panel.default_path,
          default_title: shared.name,
          default_icon: shared.action.default_icon,
          open_at_install: false,
        },
        browser_specific_settings: {
          gecko: {
            id: 'today-paper@sparkchase',
            strict_min_version: '140.0',
            data_collection_permissions: { required: ['none'] },
          },
          gecko_android: { strict_min_version: '142.0' },
        },
      }
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) + '\n' })
    },
  }
}

export default defineConfig(({ mode }) => {
  const firefox = mode === 'firefox'
  return {
    base: './',
    plugins: [tailwindcss(), ...(firefox ? [firefoxManifest()] : [])],
    resolve: {
      alias: { '@': fromRoot('./vendor/looseleaf') },
    },
    build: {
      ...(firefox ? { outDir: 'dist-firefox', target: 'firefox140', cssTarget: 'firefox140' } : {}),
      rollupOptions: {
        input: {
          panel: fromRoot('./index.html'),
          background: fromRoot('./src/background.js'),
        },
        output: { entryFileNames: '[name].js' },
      },
    },
    esbuild: { jsx: 'automatic' },
  }
})
