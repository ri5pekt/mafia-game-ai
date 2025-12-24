export type TtsSpeakRequest = {
    text: string;
    /**
     * Optional BCP-47 language code (e.g. "en-US", "ru-RU").
     * If omitted, the server may auto-pick based on the text.
     */
    languageCode?: string;
    /**
     * Optional voice name (e.g. "en-US-Neural2-J").
     * If omitted, Google will pick a default for the language.
     */
    voiceName?: string;
    /**
     * Optional speaking rate (Google supports ~0.25..4.0, default 1.0).
     */
    speakingRate?: number;
    /**
     * Optional pitch (semitones, Google supports ~-20..20, default 0).
     */
    pitch?: number;
    /**
     * Optional volume gain in dB (Google supports ~-96..16, default 0).
     */
    volumeGainDb?: number;
};


