import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://xenolithengine.github.io',
  base: '/xenolith-graph',
  vite: {
    // Force a single physical copy of PIXI (its extensions self-register on import; two copies →
    // "Extension type shape-builder already has a handler") and pre-bundle it so Vite optimizes in
    // ONE pass — otherwise discovering a new demo import mid-load triggers a re-optimize and PIXI
    // ends up loaded from two optimize generations on the same page.
    optimizeDeps: { include: ['pixi.js', 'react', 'react-dom', 'react-dom/client'] },
    resolve: {
      dedupe: ['pixi.js', 'react', 'react-dom'],
      alias: {
        '@xenolith/core':         new URL('../../packages/core/src/index.ts',         import.meta.url).pathname,
        '@xenolith/render-pixi':  new URL('../../packages/render-pixi/src/index.ts',  import.meta.url).pathname,
        '@xenolith/editor':       new URL('../../packages/editor/src/index.ts',       import.meta.url).pathname,
        '@xenolith/adapter-core': new URL('../../packages/adapter-core/src/index.ts', import.meta.url).pathname,
        '@xenolith/react':        new URL('../../packages/react/src/index.tsx',       import.meta.url).pathname,
        '@xenolith/theme-xen':           new URL('../../packages/theme-xen/src/index.ts',           import.meta.url).pathname,
        '@xenolith/theme-liquid-glass':  new URL('../../packages/theme-liquid-glass/src/index.ts',  import.meta.url).pathname,
      },
    },
    build: { target: 'es2022' },
    esbuild: { target: 'es2022' },
  },
  integrations: [
    react(),
    starlight({
      title: 'Xenolith Graph',
      logo: { src: './src/assets/logo.png', alt: 'Xenolith Graph', replacesTitle: false },
      favicon: '/favicon-64.png',
      customCss: [
        new URL('./src/styles/fonts.css',   import.meta.url).pathname,
        new URL('./src/styles/theme.css',   import.meta.url).pathname,
        new URL('./src/styles/landing.css', import.meta.url).pathname,
      ],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ru:   { label: 'Русский', lang: 'ru' },
        zh:   { label: '中文',    lang: 'zh' },
      },
      components: {
        ThemeSelect:   './src/components/Empty.astro',
        ThemeProvider: './src/components/DarkOnly.astro',
      },
      expressiveCode: {
        themes: ['vesper'],
        styleOverrides: {
          borderRadius: '10px',
          borderColor: 'rgba(217, 202, 160, 0.18)',
          codeBackground: '#0F1010',
          frames: { shadowColor: 'transparent' },
        },
      },
      social: {
        github: 'https://github.com/XenolithEngine/xenolith-graph',
      },
      sidebar: [
        {
          label: 'Explore',
          translations: { ru: 'Обзор', zh: '探索' },
          items: [
            { label: 'Examples', link: '/examples/', attrs: { target: '_self' } },
            { label: 'Playground', link: '/playground/', attrs: { target: '_self' } },
          ],
        },
        {
          label: 'Getting Started',
          translations: { ru: 'Начало работы', zh: '开始使用' },
          items: [
            { slug: 'guides/install' },
            { slug: 'guides/init' },
            { slug: 'guides/api' },
          ],
        },
        {
          label: 'Customisation',
          translations: { ru: 'Кастомизация', zh: '自定义' },
          items: [
            { slug: 'guides/theme' },
          ],
        },
      ],
      head: [
        { tag: 'meta', attrs: { property: 'og:image',        content: 'https://xenolithengine.github.io/xenolith-graph/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width',  content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:card',        content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image',       content: 'https://xenolithengine.github.io/xenolith-graph/og.png' } },
      ],
    }),
  ],
})
