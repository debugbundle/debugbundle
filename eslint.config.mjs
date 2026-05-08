import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "**/dist/**",
      ".venv/**",
      "**/.venv/**",
      "node_modules/**",
      "**/.next/**",
      "examples/**",
      "sdks/**",
      "tests/apps/public-site/**",
      "tests/site/**",
      "site/**"
    ]
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: configDir
      }
    },
    plugins: {
      "@typescript-eslint": tsEslintPlugin
    },
    rules: {
      ...tsEslintPlugin.configs.recommended.rules,
      ...tsEslintPlugin.configs["recommended-type-checked"].rules,
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true
        }
      ]
    }
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx", "sdks/**/tests/**/*.ts", "sdks/**/tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off"
    }
  },
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/require-await": "off"
    }
  },
  {
    files: ["apps/web/src/components/ui/**/*.tsx"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off"
    }
  }
];
