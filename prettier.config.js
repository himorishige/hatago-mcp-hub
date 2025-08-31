export default {
  tabWidth: 2,
  singleQuote: true,
  semi: true,
  trailingComma: 'es5',
  printWidth: 100,
  overrides: [
    {
      files: ['*.md', '*.mdx'],
      options: {
        proseWrap: 'preserve',
      },
    },
    {
      files: ['*.json', '*.jsonc'],
      options: {
        printWidth: 80,
      },
    },
    {
      files: ['*.yaml', '*.yml'],
      options: {
        singleQuote: false,
      },
    },
  ],
};
