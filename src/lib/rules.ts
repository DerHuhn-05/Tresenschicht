import type { CheckInRefusal } from '../api';
import { t } from './i18n';

// Regeln aus dem Anforderungsblatt. Der Server erzwingt sie ebenfalls (supabase/schema.sql).
export const LOCK_MINUTES = 5; // C4: Sperre nach einem Check-in
export const SAME_PUB_HOURS = 12; // erneuter Check-in in derselben Kneipe
export const RADIUS_M = 20; // Check-in-Umkreis um die Kneipe
export const GPS_ALLOWANCE_M = 20; // Spielraum je nach GPS-Genauigkeit, höchstens so viel dazu (also bis 40 m)
export const MAX_ACCURACY_M = 100; // schlechtere Genauigkeit: kein Check-in
export const DECLINE_MINUTES = 30; // nach „Nein“ nicht erneut fragen
export const LEAVE_DISTANCE_M = 100; // „Kneipe verlassen“ ab dieser Entfernung
export const MIN_AGE = 18; // A5
export const PHOTO_MAX_SIDE = 1280; // G3: längste Seite; reicht für volle iPhone-Breite in Retina-Schärfe
export const PHOTO_TARGET_BYTES = 140_000; // Ziel je Foto (vorher 300 KB): etwa doppelt so viele Fotos im Speicher
export const AVATAR_MAX_SIDE = 400; // Profilbild wird höchstens 96 pt groß gezeigt
export const AVATAR_TARGET_BYTES = 40_000;

// B4: Deutschland, die neun Nachbarländer, Italien und Spanien (ISO 3166-1 alpha-2)
export const ALLOWED_COUNTRIES = ['DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'IT', 'ES'];

/** Warum ein Check-in nicht geklappt hat, in Worten für die Anzeige */
export const REFUSAL_TEXT: Record<CheckInRefusal, string> = {
  lock: t('Du hast gerade erst eingecheckt. Der nächste Check-in ist nach 5 Minuten möglich.'),
  same_pub: t('In dieser Kneipe warst du in den letzten 12 Stunden schon. Ein neuer Besuch zählt danach.'),
  accuracy: t('Dein Standort ist gerade zu ungenau. Geh kurz ans Fenster oder vor die Tür und versuch es noch einmal.'),
  country: t('Check-ins gehen nur in Deutschland, seinen Nachbarländern, Italien und Spanien.'),
  too_far: t('Du bist zu weit von der Kneipe entfernt. Geh näher heran und versuch es noch einmal.'),
  not_logged_in: t('Melde dich an, um einzuchecken.'),
};
