import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { env, hasGemini } from "@/lib/env";

export { hasGemini };

/** Fast, cheap model — fine for short structured parsing/summarisation. */
const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
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
 * model output as logic. Throws on transport error or schema mismatch.
 */
export async function generateJSON<T>(opts: {
  prompt: string;
  schema: ZodType<T>;
  system?: string;
  temperature?: number;
}): Promise<T> {
  const ai = getClient();
  // One retry: model output occasionally varies in shape/validity.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: opts.prompt,
        config: {
          responseMimeType: "application/json",
          temperature: opts.temperature ?? 0.2,
          ...(opts.system ? { systemInstruction: opts.system } : {}),
        },
      });
      return parseValidated(res.text, opts.schema);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
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
  const ai = getClient();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
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
      });
      return parseValidated(res.text, opts.schema);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Plain-text generation (summaries etc.). */
export async function generateText(opts: {
  prompt: string;
  system?: string;
  temperature?: number;
}): Promise<string> {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: opts.prompt,
    config: {
      temperature: opts.temperature ?? 0.3,
      ...(opts.system ? { systemInstruction: opts.system } : {}),
    },
  });
  return res.text ?? "";
}
