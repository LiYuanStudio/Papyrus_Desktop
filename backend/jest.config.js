/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^#/(.*)\\.js$': '<rootDir>/src/$1',
    '^#/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          strict: true,
          noImplicitAny: true,
          strictNullChecks: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/core/**/*.ts',
    'src/utils/**/*.ts',
    'src/db/**/*.ts',
    'src/ai/**/*.ts',
    'src/mcp/**/*.ts',
    'src/integrations/**/*.ts',
    'src/cli/**/*.ts',
    'src/api/routes/**/*.ts',
    '!src/**/*.d.ts',
    '!src/api/server.ts',
    '!src/utils/proxy.ts',
    '!src/ai/provider.ts',
    '!src/integrations/file-watcher.ts',
    '!src/mcp/server.ts',
    '!src/cli/cli-manager.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: ['**/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/jest-setup.ts'],
  testTimeout: 10000,
  verbose: true,
};
