# example-plugin

The reference [Open BRF](https://github.com/openbrf/openbrf) plugin. A housing
cooperative can install it from the catalog, and a plugin author can start
from it. It is built only against the published plugin contract,
[`@openbrf/plugin-sdk`](https://www.npmjs.com/package/@openbrf/plugin-sdk), the
same way any third-party plugin is.

## What it does

**Boende och lägenheter** (Residents and apartments) gives the board two
things:

- the association's counts: how many apartments, how many residents, and how
  many members;
- the apartments listed by address or by floor, with how many people are
  registered as living in each and how many of them hold the tenant-ownership.
  An apartment with nobody registered is marked. It may stand empty, or the
  register may lack the people who live there.

The board sets four things in the plugin's settings: a heading of its own,
whether the member count shows, the grouping the list opens with, and how many
apartments the list shows at most.

It also proposes one action, `summary`, which returns the three counts. An
administrator can arm it on the plugin's screen so that connected apps can use
it too.

## What it asks for, and why

| Declaration        | Value                            | Why                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission         | `addressBook:read`               | The counts and the apartment list come from the register. Nothing else: no contact details, no mail, no jobs.                                                                                                                       |
| Personal data      | `name`, `apartment`, `residency` | To count people per apartment the plugin reads the residents, and the host hands each one out with their name, apartment and residency. The plugin only counts them: the browser receives numbers, and nothing leaves the instance. |
| Action `summary`   | `read`, no personal data         | It returns three counts and names nobody, so it may be offered to connected apps (`mcp`) as well as on the platform's own screens (`ui`).                                                                                           |
| Protected resource | none                             | An instance has only one OAuth protected resource. A plugin holding it would keep a real connector from being installed.                                                                                                            |

Like every plugin, it never sees a person with protected personal data
(skyddade personuppgifter) or any personal identity number. The host leaves
them out of every register read.

## Where each part of the contract is

The [plugin contract](https://github.com/openbrf/openbrf/blob/main/docs/plugin-contract.md)
is the reference. This is where this package meets each part of it.

| Part          | Here                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest      | The `openbrf` field of [`package.json`](package.json): id, entries, permission, personal data, view, settings (all four field types) and the action.                               |
| Server entry  | [`src/server.ts`](src/server.ts), compiled by `tsc` to `dist/server.cjs`: one CommonJS file that requires only `@nestjs/common` and `zod`, which resolve to the host's own copies. |
| NestJS module | A provider with an `onModuleInit` hook, and a controller whose two routes the host mounts at `/api/plugin/occupancy/summary` and `/api/plugin/occupancy/apartments`.               |
| Route input   | `GET apartments` takes one query parameter, read with the host's zod. Anything else is answered with 400.                                                                          |
| Settings      | Read with `host.settings.read()` on every request, so a change the board saves applies at once.                                                                                    |
| Action        | Declared in the manifest and registered from the module factory, after checking that `host.actions` exists, because an older host does not have it.                                |
| View          | [`src/View.tsx`](src/View.tsx), built by Vite into `dist/remoteEntry.js`: a Module Federation remote that exposes `./View` and shares React and i18next with the host.             |
| Theming       | The view is styled only with `--obrf-*` design tokens, so a theme restyles it with the rest of the interface.                                                                      |
| Translations  | [`locales/sv.json`](locales/sv.json) and [`locales/en.json`](locales/en.json), merged by the host under the `plugin-occupancy` namespace.                                          |
| Package check | [`scripts/check-package.mjs`](scripts/check-package.mjs) reads the packed tarball the way the catalog does and runs `pluginPackageProblems` on it.                                 |
| Release       | [`.github/workflows/release.yml`](.github/workflows/release.yml): on a `v<version>` tag it packs the tarball once, checks it, attests it and publishes it on a release.            |

## Building and testing

You need Node 26 and pnpm 12. `corepack enable` gives you the pnpm version
pinned in `package.json`.

```sh
pnpm install
pnpm typecheck
pnpm test            # builds dist/, then runs the tests
pnpm check:package   # packs the package and runs the catalog's checks on it
```

The tests cover four things:

- the counting, the grouping and the reading of the settings, against a small
  register with its edge cases;
- the built `dist/server.cjs` in a NestJS testing module, which shows that the
  decorator metadata survived the build and that the host can publish the
  action's schemas;
- the view, rendered with the plugin's Swedish and English strings against
  stubbed routes;
- the packed tarball, against the catalog's checks, and the locale files,
  against every key the manifest, the view and the action name.

A Module Federation remote cannot be served by `vite dev`. To try the view in a
running instance, run `vite build --watch` and install the package there.

## Starting your own plugin from this one

The licence is MIT-0, so you can copy any of it without keeping a notice.

1. Choose an id: lowercase letters, digits and single hyphens. Put it in
   `openbrf.id`, in `name` in [`vite.config.ts`](vite.config.ts), in the
   `/api/plugin/<id>` paths and in the `plugin-<id>` namespace that
   `useTranslation` reads in the view.
2. Rename the package and start your version at `0.1.0`.
3. Declare only what your code uses. The board sees `permissions`,
   `personalData` and `actions` on the consent screen before anything is
   downloaded, and a later version that asks for more is refused until the
   board consents again.
4. Keep the server in one file, or bundle it into one. Keep `@nestjs/common`,
   `@nestjs/core` and `zod` as peer dependencies and never bundle them, and
   import `@openbrf/plugin-sdk` for types only. The package check refuses any
   runtime dependency, and a bundle that requires another package or a
   relative path.
5. Turn on GitHub's immutable releases for your repository before your first
   release. The catalog refuses a release that is not immutable.

## Releasing

1. In a pull request, set the new `version` in `package.json` and add it to
   [`CHANGELOG.md`](CHANGELOG.md).
2. Once it is merged, tag the merge commit on `main` and push the tag:

   ```sh
   git fetch origin
   git tag v0.1.0 origin/main
   git push origin v0.1.0
   ```

3. The release workflow checks that the tag matches the version and points at
   a commit on `main`. It then builds, tests, packs, checks and attests the
   tarball, and publishes the release with the tarball attached. The release
   notes give the tarball's `sha512` and `bytes`.

Do not create the release in the GitHub interface. That creates the tag
first, so the workflow starts after the release is already immutable, and the
tarball cannot be attached.

To have a version listed, open a pull request in
[`openbrf/catalog`](https://github.com/openbrf/catalog) that adds its entry
with the release's tarball URL, `sha512` and `bytes`. Copy the declaration from
the manifest exactly: the catalog's check compares the two.

## Licence

[MIT-0](LICENSE). The plugin is built against `@openbrf/plugin-sdk`, which is
AGPL-3.0-only with a module exception. Under that exception, a plugin built
against it may be licensed on any terms.
