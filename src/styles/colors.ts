/**
 * Color tokens for the application.
 * Extracted directly from the Pencil design source (.pen components):
 * Button/Primary, TagChip, Badge/Draft, Badge/Completed, Answer/Toggle
 * variants, Metric, ChecklistCard, ApplicationRow, ItemCard, ItemDrawer.
 */

export const colors = {
  // Brand color reverted to the old purple palette per design feedback
  blue: {
    base: '#6A46EB',
    tint: 'rgb(223, 218, 242)',
  },

  white: '#FFFFFF',

  ink: {
    base: '#12151C',
  },

  gray: {
    // background
    100: '#F5F6F8',
    // borders
    200: '#E7E9ED',
    // muted icons/text
    400: '#9AA1AC',
    // secondary text
    600: '#6B7280',
    700: '#12151C',
  },

  success: {
    base: '#1C9A5B',
    tint: '#E7F6EE',
  },

  danger: {
    base: '#D8433D',
    light: '#FBE9E8',
    dark: '#9E4949',
  },

  warning: {
    base: '#C17A12',
    tint: '#FBF1E1',
  },
} as const
