import type { Person } from '../../domain/types';

/** Profile picture, or the first letter of the name when there is none. */
export function PersonAvatar({
  person,
  size = 72,
}: {
  person: Pick<Person, 'fullName' | 'preferredName' | 'photoUrl'>;
  size?: number;
}) {
  const initial = (person.preferredName || person.fullName)
    .trim()
    .slice(0, 1)
    .toUpperCase();
  return (
    <span
      className="person-avatar"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {person.photoUrl ? (
        <img src={person.photoUrl} alt={`${person.fullName}`} />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}
