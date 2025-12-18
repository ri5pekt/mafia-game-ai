<template>
  <div class="avatar" :class="{ isHost }">
    <div class="circle">
      <img
        v-if="avatarUrl"
        class="photo"
        :src="avatarUrl"
        :alt="`${name} avatar`"
        loading="lazy"
        decoding="async"
      />
      <span v-else class="initials">{{ initials }}</span>

      <div v-if="roleTag" class="roleTag" :class="roleTag.tone" :title="roleTag.label">
        <img class="roleIcon" :src="roleTag.iconUrl" :alt="roleTag.label" />
      </div>
    </div>
    <div class="label">
      <div class="name">{{ name }}</div>
      <div v-if="nickname" class="nick">{{ nickname }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  initials: string;
  name: string;
  nickname?: string;
  avatarUrl?: string;
  roleTag?: {
    iconUrl: string;
    label: string;
    tone: "town" | "mafia";
  };
  isHost?: boolean;
}>();
</script>

<style scoped>
.avatar {
  display: grid;
  justify-items: center;
  gap: 6px;
}

.circle {
  width: 100px;
  height: 100px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: relative;
}

.photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: translateZ(0);
}

.initials {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.2px;
  font-size: 18px;
}

.label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.90);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  display: grid;
  justify-items: center;
  gap: 2px;
}

.name {
  font-weight: 700;
  line-height: 1.15;
}

.nick {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.70);
  line-height: 1.1;
}

.avatar.isHost .circle {
  width: 132px;
  height: 132px;
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
}

.avatar.isHost .initials {
  font-size: 20px;
}

.avatar.isHost .label {
  font-weight: 700;
}

.roleTag {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.roleTag.town {
  background: rgba(190, 18, 60, 0.85); /* red */
}

.roleTag.mafia {
  background: rgba(0, 0, 0, 0.75); /* black */
}

.roleIcon {
  width: 16px;
  height: 16px;
  filter: invert(1);
  opacity: 0.95;
}
</style>


