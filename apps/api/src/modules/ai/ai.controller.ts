import { Body, Controller, Get, Inject, Post } from "@nestjs/common";

import type { AiActRequest } from "./ai.types";
import { AiService } from "./ai.service";

@Controller("ai")
export class AiController {
    private readonly ai: AiService;

    constructor(@Inject(AiService) ai: AiService) {
        // Explicit assignment (matches the pattern used elsewhere in this repo).
        this.ai = ai;
    }

    @Post("act")
    async act(@Body() body: AiActRequest) {
        return await this.ai.act(body);
    }

    @Get("models")
    async models() {
        return await this.ai.listModels();
    }
}
