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

// B4: Deutschland und die neun Nachbarländer (ISO 3166-1 alpha-2)
export const ALLOWED_COUNTRIES = ['DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL'];
