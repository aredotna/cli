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

## Options

| Flag                | Description                                      |
| ------------------- | ------------------------------------------------ |
| `--json`            | Output as JSON                                   |
| `--quiet`           | Minimal output (just IDs)                        |
| `--page <n>`        | Page number                                      |
| `--per <n>`         | Items per page                                   |
| `--sort <s>`        | Sort order                                       |
| `--type <t>`        | Filter by type                                   |
| `--filter <f>`      | Filter connections (`ALL`, `OWN`, `EXCLUDE_OWN`) |
| `--visibility <v>`  | `public`, `closed`, or `private`                 |
| `--title <t>`       | Title (for create/update)                        |
| `--description <d>` | Description (for create/update)                  |
| `--no-fullscreen`   | Disable session fullscreen mode                  |
| `--help`            | Show help                                        |

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
