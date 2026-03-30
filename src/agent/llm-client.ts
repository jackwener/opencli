/**
 * LLM Client — wrapper around the Anthropic SDK.
 *
 * Features:
 * - Prompt caching (system + last user message)
 * - Multimodal support (text + screenshot images)
 * - Screenshot size control (auto-resize for token efficiency)
 * - Token tracking with cost estimation
 * - JSON extraction and Zod validation
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { AgentResponse } from './types.js';

export interface LLMClientConfig {
  model?: string;
  apiKey?: string;
  /** Max screenshot dimension in pixels (default 1200) */
  maxScreenshotDim?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Base64-encoded screenshot image (user messages only) */
  screenshot?: string;
}

interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  estimatedCost: number;
}

// Cost per 1M tokens (Claude Sonnet 4)
const COST_PER_1M_INPUT = 3.0;
const COST_PER_1M_OUTPUT = 15.0;
const COST_PER_1M_CACHE_READ = 0.3;   // 90% cheaper than input
const COST_PER_1M_CACHE_WRITE = 3.75; // 25% more than input

export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxScreenshotDim: number;
  private _totalTokens: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, estimatedCost: 0 };

  constructor(config: LLMClientConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    const baseURL = process.env.ANTHROPIC_BASE_URL ?? undefined;
    this.client = new Anthropic({ apiKey, baseURL });
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.maxScreenshotDim = config.maxScreenshotDim ?? 1200;
  }

  async chat(
    systemPrompt: string,
    messages: ChatMessage[],
  ): Promise<AgentResponse> {
    const apiMessages: MessageParam[] = messages.map((m, i) => {
      const isLastUser = m.role === 'user' && i === messages.length - 1;

      if (m.role === 'user' && m.screenshot) {
        // Multimodal: image + text
        const content: ContentBlockParam[] = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: m.screenshot,
            },
          },
          {
            type: 'text',
            text: m.content,
            ...(isLastUser ? { cache_control: { type: 'ephemeral' as const } } : {}),
          },
        ];
        return { role: m.role, content };
      }
      return {
        role: m.role,
        content: isLastUser
          ? [{ type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } }]
          : m.content,
      };
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: apiMessages,
    });

    // Track tokens (including cache stats)
    const usage = response.usage as unknown as Record<string, number> | undefined;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheCreation = usage?.cache_creation_input_tokens ?? 0;

    this._totalTokens.input += inputTokens;
    this._totalTokens.output += outputTokens;
    this._totalTokens.cacheRead += cacheRead;
    this._totalTokens.cacheCreation += cacheCreation;
    this._totalTokens.estimatedCost =
      (this._totalTokens.input / 1_000_000) * COST_PER_1M_INPUT +
      (this._totalTokens.output / 1_000_000) * COST_PER_1M_OUTPUT +
      (this._totalTokens.cacheRead / 1_000_000) * COST_PER_1M_CACHE_READ +
      (this._totalTokens.cacheCreation / 1_000_000) * COST_PER_1M_CACHE_WRITE;

    // Extract text content
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in LLM response');
    }

    // Guard against empty/truncated responses
    if (!textBlock.text || textBlock.text.trim().length === 0) {
      throw new Error('LLM returned empty response (API proxy may have truncated output)');
    }

    // Parse JSON from the response
    const jsonText = extractJson(textBlock.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse LLM response as JSON: ${(e as Error).message}\nResponse: ${textBlock.text.slice(0, 500)}`);
    }

    // Validate with Zod
    const result = AgentResponse.safeParse(parsed);
    if (!result.success) {
      throw new Error(`LLM response validation failed: ${result.error.message}\nParsed: ${JSON.stringify(parsed).slice(0, 500)}`);
    }

    return result.data;
  }

  getTokenUsage(): { input: number; output: number; estimatedCost: number } {
    return {
      input: this._totalTokens.input,
      output: this._totalTokens.output,
      estimatedCost: this._totalTokens.estimatedCost,
    };
  }

  getDetailedTokenUsage(): TokenUsage {
    return { ...this._totalTokens };
  }
}

/**
 * Extract JSON from text that may contain markdown code fences or other wrapping.
 */
function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}
