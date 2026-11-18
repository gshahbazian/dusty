import { type LucideIcon } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

/**
 * An icon button that opens a menu of choices with one picked: the
 * subscriptions list's filter and sort. Only the icon shows; its name says
 * what is picked ("Sort: Name"), and it stands out while `changed`.
 */
export function ChoiceMenu<T extends string>({
  label,
  icon: Icon,
  value,
  choices,
  changed,
  onChange,
}: {
  label: string
  icon: LucideIcon
  value: T
  choices: ReadonlyArray<{ readonly value: T; readonly label: string }>
  /** Not the default, so the button looks pressed. */
  changed: boolean
  onChange: (value: T) => void
}) {
  const picked = choices.find((choice) => choice.value === value)
  const name = `${label}: ${picked?.label ?? ''}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={changed ? 'secondary' : 'outline'}
            size="icon"
            className="pointer-coarse:size-11"
          />
        }
        aria-label={name}
        title={name}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next: string) => {
            const choice = choices.find((choice) => choice.value === next)

            if (choice !== undefined) onChange(choice.value)
          }}
        >
          {choices.map((choice) => (
            <DropdownMenuRadioItem
              key={choice.value}
              value={choice.value}
              // One pick and done: Base UI keeps radio menus open otherwise.
              closeOnClick
              className="pointer-coarse:min-h-11"
            >
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
