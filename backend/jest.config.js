export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/**/*.test.mjs'],
  testTimeout: 10000,
  setupFilesAfterEnv: [],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
};