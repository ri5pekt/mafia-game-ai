<template>
  <div class="avatar" :class="{ isHost }" :style="style">
    <div class="circle">
      <span class="initials">{{ initials }}</span>
    </div>
    <div class="label">{{ name }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  initials: string;
  name: string;
  top: string;
  left: string;
  isHost?: boolean;
}>();

const style = computed(() => ({
  top: props.top,
  left: props.left
}));
</script>

<style scoped>
.avatar {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: 6px;
}

.circle {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.initials {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.2px;
  font-size: 14px;
}

.label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.avatar.isHost .circle {
  width: 76px;
  height: 76px;
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
}

.avatar.isHost .initials {
  font-size: 16px;
}

.avatar.isHost .label {
  font-weight: 700;
}
</style>


