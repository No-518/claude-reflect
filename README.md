# Claude Reflect

AI-powered reflection skill for Claude Code - Daily and project-level retrospectives with smart pitfall detection.

## Features

- **Daily Reflection** (`/daily-reflect`) - Interactive guided reflection on your daily work
- **Project Reflection** (`/project-reflect`) - Deep dive into project-level learnings and decisions
- **User Profile** (`/reflect-profile`) - Track your learning patterns and preferences
- **Smart Pitfall Detection** - Automatically detect potential issues from git history
- **SessionStart Hook** - Intelligent reminder when to reflect

## Installation

### As a Claude Code Skill

```bash
cd ~/.claude/skills
git clone https://github.com/No-518/claude-reflect
```

### Standalone

```bash
git clone https://github.com/No-518/claude-reflect
cd claude-reflect
bun install
bun run build
```

## Commands

| Command | Description |
|---------|-------------|
| `/daily-reflect` | Start daily reflection session |
| `/daily-reflect --date 2026-02-01` | Reflect on a specific date |
| `/project-reflect` | Start project-level reflection |
| `/reflect-profile view` | View your user profile |
| `/reflect-profile add-project .` | Add current directory as active project |
| `/reflect-help` | Show help information |

## How It Works

### Daily Reflection Flow

1. **Data Aggregation** - Collects observations from claude-mem and git commits
2. **Question Generation** - Creates personalized questions based on your work
3. **Interactive Dialog** - Guides you through reflection with follow-up questions
4. **Report Generation** - Generates a Markdown report saved to `~/.claude-reflect/daily/`

### Project Reflection Flow

1. **Repository Analysis** - Analyzes git history and identifies patterns
2. **Pitfall Detection** - Automatically detects potential issues:
   - Revert commits
   - High-frequency file modifications
   - Multiple fix commits
   - Massive refactors
3. **Guided Questions** - Asks about technical decisions, challenges, and learnings
4. **Report Generation** - Creates comprehensive project summary

### Pitfall Detection

| Signal Type | Detection Method | Severity |
|-------------|------------------|----------|
| Revert | Commit message starts with "revert" | High |
| High Frequency | Same file modified ≥3 times in 24h | Medium-High |
| Multiple Fixes | >3 fix commits for same component | Medium |
| Massive Refactor | >100 lines added AND deleted | Medium |

## Architecture

```
src/
├── commands/           # Command handlers
│   ├── daily-reflect.ts
│   ├── project-reflect.ts
│   ├── reflect-profile.ts
│   └── reflect-help.ts
├── core/               # Core logic
│   ├── aggregator.ts   # Data aggregation
│   ├── pitfall.ts      # Pitfall detection
│   ├── profile.ts      # User profile management
│   ├── reflection.ts   # Question generation & dialog
│   └── report.ts       # Report generation
├── integrations/       # External integrations
│   ├── claude-mem.ts   # claude-mem integration
│   └── git.ts          # Git history reader
├── types/              # TypeScript types
└── utils/              # Utility functions

hooks/
└── SessionStart.sh     # Smart reflection reminder

scripts/
└── install.sh          # Installation script
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

## Storage Locations

| Path | Description |
|------|-------------|
| `~/.claude-reflect/daily/` | Daily reflection reports |
| `~/.claude-reflect/projects/` | Project reflection reports |
| `~/.claude-reflect/profile.json` | User profile |
| `~/.claude-reflect/backup/` | Report backups |

## Learning Dimensions

- **Technical** - New knowledge and skills learned
- **Decision** - Technical decisions and trade-offs made
- **Efficiency** - Workflow optimization insights

## Requirements

- [Bun](https://bun.sh/) runtime
- Git (for repository analysis)
- Optional: [claude-mem](https://github.com/anthropics/claude-mem) for richer context

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
