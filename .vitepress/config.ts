import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'combhq',
  description: 'Per-tenant container platform for any infrastructure.',
  base: '/docs/',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: 'localhostLinks',
  srcExclude: ['README.md'],

  head: [
    ['meta', { name: 'theme-color', content: '#f5a623' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Getting started', link: '/getting-started/operator' },
      { text: 'Concepts', link: '/concepts/tenants' },
      { text: 'API', link: '/api/rest' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'GitHub', link: 'https://github.com/combhq' },
    ],

    sidebar: [
      {
        text: 'Overview',
        items: [
          { text: 'What is combhq?', link: '/what-is-combhq' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'What it is not', link: '/what-it-is-not' },
        ],
      },
      {
        text: 'Getting started',
        items: [
          { text: 'Operator quickstart', link: '/getting-started/operator' },
        ],
      },
      {
        text: 'Concepts',
        items: [
          { text: 'Tenants', link: '/concepts/tenants' },
          { text: 'Hosts', link: '/concepts/hosts' },
          { text: 'Containers', link: '/concepts/containers' },
          { text: 'Drivers', link: '/concepts/drivers' },
          { text: 'Tunnels', link: '/concepts/tunnels' },
        ],
      },
      {
        text: 'API reference',
        items: [
          { text: 'REST', link: '/api/rest' },
          { text: 'gRPC (agent stream)', link: '/api/grpc' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Roadmap', link: '/roadmap' },
          { text: 'Original design doc', link: '/brainstorm' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/combhq' },
    ],

    editLink: {
      pattern: 'https://github.com/combhq/docs/edit/main/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © combhq',
    },

    search: {
      provider: 'local',
    },
  },
})
