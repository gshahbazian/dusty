/**
 * The only addresses anyone may load without logging in: the home screen
 * icon. Safari's Favorites fetch it without the Access cookie, and showed a
 * lettered square while Access sent that fetch to the login page. An icon
 * is nothing private.
 *
 * Both gates read this list: `alchemy.run.ts` gives these paths an Access
 * application that bypasses login, and the Worker serves them before its
 * owner check.
 */
export const PUBLIC_PATHS: readonly string[] = ['/apple-touch-icon.png']
