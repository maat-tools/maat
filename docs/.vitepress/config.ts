import { defineConfig, type HeadConfig } from 'vitepress'

const gaMeasurementId = process.env.GA_MEASUREMENT_ID

const gaHead: HeadConfig[] = gaMeasurementId
  ? [
      [
        'script',
        {
          async: '',
          src: `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`,
        },
      ],
      [
        'script',
        {},
        `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(gaMeasurementId)});`,
      ],
    ]
  : []

const guideAndPluginSidebar = [
  {
    text: 'Guide',
    items: [
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Fitness functions', link: '/guide/fitness-functions' },
      { text: 'Greenfield and brownfield', link: '/guide/adoption' },
      { text: 'Determinism', link: '/guide/determinism' },
      { text: 'ADRs vs Axioms', link: '/guide/adrs-vs-axioms' },
      { text: 'Plugin system', link: '/guide/plugins' },
      { text: 'Enrichers', link: '/guide/enrichers' },
    ],
  },
  {
    text: 'Commands',
    items: [
      { text: 'All commands', link: '/commands/' },
      {
        text: 'Finding workflow',
        link: '/commands/check',
        collapsed: false,
        items: [
          { text: 'maat check', link: '/commands/check' },
          { text: 'maat baseline', link: '/commands/baseline' },
          { text: 'maat resolve', link: '/commands/resolve' },
          { text: 'maat verify', link: '/commands/verify' },
          { text: 'maat visualize', link: '/commands/visualize' },
        ],
      },
      {
        text: 'Axioms',
        link: '/commands/axiom-declare',
        collapsed: false,
        items: [
          { text: 'maat axiom declare', link: '/commands/axiom-declare' },
          { text: 'maat axiom supersede', link: '/commands/axiom-supersede' },
          { text: 'maat axiom revoke', link: '/commands/axiom-revoke' },
        ],
      },
    ],
  },
  {
    text: 'Plugins',
    items: [
      { text: 'All plugins', link: '/plugins/' },
      {
        text: 'Collectors',
        collapsed: false,
        items: [
          {
            text: 'TypeScript',
            link: '/plugins/collector-ts/',
          },
          {
            text: 'Git',
            link: '/plugins/collector-git/',
          },
        ],
      },
      {
        text: 'Rules',
        collapsed: false,
        items: [
          {
            text: 'Coupling',
            link: '/plugins/coupling-rules/',
            collapsed: false,
            items: [
              { text: 'layer(target)', link: '/plugins/coupling-rules/layer' },
            ],
          },
          {
            text: 'Connascence',
            link: '/plugins/connascence-rules/',
            collapsed: false,
            items: [
              { text: 'com', link: '/plugins/connascence-rules/com' },
              {
                text: 'cop',
                link: '/plugins/connascence-rules/cop',
                collapsed: false,
                items: [
                  { text: 'cop-args', link: '/plugins/connascence-rules/cop-args' },
                  { text: 'cop-struct', link: '/plugins/connascence-rules/cop-struct' },
                ],
              },
            ],
          },
          {
            text: 'Git',
            link: '/plugins/git-rules/',
            collapsed: false,
            items: [
              { text: 'churn', link: '/plugins/git-rules/churn' },
            ],
          },
        ],
      },
      {
        text: 'Insights',
        link: '/plugins/insights/',
        collapsed: false,
        items: [
          { text: 'erosion', link: '/plugins/insights/erosion' },
        ],
      },
    ],
  },
  {
    text: 'For Contributors',
    collapsed: false,
    items: [
      { text: '001 — Monorepo bounded packages', link: '/adr/001-monorepo-bounded-packages' },
      { text: '002 — Declaration merging registries', link: '/adr/002-declaration-merging-registries' },
      { text: '003 — Event-sourced NDJSON ledger', link: '/adr/003-event-sourced-ndjson-ledger' },
      { text: '004 — ULID ledger entry IDs', link: '/adr/004-ulid-ledger-entry-ids' },
      { text: '005 — Four-state finding lifecycle', link: '/adr/005-four-state-finding-lifecycle' },
      { text: '006 — Pure kernel', link: '/adr/006-pure-kernel' },
      { text: '007 — Plugin determinism contract', link: '/adr/007-plugin-determinism-contract' },
      { text: '008 — Fingerprint-based finding identity', link: '/adr/008-fingerprint-based-finding-identity' },
      { text: '009 — Axiom lifecycle', link: '/adr/009-axiom-lifecycle' },
      { text: '010 — Rule builder fluent DSL', link: '/adr/010-rule-builder-fluent-dsl' },
      { text: '011 — Enrichers', link: '/adr/011-enrichers-probabilistic-facts' },
    ],
  },
]

export default defineConfig({
  title: 'maat',
  description: 'Turn implicit architecture knowledge into deterministic checks.',
  base: '/maat/',

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/maat/maat.png' }],
    ...gaHead,
  ],

  themeConfig: {
    logo: '/maat.png',

    nav: [
      { text: 'Project', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Commands', link: '/commands/' },
      { text: 'Plugins', link: '/plugins/' },
    ],

    sidebar: {
      '/guide/': guideAndPluginSidebar,
      '/commands/': guideAndPluginSidebar,
      '/plugins/': guideAndPluginSidebar,
      '/adr/': [
        {
          text: 'For Contributors',
          collapsed: false,
          items: [
            { text: '001 — Monorepo bounded packages', link: '/adr/001-monorepo-bounded-packages' },
            { text: '002 — Declaration merging registries', link: '/adr/002-declaration-merging-registries' },
            { text: '003 — Event-sourced NDJSON ledger', link: '/adr/003-event-sourced-ndjson-ledger' },
            { text: '004 — ULID ledger entry IDs', link: '/adr/004-ulid-ledger-entry-ids' },
            { text: '005 — Four-state finding lifecycle', link: '/adr/005-four-state-finding-lifecycle' },
            { text: '006 — Pure kernel', link: '/adr/006-pure-kernel' },
            { text: '007 — Plugin determinism contract', link: '/adr/007-plugin-determinism-contract' },
            { text: '008 — Fingerprint-based finding identity', link: '/adr/008-fingerprint-based-finding-identity' },
            { text: '009 — Axiom lifecycle', link: '/adr/009-axiom-lifecycle' },
            { text: '010 — Rule builder fluent DSL', link: '/adr/010-rule-builder-fluent-dsl' },
            { text: '011 — Enrichers', link: '/adr/011-enrichers-probabilistic-facts' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/maat-tools/maat' },
    ],

  },
})
