<template>
  <WelcomeScreen v-if="screen === 'welcome'" @start="screen = 'game'" />
  <GameScreen v-else />
</template>

<script setup lang="ts">
import { ref } from 'vue';

import GameScreen from '@/views/GameScreen.vue';
import WelcomeScreen from '@/views/WelcomeScreen.vue';

const screen = ref<'welcome' | 'game'>('welcome');
</script>


