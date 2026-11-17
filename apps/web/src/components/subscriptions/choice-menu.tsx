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
 * A button that opens a menu of choices, one of them picked: the
 * subscriptions list's filter and sort. The button names what is picked.
 */
export function ChoiceMenu<T extends string>({
  label,
  icon: Icon,
  value,
  choices,
  onChange,
}: {
  /** Names the button (with the current choice); only its icon shows. */
  label: string
  icon: LucideIcon
  value: T
  choices: ReadonlyArray<{ readonly value: T; readonly label: string }>
  onChange: (value: T) => void
}) {
  const picked = choices.find((choice) => choice.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" />}
        aria-label={`${label}: ${picked?.label ?? ''}`}
        title={`${label}: ${picked?.label ?? ''}`}
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
            <DropdownMenuRadioItem key={choice.value} value={choice.value}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
