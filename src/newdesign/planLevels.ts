/** The key of an approval step from the name the server gives it ("President" is the unit's own step). */
export function levelKeyOf(label: string): 'UNIT' | 'TREASURER' | 'CATECHIST' | 'CHURCH' {
  if (label === 'Church Leader') return 'CHURCH';
  if (label === 'Treasurer') return 'TREASURER';
  if (label === 'Catechist') return 'CATECHIST';
  return 'UNIT';
}
