export interface RoutineTemplateExercise {
  exerciseSlug: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
}

export interface RoutineTemplate {
  id: string;
  slug: string;
  title: string;
  description: string;
  exercises: readonly RoutineTemplateExercise[];
}

const planned = (
  exerciseSlug: string,
  targetSets: number,
  targetReps: number,
  restSeconds: number,
): RoutineTemplateExercise => ({ exerciseSlug, targetSets, targetReps, restSeconds });

/**
 * Starter routines that a user copies into their own account. Templates carry no
 * load target because a useful starting weight depends on the person.
 */
export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    id: 'e1f17100-0000-4000-8000-000000000001',
    slug: 'full-body-starter',
    title: 'Full Body Starter',
    description: 'One balanced session that uses mostly beginner-friendly equipment.',
    exercises: [
      planned('goblet-squat', 3, 10, 90),
      planned('chest-press-machine', 3, 10, 90),
      planned('seated-cable-row', 3, 10, 90),
      planned('dumbbell-romanian-deadlift', 3, 10, 90),
      planned('dead-bug', 2, 10, 60),
    ],
  },
  {
    id: 'e1f17100-0000-4000-8000-000000000002',
    slug: 'upper-body-push',
    title: 'Upper Body Push',
    description: 'Chest, shoulders and triceps, starting with incline pressing.',
    exercises: [
      planned('barbell-incline-bench-press', 4, 8, 120),
      planned('dumbbell-flat-bench-press', 3, 10, 90),
      planned('seated-dumbbell-shoulder-press', 3, 10, 90),
      planned('incline-push-up', 2, 12, 60),
    ],
  },
  {
    id: 'e1f17100-0000-4000-8000-000000000003',
    slug: 'upper-body-pull',
    title: 'Upper Body Pull',
    description: 'Back and biceps through vertical and horizontal pulling.',
    exercises: [
      planned('lat-pulldown', 4, 10, 90),
      planned('seated-cable-row', 3, 10, 90),
      planned('one-arm-dumbbell-row', 3, 10, 90),
      planned('pallof-press', 2, 10, 60),
    ],
  },
  {
    id: 'e1f17100-0000-4000-8000-000000000004',
    slug: 'lower-body-foundations',
    title: 'Lower Body Foundations',
    description: 'Squat and hinge strength with machine work to finish.',
    exercises: [
      planned('barbell-back-squat', 3, 8, 120),
      planned('barbell-romanian-deadlift', 3, 8, 120),
      planned('leg-press', 3, 10, 90),
      planned('seated-leg-curl', 3, 12, 60),
      planned('dead-bug', 2, 10, 60),
    ],
  },
];
