# Analytics preservation manifest — 2026-10-02

The owner authorized local preservation commits and fresh branches. No push or release action was performed. All paths are relative to the core checkout, `/Users/owenfar/Developer/debugbundle`.

## Archived implementation and fixed restart bases

In each repository below, `update/analytics` retains the archive commit. `update/visit-flows` starts from the fixed stable base, not from that archive. Core then adds only the reset/planning documentation commit; the SDK branches remain exactly at their bases.

| Repository | Stable base for the focused branch | Preserved `update/analytics` commit |
| --- | --- | --- |
| `.` | `370c3c68f9991b7ae4bfde79bea7f505404a264a` | `4c6b7ec0995d5b4b9781d1a0e5ac1a1219407df2` |
| `sdks/debugbundle-android` | `585c0da9f29f70be8579693a43874fbfdbfadda1` | `85f63ca428d6987707a94023a57498a60f6376d7` |
| `sdks/debugbundle-dotnet` | `420c57a69c93d9bf2a42e8004ab2e1dc11aed115` | `d19d439eb8e089225bfb05e89a3b051447c166be` |
| `sdks/debugbundle-go` | `75ae484b2d359307df9d21ab3dabc9a72dceb030` | `9fd7e4bb14de3fde1b1e5758638cbdefc9c5fb1f` |
| `sdks/debugbundle-java` | `263fdf542eafc12858af6cd8d8ff8d8c8eb669f0` | `7d9cde7f9e94d47c5bf9384e94e1170e6732ffce` |
| `sdks/debugbundle-js` | `d9c7ca69d34618004d654fc465e9c78a784639fd` | `a3eb99ce08e8f0528dff9f6eaad156deb6345922` |
| `sdks/debugbundle-php` | `3f81b2b3a17c3bc10239766f0f308f510703f66d` | `7c1aa9541b40aed687689c5d25cc81f39af940c8` |
| `sdks/debugbundle-python` | `173641691a38b2d8608b1e5ed775971ef1c6707f` | `1bf179a6e7190d5fbbb4d8fed4d6767389c7288e` |
| `sdks/debugbundle-react-native` | `78a29b303a8732dfe31f2713dfc535eb07d5f9f9` | `da66e83574c7789bdf01960958196e4e85d68deb` |
| `sdks/debugbundle-ruby` | `17bdfda354b3aa0f27e6555be4c1f542fa5a86cc` | `bdfbeea25ef6651a7cb99de41e4d6192615203f1` |
| `sdks/debugbundle-swift` | `91ff39722d8b88eedc81abb37e5ff472723e4e8f` | `5fe26c137e02c94693f9358ed371edaa0a16f07b` |
| `sdks/debugbundle-wordpress` | `f33e5843f5fb14e62e07916bd98fb60b36260385` | `81d5d643f171dc455acdb85b7db415c644290ab5` |

The new preservation commits are core `4c6b7ec0995d` and JavaScript `a3eb99ce08e8`. The other ten SDKs were already clean; no empty commits were created. These two new commits were not pushed. Earlier remote checkpoints, if any, were not changed.

## Other companion repositories

| Repository | Preserved HEAD / starting base | Current branch |
| --- | --- | --- |
| `site` | `73e6e0295420ae854141f0da30e06629c72969fa` | `update/visit-flows` |
| `.local-repos/action` | `05302c9f0829f07834fc20689f6bb03baa967bf2` | `main` |
| `.local-repos/debugbundle-cloud` | `201a1e1613a23775530efcef2735577b430b0d2f` | `main` |
| `.local-repos/debugbundle-github-profile` | `3099125526d7f3f56379692709937beb66658823` | `main` |

The site gets a fresh branch because it is a direct consumer in the focused plan. The three unrelated companions remain on their existing clean `main` branches. No listed repository is left checked out on `update/analytics`; archive branch refs remain available locally. Existing working directory paths were retained rather than deleting/recreating worktrees.

## What was preserved and checked

- The initial inventory contained 158 pending git-visible core files and 25 pending JavaScript SDK files. All pending source/test bytes were checked against a temporary snapshot and again against the resulting commits. Coordination documents were deliberately prefixed with a parked notice; their earlier content was retained.
- Core preservation also includes the scope reset and focused plan/prompt, plus the previously ignored app-consent proposal, account-erasure delivery proposal, public-page proposal, and an archive of the old analytics-only TODO checklist. The core archive commit contains 167 changed/added files; the JavaScript archive contains 25.
- The local ignored `TODO.md` has only its analytics entry replaced. Its unrelated tasks remain unchanged. Its former analytics entry is in `spec/local/analytics-parked-checklist-20261002.md` on the archived core commit.
- A staged-byte comparison, `git diff --cached --check`, and a limited high-confidence secret-pattern scan passed before the commits. No environment secrets, caches, dependencies, runtime data, or unrelated ignored local notes were staged.
- Every affected checkout was clean before branching. The selected bases were checked against the prior immutable base ledger and local `main` refs; no remote freshness or current production-version claim is made.
- No code was rewritten to make the archive releasable. Test evidence in the old checkpoint is historical; the full unfinished implementation has not passed final release review. No runtime tests, services, migrations, or production requests were run for this documentation/branch operation.

## Read an archived change without switching the active checkout

Run in the owning repository, substituting its exact archive SHA and path:

```sh
git show ARCHIVE_SHA:path/to/file
git diff BASE_SHA..ARCHIVE_SHA -- path/to/file
```

For the old core checkpoint, for example:

```sh
git show 4c6b7ec0995d5b4b9781d1a0e5ac1a1219407df2:spec/local/analytics-semantic-implementation-20260928.md
```

Inspect before selectively reusing an independent fix for a named focused acceptance case. An SDK's history belongs to its own repository and is not contained in the core commit. Do not delete these local archive branches until the owner explicitly decides to discard them. The fresh plan does not depend on the temporary preservation snapshot.

## Fresh branch boundary

The focused root candidate contains only `STATUS.md`, navigation notes in `SYSTEM_OVERVIEW.md` / `ARCHITECTURE_MAP.md`, and the four `spec/analytics-*-20261002.md` reset/plan/prompt/manifest files. No parked source, schema migration, dependency pin, or runtime configuration is imported. Existing ignored build artifacts and local data remain untouched and must not be mistaken for a build of this branch.

Continue from [the focused plan](analytics-visit-flows-plan-20261002.md) and [restart prompt](analytics-visit-flows-next-thread-20261002.md), not the archived semantic plan.
