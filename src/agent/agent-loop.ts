/**
 * Agent Loop — the core LLM-driven browser control loop.
 *
 * Implements: context → LLM → execute → observe → repeat
 * With: loop detection, message compaction, budget warnings, error recovery.
 */

import type { IPage } from '../types.js';
import type { AgentConfig, AgentResponse, AgentResult, AgentStep, ActionResult } from './types.js';
import { buildDomContext } from './dom-context.js';
import { buildSystemPrompt, buildStepMessage, buildLoopWarning, buildBudgetWarning } from './prompts.js';
import { LLMClient, type ChatMessage } from './llm-client.js';
import { ActionExecutor } from './action-executor.js';
import { TraceRecorder, type RichTrace } from './trace-recorder.js';

export class AgentLoop {
  private steps: AgentStep[] = [];
  private consecutiveErrors = 0;
  private config: Required<Pick<AgentConfig, 'maxSteps' | 'maxConsecutiveErrors'>> & AgentConfig;
  private llm: LLMClient;
  private executor: ActionExecutor;
  private page: IPage;
  private messages: ChatMessage[] = [];
  private systemPrompt: string;
  private traceRecorder: TraceRecorder | null = null;

  constructor(page: IPage, config: AgentConfig) {
    this.page = page;
    this.config = {
      ...config,
      maxSteps: config.maxSteps ?? 50,
      maxConsecutiveErrors: config.maxConsecutiveErrors ?? 5,
    };
    this.llm = new LLMClient({
      model: config.model,
    });
    this.executor = new ActionExecutor(page);
    this.systemPrompt = buildSystemPrompt(config.task);

    if (config.record || config.saveAs) {
      this.traceRecorder = new TraceRecorder();
    }
  }

  async run(): Promise<AgentResult> {
    // Navigate to start URL if provided
    if (this.config.startUrl) {
      await this.page.goto(this.config.startUrl);
      await this.page.wait(2);
    }

    // Install network interceptor for rich trace capture
    if (this.traceRecorder) {
      await this.traceRecorder.installInterceptor(this.page);
    }

    for (let step = 1; step <= this.config.maxSteps; step++) {
      try {
        const result = await this.step(step);
        if (result) return result;
      } catch (err) {
        this.consecutiveErrors++;
        const errMsg = err instanceof Error ? err.message : String(err);

        if (this.config.verbose) {
          console.error(`  Step ${step} error: ${errMsg}`);
        }

        if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
          return {
            success: false,
            status: 'error',
            result: `Agent stopped after ${this.consecutiveErrors} consecutive errors. Last: ${errMsg}`,
            stepsCompleted: step,
            tokenUsage: this.llm.getTokenUsage(),
            trace: await this.traceRecorder?.finalize(this.page, this.config.task, this.config.startUrl),
          };
        }

        // Add error context for the LLM (as user message to maintain alternation)
        this.messages.push({
          role: 'user' as const,
          content: `ERROR in step ${step}: ${errMsg}\nPlease try a different approach.`,
        });
      }
    }

    return {
      success: false,
      status: 'max_steps',
      result: `Agent reached maximum steps (${this.config.maxSteps}) without completing the task`,
      stepsCompleted: this.config.maxSteps,
      tokenUsage: this.llm.getTokenUsage(),
      trace: await this.traceRecorder?.finalize(this.page, this.config.task, this.config.startUrl),
    };
  }

  private async step(stepNumber: number): Promise<AgentResult | null> {
    // Phase 1: Build context
    const domContext = await buildDomContext(this.page);

    // Get screenshot if enabled
    let screenshot: string | null = null;
    if (this.config.useScreenshot) {
      try {
        screenshot = await this.page.screenshot({ format: 'jpeg', quality: 50 });
      } catch {
        // Screenshot is optional
      }
    }

    // Build step message
    const previousResults = this.steps.length > 0
      ? this.steps[this.steps.length - 1].results
      : null;
    const stepContent = buildStepMessage(domContext, previousResults, screenshot);
    let stepText = stepContent.text;

    // Inject loop warning if needed
    const loopCount = this.detectLoop();
    if (loopCount >= 3) {
      stepText += '\n\n' + buildLoopWarning(loopCount);
    }

    // Inject budget warning at 75%
    if (stepNumber >= this.config.maxSteps * 0.75) {
      stepText += '\n\n' + buildBudgetWarning(stepNumber, this.config.maxSteps);
    }

    this.messages.push({
      role: 'user',
      content: stepText,
      screenshot: stepContent.screenshot,
    });

    // Phase 2: Call LLM
    if (this.config.verbose) {
      console.log(`\n--- Step ${stepNumber} ---`);
      console.log(`  URL: ${domContext.url}`);
      console.log(`  Elements: ${domContext.elementMap.size}`);
    }

    // Compact messages if history is too long
    this.compactMessages();

    const response = await this.llm.chat(this.systemPrompt, this.messages);

    // Store assistant response in message history
    this.messages.push({ role: 'assistant', content: JSON.stringify(response) });

    if (this.config.verbose) {
      console.log(`  Thinking: ${response.thinking}`);
      console.log(`  Goal: ${response.nextGoal}`);
      console.log(`  Actions: ${response.actions.map(a => a.type).join(', ')}`);
    }

    // Phase 3: Execute actions
    const results: ActionResult[] = [];
    let isDone = false;
    let doneResult: AgentResult | null = null;

    for (const action of response.actions) {
      if (action.type === 'done') {
        isDone = true;
        // Capture final DOM snapshot before finalizing trace
        if (this.traceRecorder) {
          this.traceRecorder.recordFinalSnapshot(domContext);
        }
        doneResult = {
          success: true,
          status: 'done',
          result: action.result,
          extractedData: action.extractedData,
          stepsCompleted: stepNumber,
          tokenUsage: this.llm.getTokenUsage(),
          trace: await this.traceRecorder?.finalize(
            this.page,
            this.config.task,
            this.config.startUrl,
            action.result,
            action.extractedData,
          ),
        };
        results.push({ action, success: true, extractedContent: action.result });
        break;
      }

      const result = await this.executor.execute(action, domContext.elementMap);
      results.push(result);

      if (this.config.verbose) {
        const status = result.success ? 'OK' : 'FAIL';
        console.log(`  → ${action.type}: ${status}${result.error ? ` (${result.error})` : ''}`);
      }
    }

    // Track consecutive errors at step level (not per-action)
    const anyActionFailed = results.some(r => !r.success);
    if (anyActionFailed) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
    }

    // Record step for trace
    if (this.traceRecorder) {
      this.traceRecorder.recordStep(stepNumber, domContext, response, results);
    }

    // Save step history
    this.steps.push({
      stepNumber,
      url: domContext.url,
      response,
      results,
    });

    if (isDone && doneResult) {
      return doneResult;
    }

    return null;
  }

  /**
   * Detect if the agent is stuck in a loop by comparing recent action sequences.
   * Returns the number of consecutive identical action sequences.
   */
  private detectLoop(): number {
    if (this.steps.length < 3) return 0;

    const recent = this.steps.slice(-3);
    const actionKeys = recent.map(s =>
      s.response.actions.map(a => {
        if (a.type === 'click') return `click:${a.index}`;
        if (a.type === 'type') return `type:${a.index}:${a.text}`;
        if (a.type === 'scroll') return `scroll:${a.direction}`;
        return a.type;
      }).join(',')
    );

    // Check if all 3 recent steps have the same action sequence
    if (actionKeys[0] === actionKeys[1] && actionKeys[1] === actionKeys[2]) {
      return 3;
    }

    return 0;
  }

  /**
   * Compact message history when it gets too long.
   * Keeps the first message and last 10 exchanges, summarizes the rest.
   */
  private compactMessages(): void {
    const MAX_EXCHANGES = 20; // 20 user+assistant pairs = 40 messages
    if (this.messages.length <= MAX_EXCHANGES * 2) return;

    const keepFirst = 2; // First user + assistant
    const keepLast = 10 * 2; // Last 10 exchanges

    const removed = this.messages.length - keepFirst - keepLast;
    let tail = this.messages.slice(-keepLast);

    // Ensure tail starts with a 'user' message to maintain alternation
    // (Anthropic API requires user/assistant to alternate, starting with user)
    while (tail.length > 0 && tail[0].role !== 'user') {
      tail = tail.slice(1);
    }

    const compacted: ChatMessage[] = [
      ...this.messages.slice(0, keepFirst),
      {
        role: 'user' as const,
        content: `[${removed} earlier messages omitted for context management. Key facts from earlier steps are in your memory field.]`,
      },
      ...tail,
    ];

    this.messages = compacted;
  }
}
