import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.tsx"],
  format: ["esm"],
  target: "node20",
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import{createRequire as __createRequire}from"module";const require=__createRequire(import.meta.url);',
    ].join("\n"),
  },
  clean: true,
});
