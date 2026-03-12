# Are.na CLI

A command-line interface for [Are.na](https://www.are.na).

## Install

```bash
npm install -g @aredotna/cli
```

Requires Node.js 20 or later.

## Upgrade

```bash
npm update -g @aredotna/cli
```

## Authentication

```bash
arena login
```

Opens your browser to authorize via OAuth. Your token is stored locally and used for subsequent requests.

```bash
arena logout
```

## Usage

Running `arena` with no arguments opens an interactive session. Pass a command for direct access.

### Channels

```bash
arena channel worldmaking                     # View a channel
arena channel contents worldmaking            # Paginated contents
arena channel create "My Research" --visibility private
arena channel update my-research --title "New Title" --description "Updated"
arena channel delete my-research
arena channel connections worldmaking         # Where channel appears
arena channel followers worldmaking
```

### Blocks

```bash
arena block 12345                             # View a block
arena block update 12345 --title "New Title"
arena block comments 12345                    # View comments
arena block connections 12345                 # Where block appears
arena add my-channel "Hello world"            # Add text
arena add my-channel https://example.com      # Add a URL
arena upload photo.jpg --channel my-channel
arena batch my-channel "https://a.com" "https://b.com"
arena batch status 1234
arena import my-channel --dir ./assets
arena import my-channel --dir ./assets --recursive
arena import my-channel --interactive
echo "piped text" | arena add my-channel
```

### Connections

```bash
arena connect 12345 my-channel          # Connect block to channel
arena connection 67890                  # View a connection
arena connection move 67890 --movement move_to_top
arena connection delete 67890
```

### Comments

```bash
arena comment 12345 "Nice find"         # Add a comment
arena comment delete 67890
```

### Users

```bash
arena whoami                            # Current user
arena user damon-zucconi                # View a user
arena user contents damon-zucconi       # User's content
arena user followers damon-zucconi
arena user following damon-zucconi
arena group are-na-team                 # View a group
arena group contents are-na-team        # Group's content
arena group followers are-na-team
```

### Search

```bash
arena search "brutalist architecture"
arena search "photography" --type Image
```

### Other

```bash
arena ping                              # API health check
```

## Flags

### Global flags

| Flag      | Description                                     |
| --------- | ----------------------------------------------- |
| `--json`  | Output as JSON (`import --json` streams NDJSON) |
| `--quiet` | Compact JSON output when supported              |
| `--yes`   | Bypass destructive confirmation prompts         |
| `--help`  | Show help                                       |

### Common query flags

| Flag           | Description                                     |
| -------------- | ----------------------------------------------- |
| `--page <n>`   | Page number                                     |
| `--per <n>`    | Items per page                                  |
| `--sort <s>`   | Sort order                                      |
| `--type <t>`   | Type filter                                     |
| `--filter <f>` | Connection filter (`ALL`, `OWN`, `EXCLUDE_OWN`) |

### Command-specific flags

| Command                            | Flags                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `channel create`, `channel update` | `--title`, `--description`, `--visibility`                                                         |
| `block update`                     | `--title`, `--description`, `--content`, `--alt-text`                                              |
| `add`, `batch`                     | `--title`, `--description`                                                                         |
| `upload`                           | `--channel`, `--title`, `--description`                                                            |
| `connect`                          | `--type`, `--position`                                                                             |
| `connection move`                  | `--movement`, `--position`                                                                         |
| `search`                           | `--scope`, `--ext`, `--after`, `--seed`, `--user-id`, `--group-id`, `--channel-id`                 |
| `import`                           | `--dir`, `--recursive`, `--interactive`, `--batch-size`, `--upload-concurrency`, `--poll-interval` |

## Aliases

| Alias | Command   |
| ----- | --------- |
| `ch`  | `channel` |
| `bl`  | `block`   |
| `me`  | `whoami`  |
| `s`   | `search`  |

## Development

```bash
git clone https://github.com/aredotna/cli.git
cd cli
npm install
cp .env.example .env    # Configure API base URL
npm run dev             # Run from source
npm run check           # Typecheck + test + build
```

### Testing

Tests use a file-based VCR to record and replay API responses.

```bash
npm test                                # Run tests (auto mode — records if no cassette)
ARENA_VCR_MODE=replay npm test          # Strict replay (no network, used in CI)
rm .vcr/registry-test.json && npm test  # Re-record cassettes
```
