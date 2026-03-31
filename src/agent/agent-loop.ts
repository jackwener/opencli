/**
 * Agent Loop — the core LLM-driven browser control loop.
 *
 * Features:
 * - Planning system with plan CRUD and replan nudges
 * - Sliding-window loop detection with page fingerprinting
 * - LLM call timeout
 * - Sensitive data masking
 * - Message compaction (summary-based)
 * - Budget and replan warnings
 */

import type { IPage } from '../types.js';
import type { AgentConfig, AgentResponse, AgentResult, AgentStep, ActionResult, PlanItem } from './types.js';
import { buildDomContext, type DomContext } from './dom-context.js';
import { buildSystemPrompt, buildStepMessage, buildLoopWarning, buildBudgetWarning, buildReplanNudge } from './prompts.js';
import { LLMClient, type ChatMessage } from './llm-client.js';
import { ActionExecutor } from './action-executor.js';
import { TraceRecorder, type RichTrace } from './trace-recorder.js';
import { createHash } from 'node:crypto';

export class AgentLoop {
  private steps: AgentStep[] = [];
  private consecutiveErrors = 0;
  private config: Required<Pick<AgentConfig, 'maxSteps' | 'maxConsecutiveErrors' | 'llmTimeout'>> & AgentConfig;
  private llm: LLMClient;
  private executor: ActionExecutor;
  private page: IPage;
  private messages: ChatMessage[] = [];
  private systemPrompt: string;
  private traceRecorder: TraceRecorder | null = null;

  // Planning state
  private plan: PlanItem[] = [];

  // Loop detection state (sliding window)
  private actionHashes: string[] = [];
  private pageFingerprints: string[] = [];
  private static readonly LOOP_WINDOW = 15;
  private static readonly LOOP_MILD_THRESHOLD = 4;
  private static readonly LOOP_STRONG_THRESHOLD = 7;
  private static readonly LOOP_CRITICAL_THRESHOLD = 10;
  private static readonly PAGE_STALL_THRESHOLD = 4;

  // Sensitive data patterns
  private sensitivePatterns: Map<string, string>;

  constructor(page: IPage, config: AgentConfig) {
    this.page = page;
    this.config = {
      ...config,
      maxSteps: config.maxSteps ?? 50,
      maxConsecutiveErrors: config.maxConsecutiveErrors ?? 5,
      llmTimeout: config.llmTimeout ?? 60000,
    };
    this.llm = new LLMClient({ model: config.model });
    this.executor = new ActionExecutor(page);
    this.systemPrompt = buildSystemPrompt(config.task);
    this.sensitivePatterns = new Map(Object.entries(config.sensitivePatterns ?? {}));

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

        // Add error context for the LLM
        this.messages.push({
          role: 'user',
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

    // Re-install network interceptor (it's destroyed on navigation)
    if (this.traceRecorder) {
      await this.traceRecorder.installInterceptor(this.page);
    }

    // Screenshot (optional)
    let screenshot: string | null = null;
    if (this.config.useScreenshot) {
      try {
        screenshot = await this.page.screenshot({ format: 'jpeg', quality: 50 });
      } catch { /* optional */ }
    }

    // Build step message with plan
    const previousResults = this.steps.length > 0
      ? this.steps[this.steps.length - 1].results
      : null;
    const stepContent = buildStepMessage(
      domContext,
      previousResults,
      this.plan.length > 0 ? this.plan : null,
      screenshot,
    );
    let stepText = stepContent.text;

    // Inject warnings (loop detection uses previously recorded state, not current step)
    const loopInfo = this.detectLoop();
    if (loopInfo.actionRepeat >= AgentLoop.LOOP_CRITICAL_THRESHOLD) {
      stepText += '\n\n' + buildLoopWarning(loopInfo.actionRepeat, 'critical');
    } else if (loopInfo.actionRepeat >= AgentLoop.LOOP_STRONG_THRESHOLD) {
      stepText += '\n\n' + buildLoopWarning(loopInfo.actionRepeat, 'strong');
    } else if (loopInfo.actionRepeat >= AgentLoop.LOOP_MILD_THRESHOLD) {
      stepText += '\n\n' + buildLoopWarning(loopInfo.actionRepeat, 'mild');
    }
    if (loopInfo.pageStall >= AgentLoop.PAGE_STALL_THRESHOLD) {
      stepText += '\n\nPage stall detected: same page for ' + loopInfo.pageStall + ' consecutive steps. The page may not be responding to your actions.';
    }

    if (stepNumber >= this.config.maxSteps * 0.75) {
      stepText += '\n\n' + buildBudgetWarning(stepNumber, this.config.maxSteps);
    }

    if (this.consecutiveErrors >= 3) {
      stepText += '\n\n' + buildReplanNudge(this.consecutiveErrors);
    }

    this.messages.push({
      role: 'user',
      content: this.maskSensitiveData(stepText),
      screenshot: stepContent.screenshot,
    });

    // Phase 2: Call LLM (with timeout)
    if (this.config.verbose) {
      console.log(`\n--- Step ${stepNumber} ---`);
      console.log(`  URL: ${domContext.url}`);
      console.log(`  Elements: ${domContext.elementMap.size}`);
    }

    this.compactMessages();

    const response = await this.callLLMWithTimeout();

    this.messages.push({ role: 'assistant', content: JSON.stringify(response) });

    if (this.config.verbose) {
      console.log(`  Eval: ${response.evaluationPreviousGoal}`);
      console.log(`  Thinking: ${response.thinking}`);
      console.log(`  Goal: ${response.nextGoal}`);
      console.log(`  Actions: ${response.actions.map(a => a.type).join(', ')}`);
      if (response.plan) console.log(`  Plan: ${response.plan.join(' → ')}`);
    }

    // Phase 3: Execute actions
    const results: ActionResult[] = [];
    let isDone = false;
    let doneResult: AgentResult | null = null;

    for (const action of response.actions) {
      if (action.type === 'done') {
        isDone = true;
        if (this.traceRecorder) {
          this.traceRecorder.recordFinalSnapshot(domContext);
        }
        doneResult = {
          success: action.success !== false,
          status: 'done',
          result: action.result,
          extractedData: action.extractedData,
          stepsCompleted: stepNumber,
          tokenUsage: this.llm.getTokenUsage(),
          trace: await this.traceRecorder?.finalize(
            this.page, this.config.task, this.config.startUrl,
            action.result, action.extractedData,
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

    // Track consecutive errors at step level (must happen before updatePlan)
    const anyActionFailed = results.some(r => !r.success);
    if (anyActionFailed) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
    }

    // Update plan from LLM response (after consecutiveErrors is current)
    this.updatePlan(response);

    // Record step for trace
    if (this.traceRecorder) {
      this.traceRecorder.recordStep(stepNumber, domContext, response, results);
    }

    // Update loop detection state
    this.recordLoopState(response, domContext);

    // Save step history
    this.steps.push({ stepNumber, url: domContext.url, response, results });

    if (isDone && doneResult) return doneResult;
    return null;
  }

  // ── Planning ────────────────────────────────────────────────────────────

  private updatePlan(response: AgentResponse): void {
    if (response.plan && response.plan.length > 0) {
      // LLM provided a new plan — replace
      this.plan = response.plan.map((text, i) => ({
        text,
        status: i === 0 ? 'current' as const : 'pending' as const,
      }));
    } else if (this.plan.length > 0) {
      // No plan update — advance current item to done if action succeeded
      const currentIdx = this.plan.findIndex(p => p.status === 'current');
      if (currentIdx >= 0 && this.consecutiveErrors === 0) {
        this.plan[currentIdx].status = 'done';
        const nextIdx = this.plan.findIndex(p => p.status === 'pending');
        if (nextIdx >= 0) {
          this.plan[nextIdx].status = 'current';
        }
      }
    }
  }

  // ── Loop Detection (sliding window + page fingerprint) ──────────────────

  private hashAction(response: AgentResponse): string {
    const key = response.actions.map(a => {
      if (a.type === 'click') return `click:${a.index}`;
      if (a.type === 'type') return `type:${a.index}`;
      if (a.type === 'scroll') return `scroll:${a.direction}`;
      if (a.type === 'navigate') return `nav`;
      return a.type;
    }).join(',');
    return createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  private fingerprintPage(domContext: DomContext): string {
    const key = `${domContext.url}|${domContext.elementMap.size}|${domContext.snapshotText.slice(0, 200)}`;
    return createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  private recordLoopState(response: AgentResponse, domContext: DomContext): void {
    this.actionHashes.push(this.hashAction(response));
    this.pageFingerprints.push(this.fingerprintPage(domContext));

    // Keep sliding window bounded
    if (this.actionHashes.length > AgentLoop.LOOP_WINDOW) {
      this.actionHashes.shift();
    }
    if (this.pageFingerprints.length > AgentLoop.LOOP_WINDOW) {
      this.pageFingerprints.shift();
    }
  }

  private detectLoop(): { actionRepeat: number; pageStall: number } {
    // Count how many recent action hashes match the latest (all from recorded history)
    let actionRepeat = 0;
    if (this.actionHashes.length >= 2) {
      const latest = this.actionHashes[this.actionHashes.length - 1];
      for (let i = this.actionHashes.length - 2; i >= 0; i--) {
        if (this.actionHashes[i] === latest) actionRepeat++;
        else break;
      }
    }

    // Count how many recent page fingerprints are identical
    let pageStall = 0;
    if (this.pageFingerprints.length >= 2) {
      const latest = this.pageFingerprints[this.pageFingerprints.length - 1];
      for (let i = this.pageFingerprints.length - 2; i >= 0; i--) {
        if (this.pageFingerprints[i] === latest) pageStall++;
        else break;
      }
    }

    return { actionRepeat, pageStall };
  }

  // ── LLM Call with Timeout ───────────────────────────────────────────────

  private async callLLMWithTimeout(): Promise<AgentResponse> {
    const timeoutMs = this.config.llmTimeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.llm.chat(this.systemPrompt, this.messages, controller.signal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`LLM call timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Sensitive Data Masking ──────────────────────────────────────────────

  private maskSensitiveData(text: string): string {
    let result = text;
    for (const [placeholder, value] of this.sensitivePatterns) {
      result = result.replaceAll(value, `<${placeholder}>`);
    }
    return result;
  }

  // ── Message Compaction ──────────────────────────────────────────────────

  private compactMessages(): void {
    const MAX_MESSAGES = 40; // 20 exchanges
    if (this.messages.length <= MAX_MESSAGES) return;

    const keepFirst = 2;
    const keepLast = 16; // Last 8 exchanges

    const removed = this.messages.length - keepFirst - keepLast;

    // Build a summary of removed messages
    const removedMsgs = this.messages.slice(keepFirst, this.messages.length - keepLast);
    const summary = this.buildCompactionSummary(removedMsgs, removed);

    let tail = this.messages.slice(-keepLast);
    // Ensure tail starts with 'user' for Anthropic API compliance
    while (tail.length > 0 && tail[0].role !== 'user') {
      tail = tail.slice(1);
    }

    const compacted: ChatMessage[] = [...this.messages.slice(0, keepFirst)];

    // The summary is a 'user' message. If the last kept message is also 'user',
    // merge them to prevent consecutive user messages (Anthropic API requires alternation).
    if (compacted.length > 0 && compacted[compacted.length - 1].role === 'user') {
      compacted[compacted.length - 1] = {
        ...compacted[compacted.length - 1],
        content: compacted[compacted.length - 1].content + '\n\n' + summary,
      };
    } else {
      compacted.push({ role: 'user' as const, content: summary });
    }

    // Ensure tail also maintains alternation after summary
    if (tail.length > 0 && compacted[compacted.length - 1].role === tail[0].role) {
      tail = tail.slice(1);
    }

    this.messages = [...compacted, ...tail];
  }

  private buildCompactionSummary(messages: ChatMessage[], count: number): string {
    // Extract key info from removed messages
    const urls = new Set<string>();
    const actions: string[] = [];
    const errors: string[] = [];
    const memories: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        const urlMatch = msg.content.match(/URL: (.+)/);
        if (urlMatch) urls.add(urlMatch[1]);
      } else {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.nextGoal) actions.push(parsed.nextGoal);
          if (parsed.memory) memories.push(parsed.memory);
          if (parsed.evaluationPreviousGoal?.toLowerCase().includes('fail')) {
            errors.push(parsed.evaluationPreviousGoal);
          }
        } catch { /* not JSON */ }
      }
    }

    const parts = [`[${count} earlier messages compacted]`];
    if (urls.size > 0) parts.push(`Pages visited: ${[...urls].join(', ')}`);
    if (actions.length > 0) parts.push(`Actions taken: ${actions.slice(-5).join('; ')}`);
    if (errors.length > 0) parts.push(`Past errors: ${errors.slice(-3).join('; ')}`);
    if (memories.length > 0) parts.push(`Key memories from earlier steps:\n${memories.slice(-5).join('\n')}`);

    return parts.join('\n');
  }
}
