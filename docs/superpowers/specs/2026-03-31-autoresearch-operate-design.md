# AutoResearch for OpenCLI Operate

Use the AutoResearch method (Karpathy, 2025) to automatically optimize
`opencli operate`'s task success rate through iterative, AI-driven
experimentation.

## Goal

Improve `opencli operate` success rate on a fixed set of 20 browser
automation tasks. The AI agent modifies any file in `src/agent/`, rebuilds,
evaluates, and commits only if the score improves.

## Approach: Classic AutoResearch

```
loop:
  1. Claude Code reads program.md + last round's results
  2. Analyzes failed tasks, decides optimization direction
  3. Modifies src/agent/ files
  4. npm run build (must compile)
  5. Runs eval.ts (20 tasks, serial, real browser + real websites)
  6. Score >= baseline → git commit → update baseline
  7. Score < baseline → git revert → log failed attempt
  8. Repeat (10-20 rounds per session)
```

## File Structure

```
autoresearch/
├── program.md          # Research instructions for Claude Code
├── tasks.json          # 20 task definitions + success criteria
├── eval.ts             # Evaluation runner
├── run.sh              # Launch script
├── baseline.txt        # Current best score (e.g. "14/20")
└── results/
    └── round-NNN.json  # Per-round results
```

## Task Set (20 tasks)

### Self-built tasks (15) — train set

| # | Task | Type | Success Criteria |
|---|------|------|------------------|
| 1 | Open example.com, extract page title | Extract | extractedData contains "Example Domain" |
| 2 | Search "opencli github" on Google, extract top 3 results | Search+Extract | extractedData is array of 3+ items |
| 3 | Open HN, extract top 5 stories | List extract | 5 items, each has title |
| 4 | Open Wikipedia "JavaScript", extract first paragraph | Long text | contains "programming language" |
| 5 | Open GitHub opencli repo, extract star count | Single value | extractedData contains a number |
| 6 | Search "weather beijing" on DuckDuckGo | Search engine | extractedData non-empty |
| 7 | Open a form page, fill name+email fields | Form fill | input values non-empty |
| 8 | Open httpbin.org/forms/post, fill all fields | Complex form | all fields have values |
| 9 | Open books.toscrape.com, extract 5 books (title+price) | Structured | 5 items with title+price |
| 10 | Open quotes.toscrape.com, extract 3 quotes+authors | Structured | 3 items with quote+author |
| 11 | Open page, scroll to bottom, extract footer text | Scroll+Extract | extractedData has footer text |
| 12 | Open GitHub trending, extract top 3 repos | Dynamic page | 3 items with repo name |
| 13 | Open HN → click first story → extract article title | Multi-step | extractedData has title |
| 14 | Open example.com → click "More information" → extract new page title | Link follow | contains "IANA" |
| 15 | Open jsonplaceholder.typicode.com, extract endpoint list | API docs | non-empty array |

### Public benchmark subset (5) — test set

Selected from WebArena or similar benchmarks. Claude Code sees the
score but not the failure details, preventing overfitting.

Tasks TBD during implementation (must be publicly accessible websites).

## Evaluation Script (eval.ts)

```typescript
interface Task {
  name: string;
  command: string;           // natural language task
  url?: string;              // --url parameter
  maxSteps?: number;         // default 10
  judge: (result: AgentResult) => boolean;
}

async function evaluate(tasks: Task[]): Promise<EvalResult> {
  const results = [];
  for (const task of tasks) {
    const result = await runOperate(task.command, task.url, task.maxSteps);
    const passed = task.judge(result);
    results.push({ name: task.name, passed, steps, cost });
  }
  return { score: `${passed}/${total}`, tasks: results, totalCost, duration };
}
```

Judge functions per task:
- String inclusion: `result.extractedData includes "X"`
- Array length: `Array.isArray(data) && data.length >= N`
- Field presence: `data?.[0]?.title && data?.[0]?.price`

## program.md (Research Instructions)

Core rules for Claude Code:
1. Only modify `src/agent/` files
2. Must `npm run build` and pass compilation after changes
3. Must run `eval.ts` for full evaluation
4. Commit only if score >= baseline, revert otherwise
5. Prefer bold architectural changes over parameter tweaks
6. Do NOT modify eval.ts, tasks.json, or program.md
7. Do NOT hardcode task-specific logic

Strategy guidance:
- Analyze verbose logs of failed tasks to find root causes
- Common failures: element not in viewport, wrong DOM index, LLM hallucination, premature done
- Prompt optimization often beats code changes
- Try different DOM representation formats
- Try different action combination strategies

## Launch Script (run.sh)

```bash
#!/bin/bash
cd "$(dirname "$0")/.."
claude -p \
  --dangerously-skip-permissions \
  --model sonnet \
  --system-prompt "$(cat autoresearch/program.md)" \
  "Read autoresearch/tasks.json and the latest results in autoresearch/results/. \
   Your goal: improve opencli operate success rate. \
   Current baseline: $(cat autoresearch/baseline.txt). \
   Run eval, analyze failures, make changes, repeat."
```

## Result Format

Each round produces `autoresearch/results/round-NNN.json`:

```json
{
  "round": 3,
  "timestamp": "2026-03-31T15:30:00Z",
  "score": "16/20",
  "baseline": "14/20",
  "committed": true,
  "changes": "Simplified system prompt, added scroll-before-extract",
  "tasks": [
    { "name": "example-title", "passed": true, "steps": 1, "cost": 0.004 },
    { "name": "google-search", "passed": false, "steps": 10, "error": "max_steps" }
  ],
  "totalCost": 1.85,
  "duration": "22min"
}
```

## Overfitting Prevention

1. **Train/test split**: 15 self-built tasks are train (Claude sees failure logs), 5 benchmark tasks are test (only sees score)
2. **No task-specific changes**: program.md explicitly forbids hardcoding for individual tasks
3. **Human merge review**: After session ends, human reviews the git diff and rejects overfitting changes

## Constraints

- Modifiable scope: `src/agent/` only (all files)
- Execution: Real browser, real websites, real LLM API calls
- Cost estimate: ~$1-3 per round (20 tasks × ~$0.05-0.15 each)
- Time estimate: 15-30 minutes per round
- Session target: 10-20 rounds (~3-8 hours total)

## Success Criteria

- Establish a reproducible baseline score
- Achieve measurable improvement (e.g., 14/20 → 17/20)
- Changes are generalizable (test set score also improves)
- All changes pass human review (no overfitting)
