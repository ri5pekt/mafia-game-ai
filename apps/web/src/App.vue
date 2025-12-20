<template>
    <WelcomeScreen v-if="screen === 'welcome'" @start="screen = 'game'" />
    <GameScreen v-else @ended="screen = 'welcome'" />
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import GameScreen from "@/views/GameScreen.vue";
import WelcomeScreen from "@/views/WelcomeScreen.vue";

const screen = ref<"welcome" | "game">("welcome");

const API_BASE = "http://localhost:3000";

onMounted(async () => {
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
