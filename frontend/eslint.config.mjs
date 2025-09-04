import next from 'eslint-plugin-next'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
    ...js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    next.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ['./tsconfig.json'],
            },
        },
    },
]