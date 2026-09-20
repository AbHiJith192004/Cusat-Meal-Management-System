/**
 * One answer to "which meal is it now?", derived from the server's windows.
 *
 * There used to be two, and they disagreed. StudentHomeView switched to dinner
 * at 16:00 and StudentQrView at 15:00, so between three and four o'clock the
 * home screen offered lunch while the pass screen offered dinner. Neither
 * matched the mess: lunch service ends at 14:30.
 *
 * The windows are a system setting the office can change
 * (`meal_window_lunch_start` and friends), so no screen should hardcode them.
 * `GET /api/v1/meals` returns each one as `time_window`, e.g. "12:00–14:30
 * IST", and that string is what these functions read.
 *
 * FALLBACK_WINDOWS exists only for the moment before that request lands, or if
 * it fails. The values mirror DEFAULT_SETTINGS in
 * backend/app/services/meal_timing_service.py -- if you change them there,
 * change them here, though a running server will normally paper over any drift
 * within a second of the screen opening.
 */

export type MealKey = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_ORDER: MealKey[] = ['breakfast', 'lunch', 'dinner'];

/** Mirrors the backend's DEFAULT_SETTINGS. Used only until the real ones load. */
export const FALLBACK_WINDOWS: Record<MealKey, string> = {
  breakfast: '07:00–09:30 IST',
  lunch: '12:00–14:30 IST',
  dinner: '19:00–21:30 IST',
};

/** "12:00–14:30 IST" -> [720, 870], as minutes past midnight. */
export const parseWindow = (w?: string): [number, number] | null => {
  const m = (w || '').match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
};

/** "12:00–14:30 IST" -> "12:00 PM – 2:30 PM". Null when it cannot be read. */
export const formatWindow = (w?: string): string | null => {
  const parsed = parseWindow(w);
  if (!parsed) return null;
  const clock = (mins: number) => {
    const h = Math.floor(mins / 60);
    const mm = String(mins % 60).padStart(2, '0');
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${mm} ${suffix}`;
  };
  return `${clock(parsed[0])} – ${clock(parsed[1])}`;
};

/** True while the mess is actually serving that window. */
export const isServingNow = (window?: string, now: Date = new Date()): boolean => {
  const span = parseWindow(window);
  if (!span) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= span[0] && minutes <= span[1];
};

/**
 * The meal to show, and to ask for a pass for, right now.
 *
 * Inside a serving window it is that meal. Otherwise it is the next one due
 * today, because a pass for a meal that finished an hour ago is refused by the
 * server and the student can do nothing with it. After dinner has ended there
 * is no next meal, so it stays on dinner rather than jumping to tomorrow.
 *
 * `windows` takes whatever the caller has; anything missing or unparseable
 * falls back per-meal, so a partial response still gives a sensible answer.
 */
export const currentMeal = (
  windows?: Partial<Record<MealKey, string | undefined>>,
  now: Date = new Date(),
): MealKey => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const spans = MEAL_ORDER.map(meal => ({
    meal,
    span: parseWindow(windows?.[meal]) ?? parseWindow(FALLBACK_WINDOWS[meal])!,
  }));

  const serving = spans.find(({ span }) => minutes >= span[0] && minutes <= span[1]);
  if (serving) return serving.meal;

  const next = spans.find(({ span }) => minutes < span[0]);
  return next ? next.meal : 'dinner';
};
