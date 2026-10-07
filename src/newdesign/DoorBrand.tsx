/** The ADEPR mark with the church name, used at the top of every new-design screen. */
export function DoorBrand({ subtitle, name = 'ADEPR Kacyiru' }: { subtitle?: string; name?: string }) {
  return (
    <div className="door-brand">
      <img className="door-brand-logo" src="/brand/adepr-logo.png" alt="" width={40} height={40} />
      <div className="door-brand-text">
        <strong>{name}</strong>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
    </div>
  );
}
