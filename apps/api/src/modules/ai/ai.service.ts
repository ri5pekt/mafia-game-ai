import { BadRequestException, Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";

import type { AiActRequest, AiDayDiscussionSpeak } from "./ai.types";

function makeId() {
    return crypto.randomUUID();
}

function promptPath() {
    // Support both:
    // - running from repo root (cwd=/workspace)
    // - running from apps/api (cwd=/workspace/apps/api)
    const candidates = [
        path.resolve(process.cwd(), "src/modules/ai/system-prompt.md"),
        path.resolve(process.cwd(), "apps/api/src/modules/ai/system-prompt.md"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    // Fall back to the first candidate for error messages.
    return candidates[0];
}

function loadSystemPrompt(): string {
    try {
        return fs.readFileSync(promptPath(), "utf8");
    } catch (e: any) {
        throw new BadRequestException(`Failed to read system prompt: ${e?.message ?? String(e)}`);
    }
}

function extractJsonObject(text: string): string {
    const s = text.trim();
    // Common case: perfect JSON.
    if (s.startsWith("{") && s.endsWith("}")) return s;
    // Fallback: extract the first {...} block.
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return s;
    return s.slice(first, last + 1);
}

function parseDayDiscussionSpeak(rawText: string): { parsed: AiDayDiscussionSpeak | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const say = typeof obj?.say === "string" ? obj.say.trim() : "";
        const nominate =
            obj?.nominateSeatNumber === null
                ? null
                : Number.isFinite(Number(obj?.nominateSeatNumber))
                ? Number(obj.nominateSeatNumber)
                : null;

        if (!say) return { parsed: null, error: 'Missing/empty "say" string.' };
        if (!(nominate === null || (Number.isInteger(nominate) && nominate >= 1 && nominate <= 10))) {
            return { parsed: null, error: '"nominateSeatNumber" must be null or an integer 1..10.' };
        }
        return { parsed: { say, nominateSeatNumber: nominate } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

@Injectable()
export class AiService {
    private client: OpenAI | null = null;
    private clientKey: string | null = null;

    private getClient(): OpenAI {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new BadRequestException("OPENAI_API_KEY is not set");

        // If key changes at runtime (dev), recreate the client.
        if (!this.client || this.clientKey !== apiKey) {
            this.client = new OpenAI({ apiKey });
            this.clientKey = apiKey;
        }
        return this.client;
    }

    async act(req: AiActRequest) {
        const system = loadSystemPrompt();

        const model = (req.model ?? process.env.OPENAI_MODEL ?? "gpt-5-nano").trim();
        if (!model) throw new BadRequestException("model is required");

        const persona = req.persona;
        if (!persona || !Number.isInteger(persona.seatNumber))
            throw new BadRequestException("persona.seatNumber is required");
        if (!persona.roleId) throw new BadRequestException("persona.roleId is required");
        if (!persona.name) throw new BadRequestException("persona.name is required");

        if (req.action !== "DAY_DISCUSSION_SPEAK") {
            throw new BadRequestException(`Unsupported action: ${String(req.action)}`);
        }

        const aliveList = Array.isArray(req.aliveSeatNumbers)
            ? req.aliveSeatNumbers.filter((n) => Number.isInteger(n))
            : [];

        const prompt = [
            system.trim(),
            "",
            "## Current state (role-specific log)",
            req.roleLogText?.trim() || "(empty)",
            "",
            "## Persona",
            `You are seat #${persona.seatNumber}.`,
            `Your role: ${persona.roleId}.`,
            `Your name: ${persona.name}${persona.nickname ? ` (${persona.nickname})` : ""}.`,
            persona.profile ? `Bio: ${persona.profile}` : "",
            aliveList.length ? `Alive seats: ${aliveList.join(", ")}` : "",
            "",
            "## Task",
            `Phase: ${req.phaseId}`,
            "You must speak as the current speaker.",
            "Optionally nominate ONE alive seat (1..10). If you do not nominate, set nominateSeatNumber to null.",
            "",
            "Output JSON ONLY with this exact shape:",
            '{"say":"...","nominateSeatNumber":null}',
            "",
            "Hard constraints:",
            "- No markdown. No explanations. Output only JSON.",
            '- "say" must be a single short paragraph (1-4 sentences).',
            '- "nominateSeatNumber" must be null or an integer 1..10.',
            "- Prefer nominating someone only if you have a plausible reason from the log.",
        ]
            .filter(Boolean)
            .join("\n");

        const requestId = makeId();

        // What we send to OpenAI (exact payload).
        const openaiRequest = {
            model,
            input: prompt,
        };

        const resp = await this.getClient().responses.create(openaiRequest as any);

        const outputText = (resp as any)?.output_text ?? (resp as any)?.outputText ?? "";

        const { parsed, error } = parseDayDiscussionSpeak(String(outputText ?? ""));

        return {
            requestId,
            model,
            prompt,
            outputText: String(outputText ?? ""),
            parsed,
            parseError: error,
            openaiRequest,
            openaiResponse: resp,
        };
    }
}
