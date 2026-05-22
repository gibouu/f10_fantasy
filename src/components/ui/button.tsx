import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base styles — shared by every variant
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full',
    'font-medium transition-opacity',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:opacity-80',
  ],
  {
    variants: {
      variant: {
        /** F1 red — primary CTA */
        primary: 'bg-accent text-white',
        /** Elevated surface — secondary action */
        secondary: 'bg-surface-elevated text-text-primary border border-[var(--border)]',
        /** Transparent — de-emphasised / icon action */
        ghost: 'bg-transparent text-text-secondary hover:bg-surface-elevated',
        /** Destructive — delete / danger */
        destructive: 'bg-red-600 text-white',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-11 px-5 text-base',
        lg: 'h-13 px-6 text-base font-semibold',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as a child element (Radix Slot pattern) */
  asChild?: boolean
  /** Shows a spinner and disables interaction */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      disabled,
      children,
      onClick,
      'aria-disabled': ariaDisabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const isDisabled = disabled || loading
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (asChild && isDisabled) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      onClick?.(event)
    }

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, fullWidth, className }),
          asChild && isDisabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        )}
        disabled={asChild ? undefined : isDisabled}
        aria-disabled={asChild && isDisabled ? true : ariaDisabled}
        data-disabled={isDisabled ? '' : undefined}
        {...props}
        onClick={handleClick}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
