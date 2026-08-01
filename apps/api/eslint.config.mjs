import config from '@repo/eslint-config/nestjs';

export default [
  ...config,
  {
    ignores: ['dist/**'],
  },
];
