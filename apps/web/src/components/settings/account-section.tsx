import { cn } from 'cn'

import { buttonVariants } from '@/components/ui/button.tsx'

/** The bottom of Settings: who is signed in, and logging out. */
export function AccountSection({
  email,
  logoutUrl,
}: {
  email: string
  /** From the auth provider (Cloudflare Access's logout, or `/` in dev). */
  logoutUrl: string
}) {
  return (
    <section
      aria-labelledby="account-heading"
      className="flex flex-col items-start gap-2 border-t pt-6"
    >
      <h2 id="account-heading" className="font-medium">
        Account
      </h2>
      <p className="text-muted-foreground text-xs">Signed in as {email}</p>
      <a
        href={logoutUrl}
        className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}
      >
        Log out
      </a>
    </section>
  )
}
