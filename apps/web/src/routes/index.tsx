import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Unread,
})

/** The unread list arrives in M3; until then, point at subscriptions. */
function Unread() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Unread</h1>
      <p className="mt-2 text-neutral-500">
        The unread list is coming next. For now, manage your feeds on the{' '}
        <Link to="/subscriptions" className="underline">
          subscriptions
        </Link>{' '}
        page.
      </p>
    </section>
  )
}
