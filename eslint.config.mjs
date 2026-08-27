/**
 * ESLint flat config（P3）。
 * 立场：只开正确性规则为 error（hooks/unused/any 等），风格类一律不启用，
 * 避免与项目既有约定冲突。未启用 eslint-plugin-react-native：v5 仍为
* legacy rule 格式（flat 下 no-unused-styles 直接抛错），收益不抵维护成本。
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/lib/**",
      "**/.expo/**",
      "**/coverage/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
      "harness-plugin/client/**",
      ".playwright-cli/**",
      ".shots/**",
      "**/dist-web*/**",
      "**/*.cjs",
      "metro.config.js",
      "**/babel.config.js",
      "**/metro.config.js",
      ".superpowers/**",
    ],
  },
  { files: ["**/*.{ts,tsx,mjs}"], languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
