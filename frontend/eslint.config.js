import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Lattice complexity rules (advisory — warn, not error)
      'complexity': ['warn', { max: 15 }],
      'max-depth': ['warn', { max: 4 }],
      'max-params': ['warn', { max: 5 }],
      // max-lines-per-function excluded: many React components are legitimately large
      // Domain-critical files (lib/cross-domain-syndromes.ts, lib/endpoint-confidence.ts, etc.)
      // may carry eslint-disable with mandatory justification comment (CLAUDE.md rule 15)
      // Underscore-prefixed identifiers are the codebase convention for intentionally
      // unused params/vars — honor that so the signal rule flags only real dead code.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // React Compiler-targeted rules from eslint-plugin-react-hooks v7. The codebase
      // has NOT adopted React Compiler (no babel-plugin-react-compiler, no runtime).
      // Keep as warnings so adoption signal is preserved without blocking CI.
      // Flip back to 'error' when React Compiler is enabled in vite.config.ts.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
