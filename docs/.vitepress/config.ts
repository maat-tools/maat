import { defineConfig, type HeadConfig } from 'vitepress'

const gaMeasurementId = process.env.GA_MEASUREMENT_ID

// Set by the Pages workflow to the release tag (e.g. "v0.2.0") so the site
// states which published version it documents. Absent in local dev.
const docsVersion = process.env.MAAT_DOCS_VERSION

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
      { text: 'Greenfield and brownfield', link: '/guide/adoption' },
      { text: 'Repeatable results (determinism)', link: '/guide/determinism' },
      { text: 'AI-assisted facts (enrichers)', link: '/guide/enrichers' },
      { text: 'CI integration', link: '/guide/ci' },
      { text: 'Fitness functions', link: '/guide/fitness-functions' },
      { text: 'ADRs vs axioms', link: '/guide/adrs-vs-axioms' },
      { text: 'Plugin system', link: '/guide/plugins' },
      {
        text: 'LLM models',
        link: '/guide/llm-models',
        collapsed: false,
        items: [
          {
            text: 'Providers',
            collapsed: false,
            items: [
              { text: 'Google Vertex AI', link: '/guide/llm-models/vertex' },
              { text: 'Google AI', link: '/guide/llm-models/google' },
              { text: 'Anthropic', link: '/guide/llm-models/anthropic' },
              { text: 'xAI', link: '/guide/llm-models/xai' },
              { text: 'OpenAI', link: '/guide/llm-models/openai' },
              { text: 'OpenRouter', link: '/guide/llm-models/openrouter' },
            ],
          },
          {
            text: 'Models',
            collapsed: false,
            items: [
              { text: 'Gemini 3.5 Flash', link: '/guide/llm-models/gemini-3-5-flash' },
              { text: 'Gemini 3.1 Pro Preview', link: '/guide/llm-models/gemini-3-1-pro-preview' },
              { text: 'Claude Sonnet 4.6', link: '/guide/llm-models/claude-sonnet-4-6' },
              { text: 'Claude Opus 4.8', link: '/guide/llm-models/claude-opus-4-8' },
              { text: 'Claude Haiku 4.5', link: '/guide/llm-models/claude-haiku-4-5' },
              { text: 'Grok 4.3', link: '/guide/llm-models/grok-4-3' },
              { text: 'GPT 5.4', link: '/guide/llm-models/gpt-5-4' },
              { text: 'GPT 5.5', link: '/guide/llm-models/gpt-5-5' },
            ],
          },
        ],
      },
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
            text: 'Layers and boundaries',
            link: '/plugins/coupling-rules/',
            collapsed: false,
            items: [
              { text: 'layer(target)', link: '/plugins/coupling-rules/layer' },
            ],
          },
          {
            text: 'Hidden coupling (connascence)',
            link: '/plugins/connascence-rules/',
            collapsed: false,
            items: [
              {
                text: 'Shared meaning',
                collapsed: false,
                items: [
                  { text: 'Duplicated magic values (com)', link: '/plugins/connascence-rules/com' },
                  { text: 'Duplicated concepts, AI-read (com-semantic)', link: '/plugins/connascence-rules/com-semantic' },
                ],
              },
              {
                text: 'Order-dependent code',
                link: '/plugins/connascence-rules/cop',
                collapsed: false,
                items: [
                  { text: 'Positional arguments (cop-args)', link: '/plugins/connascence-rules/cop-args' },
                  { text: 'Index-based access (cop-struct)', link: '/plugins/connascence-rules/cop-struct' },
                ],
              },
              {
                text: 'Paired algorithms',
                link: '/plugins/connascence-rules/coa-technical',
                collapsed: false,
                items: [
                  { text: 'Encode/decode drift (coa-technical)', link: '/plugins/connascence-rules/coa-technical' },
                ],
              },
            ],
          },
          {
            text: 'Git history',
            link: '/plugins/git-rules/',
            collapsed: false,
            items: [
              { text: 'Files that churn (churn)', link: '/plugins/git-rules/churn' },
            ],
          },
        ],
      },
      {
        text: 'Presets',
        collapsed: false,
        items: [
          { text: 'TypeScript', link: '/plugins/presets-ts/' },
        ],
      },
      {
        text: 'Enrichers',
        link: '/plugins/enricher-llm/',
        collapsed: false,
        items: [
          { text: 'LLM enrichers', link: '/plugins/enricher-llm/' },
          { text: 'Shared meaning, AI-read (com)', link: '/plugins/enricher-llm/com' },
        ],
      },
      {
        text: 'Insights',
        link: '/plugins/insights/',
        collapsed: false,
        items: [
          { text: 'Erosion over time (erosion)', link: '/plugins/insights/erosion' },
        ],
      },
      {
        text: 'Ledger backends',
        collapsed: false,
        items: [
          { text: 'File ledger (NDJSON)', link: '/plugins/file-ledger/' },
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
  description: 'Linters check lines. maat checks the agreements your team made about the codebase.',
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
      ...(docsVersion
        ? [{ text: docsVersion, link: 'https://github.com/maat-tools/maat/releases' }]
        : []),
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
