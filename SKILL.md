---
name: claude-reflect
version: 0.4.0
description: AI-powered reflection skill for Claude Code - Daily and project-level retrospectives
author: wybcode
commands:
  - daily-reflect
  - project-reflect
  - reflect-profile
  - reflect-help
hooks:
  - SessionStart
---

# Claude Reflect Skill

AI-powered reflection and learning system for developers. Analyzes your work history and guides interactive reflection sessions.

## Commands

### /daily-reflect

Start an interactive daily reflection session.

**Options:**
- `--date YYYY-MM-DD` - Reflect on a specific date (default: today)
- `--overwrite` - Overwrite existing report
- `--append` - Append to existing report

**AI Execution Steps:**

1. **Initialize**
   - Call `initReflection(date, options)` from `src/commands/daily-reflect.ts`
   - Check if data is available for the date
   - If no data: inform user and suggest alternative dates
   - If report exists: check for --overwrite or --append flags

2. **Get Timeline Summary**
   - Review the returned `timeline` object
   - Summarize key events, commits, and observations for the user
   - Display statistics (total events, observations, commits, active projects)

3. **Start Question Loop**
   - Get first question from `initReflection` result
   - Display question to user with progress indicator (e.g., "[1/5]")
   - Wait for user response

4. **Process Answers**
   - Call `submitAnswer(questionId, answer)` with user's response
   - If `action === 'follow_up'`: ask the follow-up question
   - If `action === 'next'`: display next question
   - If `action === 'complete'`: proceed to step 5

5. **Generate Report**
   - Call `completeReflection()`
   - Display summary of learnings extracted
   - Confirm report saved location

6. **Session End**
   - Display final message with report path
   - Offer to view the report

**Fallback (No claude-mem):**
- If claude-mem unavailable, system operates in git-only mode
- Still analyzes git commits and generates meaningful questions
- Inform user: "(Git-only mode: claude-mem unavailable)"

### /project-reflect

Start a project-level reflection session for deeper insights.

**Usage:**
```
/project-reflect                    # Reflect on current directory
/project-reflect --since 2026-01-01 # Reflect since specific date
```

**AI Execution Steps:**

1. **Initialize**
   - Call `initProjectReflection(repos, options)` from `src/commands/project-reflect.ts`
   - `repos` defaults to current working directory
   - Validate repository paths contain `.git`

2. **Show Project Summary**
   - Display aggregated data:
     - Time span covered
     - Total commits and observations
     - Detected pitfalls count
     - Core files (most modified)
     - Contributors

3. **Discuss Pitfalls**
   - If pitfalls detected, highlight them for user
   - Ask targeted questions about specific issues found:
     - "I noticed [file] was modified [N] times on [date]. What happened?"
     - "There was a revert commit for [message]. What led to that?"

4. **Question Loop**
   - Similar to daily-reflect but focused on:
     - Technical decisions
     - Challenges encountered
     - Lessons learned
   - Use `submitProjectAnswer(questionId, answer)`

5. **Generate Report**
   - Call `completeProjectReflection()`
   - Save to `~/.claude-reflect/projects/[project-name].md`

6. **Session End**
   - Display summary and report path
   - Highlight key insights extracted

### /reflect-profile

View and manage your user profile.

**Subcommands:**

- `view` - View full profile
- `correct <field> <value>` - Correct a profile field
- `add-project <path>` - Add active project
- `remove-project <path>` - Remove active project

**Example Usage:**
```
/reflect-profile view
/reflect-profile add-project /path/to/project
/reflect-profile correct technical_level.overall intermediate
```

**Available Fields:**
- `technical_level.overall` - beginner/intermediate/advanced/expert
- `strengths` - Array of strengths
- `weaknesses` - Array of areas to improve
- `work_habits.peak_hours` - Productive hours
- `learning_preferences.style` - visual/reading/hands-on/mixed

### /reflect-help

Display help information about all commands and options.

## SessionStart Hook

The skill includes a SessionStart hook that provides intelligent reflection reminders.

**Behavior:**
- Checks when last reflection was completed
- Suggests daily reflection if >24 hours since last
- Suggests project reflection at milestones (weekly, after major releases)
- Non-intrusive: only displays a brief reminder message

## API Reference

### Daily Reflection API

```typescript
// Initialize session
const result = await initReflection(date: string, options?: DailyReflectOptions)

// Submit answer
const next = submitAnswer(questionId: string, answer: string)

// Complete and generate report
const report = completeReflection()

// Cancel session
cancelReflection()

// Get session status
getSessionStatus()
```

### Project Reflection API

```typescript
// Initialize project session
const result = await initProjectReflection(repos: string[], options?: ProjectReflectOptions)

// Submit answer
const next = submitProjectAnswer(questionId: string, answer: string)

// Complete and generate report
const report = completeProjectReflection()

// Cancel session
cancelProjectReflection()
```

### Profile API

```typescript
// View profile
viewProfile()

// Correct profile field
correctProfile(field: string, newValue: unknown, reason: string)

// Add/remove projects
addProject(path: string, role?: string)
removeProject(path: string)
```

## Learning Dimensions

Questions and learnings are categorized into three dimensions:

1. **Technical** - New knowledge, tools, APIs, patterns learned
2. **Decision** - Choices made, trade-offs considered, alternatives evaluated
3. **Efficiency** - Workflow improvements, time optimizations, blockers overcome

## Report Format

Reports are generated in Markdown format:

```markdown
# Daily Reflection - 2026-02-03

## Summary
- **Active Projects:** 2
- **Commits:** 15
- **Observations:** 8

## Technical Learnings
### 1. [Learning Title]
- **Content:** Description of what was learned
- **Confidence:** high/medium/low

## Decision Analysis
...

## Efficiency Insights
...

## Tomorrow's Suggestions
1. [Actionable suggestion]

---
*Generated at: 2026-02-03T18:00:00Z*
*Powered by Claude Reflect*
```
