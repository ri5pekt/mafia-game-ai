<template>
  <div class="wrap" :class="phaseClass" role="status" aria-live="polite">
    <div class="dot" />
    <div class="text">
      <div class="label">{{ phase }}</div>
      <div class="hint">{{ hint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

export type UiPhase = "DAY" | "NIGHT" | "VOTING" | "TIE";

const props = defineProps<{
  phase: UiPhase;
}>();

const phaseClass = computed(() => `phase-${props.phase.toLowerCase()}`);

const hint = computed(() => {
  switch (props.phase) {
    case "DAY":
      return "Discussion";
    case "NIGHT":
      return "Private actions";
    case "VOTING":
      return "Cast your vote";
    case "TIE":
      return "Tie-break";
  }
});
</script>

<style scoped>
.wrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.35);
  user-select: none;
  color: rgba(255, 255, 255, 0.94);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06);
}

.text {
  display: grid;
  gap: 1px;
  line-height: 1.1;
}

.label {
  font-weight: 900;
  letter-spacing: 0.8px;
  font-size: 14px;
}

.hint {
  font-size: 13px;
  opacity: 0.75;
}

/* Themes */
.phase-day {
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.12);
}
.phase-day .dot {
  background: #f59e0b;
}

.phase-night {
  border-color: rgba(59, 130, 246, 0.30);
  background: rgba(59, 130, 246, 0.12);
}
.phase-night .dot {
  background: #60a5fa;
}

.phase-voting {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.14);
}
.phase-voting .dot {
  background: #f59e0b;
}

.phase-tie {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.12);
}
.phase-tie .dot {
  background: #ef4444;
}
</style>


