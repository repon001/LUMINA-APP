import { z } from "zod";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  /** OpenRouter reports what the call cost, in USD. Worth logging. */
  costUsd: number;
}

export interface CompletionResult<T> {
  data: T;
  usage: CompletionUsage;
  model: string;
}

interface OpenRouterResponse {
  model?: string;
  choices?: { message?: { content?: string; reasoning?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number };
}

export const isAiConfigured = () => Boolean(env.OPENROUTER_API_KEY);

/**
 * Reads the JSON out of an answer.
 *
 * `response_format` constrains well-behaved models, but the field is advisory
 * for some of the ones OpenRouter fronts: they wrap the object in a ```json
 * fence, or write a sentence before it. Rather than forbid those models, take
 * the widest brace-delimited span when a direct parse fails.
 */
const parseJson = (content: string, schemaName: string): unknown => {
  const attempts = [content];

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) attempts.push(fenced[1]);

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(content.slice(firstBrace, lastBrace + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt.trim());
    } catch {
      // Try the next shape.
    }
  }

  // The content itself may be long and is not the client's problem; log a head
  // for diagnosis and tell the caller only that it was unusable.
  console.error(`[ai] unparseable answer for ${schemaName}: ${content.slice(0, 200)}`);
  throw ApiError.serviceUnavailable("The AI provider returned malformed JSON");
};

const requireKey = () => {
  if (!env.OPENROUTER_API_KEY) {
    throw ApiError.serviceUnavailable("AI features are not configured on this server");
  }
  return env.OPENROUTER_API_KEY;
};

/**
 * One call to the model, with the answer shaped by a schema.
 *
 * The same Zod schema does two jobs: it is converted to JSON Schema and sent as
 * `response_format`, so the model is constrained rather than merely asked; and
 * it validates what comes back. A model that ignores the constraint fails here
 * instead of leaking a malformed object into the database.
 */
export const complete = async <T>(input: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
}): Promise<CompletionResult<T>> => {
  const apiKey = requireKey();

  // Draft-07 is what OpenRouter's structured-output validator accepts.
  const jsonSchema = z.toJSONSchema(input.schema, { target: "draft-7" });

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        // OpenRouter shows these on the account's activity page.
        "X-Title": "LUMINA",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: input.maxTokens ?? 4000,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: jsonSchema },
        },
        reasoning:
          env.OPENROUTER_REASONING === "off"
            ? { enabled: false }
            : { effort: env.OPENROUTER_REASONING },
      }),
      signal: AbortSignal.timeout(env.OPENROUTER_TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout or a network failure is the provider being unavailable, not a
    // bug in this request.
    throw ApiError.serviceUnavailable(
      error instanceof Error && error.name === "TimeoutError"
        ? "The AI provider took too long to answer"
        : "The AI provider is unreachable",
    );
  }

  const body = (await response.json().catch(() => null)) as OpenRouterResponse | null;

  if (!response.ok || body?.error) {
    const message = body?.error?.message ?? `provider returned ${response.status}`;
    // 4xx from the provider is our request; 5xx is theirs.
    throw response.status >= 500 || response.status === 429
      ? ApiError.serviceUnavailable(`AI provider is unavailable: ${message}`)
      : ApiError.badRequest(`AI request was rejected: ${message}`);
  }

  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    // A reasoning model can spend the entire budget thinking and return an
    // empty answer. Name that, because the fix is a setting, not a retry.
    const thought = choice?.message?.reasoning?.length ?? 0;
    console.error(`[ai] empty answer for ${input.schemaName} (reasoning chars: ${thought})`);
    throw ApiError.serviceUnavailable(
      thought > 0
        ? "The AI spent its whole budget reasoning and returned no answer"
        : "The AI provider returned an empty answer",
    );
  }

  // Hitting the token ceiling truncates mid-object, which looks identical to a
  // model that cannot follow the schema. Say which one it was.
  if (choice?.finish_reason === "length") {
    console.error(`[ai] answer truncated at max_tokens (${input.schemaName})`);
    throw ApiError.serviceUnavailable("The AI answer was cut off before it finished");
  }

  const parsed = parseJson(content, input.schemaName);

  const result = input.schema.safeParse(parsed);
  if (!result.success) {
    console.error(
      `[ai] answer failed validation for ${input.schemaName}:`,
      result.error.issues.slice(0, 5),
    );
    throw ApiError.serviceUnavailable("The AI answer did not match the expected shape");
  }

  return {
    data: result.data,
    usage: {
      promptTokens: body?.usage?.prompt_tokens ?? 0,
      completionTokens: body?.usage?.completion_tokens ?? 0,
      costUsd: body?.usage?.cost ?? 0,
    },
    model: body?.model ?? env.OPENROUTER_MODEL,
  };
};
