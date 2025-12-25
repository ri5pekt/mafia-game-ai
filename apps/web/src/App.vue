<template>
    <WelcomeScreen v-if="screen === 'welcome'" v-model:model="selectedModel" @start="startGame()" />
    <GameScreen v-else :ai-model="selectedModel" @ended="screen = 'welcome'" />
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import GameScreen from "@/views/GameScreen.vue";
import WelcomeScreen from "@/views/WelcomeScreen.vue";

const screen = ref<"welcome" | "game">("welcome");

const API_BASE = "http://localhost:3000";

const MODEL_STORAGE_KEY = "mafia:aiModel";
const selectedModel = ref<string>("gpt-5-mini");

function startGame() {
    try {
        localStorage.setItem(MODEL_STORAGE_KEY, selectedModel.value);
    } catch {
        // ignore
    }
    screen.value = "game";
}

onMounted(async () => {
    try {
        const saved = localStorage.getItem(MODEL_STORAGE_KEY);
        if (saved) selectedModel.value = saved;
    } catch {
        // ignore
    }
    try {
        const res = await fetch(`${API_BASE}/game/active`);
        if (!res.ok) return;
        const active = await res.json();
        if (active && !active.endedAt) {
            screen.value = "game";
        }
    } catch {
        // ignore
    }
});
</script>
