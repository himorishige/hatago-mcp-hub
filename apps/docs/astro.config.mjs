// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightMermaid from '@pasqal-io/starlight-client-mermaid';

// https://astro.build/config
export default defineConfig({
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
          href: 'https://github.com/himorishige/hatago-hub'
        }
      ],
      sidebar: [
        {
          label: 'はじめに',
          translations: {
            en: 'Getting Started'
          },
          items: [
            { label: 'イントロダクション', link: '/' },
            { label: 'クイックスタート', link: '/getting-started/quick-start/' },
            { label: 'インストール', link: '/getting-started/installation/' }
          ]
        },
        {
          label: 'チュートリアル',
          translations: {
            en: 'Tutorials'
          },
          collapsed: false,
          items: [
            { label: '🚀 10分クイックスタート', link: '/tutorials/10-minute-quickstart/' },
            { label: '🎯 ゴールデンパス', link: '/tutorials/golden-path/' }
          ]
        },
        {
          label: 'How-to ガイド',
          translations: {
            en: 'How-to Guides'
          },
          collapsed: false,
          items: [
            { label: '基本設定', link: '/how-to/basic-configuration/' },
            { label: 'リモートサーバー接続', link: '/how-to/remote-servers/' },
            { label: 'タグフィルタリング', link: '/how-to/tag-filtering/' }
          ]
        },
        {
          label: '概念説明',
          translations: {
            en: 'Explanation'
          },
          collapsed: false,
          items: [
            { label: 'システムアーキテクチャ', link: '/explanation/architecture/' },
            { label: 'データフロー', link: '/explanation/data-flow/' }
          ]
        },
        {
          label: 'トラブルシューティング',
          translations: {
            en: 'Troubleshooting'
          },
          collapsed: false,
          items: [{ label: 'よくある問題 Top10', link: '/troubleshooting/' }]
        },
        {
          label: 'レシピ・例',
          translations: {
            en: 'Examples & Recipes'
          },
          collapsed: true,
          items: [{ label: 'コード例一覧', link: '/examples/' }]
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
          items: [
            { label: '設定オプション', link: '/reference/config/' },
            { label: 'APIリファレンス', link: '/reference/api/' }
          ]
        }
      ],
      editLink: {
        baseUrl: 'https://github.com/himorishige/hatago-hub/edit/main/apps/docs/'
      },
      customCss: ['./src/styles/custom.css']
    })
  ]
});
