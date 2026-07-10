# @debugbundle/cli

Command-line interface for DebugBundle.

## Installation

```sh
npm install -g @debugbundle/cli
```

Supported Node.js versions: 22.x through 26.x.

Check the installed CLI version with `debugbundle --version` or `debugbundle -v`.

Or install it as a project development dependency:

```sh
npm install --save-dev @debugbundle/cli
```

## Quick start

```sh
debugbundle setup --non-interactive
debugbundle doctor --privacy
debugbundle verify local
debugbundle verify cloud --project-id <id> --trigger-5xx
debugbundle verify cloud --project-id <id> --trigger-4xx 403
debugbundle process
debugbundle incidents
debugbundle explain <incident-id> --source cloud
```

## Configuration

The CLI reads local project configuration from `.debugbundle/` and can use member-token authentication for connected cloud operations. Use `debugbundle connect` to configure cloud access, or pass `--auth-file` to commands that support explicit auth state.

## AnalyticsBundle

Analytics commands require connected member authentication and a project with AnalyticsBundle enabled. They query aggregate rollups or request an asynchronous analysis artifact; they do not read raw analytics events.

```sh
debugbundle analytics summary --project <project-id> --last 7d
debugbundle analytics devices --project <project-id> --last 7d
debugbundle analytics journeys --project <project-id> --last 7d
debugbundle analytics opportunities --project <project-id>
debugbundle analytics opportunities --all-projects
debugbundle analytics bundle create --project <project-id> --kind journey_friction --last 7d
debugbundle analytics bundle list --project <project-id>
debugbundle analytics bundle list --all-projects
```

Use `debugbundle analytics settings get --project <project-id>` to inspect availability and capture/retention settings. Owners and admins can enable it with `debugbundle analytics settings set --project <project-id> --enabled true`; Team projects can additionally manage approved custom dimensions. Project tokens remain SDK-ingestion-only and cannot read analytics.

## Documentation

Full CLI documentation: https://debugbundle.com/docs/cli

## License

AGPL-3.0-only
