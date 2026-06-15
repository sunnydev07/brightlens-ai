import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'ghost' | 'solid' | 'danger'
type Size = 'sm' | 'md'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; rendered as aria-label and tooltip title. */
  label: string
  variant?: Variant
  size?: Size
  active?: boolean
}

/** A square, icon-only button with an accessible label and focus ring. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', active = false, className, children, ...rest },
  ref,
) {
  const classes = [
    'icon-btn',
    `icon-btn--${variant}`,
    `icon-btn--${size}`,
    active ? 'is-active' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-label={label}
      title={label}
      aria-pressed={variant === 'ghost' && active ? true : undefined}
      {...rest}
    >
      {children}
    </button>
  )
})
