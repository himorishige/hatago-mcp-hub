// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightMermaid from '@pasqal-io/starlight-client-mermaid';

// https://astro.build/config
export default defineConfig({
  site: 'https://hatago.dev',
  integrations: [
    starlight({
      plugins: [starlightMermaid()],
      title: '🏮 Hatago MCP Hub',
      defaultLocale: 'ja',
      locales: {
        ja: {
          label: '日本語'
        },
        en: {
          label: 'English'
        }
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/himorishige/hatago-mcp-hub'
        }
      ],
      sidebar: [
        {
          label: 'はじめに',
          translations: {
            en: 'Getting Started'
          },
          items: ['', 'getting-started/quick-start', 'getting-started/installation']
        },
        {
          label: 'チュートリアル',
          translations: {
            en: 'Tutorials'
          },
          collapsed: false,
          items: ['tutorials/10-minute-quickstart', 'tutorials/golden-path']
        },
        {
          label: 'How-to ガイド',
          translations: {
            en: 'How-to Guides'
          },
          collapsed: false,
          items: ['how-to/basic-configuration', 'how-to/remote-servers', 'how-to/tag-filtering']
        },
        {
          label: '概念説明',
          translations: {
            en: 'Explanation'
          },
          collapsed: false,
          items: ['explanation/architecture', 'explanation/data-flow']
        },
        {
          label: 'トラブルシューティング',
          translations: {
            en: 'Troubleshooting'
          },
          collapsed: false,
          items: ['troubleshooting']
        },
        {
          label: 'レシピ・例',
          translations: {
            en: 'Examples & Recipes'
          },
          collapsed: true,
          items: ['examples']
        },
        {
          label: 'パッケージ',
          translations: {
            en: 'Packages'
          },
          collapsed: true,
          autogenerate: { directory: 'packages' }
        },
        {
          label: 'リファレンス',
          translations: {
            en: 'Reference'
          },
          collapsed: true,
          items: ['reference/config', 'reference/api', 'reference/docs-map']
        }
      ],
      editLink: {
        baseUrl: 'https://github.com/himorishige/hatago-mcp-hub/edit/main/apps/docs/'
      },
      customCss: ['./src/styles/custom.css']
    })
  ]
});
