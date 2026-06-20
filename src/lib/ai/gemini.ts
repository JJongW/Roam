import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { env, hasGemini } from "@/lib/env";

export { hasGemini };

/** Primary fast/cheap model, with a fallback used when the primary is overloaded
 *  ("high demand" / 503). */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Permanent failures (bad request/auth) — retrying or switching model won't help. */
function isFatal(e: unknown): boolean {
  const status = (e as { status?: number; code?: number })?.status ?? (e as { code?: number })?.code;
  return status === 400 || status === 401 || status === 403 || status === 404;
}

type Request = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/**
 * Run a generateContent request with backoff + model fallback. Overload ("high
 * demand"/503), rate limits, and the occasional malformed response all clear on
 * a retry; after two tries on the primary model we drop to the fallback. Fatal
 * errors (4xx) short-circuit. Returns the parsed result of the first success.
 */
async function generate<T>(
  request: (model: string) => Request,
  parse: (text: string | undefined) => T,
): Promise<T> {
  const ai = getClient();
  // Primary ×2, then fallback ×2, with growing backoff + jitter.
  const plan: Array<{ model: string; delay: number }> = [
    { model: MODELS[0], delay: 0 },
    { model: MODELS[0], delay: 500 },
    { model: MODELS[1], delay: 1200 },
    { model: MODELS[1], delay: 2500 },
  ];
  let lastErr: unknown;
  for (const step of plan) {
    if (step.delay) await sleep(step.delay + Math.floor(Math.random() * 250));
    try {
      const res = await ai.models.generateContent(request(step.model));
      return parse(res.text);
    } catch (e) {
      lastErr = e;
      if (isFatal(e)) break;
    }
  }
  throw lastErr;
}

/** Parse a model text response into validated JSON, salvaging fenced/prose-wrapped objects. */
function parseValidated<T>(text: string | undefined, schema: ZodType<T>): T {
  if (!text) throw new Error("Gemini returned an empty response");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Models sometimes wrap JSON in prose/fences — salvage first object.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Gemini response was not JSON");
    json = JSON.parse(m[0]);
  }
  return schema.parse(json);
}

/**
 * Ask Gemini for JSON and validate it with a Zod schema. The model is forced to
 * emit JSON (responseMimeType), then re-validated so the app never trusts raw
 * model output as logic. Retries with backoff + fallback model on overload.
 */
export async function generateJSON<T>(opts: {
  prompt: string;
  schema: ZodType<T>;
  system?: string;
  temperature?: number;
}): Promise<T> {
  return generate(
    (model) => ({
      model,
      contents: opts.prompt,
      config: {
        responseMimeType: "application/json",
        temperature: opts.temperature ?? 0.2,
        ...(opts.system ? { systemInstruction: opts.system } : {}),
      },
    }),
    (text) => parseValidated(text, opts.schema),
  );
}

/**
 * Vision variant: read an inline image (base64) plus a text prompt, return
 * validated JSON. Used to extract publisher/brand/title text from a visitor's
 * screenshot — perception only; booth matching stays deterministic downstream.
 */
export async function generateJSONFromImage<T>(opts: {
  prompt: string;
  image: { data: string; mimeType: string };
  schema: ZodType<T>;
  system?: string;
  temperature?: number;
}): Promise<T> {
  return generate(
    (model) => ({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            {
              inlineData: {
                mimeType: opts.image.mimeType,
                data: opts.image.data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: opts.temperature ?? 0.1,
        ...(opts.system ? { systemInstruction: opts.system } : {}),
      },
    }),
    (text) => parseValidated(text, opts.schema),
  );
}

/** Plain-text generation (summaries etc.). Same backoff + fallback. */
export async function generateText(opts: {
  prompt: string;
  system?: string;
  temperature?: number;
}): Promise<string> {
  return generate(
    (model) => ({
      model,
      contents: opts.prompt,
      config: {
        temperature: opts.temperature ?? 0.3,
        ...(opts.system ? { systemInstruction: opts.system } : {}),
      },
    }),
    (text) => text ?? "",
  );
}
