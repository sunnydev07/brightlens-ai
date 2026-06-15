interface BrandMarkProps {
  size?: number
}

/**
 * The Brightlens "aperture" glyph — a stylized lens drawn with concentric
 * strokes. Decorative; callers provide their own visible/srreader label.
 */
export function BrandMark({ size = 26 }: BrandMarkProps) {
  return (
    <span className="brandmark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
        <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <circle cx="16" cy="16" r="7.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="2.5" fill="currentColor" />
        <path d="M16 3.2v6.2M16 22.6v6.2M3.2 16h6.2M22.6 16h6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      </svg>
    </span>
  )
}
