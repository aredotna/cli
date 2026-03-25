# @aredotna/cli

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

## Quick Start

```bash
arena login
arena whoami
arena search "brutalist architecture" --type Image
arena channel worldmaking
arena add my-channel "Hello world"
arena upload photo.jpg --channel my-channel
```

## Getting Help

- `arena --help` shows a concise overview and common workflows.
- `arena help <command>` shows command-specific help.
- `arena <command> --help` also shows command-specific help.

Examples:

```bash
arena help search
arena channel --help
arena channel contents --help
```

## Global Flags

| Flag      | Description                                     |
| --------- | ----------------------------------------------- |
| `--json`  | Output as JSON (`import --json` streams NDJSON) |
| `--quiet` | Compact JSON output when supported              |
| `--yes`   | Bypass destructive confirmation prompts         |
| `--help`  | Show help                                       |

## Output & Errors

- `stdout`:
  - Successful command output.
  - `--json` returns JSON objects; `import --json` returns NDJSON progress events.
  - `--quiet` only changes JSON formatting (compact, single-line); it does **not** change response fields.
- `stderr`:
  - Human-readable failures in non-interactive mode.
  - Structured JSON errors in `--json` mode.
- JSON error shape:
  - `{"error": string, "code": number | null, "type": string, "hint"?: string}`
  - Common `type` values include: `unknown_command`, `unknown_subcommand`, `json_not_supported`, API-derived types like `not_found`.
- Exit codes:
  - `0` success
  - `1` client/usage errors and unknown command/subcommand
  - `2` unauthorized (`401`)
  - `3` not found (`404`)
  - `4` validation/bad request (`400`, `422`)
  - `5` rate limited (`429`)
  - `6` forbidden (`403`)

### Non-Interactive Behavior

- Interactive session mode only starts when **both** `stdin` and `stdout` are TTYs.
- In non-interactive contexts (pipes/CI), output is deterministic and unknown commands fail fast with non-zero exits.
- `batch` is JSON-only; use `--json`.
- For stdin-driven automation (for example piping content into `add`), use `--json`.

## Command Reference

Examples are shown first, then options.

### Authentication

#### `login`

Authenticate via OAuth.

Examples:

```bash
arena login
```

Options:

- `--token <token>`

#### `whoami`

Show current authenticated user.

Examples:

```bash
arena whoami
```

Options:

- None

#### `logout`

Clear local auth token.

Examples:

```bash
arena logout
```

Options:

- None

### Search

#### `search`

Search across blocks, channels, users, and groups.

Examples:

```bash
arena search "brutalist architecture"
arena search "photography" --type Image
arena search "design" --scope my
arena search "*" --type Attachment --ext pdf
arena search "architecture" --sort created_at_desc
arena search "*" --sort random --seed 42
arena search "*" --channel-id 789
```

Options:

- `--page <n>`
- `--per <n>`
- `--type <t>`
- `--scope <all|my|following>`
- `--sort <s>`
- `--ext <ext>`
- `--after <iso8601>`
- `--seed <n>`
- `--user-id <id>`
- `--group-id <id>`
- `--channel-id <id>`

### Channels

#### `channel`

View channel details.

Examples:

```bash
arena channel worldmaking
```

Options:

- `--page <n>`
- `--per <n>`

#### `channel contents`

List channel contents.

Examples:

```bash
arena channel contents worldmaking
arena channel contents worldmaking --sort updated_at_desc --user-id 123
```

Options:

- `--page <n>`
- `--per <n>`
- `--sort <s>`
- `--user-id <id>`

#### `channel create`

Create a channel.

Examples:

```bash
arena channel create "My Research" --visibility private
arena channel create "Team Notes" --group-id 123
```

Options:

- `--visibility <public|private|closed>`
- `--description <text>`
- `--group-id <id>`

#### `channel update`

Update a channel.

Examples:

```bash
arena channel update my-research --title "New Title" --description "Updated"
```

Options:

- `--title <text>`
- `--description <text>`
- `--visibility <public|private|closed>`

#### `channel delete`

Delete a channel.

Examples:

```bash
arena channel delete my-research
```

Options:

- None

#### `channel connections`

Show where a channel appears.

Examples:

```bash
arena channel connections worldmaking --sort connected_at_desc
```

Options:

- `--page <n>`
- `--per <n>`
- `--sort <s>`

#### `channel followers`

List channel followers.

Examples:

```bash
arena channel followers worldmaking --sort connected_at_desc
```

Options:

- `--page <n>`
- `--per <n>`
- `--sort <s>`

### Blocks

#### `block`

View a block.

Examples:

```bash
arena block 12345
```

Options:

- None

#### `block update`

Update block metadata/content.

Examples:

```bash
arena block update 12345 --title "New Title"
```

Options:

- `--title <text>`
- `--description <text>`
- `--content <text>`
- `--alt-text <text>`

#### `block comments`

List block comments.

Examples:

```bash
arena block comments 12345 --sort connected_at_desc
```

Options:

- `--page <n>`
- `--per <n>`
- `--sort <s>`

#### `block connections`

Show channels connected to a block.

Examples:

```bash
arena block connections 12345 --sort connected_at_desc --filter OWN
```

Options:

- `--page <n>`
- `--per <n>`
- `--sort <s>`
- `--filter <ALL|OWN|EXCLUDE_OWN>`

#### `add`

Add text/URL content to a channel.

Examples:

```bash
arena add my-channel "Hello world"
arena add my-channel "Hello" --title "Greeting" --description "Pinned note"
arena add my-channel https://example.com --alt-text "Cover image" --insert-at 1
arena add my-channel https://example.com --original-source-url https://source.com --original-source-title "Original"
echo "piped text" | arena --json add my-channel
```

Options:

- `--title <text>`
- `--description <text>`
- `--alt-text <text>`
- `--original-source-url <url>`
- `--original-source-title <text>`
- `--insert-at <n>`

#### `upload`

Upload local file content.

Examples:

```bash
arena upload photo.jpg --channel my-channel
arena upload photo.jpg --channel my-channel --title "Cover" --description "Homepage image"
```

Options:

- `--channel <slug|id>` (required)
- `--title <text>`
- `--description <text>`

#### `batch`

Create many blocks asynchronously.

`batch` is available in `--json` mode.

Examples:

```bash
arena batch my-channel "https://a.com" "https://b.com"
arena batch status 1234
```

Options:

- `--title <text>`
- `--description <text>`

#### `import`

Import local files in bulk.

Examples:

```bash
arena import my-channel --dir ./assets
arena import my-channel --dir ./assets --recursive
arena import my-channel --interactive
```

Options:

- `--dir <path>`
- `--recursive`
- `--interactive`
- `--batch-size <n>`
- `--upload-concurrency <n>`
- `--poll-interval <ms>`

### Connections

#### `connect`

Connect a block/channel to a channel.

Examples:

```bash
arena connect 12345 my-channel
arena connect 12345 my-channel --type Channel --position 1
```

Options:

- `--type <Block|Channel>`
- `--position <n>`

#### `connection`

Inspect/delete/move connections.

Examples:

```bash
arena connection 67890
arena connection delete 67890
arena connection move 67890 --movement move_to_top
arena connection move 67890 --movement insert_at --position 1
```

Options:

- `--movement <move_to_top|move_to_bottom|insert_at>` (for `connection move`)
- `--position <n>` (for `connection move`)

### Comments

#### `comment`

Create or delete comments.

Examples:

```bash
arena comment 12345 "Nice find"
arena comment delete 67890
```

Options:

- None

### Users & Groups

#### `user`

View users and relationships.

Examples:

```bash
arena user damon-zucconi
arena user contents damon-zucconi --type Image --sort updated_at_desc
arena user followers damon-zucconi --sort connected_at_desc
arena user following damon-zucconi --type User --sort connected_at_desc
```

Options:

- `--page <n>`
- `--per <n>`
- `--type <t>`
- `--sort <s>`

#### `group`

View groups and group activity.

Examples:

```bash
arena group are-na-team
arena group contents are-na-team --type Image --sort updated_at_desc
arena group followers are-na-team --sort connected_at_desc
```

Options:

- `--page <n>`
- `--per <n>`
- `--type <t>`
- `--sort <s>`

### Other

#### `ping`

Check API health.

Examples:

```bash
arena ping
```

Options:

- None

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
