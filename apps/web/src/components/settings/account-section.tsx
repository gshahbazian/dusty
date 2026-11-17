import { cn } from 'cn'

import { buttonVariants } from '#/components/ui/button'

/** Settings' Account tab: who is signed in, and logging out. */
export function AccountSection({
  email,
  logoutUrl,
}: {
  email: string
  /** From the auth provider (Cloudflare Access's logout, or `/` in dev). */
  logoutUrl: string
}) {
  return (
    <section className="flex flex-col items-start gap-4">
      <dl className="flex flex-col gap-1 text-sm">
        <dt className="font-semibold">Email</dt>
        <dd className="text-muted-foreground">{email}</dd>
      </dl>
      <a
        href={logoutUrl}
        className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
      >
        Log out
      </a>
    </section>
  )
}
