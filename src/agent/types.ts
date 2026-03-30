/**
 * Agent types — Zod schemas for LLM actions, response format, and configuration.
 */

import { z } from 'zod';

// ── Action Schemas ──────────────────────────────────────────────────────────

export const ClickAction = z.object({
  type: z.literal('click'),
  index: z.number().describe('Element index from the DOM snapshot'),
});

export const TypeAction = z.object({
  type: z.literal('type'),
  index: z.number().describe('Element index from the DOM snapshot'),
  text: z.string().describe('Text to type into the element'),
  pressEnter: z.boolean().optional().describe('Press Enter after typing'),
});

export const NavigateAction = z.object({
  type: z.literal('navigate'),
  url: z.string().describe('URL to navigate to'),
});

export const ScrollAction = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']).default('down'),
  amount: z.number().optional().describe('Number of pixels to scroll (default 500)'),
  index: z.number().optional().describe('Element index to scroll within (omit for page scroll)'),
});

export const WaitAction = z.object({
  type: z.literal('wait'),
  seconds: z.number().optional().default(2).describe('Seconds to wait'),
});

export const ExtractAction = z.object({
  type: z.literal('extract'),
  goal: z.string().describe('What to extract from the page'),
});

export const GoBackAction = z.object({
  type: z.literal('go_back'),
});

export const PressKeyAction = z.object({
  type: z.literal('press_key'),
  key: z.string().describe('Key to press (e.g. Enter, Escape, Tab, Control+a)'),
});

export const SelectDropdownAction = z.object({
  type: z.literal('select_dropdown'),
  index: z.number().describe('Element index of the <select> element'),
  option: z.string().describe('Option text to select'),
});

export const SwitchTabAction = z.object({
  type: z.literal('switch_tab'),
  tabIndex: z.number().describe('Tab index to switch to'),
});

export const OpenTabAction = z.object({
  type: z.literal('open_tab'),
  url: z.string().optional().describe('URL to open in new tab'),
});

export const CloseTabAction = z.object({
  type: z.literal('close_tab'),
});

export const SearchPageAction = z.object({
  type: z.literal('search_page'),
  query: z.string().describe('Text to search for on the page'),
});

export const DoneAction = z.object({
  type: z.literal('done'),
  result: z.string().optional().describe('Summary of what was accomplished'),
  extractedData: z.unknown().optional().describe('Structured data extracted'),
  success: z.boolean().optional().default(true).describe('Whether the task was completed successfully'),
});

export const AgentAction = z.discriminatedUnion('type', [
  ClickAction,
  TypeAction,
  NavigateAction,
  ScrollAction,
  WaitAction,
  ExtractAction,
  GoBackAction,
  PressKeyAction,
  SelectDropdownAction,
  SwitchTabAction,
  OpenTabAction,
  CloseTabAction,
  SearchPageAction,
  DoneAction,
]);

export type AgentAction = z.infer<typeof AgentAction>;

// ── Agent Response Schema (with planning + self-evaluation) ─────────────────

export const AgentResponse = z.object({
  evaluationPreviousGoal: z.string().describe('1-sentence evaluation: did the previous action succeed or fail, and why?'),
  thinking: z.string().describe('Your reasoning about the current state and what to do next'),
  memory: z.string().optional().describe('Important information to remember across steps'),
  nextGoal: z.string().describe('What the next action will achieve'),
  plan: z.array(z.string()).optional().describe('Updated task plan — list of remaining steps'),
  actions: z.array(AgentAction).min(1).max(5).describe('Actions to execute'),
});

export type AgentResponse = z.infer<typeof AgentResponse>;

// ── Action Result ───────────────────────────────────────────────────────────

export interface ActionResult {
  action: AgentAction;
  success: boolean;
  error?: string;
  extractedContent?: string;
}

// ── Planning ────────────────────────────────────────────────────────────────

export type PlanItemStatus = 'pending' | 'current' | 'done' | 'skipped';

export interface PlanItem {
  text: string;
  status: PlanItemStatus;
}

// ── Agent Configuration ─────────────────────────────────────────────────────

export interface AgentConfig {
  task: string;
  startUrl?: string;
  maxSteps?: number;
  maxConsecutiveErrors?: number;
  useScreenshot?: boolean;
  model?: string;
  verbose?: boolean;
  workspace?: string;
  record?: boolean;
  saveAs?: string;
  /** LLM call timeout in ms (default 60000) */
  llmTimeout?: number;
  /** Sensitive data patterns to mask before sending to LLM */
  sensitivePatterns?: Record<string, string>;
}

// ── Agent Result ────────────────────────────────────────────────────────────

export interface AgentResult {
  success: boolean;
  status: 'done' | 'error' | 'max_steps';
  result?: string;
  extractedData?: unknown;
  stepsCompleted: number;
  tokenUsage: { input: number; output: number; estimatedCost: number };
  trace?: import('./trace-recorder.js').RichTrace;
}

// ── Agent Step ──────────────────────────────────────────────────────────────

export interface AgentStep {
  stepNumber: number;
  url: string;
  response: AgentResponse;
  results: ActionResult[];
}
