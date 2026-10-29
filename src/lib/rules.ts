import type { CheckInRefusal } from '../api';

// Regeln aus dem Anforderungsblatt. Der Server erzwingt sie ebenfalls (supabase/schema.sql).
export const LOCK_MINUTES = 5; // C4: Sperre nach einem Check-in
export const SAME_PUB_HOURS = 12; // erneuter Check-in in derselben Kneipe
export const RADIUS_M = 50; // Umkreis für die Suche nach Kneipen
export const MAX_ACCURACY_M = 100; // schlechtere Genauigkeit: kein Check-in
export const DECLINE_MINUTES = 30; // nach „Nein“ nicht erneut fragen
export const LEAVE_DISTANCE_M = 100; // „Kneipe verlassen“ ab dieser Entfernung
export const MIN_AGE = 18; // A5
export const PHOTO_MAX_SIDE = 1600; // G3
export const PHOTO_TARGET_BYTES = 300_000;

// B4: Deutschland, die neun Nachbarländer, Italien und Spanien (ISO 3166-1 alpha-2)
export const ALLOWED_COUNTRIES = ['DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'IT', 'ES'];

/** Warum ein Check-in nicht geklappt hat, in Worten für die Anzeige */
export const REFUSAL_TEXT: Record<CheckInRefusal, string> = {
  lock: 'Du hast gerade erst eingecheckt. Der nächste Check-in ist nach 5 Minuten möglich.',
  same_pub: 'In dieser Kneipe warst du in den letzten 12 Stunden schon. Ein neuer Besuch zählt danach.',
  accuracy: 'Dein Standort ist gerade zu ungenau. Geh kurz ans Fenster oder vor die Tür und versuch es noch einmal.',
  country: 'Check-ins gehen nur in Deutschland, seinen Nachbarländern, Italien und Spanien.',
  too_far: 'Du bist zu weit von der Kneipe entfernt. Geh näher heran und versuch es noch einmal.',
  not_logged_in: 'Melde dich an, um einzuchecken.',
};
