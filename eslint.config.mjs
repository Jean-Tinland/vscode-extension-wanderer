import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const ignoredPaths = [
  "node_modules/**",
  "dist/**",
  "webview/dist/**",
  "**/*.d.ts",
];

const noUnusedVariablesRule = [
  "error",
  {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
  },
];

export default tseslint.config(
  {
    ignores: ignoredPaths,
  },
  eslint.configs.recommended,
  {
    files: ["esbuild.config.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended,
  {
    files: [
      "extension/src/**/*.ts",
      "shared/**/*.ts",
      "webview/vite.config.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": noUnusedVariablesRule,
    },
  },
  {
    files: ["webview/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": noUnusedVariablesRule,
    },
  },
  prettier,
);
