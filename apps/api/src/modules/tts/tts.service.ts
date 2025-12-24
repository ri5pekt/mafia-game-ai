import { BadRequestException, Injectable } from "@nestjs/common";
import * as fs from "node:fs";

import { TextToSpeechClient } from "@google-cloud/text-to-speech";

import type { TtsSpeakRequest } from "./tts.types";

export type StandardVoiceInfo = {
    languageCode: string;
    name: string;
    ssmlGender: string;
    naturalSampleRateHertz: number;
};

function pickLanguageCode(text: string): string {
    // Very small heuristic: if it contains Cyrillic, assume Russian.
    if (/[а-яё]/i.test(text)) return "ru-RU";
    return "en-US";
}

@Injectable()
export class TtsService {
    private client: TextToSpeechClient | null = null;
    private voicesCache:
        | {
              cachedAtMs: number;
              voices: StandardVoiceInfo[];
          }
        | null = null;

    private getClient(): TextToSpeechClient {
        if (this.client) return this.client;

        const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!credsPath) {
            throw new BadRequestException(
                "GOOGLE_APPLICATION_CREDENTIALS is not set (point it to your service-account JSON file)."
            );
        }
        if (!fs.existsSync(credsPath)) {
            throw new BadRequestException(`GOOGLE_APPLICATION_CREDENTIALS points to missing file: ${credsPath}`);
        }

        this.client = new TextToSpeechClient();
        return this.client;
    }

    async listStandardVoices(): Promise<StandardVoiceInfo[]> {
        const ttlMs = 15 * 60 * 1000;
        const now = Date.now();
        if (this.voicesCache && now - this.voicesCache.cachedAtMs < ttlMs) return this.voicesCache.voices;

        let result: any;
        try {
            [result] = await this.getClient().listVoices({});
        } catch (e: any) {
            const code = e?.code != null ? `code=${String(e.code)}` : "";
            const details = e?.details ?? e?.message ?? String(e);
            throw new BadRequestException(`Google TTS listVoices failed ${code}: ${details}`.trim());
        }

        const standard: StandardVoiceInfo[] = (result?.voices ?? [])
            .flatMap((v: any) =>
                (v?.languageCodes ?? []).map((languageCode: any) => ({
                    languageCode: String(languageCode),
                    name: String(v?.name ?? ""),
                    ssmlGender: String(v?.ssmlGender ?? ""),
                    naturalSampleRateHertz: Number(v?.naturalSampleRateHertz ?? 0),
                }))
            )
            .filter((v: StandardVoiceInfo) => v.name.includes("Standard"));

        // Stable ordering for UI
        standard.sort((a, b) => {
            const lc = a.languageCode.localeCompare(b.languageCode);
            if (lc !== 0) return lc;
            return a.name.localeCompare(b.name);
        });

        this.voicesCache = { cachedAtMs: now, voices: standard };
        return standard;
    }

    async speakMp3(req: TtsSpeakRequest): Promise<Buffer> {
        const text = String(req.text ?? "").trim();
        if (!text) throw new BadRequestException("text is required");
        if (text.length > 4000) throw new BadRequestException("text is too long (max 4000 chars)");

        const languageCode = (req.languageCode ?? pickLanguageCode(text)).trim();
        const voiceName = req.voiceName?.trim() || undefined;

        const speakingRate = req.speakingRate;
        if (speakingRate != null && !Number.isFinite(Number(speakingRate))) {
            throw new BadRequestException("speakingRate must be a number");
        }
        const pitch = req.pitch;
        if (pitch != null && !Number.isFinite(Number(pitch))) {
            throw new BadRequestException("pitch must be a number");
        }
        const volumeGainDb = req.volumeGainDb;
        if (volumeGainDb != null && !Number.isFinite(Number(volumeGainDb))) {
            throw new BadRequestException("volumeGainDb must be a number");
        }

        let resp: any;
        try {
            [resp] = await this.getClient().synthesizeSpeech({
                input: { text },
                voice: { languageCode, name: voiceName },
                audioConfig: {
                    audioEncoding: "MP3" as any,
                    speakingRate: speakingRate == null ? undefined : Number(speakingRate),
                    pitch: pitch == null ? undefined : Number(pitch),
                    volumeGainDb: volumeGainDb == null ? undefined : Number(volumeGainDb),
                },
            });
        } catch (e: any) {
            const code = e?.code != null ? `code=${String(e.code)}` : "";
            const details = e?.details ?? e?.message ?? String(e);
            // Common setup issue: API disabled or billing not enabled.
            throw new BadRequestException(`Google TTS request failed ${code}: ${details}`.trim());
        }

        const audio = resp.audioContent as any;
        if (!audio) throw new BadRequestException("TTS returned empty audioContent");

        // audioContent can come back as Buffer/Uint8Array/string depending on transport.
        if (Buffer.isBuffer(audio)) return audio;
        if (audio instanceof Uint8Array) return Buffer.from(audio);
        if (typeof audio === "string") return Buffer.from(audio, "base64");

        return Buffer.from(audio);
    }
}


