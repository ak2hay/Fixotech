import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/storage/**",
      "**/generated/**",
      "**/next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: ["apps/api/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name=/^(data|update|create)$/] > TSAsExpression > TSNeverKeyword",
          message: "Do not cast Prisma write data to never. Parse the body with a zod schema and map fields explicitly.",
        },
        {
          selector: "Property[key.name=/^(data|update|create)$/][value.type='Identifier'][value.name='body']",
          message: "Do not pass a request body to Prisma. Parse it with a zod schema and map fields explicitly.",
        },
        {
          selector: "Property[key.name=/^(data|update|create)$/] > ObjectExpression > SpreadElement[argument.name='body']",
          message: "Do not spread a request body into Prisma data. Parse it with a zod schema and map fields explicitly.",
        },
      ],
    },
  },
);
