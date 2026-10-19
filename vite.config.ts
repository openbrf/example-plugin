import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * A chunk's name, cut short and in the characters the catalog's reader takes
 * in a path segment: a letter or digit first, then letters, digits, `.`, `_`
 * and `-`.
 */
function shortName(name: string): string {
  const cut = name
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 40);
  return cut === "" ? "chunk" : cut;
}

/**
 * The view's build: a Module Federation 2.0 remote the host loads at runtime.
 *
 * The remote's name is the plugin id and the exposed module is the manifest's
 * `view.module`; the host looks both up from the manifest it already read.
 *
 * React, ReactDOM, react-i18next and i18next are shared singletons, the same
 * four the host shares. The host has already loaded all of them, and a second
 * copy of any would give the view its own hook dispatcher or its own resource
 * store: the first breaks on the first hook call, the second shows keys
 * instead of text, because the plugin's translations were merged into the
 * host's store and nowhere else. `requiredVersion: false` because the plugin
 * is installed into a host whose exact versions it was not built against, and
 * refusing to share over a patch difference would load the duplicate the
 * singleton exists to prevent.
 */
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "occupancy",
      filename: "remoteEntry.js",
      exposes: { "./View": "./src/View.tsx" },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
        "react-i18next": { singleton: true, requiredVersion: false },
        i18next: { singleton: true, requiredVersion: false },
      },
      // The type archive is for a consumer that imports the remote at its own
      // build time. The host loads this one from its manifest at runtime, so
      // the archive would only be dead weight in the tarball.
      dts: false,
    }),
  ],
  build: {
    target: "esnext",
    outDir: "dist",
    // The view is built first and owns the directory while it runs; tsc then
    // emits the server bundle beside it.
    emptyOutDir: true,
    // No input of its own: the remote entry is the only entry point, and the
    // federation plugin emits it. Left unset, Vite would look for the
    // index.html of an application this package is not.
    rollupOptions: {
      input: {},
      output: {
        // The federation plugin names its chunks after its virtual module ids,
        // which start with an underscore and run past 100 characters. The
        // catalog reads a plugin's tarball with the strict reader an instance
        // reads a theme with, and it refuses both: a segment that does not
        // start with a letter or a digit, and the pax extension record a name
        // that long is stored with.
        chunkFileNames: (chunk) => `assets/${shortName(chunk.name)}-[hash].js`,
        assetFileNames: (asset) =>
          `assets/${shortName(asset.names[0] ?? "asset")}-[hash][extname]`,
      },
    },
  },
});
