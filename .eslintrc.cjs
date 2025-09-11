
module.exports = {
    env: {
      browser: false,
      es6: true,
      jest: true,
    },
    extends: [
      'airbnb-base',
      'plugin:jest/all',
    ],
    globals: {
      Atomics: 'readonly',
      SharedArrayBuffer: 'readonly',
    },
    parserOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
    },
    plugins: ['jest'],
    rules: {
      'max-classes-per-file': 'off',
      'no-underscore-dangle': 'off',
      'no-console': 'off',
      'no-shadow': 'off',
      'no-restricted-syntax': [
        'error',
        'LabeledStatement',
        'WithStatement',
      ],
    },
    overrides:[
      // {
      //   files: ['*.js'],
      //   excludedFiles: 'babel.config.js',
      // }
    {
      files: ['tests/**/*.js'], // seulement les tests
      env: { mocha: true, node: true },
      plugins: ['mocha'],
      extends: ['plugin:mocha/recommended'],
      rules: {
        'jest/prefer-expect-assertions': 'off',
        'jest/valid-expect': 'off',
        'jest/lowercase-name': 'off',
        'jest/no-if': 'off',
        'import/no-unresolved': 'off',
        'max-len': ['error', { code: 120, ignoreUrls: true }],
        'no-unused-expressions': 'off', // pour Chai expect(...)
      },
    },
    ]
};
