const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
})

/**
 * Order two names as a person would: case and accents ignored, and numbers
 * by value, so "Gen 2" comes before "Gen 10".
 */
export const compareNames = (a: string, b: string): number =>
  collator.compare(a, b)
