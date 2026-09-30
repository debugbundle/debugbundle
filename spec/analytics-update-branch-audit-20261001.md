# Analytics update branch audit — 2026-10-01

The owner explicitly authorized creating/switching affected repositories to `update/analytics` and committing all current implementation work as local checkpoints. This authorization covers these checkpoint commits. It does not authorize push, release, package publication, deployment or production mutation, and it does not establish production readiness.

## Fixed comparison bases

All twelve affected repositories started on `main`; their new branches preserve those starting commits and contain one initial checkpoint each. Use these immutable bases for the final audit even after more commits accumulate. Do not compare against a later moving `main` and accidentally omit work.

| Repository | Base before analytics checkpoint | Checkpoint commit |
| --- | --- | --- |
| Core (`.`) | `370c3c68f9991b7ae4bfde79bea7f505404a264a` | This document is included in the first commit on `update/analytics` after this base; resolve with the command below. |
| `sdks/debugbundle-android` | `585c0da9f29f70be8579693a43874fbfdbfadda1` | `85f63ca428d6987707a94023a57498a60f6376d7` |
| `sdks/debugbundle-dotnet` | `420c57a69c93d9bf2a42e8004ab2e1dc11aed115` | `d19d439eb8e089225bfb05e89a3b051447c166be` |
| `sdks/debugbundle-go` | `75ae484b2d359307df9d21ab3dabc9a72dceb030` | `9fd7e4bb14de3fde1b1e5758638cbdefc9c5fb1f` |
| `sdks/debugbundle-java` | `263fdf542eafc12858af6cd8d8ff8d8c8eb669f0` | `7d9cde7f9e94d47c5bf9384e94e1170e6732ffce` |
| `sdks/debugbundle-js` | `d9c7ca69d34618004d654fc465e9c78a784639fd` | `e94ba35da48b808d07ded6da075e904ec70109f5` |
| `sdks/debugbundle-php` | `3f81b2b3a17c3bc10239766f0f308f510703f66d` | `7c1aa9541b40aed687689c5d25cc81f39af940c8` |
| `sdks/debugbundle-python` | `173641691a38b2d8608b1e5ed775971ef1c6707f` | `1bf179a6e7190d5fbbb4d8fed4d6767389c7288e` |
| `sdks/debugbundle-react-native` | `78a29b303a8732dfe31f2713dfc535eb07d5f9f9` | `da66e83574c7789bdf01960958196e4e85d68deb` |
| `sdks/debugbundle-ruby` | `17bdfda354b3aa0f27e6555be4c1f542fa5a86cc` | `bdfbeea25ef6651a7cb99de41e4d6192615203f1` |
| `sdks/debugbundle-swift` | `91ff39722d8b88eedc81abb37e5ff472723e4e8f` | `5fe26c137e02c94693f9358ed371edaa0a16f07b` |
| `sdks/debugbundle-wordpress` | `f33e5843f5fb14e62e07916bd98fb60b36260385` | `81d5d643f171dc455acdb85b7db415c644290ab5` |

Resolve the core checkpoint without a self-referential commit hash:

```sh
git rev-list --reverse 370c3c68f9991b7ae4bfde79bea7f505404a264a..update/analytics | head -1
```

For each repository, use its row's base:

```sh
git log --oneline BASE..update/analytics
git diff --stat BASE..update/analytics
git diff BASE..update/analytics
```

Run those commands from the owning repository or use `git -C <repository>`. An SDK commit is not part of the core Git history; all twelve ranges must be reviewed. Preserve this base table when adding future work.

## What was captured

- Core implementation, tests, contracts, public docs and existing migration candidates; no schema squashing or code cleanup was performed for the checkpoint.
- Browser/Node semantic writer candidate and all other SDK repositories' existing credential/privacy compatibility changes. The latter do not activate semantic writers in the deferred SDK families.
- The current STATUS, reconciled completion plan, implementation checkpoint, new-thread prompt, relevant ingress/freeze/cutover/erasure/capacity documents, approved Analytics dashboard proposal and original semantic proposal. These selected analytics documents were previously ignored and are explicitly tracked for this audit.
- The prior analytics-only implementation checkpoint and proposal/ledger archives are also retained. The older mixed-project STATUS archive, unrelated local notes, build caches, `.tmp` outputs, environments and credentials remain ignored. Historical analytics evidence is preserved in the two tracked analytics archives; the full mixed STATUS remains on disk.

The site, hosted cloud, GitHub Action and organization profile repositories were inspected and clean. They were not branched or given empty commits; create their `update/analytics` branch if later implementation affects them. Dependencies downloaded by package tools are not project companion repositories and were not changed.

## Validation boundary

These are unfinished-work preservation commits, not a passed final audit. Existing scoped test evidence and genuine open work are in [the checkpoint](local/analytics-semantic-implementation-20260928.md) and [completion plan](local/analytics-semantic-completion-plan-20261001.md). No broad runtime suite was rerun simply to create these checkpoints. Staged diff hygiene and file-content preservation were checked. The byte-preserved historical proposal has three pre-existing Markdown hard-break lines (3, 4, 45) that `git diff --check` calls trailing whitespace; those were explicitly reviewed and retained, and the remaining staged files pass. No source whitespace exception was taken; secret-pattern review found only pre-existing fixture/example patterns in tracked files, not newly introduced high-confidence credentials. This limited scan is not a complete security audit.

Default semantic capture/capability/report gates remain closed; financial facts remain fail-closed. The final audit must cover the entire branch diff, including pre-checkpoint work, along with relevant migration, SDK/package, privacy, debug-regression, report-correctness and integrated acceptance gates. No completion percentage or slice closure is awarded by committing.

## Continuing work

Use the [fresh-thread prompt](local/analytics-semantic-next-thread-20261001.md). The whole Analytics feature remains in scope, with browser/Node as the selected SDK packages. Keep working on `update/analytics` and preserve these bases. Current checkpoint commits are local only; remote backup requires a separately authorized push. Runtime activation and any merge to a release/default branch remain separate decisions.
