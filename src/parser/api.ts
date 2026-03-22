import OpenAI from "openai";
import { PARSER_SYSTEM_PROMPT, buildParserUserPrompt } from "./prompt.js";
import type { ParserInput, ParserOutput } from "./types.js";

let client: OpenAI;

export function initParserClient(c?: OpenAI) {
  client = c ?? new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
}

export async function callParser(input: ParserInput): Promise<{
  raw: string;
  parsed: ParserOutput | null;
  error: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
}> {
  const userPrompt = buildParserUserPrompt(
    input.category,
    input.description,
    input.profile as any,
  );
  const start = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: "qwen3.5-flash",
      messages: [
        { role: "system", content: PARSER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,  // extraction → low temperature
      max_tokens: 1000,
      response_format: { type: "json_object" },
      // @ts-ignore DashScope-specific
      enable_thinking: false,
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content ?? "";
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    let parsed: ParserOutput | null = null;
    let error: string | null = null;
    try {
      const cleaned = raw.replace(/^```json\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned) as ParserOutput;
    } catch (e) {
      error = `JSON parse error: ${(e as Error).message}`;
    }

    return { raw, parsed, error, usage, latencyMs };
  } catch (e) {
    return {
      raw: "",
      parsed: null,
      error: `API error: ${(e as Error).message}`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: Date.now() - start,
    };
  }
}
