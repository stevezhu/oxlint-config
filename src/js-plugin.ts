import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Resolve bundled dependencies from this package, including in pnpm consumers. */
export const jsPlugin = (name: string, specifier: string) => ({
  name,
  specifier: require.resolve(specifier),
});
