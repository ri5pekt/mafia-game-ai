import { BadRequestException, Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";

import type {
    AiActRequest,
    AiDayDiscussionSpeak,
    AiEliminationSpeechLastWords,
    AiMassVoteAll,
    AiNightMafiaBossGuessSheriff,
    AiNightMafiaBossDiscussionSelectKillGuessSheriff,
    AiNightMafiaDiscussionSpeak,
    AiNightSheriffInvestigate,
    AiVoteAll,
} from "./ai.types";

function makeId() {
    return crypto.randomUUID();
}

function promptPath() {
    const envPath = process.env.AI_SYSTEM_PROMPT_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) return envPath;
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

function parseNightMafiaDiscussionSpeak(rawText: string): { parsed: AiNightMafiaDiscussionSpeak | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const say = typeof obj?.say === "string" ? obj.say.trim() : "";
        const suggest =
            obj?.suggestKillSeatNumber === null
                ? null
                : Number.isFinite(Number(obj?.suggestKillSeatNumber))
                ? Number(obj.suggestKillSeatNumber)
                : null;

        if (!say) return { parsed: null, error: 'Missing/empty "say" string.' };
        if (!(suggest === null || (Number.isInteger(suggest) && suggest >= 1 && suggest <= 10))) {
            return { parsed: null, error: '"suggestKillSeatNumber" must be null or an integer 1..10.' };
        }
        return { parsed: { say, suggestKillSeatNumber: suggest } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

function parseEliminationSpeechLastWords(
    rawText: string
): { parsed: AiEliminationSpeechLastWords | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const say = typeof obj?.say === "string" ? obj.say.trim() : "";
        if (!say) return { parsed: null, error: 'Missing/empty "say" string.' };
        return { parsed: { say } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

function parseNightBossDiscussionSelectKillGuessSheriff(
    rawText: string
): { parsed: AiNightMafiaBossDiscussionSelectKillGuessSheriff | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const say = typeof obj?.say === "string" ? obj.say.trim() : "";
        const sel =
            obj?.selectKillSeatNumber === null
                ? null
                : Number.isFinite(Number(obj?.selectKillSeatNumber))
                ? Number(obj.selectKillSeatNumber)
                : null;
        const guess = Number(obj?.guessSheriffSeatNumber);

        if (!say) return { parsed: null, error: 'Missing/empty "say" string.' };
        if (!(sel === null || (Number.isInteger(sel) && sel >= 1 && sel <= 10))) {
            return { parsed: null, error: '"selectKillSeatNumber" must be null or an integer 1..10.' };
        }
        if (!(Number.isInteger(guess) && guess >= 1 && guess <= 10)) {
            return { parsed: null, error: '"guessSheriffSeatNumber" must be an integer 1..10.' };
        }
        return { parsed: { say, selectKillSeatNumber: sel, guessSheriffSeatNumber: guess } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

function parseNightBossGuessSheriff(rawText: string): { parsed: AiNightMafiaBossGuessSheriff | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const guess = Number(obj?.guessSheriffSeatNumber);
        if (!(Number.isInteger(guess) && guess >= 1 && guess <= 10)) {
            return { parsed: null, error: '"guessSheriffSeatNumber" must be an integer 1..10.' };
        }
        return { parsed: { guessSheriffSeatNumber: guess } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

function parseNightSheriffInvestigate(rawText: string): { parsed: AiNightSheriffInvestigate | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const seat = Number(obj?.investigateSeatNumber);
        if (!(Number.isInteger(seat) && seat >= 1 && seat <= 10)) {
            return { parsed: null, error: '"investigateSeatNumber" must be an integer 1..10.' };
        }
        return { parsed: { investigateSeatNumber: seat } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

function parseVoteAll(rawText: string): { parsed: AiVoteAll | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const votes = obj?.votes;
        if (!Array.isArray(votes)) return { parsed: null, error: 'Missing/invalid "votes" array.' };
        const parsedVotes = votes.map((v: any) => ({
            voterSeatNumber: Number(v?.voterSeatNumber),
            targetSeatNumber: Number(v?.targetSeatNumber),
        }));
        for (const v of parsedVotes) {
            if (
                !Number.isInteger(v.voterSeatNumber) ||
                !Number.isInteger(v.targetSeatNumber) ||
                v.voterSeatNumber < 1 ||
                v.voterSeatNumber > 10 ||
                v.targetSeatNumber < 1 ||
                v.targetSeatNumber > 10
            ) {
                return { parsed: null, error: "Invalid vote entry values." };
            }
        }
        return { parsed: { votes: parsedVotes } };
    } catch (e: any) {
        return { parsed: null, error: e?.message ?? String(e) };
    }
}

function parseMassVoteAll(rawText: string): { parsed: AiMassVoteAll | null; error?: string } {
    const candidate = extractJsonObject(rawText);
    try {
        const obj = JSON.parse(candidate);
        const votes = obj?.votes;
        if (!Array.isArray(votes)) return { parsed: null, error: 'Missing/invalid "votes" array.' };
        const parsedVotes = votes.map((v: any) => ({
            voterSeatNumber: Number(v?.voterSeatNumber),
            vote: v?.vote === "YES" ? "YES" : v?.vote === "NO" ? "NO" : null,
        }));
        for (const v of parsedVotes) {
            if (!Number.isInteger(v.voterSeatNumber) || v.voterSeatNumber < 1 || v.voterSeatNumber > 10) {
                return { parsed: null, error: "Invalid voterSeatNumber." };
            }
            if (!(v.vote === "YES" || v.vote === "NO")) return { parsed: null, error: 'vote must be "YES" or "NO".' };
        }
        return { parsed: { votes: parsedVotes } };
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

        const aliveList = Array.isArray(req.aliveSeatNumbers)
            ? req.aliveSeatNumbers.filter((n) => Number.isInteger(n))
            : [];

        const killTargets = Array.isArray(req.killTargetSeatNumbers)
            ? req.killTargetSeatNumbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
            : [];

        const awakeSeats = Array.isArray(req.awakeSeatNumbers)
            ? req.awakeSeatNumbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
            : [];

        const investigateTargets = Array.isArray(req.investigateTargetSeatNumbers)
            ? req.investigateTargetSeatNumbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
            : [];

        const voteCandidates = Array.isArray(req.voteCandidateSeatNumbers)
            ? req.voteCandidateSeatNumbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
            : [];

        const action = req.action;
        if (!action) throw new BadRequestException("action is required");

        const taskLines: string[] = [];
        const outputShapeLines: string[] = [];

        if (action === "DAY_DISCUSSION_SPEAK") {
            const lastLine = String(req.roleLogText ?? "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(-1)[0];
            const m = lastLine ? Array.from(lastLine.matchAll(/#(\d+)\b/g)) : [];
            const lastFocus = m.length ? Number(m[m.length - 1]?.[1]) : null;
            const hasAnySpokenToday = /#\d+\s+[^:\n]+:/.test(String(req.roleLogText ?? ""));

            taskLines.push("You must speak as the current speaker.");
            taskLines.push("Optionally nominate ONE alive seat (1..10). If you do not nominate, set nominateSeatNumber to null.");
            taskLines.push('Prefer including at least one direct question to a specific seat number OR one explicit lean (town/suspect) with a seat number.');
            if (Number.isInteger(lastFocus) && lastFocus! >= 1 && lastFocus! <= 10) {
                taskLines.push(`Anti-echo rule: do NOT target seat #${lastFocus} in your question/lean; pick a different seat number than the last speaker focused.`);
                taskLines.push("Anti-echo rule: do NOT repeat the previous speaker's question verbatim; introduce a new angle.");
            }
            taskLines.push("Day 1 speaking style: feel free to introduce yourself briefly (optional).");
            taskLines.push("Try to add at least one concrete read (suspect or town) tied ONLY to the chat log (no invented events).");
            taskLines.push("Do NOT claim someone said/did something unless it is explicitly in the log (no invented speech, no invented actions).");
            if (!hasAnySpokenToday) {
                taskLines.push("Important: you are the FIRST speaker today. You have zero prior speeches to read.");
                taskLines.push("So do NOT describe anyone's tone, pushes, or words. Ask 1-2 players for first reads + vote intent and propose a simple plan.");
                taskLines.push("In this first-speaker case, prefer nominateSeatNumber = null unless you have a very strong reason from setup alone.");
            } else {
                taskLines.push("Prefer asking a question to a seat that has already spoken today. If you ask a seat that has not spoken, explicitly ask for their first read + vote intent.");
                taskLines.push("Voting pressure: If you have a plausible suspect lean from the log, you SHOULD nominate them. Only leave it null if you truly have no plausible reason yet.");
            }
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"say":"...","nominateSeatNumber":null}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
            taskLines.push('- "say" must be a single short paragraph (1-5 sentences).');
            taskLines.push('- "nominateSeatNumber" must be null or an integer 1..10.');
            taskLines.push("- Prefer nominating someone only if you have a plausible reason from the log.");
        } else if (action === "ELIMINATION_SPEECH_LAST_WORDS") {
            taskLines.push("You have been eliminated and may say your final words to the table.");
            taskLines.push("You cannot take actions (no voting, no nominating). This is only a final statement.");
            taskLines.push("Keep it impactful and in-character. You may accuse one seat or give one town read.");
            taskLines.push("Do NOT claim your role as confirmed; roles are not publicly revealed.");
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"say":"..."}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
            taskLines.push('- "say" must be a single short paragraph (1-4 sentences).');
        } else if (action === "DAY_VOTING_DECIDE_ALL" || action === "TIE_REVOTE_DECIDE_ALL") {
            const phaseLabel = action === "DAY_VOTING_DECIDE_ALL" ? "DAY_VOTING" : "TIE_REVOTE";
            taskLines.push("You are the game orchestrator. Decide how EVERY alive seat votes this round.");
            taskLines.push("Use only information from the provided full log. Roles are not publicly revealed.");
            taskLines.push("Goal: produce a realistic distribution of votes based on stated suspicions/reads, not random votes.");
            taskLines.push(`Phase: ${phaseLabel}`);
            if (voteCandidates.length) taskLines.push(`Valid vote candidates: ${voteCandidates.join(", ")}.`);
            if (aliveList.length) taskLines.push(`Alive voters: ${aliveList.join(", ")}.`);
            taskLines.push("Rules:");
            taskLines.push("- Every alive seat must cast exactly one vote.");
            taskLines.push("- VoterSeatNumber must be an alive seat.");
            taskLines.push("- TargetSeatNumber must be one of the valid candidates.");
            taskLines.push("- Avoid unanimous votes unless the log strongly supports it.");
            taskLines.push("- If there are 2+ candidates, your votes must include at least TWO different targets (do not hard-stack 10-0).");
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"votes":[{"voterSeatNumber":1,"targetSeatNumber":2}]}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
        } else if (action === "MASS_ELIMINATION_PROPOSAL_DECIDE_ALL") {
            taskLines.push("You are the game orchestrator. Decide how EVERY alive seat votes YES/NO on the mass elimination proposal.");
            taskLines.push("Use only information from the provided full log. Roles are not publicly revealed.");
            taskLines.push("Goal: produce realistic votes based on stated suspicions/reads and fear of ties.");
            if (voteCandidates.length) taskLines.push(`Proposal candidates (would be eliminated if YES passes): ${voteCandidates.join(", ")}.`);
            if (aliveList.length) taskLines.push(`Alive voters: ${aliveList.join(", ")}.`);
            taskLines.push("Rules:");
            taskLines.push("- Every alive seat must cast exactly one vote.");
            taskLines.push('- vote must be "YES" or "NO".');
            taskLines.push("- Avoid unanimous votes unless the log strongly supports it.");
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"votes":[{"voterSeatNumber":1,"vote":"YES"}]}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
        } else if (action === "NIGHT_MAFIA_DISCUSSION_SPEAK") {
            taskLines.push("You are speaking during mafia night discussion.");
            if (awakeSeats.length) taskLines.push(`Awake seats (mafia): ${awakeSeats.join(", ")}.`);
            taskLines.push("Discuss briefly and optionally suggest a kill target.");
            if (killTargets.length) taskLines.push(`Valid kill targets: ${killTargets.join(", ")}.`);
            taskLines.push("Do NOT address sleeping seats with questions. Only address awake mafia seats.");
            taskLines.push('If you suggest a kill, mention it explicitly in "say" as: I suggest we kill #<seatNumber>.');
            taskLines.push('If you do not suggest, set "suggestKillSeatNumber" to null.');
            taskLines.push('Your "say" must include at least one direct question to a specific seat number OR one explicit suspicion/lean with a seat number.');
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"say":"...","suggestKillSeatNumber":null}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
            taskLines.push('- "say" must be a single short paragraph (1-4 sentences).');
            taskLines.push('- "suggestKillSeatNumber" must be null or an integer 1..10.');
        } else if (action === "NIGHT_MAFIA_BOSS_DISCUSSION_SELECT_KILL_GUESS_SHERIFF") {
            taskLines.push("You are the mafia boss. Speak briefly and select a kill target (or no kill).");
            taskLines.push("You will ALSO provide guessSheriffSeatNumber in JSON, but you MUST NOT talk about your guess in 'say' (it will be used later during the boss-guess phase).");
            if (awakeSeats.length) taskLines.push(`Awake seats (mafia): ${awakeSeats.join(", ")}.`);
            if (killTargets.length) taskLines.push(`Valid kill targets: ${killTargets.join(", ")}.`);
            taskLines.push("Do NOT address sleeping seats with questions. Only address awake mafia seats.");
            taskLines.push('If you select a kill, mention it explicitly in "say" as: I select kill target: #<seatNumber>.');
            taskLines.push("Mafia tactic: if ANYONE publicly claimed Sheriff today, prioritize killing that seat unless it is not a valid kill target.");
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"say":"...","selectKillSeatNumber":null,"guessSheriffSeatNumber":1}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
            taskLines.push('- "say" must be a single short paragraph (1-4 sentences).');
            taskLines.push('- "selectKillSeatNumber" must be null or an integer 1..10.');
            taskLines.push('- "guessSheriffSeatNumber" must be an integer 1..10 and must not be yourself.');
        } else if (action === "NIGHT_MAFIA_BOSS_GUESS_SHERIFF") {
            taskLines.push("You are the mafia boss. Choose ONE alive seat to check for Sheriff.");
            taskLines.push("Do not invent results. The host will tell you the result after you choose.");
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"guessSheriffSeatNumber":1}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
            taskLines.push("- Choose an alive seat (1..10). Do not choose yourself.");
        } else if (action === "NIGHT_SHERIFF_INVESTIGATE") {
            taskLines.push("You are the Sheriff. Choose ONE alive seat to investigate tonight.");
            taskLines.push("Do not invent results. The host will tell you the result after you choose.");
            if (investigateTargets.length) taskLines.push(`Valid investigation targets: ${investigateTargets.join(", ")}.`);
            taskLines.push("");
            taskLines.push("Output JSON ONLY with this exact shape:");
            taskLines.push('{"investigateSeatNumber":1}');
            taskLines.push("");
            taskLines.push("Hard constraints:");
            taskLines.push("- No markdown. No explanations. Output only JSON.");
            taskLines.push("- Choose an alive seat (1..10). Do not choose yourself.");
        } else {
            throw new BadRequestException(`Unsupported action: ${String(action)}`);
        }

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
            killTargets.length ? `Kill target seats: ${killTargets.join(", ")}` : "",
            awakeSeats.length ? `Awake seats: ${awakeSeats.join(", ")}` : "",
            investigateTargets.length ? `Investigation target seats: ${investigateTargets.join(", ")}` : "",
            voteCandidates.length ? `Vote candidate seats: ${voteCandidates.join(", ")}` : "",
            "",
            "## Task",
            `Phase: ${req.phaseId}`,
            ...taskLines,
        ]
            .filter(Boolean)
            .join("\n");

        const requestId = makeId();

        // What we send to OpenAI (exact payload).
        const openaiRequest = {
            model,
            input: prompt,
        };

        const t0 = Date.now();
        const resp = await this.getClient().responses.create(openaiRequest as any);
        const openaiLatencyMs = Date.now() - t0;

        const outputText = (resp as any)?.output_text ?? (resp as any)?.outputText ?? "";

        const { parsed, error } = (() => {
            if (action === "DAY_DISCUSSION_SPEAK") return parseDayDiscussionSpeak(String(outputText ?? ""));
            if (action === "DAY_VOTING_DECIDE_ALL" || action === "TIE_REVOTE_DECIDE_ALL") return parseVoteAll(String(outputText ?? ""));
            if (action === "MASS_ELIMINATION_PROPOSAL_DECIDE_ALL") return parseMassVoteAll(String(outputText ?? ""));
            if (action === "ELIMINATION_SPEECH_LAST_WORDS") return parseEliminationSpeechLastWords(String(outputText ?? ""));
            if (action === "NIGHT_MAFIA_DISCUSSION_SPEAK") return parseNightMafiaDiscussionSpeak(String(outputText ?? ""));
            if (action === "NIGHT_MAFIA_BOSS_DISCUSSION_SELECT_KILL_GUESS_SHERIFF")
                return parseNightBossDiscussionSelectKillGuessSheriff(String(outputText ?? ""));
            if (action === "NIGHT_MAFIA_BOSS_GUESS_SHERIFF") return parseNightBossGuessSheriff(String(outputText ?? ""));
            if (action === "NIGHT_SHERIFF_INVESTIGATE") return parseNightSheriffInvestigate(String(outputText ?? ""));
            return { parsed: null, error: `Unsupported action: ${String(action)}` };
        })();

        if ((action === "DAY_VOTING_DECIDE_ALL" || action === "TIE_REVOTE_DECIDE_ALL") && parsed) {
            const votes = (parsed as any)?.votes as any[] | undefined;
            const voters = new Set(aliveList);
            const candidatesSet = new Set(voteCandidates);
            if (!Array.isArray(votes)) {
                throw new BadRequestException("Parsed votes missing for bulk voting.");
            }
            const seen = new Set<number>();
            const targets = new Set<number>();
            for (const v of votes) {
                const voter = Number(v?.voterSeatNumber);
                const target = Number(v?.targetSeatNumber);
                if (!voters.has(voter)) throw new BadRequestException(`Invalid voterSeatNumber: ${voter}`);
                if (seen.has(voter)) throw new BadRequestException(`Duplicate voterSeatNumber: ${voter}`);
                if (voteCandidates.length && !candidatesSet.has(target))
                    throw new BadRequestException(`Invalid targetSeatNumber: ${target}`);
                seen.add(voter);
                targets.add(target);
            }
            if (seen.size !== voters.size)
                throw new BadRequestException(`Missing votes. Expected ${voters.size}, got ${seen.size}.`);
            if (voteCandidates.length >= 2 && targets.size < 2) {
                throw new BadRequestException("Votes must include at least two different targets when 2+ candidates exist.");
            }
        }

        if (action === "MASS_ELIMINATION_PROPOSAL_DECIDE_ALL" && parsed) {
            const votes = (parsed as any)?.votes as any[] | undefined;
            const voters = new Set(aliveList);
            if (!Array.isArray(votes)) {
                throw new BadRequestException("Parsed votes missing for mass elimination.");
            }
            const seen = new Set<number>();
            for (const v of votes) {
                const voter = Number(v?.voterSeatNumber);
                const vote = v?.vote;
                if (!voters.has(voter)) throw new BadRequestException(`Invalid voterSeatNumber: ${voter}`);
                if (seen.has(voter)) throw new BadRequestException(`Duplicate voterSeatNumber: ${voter}`);
                if (!(vote === "YES" || vote === "NO")) throw new BadRequestException(`Invalid vote for ${voter}`);
                seen.add(voter);
            }
            if (seen.size !== voters.size)
                throw new BadRequestException(`Missing votes. Expected ${voters.size}, got ${seen.size}.`);
        }

        return {
            requestId,
            model,
            roleLogCharCount: String(req.roleLogText ?? "").length,
            promptCharCount: String(prompt ?? "").length,
            openaiLatencyMs,
            prompt,
            outputText: String(outputText ?? ""),
            parsed,
            parseError: error,
            openaiRequest,
            openaiResponse: resp,
        };
    }
}
