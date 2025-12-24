<template>
    <Card class="logsCard" :class="{ collapsed }">
        <template #title>
            <div class="logsTitleRow" @click="collapsed = !collapsed" role="button" tabindex="0">
                <span>Role Logs (AI prompts)</span>
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
                <div class="logsHint">Town = public day info. Sheriff/Mafia/Boss include their private night actions.</div>

                <div class="logSection">
                    <div class="logHeader" @click="openTown = !openTown" role="button" tabindex="0">
                        <div class="logTitle">Town log</div>
                        <div class="logActions">
                            <Button
                                size="small"
                                severity="secondary"
                                text
                                icon="pi pi-copy"
                                label="Copy"
                                @click.stop="copy('town log', roleLogs.town)"
                            />
                            <span class="logChevron" :class="{ open: openTown }">▾</span>
                        </div>
                    </div>
                    <div v-if="openTown" class="logContent">
                        <textarea class="logText" :value="roleLogs.town" readonly />
                    </div>
                </div>

                <div class="logSection">
                    <div class="logHeader" @click="openSheriff = !openSheriff" role="button" tabindex="0">
                        <div class="logTitle">Sheriff log</div>
                        <div class="logActions">
                            <Button
                                size="small"
                                severity="secondary"
                                text
                                icon="pi pi-copy"
                                label="Copy"
                                @click.stop="copy('sheriff log', roleLogs.sheriff)"
                            />
                            <span class="logChevron" :class="{ open: openSheriff }">▾</span>
                        </div>
                    </div>
                    <div v-if="openSheriff" class="logContent">
                        <textarea class="logText" :value="roleLogs.sheriff" readonly />
                    </div>
                </div>

                <div class="logSection">
                    <div class="logHeader" @click="openMafia = !openMafia" role="button" tabindex="0">
                        <div class="logTitle">Mafia log</div>
                        <div class="logActions">
                            <Button
                                size="small"
                                severity="secondary"
                                text
                                icon="pi pi-copy"
                                label="Copy"
                                @click.stop="copy('mafia log', roleLogs.mafia)"
                            />
                            <span class="logChevron" :class="{ open: openMafia }">▾</span>
                        </div>
                    </div>
                    <div v-if="openMafia" class="logContent">
                        <textarea class="logText" :value="roleLogs.mafia" readonly />
                    </div>
                </div>

                <div class="logSection">
                    <div class="logHeader" @click="openBoss = !openBoss" role="button" tabindex="0">
                        <div class="logTitle">Mafia boss log</div>
                        <div class="logActions">
                            <Button
                                size="small"
                                severity="secondary"
                                text
                                icon="pi pi-copy"
                                label="Copy"
                                @click.stop="copy('boss log', roleLogs.boss)"
                            />
                            <span class="logChevron" :class="{ open: openBoss }">▾</span>
                        </div>
                    </div>
                    <div v-if="openBoss" class="logContent">
                        <textarea class="logText" :value="roleLogs.boss" readonly />
                    </div>
                </div>
            </div>
        </template>
    </Card>
</template>

<script setup lang="ts">
import { ref } from "vue";

const collapsed = defineModel<boolean>("collapsed", { default: false });

const props = defineProps<{
    roleLogs: { town: string; sheriff: string; mafia: string; boss: string };
}>();

const openTown = ref(true);
const openSheriff = ref(false);
const openMafia = ref(false);
const openBoss = ref(false);

async function copy(label: string, text: string) {
    try {
        await navigator.clipboard.writeText(text);
        console.log(`[copy] copied ${label}`);
    } catch (err) {
        console.warn(`[copy] clipboard failed for ${label}`, err);
        window.prompt(`Copy ${label}:`, text);
    }
}

// Touch props to keep TS happy in template-only component.
void props;
</script>

<style scoped>
.logsCard {
    background: rgba(12, 16, 32, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
}

.logsCard :deep(.p-card-body),
.logsCard :deep(.p-card-content),
.logsCard :deep(.p-card-caption),
.logsCard :deep(.p-card-title) {
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
    cursor: pointer;
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

.logChevron {
    display: inline-block;
    transform: rotate(-90deg);
    opacity: 0.8;
    transition: transform 120ms ease;
}

.logChevron.open {
    transform: rotate(0deg);
}

.logContent {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.logText {
    width: 100%;
    height: 180px;
    resize: vertical;
    border: 0;
    padding: 10px 10px;
    background: rgba(0, 0, 0, 0.25);
    color: rgba(255, 255, 255, 0.92);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    line-height: 1.3;
    outline: none;
}
</style>


