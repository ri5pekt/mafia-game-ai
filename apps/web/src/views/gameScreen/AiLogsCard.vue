<template>
    <Card class="aiCard" :class="{ collapsed }">
        <template #title>
            <div class="logsTitleRow" @click="collapsed = !collapsed" role="button" tabindex="0">
                <span>AI API Logs</span>
                <Button
                    class="logsToggle"
                    severity="secondary"
                    text
                    :icon="collapsed ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                    @click.stop="collapsed = !collapsed"
                />
            </div>
        </template>
        <template #content>
            <div v-if="!collapsed" class="logsBody">
                <div class="logsHint">
                    Shows what we send to OpenAI (<code>openaiRequest</code>) and the full OpenAI response.
                </div>

                <div class="logSection">
                    <div class="logHeader" role="button" tabindex="0">
                        <div class="logTitle">Calls</div>
                        <div class="logActions">
                            <Button
                                size="small"
                                severity="secondary"
                                text
                                icon="pi pi-copy"
                                label="Copy JSON"
                                @click.stop="copy('ai logs history', JSON.stringify(aiLogs, null, 2))"
                            />
                        </div>
                    </div>
                    <div class="logContent">
                        <div class="aiStream" role="region" aria-label="AI calls log">
                            <div v-if="aiLogs.length === 0" class="aiEmpty">No AI calls yet.</div>
                            <div v-for="entry in aiLogs" :key="entry.id" class="aiEntry">
                                <div class="aiEntryHeader">
                                    <span class="aiEntryTitle">
                                        {{ entry.createdAt }}
                                        <span v-if="entry.request?.persona?.seatNumber">
                                            • seat #{{ entry.request?.persona?.seatNumber }}
                                        </span>
                                        <span v-if="entry.request?.phaseId"> • {{ entry.request?.phaseId }}</span>
                                    </span>
                                    <span class="aiEntryMeta">id: {{ entry.id }}</span>
                                </div>

                                <div class="aiBlock aiReq">
                                    <div class="aiBlockTitle">OpenAI request</div>
                                    <pre class="aiPre" v-if="entry.response?.openaiRequest">{{
                                        prettyOpenAiRequest(entry.response?.openaiRequest)
                                    }}</pre>
                                    <div class="aiPending" v-else>Waiting to build OpenAI payload…</div>
                                </div>

                                <div class="aiBlock aiResp" :class="{ pending: !entry.response && !entry.error }">
                                    <div class="aiBlockTitle">OpenAI response</div>
                                    <pre class="aiPre" v-if="entry.response?.openaiResponse">{{
                                        prettyOpenAiResponse(entry.response?.openaiResponse)
                                    }}</pre>
                                    <div class="aiPending" v-else-if="!entry.error">Waiting for response…</div>
                                    <div class="aiErrorInline" v-else>{{ entry.error }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </Card>
</template>

<script setup lang="ts">
import { ref } from "vue";

type AiLogEntry = {
    id: string;
    createdAt: string;
    request: any;
    response?: any;
    error?: string;
};

defineProps<{
    aiLogs: AiLogEntry[];
}>();

const collapsed = defineModel<boolean>("collapsed", { default: true });

function tryPick(obj: any, key: string) {
    return obj && typeof obj === "object" ? (obj as any)[key] : undefined;
}

function prettyOpenAiRequest(req: any) {
    if (!req) return "(no request)";
    const model = String(tryPick(req, "model") ?? "");
    const input = tryPick(req, "input");

    const lines: string[] = [];
    if (model) lines.push(`model: ${model}`);

    lines.push("");
    lines.push("input:");
    lines.push("-----");
    if (typeof input === "string") lines.push(input);
    else lines.push(String(input ?? ""));
    lines.push("-----");
    return lines.join("\n");
}

function prettyOpenAiResponse(resp: any) {
    if (!resp) return "(no response)";
    const id = String(tryPick(resp, "id") ?? "");
    const model = String(tryPick(resp, "model") ?? "");
    const outputText = tryPick(resp, "output_text") ?? tryPick(resp, "outputText");

    const lines: string[] = [];
    if (id) lines.push(`id: ${id}`);
    if (model) lines.push(`model: ${model}`);

    lines.push("");
    lines.push("output_text:");
    lines.push("-----------");
    if (typeof outputText === "string") lines.push(outputText);
    else lines.push("(no output_text field)");
    lines.push("-----------");
    return lines.join("\n");
}

async function copy(label: string, text: string) {
    try {
        await navigator.clipboard.writeText(text);
        console.log(`[copy] copied ${label}`);
    } catch (err) {
        console.warn(`[copy] clipboard failed for ${label}`, err);
        window.prompt(`Copy ${label}:`, text);
    }
}
</script>

<style scoped>
.aiCard {
    background: rgba(12, 16, 32, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
}

.aiCard :deep(.p-card-body),
.aiCard :deep(.p-card-content),
.aiCard :deep(.p-card-caption),
.aiCard :deep(.p-card-title) {
    color: rgba(255, 255, 255, 0.92);
}

.logsTitleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    user-select: none;
}

.logsToggle {
    margin-left: auto;
}

.logsBody {
    display: grid;
    gap: 10px;
}

.logsHint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.25;
}

.logSection {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    overflow: hidden;
}

.logHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 10px;
    user-select: none;
}

.logTitle {
    font-weight: 900;
    letter-spacing: 0.2px;
    font-size: 13px;
}

.logActions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.logContent {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: 10px;
}

.aiStream {
    max-height: 520px;
    overflow: auto;
    display: grid;
    gap: 12px;
    padding-right: 6px;
}

.aiEmpty {
    padding: 10px 10px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
}

.aiEntry {
    display: grid;
    gap: 10px;
}

.aiEntryHeader {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
}

.aiEntryTitle {
    font-weight: 800;
    color: rgba(255, 255, 255, 0.82);
}

.aiEntryMeta {
    opacity: 0.8;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.aiBlock {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
}

.aiBlockTitle {
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.2px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.aiReq .aiBlockTitle {
    background: rgba(59, 130, 246, 0.18);
}

.aiResp .aiBlockTitle {
    background: rgba(34, 197, 94, 0.16);
}

.aiPre {
    margin: 0;
    padding: 10px 10px;
    font-size: 12px;
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.aiReq .aiPre {
    background: rgba(59, 130, 246, 0.08);
}

.aiResp .aiPre {
    background: rgba(34, 197, 94, 0.06);
}

.aiPending {
    padding: 10px 10px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(34, 197, 94, 0.04);
}

.aiErrorInline {
    padding: 10px 10px;
    font-size: 12px;
    color: rgba(248, 113, 113, 0.95);
    white-space: pre-line;
    background: rgba(248, 113, 113, 0.08);
}
</style>


