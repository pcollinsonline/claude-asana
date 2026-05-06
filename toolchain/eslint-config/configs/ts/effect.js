import plugin from '@codeforbreakfast/eslint-effect'
import { fixupPluginRules } from '@eslint/compat'
import { defineConfig } from 'eslint/config'

/**
 * @codeforbreakfast/eslint-effect
 *
 * ESLint rules and configurations for Effect projects that enforce
 * functional programming best practices and idiomatic Effect code patterns.
 * https://github.com/CodeForBreakfast/eventsourcing/tree/main/packages/eslint-effect
 */
export default defineConfig({
  files: ['**/*.ts', '**/*.cts', '**/*.mts', '**/*.tsx'],
  plugins: {
    effect: fixupPluginRules(plugin), // TODO - Remove once update to plugin to support ESLint 10.0.0 is released,
  },
  rules: {
    ...plugin.configs.recommended.rules,

    'effect/no-classes': 'off',
    'effect/no-curried-calls': 'off',
    'effect/no-eta-expansion': 'error',
    'effect/no-method-pipe': 'off',
    'effect/no-runPromise': 'off',
    'effect/no-unnecessary-function-alias': 'off',
    'effect/prefer-effect-platform': 'off',
    'effect/prefer-match-over-ternary': 'off',
  },
})
