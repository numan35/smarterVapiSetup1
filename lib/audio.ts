import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

type SynthesizeOpts = {
  voice?: string;
  sampleRateHz?: number;
  /** Auto-play after load (default true) */
  play?: boolean;
};

let audioModeInitialized = false;

/**
 * Initialize safe cross-platform audio mode.
 * We set OS-specific keys to avoid “interruptionModeAndroid was set to an invalid value”.
 */
export async function initAudioMode() {
  if (audioModeInitialized) return;
  if (Platform.OS === "ios") {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      staysActiveInBackground: false,
    });
  } else if (Platform.OS === "android") {
    await Audio.setAudioModeAsync({
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      staysActiveInBackground: false,
    });
  } else {
    // Web/other – minimal config
    await Audio.setAudioModeAsync({
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
    } as any);
  }
  audioModeInitialized = true;
}

const ANON =
  // preferred shape
  (Constants.expoConfig?.extra as any)?.supabaseAnonKey ||
  // conventional Expo public env
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  // your earlier app.json shape
  (Constants.expoConfig?.extra as any)?.expoPublic?.SUPABASE_ANON ||
  "";

/**
 * Call the `text-to-speech` Supabase Edge Function, write a WAV to cache, load & (optionally) play it.
 * Returns the loaded `Audio.Sound` so you can manage playback.
 */
export async function synthesize(text: string, opts: SynthesizeOpts = {}) {
  if (!text || !text.trim()) throw new Error("No text provided");
  await initAudioMode();

  const { voice = "en-US-Standard-C", sampleRateHz = 16000, play = true } = opts;

  // Invoke the Edge Function with gateway headers (anon)
  const { data, error } = await supabase.functions.invoke("text-to-speech", {
    body: { text, voice, sampleRateHz },
    headers: ANON
      ? { Authorization: `Bearer ${ANON}`, apikey: ANON }
      : undefined,
  });
  if (error) {
    throw new Error(`TTS edge error: ${error.message ?? String(error)}`);
  }

  const { audioBase64, reqId } = (data || {}) as { audioBase64?: string; reqId?: string };
  if (!audioBase64) {
    throw new Error(`TTS response missing ${JSON.stringify(data)}`);
  }

  // Write to a temp WAV file
  const fileUri = `${FileSystem.cacheDirectory}tts-${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Load & (optionally) play
  const sound = new Audio.Sound();
  await sound.loadAsync({ uri: fileUri }, { shouldPlay: play, isLooping: false });
  if (__DEV__) {
    console.log("TTS ok", { reqId, fileUri, len: audioBase64.length });
  }
  return sound;
}

export default {
  initAudioMode,
  synthesize,
};
