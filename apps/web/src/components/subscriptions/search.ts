import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { SortOrder } from "#/components/subscriptions/health";

/** `?sort=name&attention=true`; both optional, so links need neither. */
export type SettingsTab = "subscriptions" | "import" | "account";

export type SubscriptionsSearch = {
  readonly tab?: SettingsTab | undefined;
  readonly sort?: SortOrder | undefined;
  readonly attention?: boolean | undefined;
};

const decodeSort = Schema.decodeUnknownOption(
  Schema.Literals(["attention", "name", "unread"]),
);

const decodeTab = Schema.decodeUnknownOption(
  Schema.Literals(["subscriptions", "import", "account"]),
);

const decodeAttention = Schema.decodeUnknownOption(Schema.Boolean);

/**
 * Read the subscriptions page's search params. A bad value falls back to
 * its default instead of failing, and only that key falls back.
 *
 * Both keys are always returned, `undefined` when missing or bad: TanStack
 * Router spreads the validator's result over the raw query
 * (`{ ...raw, ...validated }`), so a key left out keeps its raw value.
 */
export const parseSubscriptionsSearch = (search: {
  readonly tab?: unknown;
  readonly sort?: unknown;
  readonly attention?: unknown;
}): SubscriptionsSearch => ({
  tab: Option.getOrUndefined(decodeTab(search.tab)),
  sort: Option.getOrUndefined(decodeSort(search.sort)),
  attention: Option.getOrUndefined(decodeAttention(search.attention)),
});
