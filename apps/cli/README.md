# @debugbundle/cli

Command-line interface for DebugBundle.

## Installation

```sh
npm install -g @debugbundle/cli
```

Or install it as a project development dependency:

```sh
npm install --save-dev @debugbundle/cli
```

## Quick start

```sh
debugbundle setup --non-interactive
debugbundle doctor
debugbundle verify local
debugbundle verify cloud --project-id <id> --trigger-5xx
debugbundle process
debugbundle incidents
```

## Configuration

The CLI reads local project configuration from `.debugbundle/` and can use member-token authentication for connected cloud operations. Use `debugbundle connect` to configure cloud access, or pass `--auth-file` to commands that support explicit auth state.

## Documentation

Full CLI documentation: https://debugbundle.com/docs/cli

## License

AGPL-3.0-only
