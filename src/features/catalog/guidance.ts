/**
 * Safety copy shown beside form cues. This is deliberately general: the app
 * never diagnoses an injury or says that a variation will remove pain. The user
 * decides whether to switch, skip or stop.
 */
export const STOP_IF_PAIN = {
  prompt: 'Feeling sharp joint pain in your knees or lower back?',
  message:
    'Stop the set if something hurts. iFit can’t tell you why. You can try an easier variation, skip this exercise or end here.',
} as const;
