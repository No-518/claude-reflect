/**
 * /reflect-help command
 *
 * Display help information
 */

export const HELP_TEXT = `
Claude Reflect - AI-Powered Reflection Learning System

Analyzes claude-mem observations and git history to guide interactive reflection sessions, generating learning reports.

Commands:
  /daily-reflect [--date YYYY-MM-DD]  Start daily reflection
  /project-reflect                     Start project-level reflection
  /reflect-profile                     View/edit user profile
  /reflect-help                        Show this help

/daily-reflect options:
  --date YYYY-MM-DD   Specify reflection date (default: today)
  --overwrite         Overwrite existing report
  --append            Append to existing report

/reflect-profile subcommands:
  view                View full profile
  correct <field>     Correct profile field
  add-project <path>  Add active project
  remove-project      Remove active project

Storage locations:
  ~/.claude-reflect/daily/        Daily reflection reports
  ~/.claude-reflect/projects/     Project reflection reports
  ~/.claude-reflect/profile.json  User profile

Learning dimensions:
  - Technical: New knowledge and skills learned
  - Decision: Technical decisions and trade-offs made
  - Efficiency: Workflow optimization insights

Examples:
  /daily-reflect                    Reflect on today
  /daily-reflect --date 2026-02-01  Reflect on specific date
  /reflect-profile view             View profile
  /reflect-profile add-project .    Add current project

More info: https://github.com/wybcode/claude-reflect
`.trim();

/**
 * Display help information
 */
export function showHelp(): string {
  return HELP_TEXT;
}

/**
 * Display version information
 */
export function showVersion(): string {
  return 'Claude Reflect v0.4.0';
}
