import { Body, Controller, Get, Inject, Post, Res } from "@nestjs/common";
import type { Response } from "express";

import type { TtsSpeakRequest } from "./tts.types";
import { TtsService } from "./tts.service";

@Controller("tts")
export class TtsController {
    private readonly tts: TtsService;

    constructor(@Inject(TtsService) tts: TtsService) {
        this.tts = tts;
    }

    @Get("voices")
    async voices() {
        return await this.tts.listStandardVoices();
    }

    @Post("speak")
    async speak(@Body() body: TtsSpeakRequest, @Res() res: Response) {
        const mp3 = await this.tts.speakMp3(body);
        res.setHeader("content-type", "audio/mpeg");
        res.setHeader("cache-control", "no-store");
        res.send(mp3);
    }
}


