import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://xenolithengine.github.io',
  base: '/xenolith-graph',
  vite: {
    resolve: {
      alias: {
        '@xenolith/core':         new URL('../../packages/core/src/index.ts',         import.meta.url).pathname,
        '@xenolith/render-pixi':  new URL('../../packages/render-pixi/src/index.ts',  import.meta.url).pathname,
        '@xenolith/editor':       new URL('../../packages/editor/src/index.ts',       import.meta.url).pathname,
        '@xenolith/theme-xen':           new URL('../../packages/theme-xen/src/index.ts',           import.meta.url).pathname,
        '@xenolith/theme-liquid-glass':  new URL('../../packages/theme-liquid-glass/src/index.ts',  import.meta.url).pathname,
      },
    },
    build: { target: 'es2022' },
    esbuild: { target: 'es2022' },
  },
  integrations: [
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
          label: 'Getting Started',
          translations: { ru: 'Начало работы', zh: '开始使用' },
          items: [
            { slug: 'guides/install' },
            { slug: 'guides/init' },
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
