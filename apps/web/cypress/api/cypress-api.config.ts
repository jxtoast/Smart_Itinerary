import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    env: {
      NEXT_PUBLIC_ENABLE_MOCK_AUTH: true,
    },
    baseUrl: "http://localhost:3000",
    specPattern: 'cypress/api/**/*spec.ts',
    setupNodeEvents(on, config) { },
  },
});
