/** Una lista de frases, sin numerar: son afirmaciones, no pasos. */
export function ClaimList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li className="flex gap-2" key={item}>
          <span aria-hidden="true" className="text-fg-muted">
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
