/**
 * StorageService — persists conversation history in localStorage.
 * Falls back gracefully if storage is unavailable (private browsing, full quota, etc.).
 */

const STORAGE_KEY = 'nova_messages';
const LANG_STORAGE_KEY = 'nova_language';
const VOICE_PERSONA_KEY = 'nova_voice_persona';
const VOICE_SPEED_KEY = 'nova_voice_speed';
const MAX_STORED_MESSAGES = 200;

export type SupportedLanguage = 'en-US' | 'ar-LB' | 'fr-FR' | 'kn-IN';
export type VoicePersona = 'female' | 'male';

export function loadLanguage(): SupportedLanguage {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (raw === 'kn-IN' || raw === 'en-US' || raw === 'ar-LB' || raw === 'fr-FR') {
      return raw as SupportedLanguage;
    }
  } catch {
    // ignore
  }
  return 'kn-IN';
}

export function saveLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (e) {
    console.warn('Failed to save language to localStorage:', e);
  }
}

export function loadVoicePersona(): VoicePersona {
  try {
    const raw = localStorage.getItem(VOICE_PERSONA_KEY);
    if (raw === 'female' || raw === 'male') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'female'; // Default to clear natural female voice
}

export function saveVoicePersona(persona: VoicePersona): void {
  try {
    localStorage.setItem(VOICE_PERSONA_KEY, persona);
  } catch (e) {
    console.warn('Failed to save voice persona:', e);
  }
}

export function loadVoiceSpeed(): number {
  try {
    const raw = localStorage.getItem(VOICE_SPEED_KEY);
    if (raw) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed >= 0.8 && parsed <= 1.5) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return 1.08; // Fast, snappy default
}

export function saveVoiceSpeed(speed: number): void {
  try {
    localStorage.setItem(VOICE_SPEED_KEY, speed.toString());
  } catch (e) {
    console.warn('Failed to save voice speed:', e);
  }
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export function loadMessages(): StoredMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate shape & trim to limit
    return parsed
      .filter(
        (m: unknown): m is StoredMessage =>
          typeof m === 'object' &&
          m !== null &&
          'role' in m &&
          'text' in m &&
          'timestamp' in m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof (m as StoredMessage).text === 'string' &&
          typeof (m as StoredMessage).timestamp === 'number',
      )
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function saveMessages(messages: StoredMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to save messages to localStorage:', e);
  }
}

export function clearMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear messages from localStorage:', e);
  }
}
