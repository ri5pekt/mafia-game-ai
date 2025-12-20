<template>
  <div class="avatar" :class="{ isHost, isEliminated, isMasked: Boolean(maskPhoto) }">
    <div class="circleWrap">
      <div class="circle">
        <img
          v-if="avatarUrl && !maskPhoto"
          class="photo"
          :src="avatarUrl"
          :alt="`${name} avatar`"
          loading="lazy"
          decoding="async"
        />
        <span v-else-if="!maskPhoto" class="initials">{{ initials }}</span>
      </div>

      <div v-if="statusIconUrl" class="statusIcon" title="Eliminated">
        <img class="statusIconImg" :src="statusIconUrl" alt="Eliminated" />
      </div>

      <!-- Role badge is OUTSIDE the clipped circle so it won't be cut -->
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
  isEliminated?: boolean;
  maskPhoto?: boolean;
  statusIconUrl?: string;
}>();
</script>

<style scoped>
.avatar {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 6px;
}

.circleWrap {
  position: relative;
  width: 100px;
  height: 100px;
}

.statusIcon {
  position: absolute;
  left: -6px;
  top: -6px;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.statusIconImg {
  width: 16px;
  height: 16px;
  opacity: 0.95;
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

.avatar.isEliminated .circle,
.avatar.isEliminated .label {
  opacity: 0.55;
}

.avatar.isEliminated .photo {
  filter: grayscale(0.75) saturate(0.7) brightness(0.85);
}

/* Night "asleep" masking: hide photo/initials and show a dark circle. */
.avatar.isMasked .circle {
  background: rgba(0, 0, 0, 0.78);
  border-color: rgba(255, 255, 255, 0.12);
}

.avatar.isMasked .photo,
.avatar.isMasked .initials {
  display: none;
}

/* Keep elimination icon fully readable */
.avatar.isEliminated .statusIcon,
.avatar.isEliminated .statusIconImg {
  opacity: 1;
  filter: none;
}

.avatar.isHost .circle {
  width: 132px;
  height: 132px;
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
}

.avatar.isHost .circleWrap {
  width: 132px;
  height: 132px;
}

.avatar.isHost .initials {
  font-size: 20px;
}

.avatar.isHost .label {
  font-weight: 700;
}

.roleTag {
  position: absolute;
  right: 0px;
  bottom: 0px;
  width: 30px;
  height: 30px;
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
  opacity: 0.95;
}

.roleTag.mafia .roleIcon {
  width: 19px;
  height: 19px;
}

/* Host does not display a role badge. */
</style>


