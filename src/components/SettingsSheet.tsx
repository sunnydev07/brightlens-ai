import { Overlay } from './ui/Overlay'
import type {
  Density,
  Preferences,
  ThemePref,
  VisionMode,
} from '../lib/types'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  preferences: Preferences
  onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  onReset: () => void
}

interface SegmentedProps<T extends string> {
  label: string
  hint?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  name: string
}

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  name,
}: SegmentedProps<T>) {
  return (
    <div className="setting">
      <div className="setting__text">
        <span className="setting__label">{label}</span>
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`segmented__option ${value === option.value ? 'is-active' : ''}`}
            onClick={() => onChange(option.value)}
            name={name}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="setting">
      <div className="setting__text">
        <span className="setting__label">{label}</span>
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Preferences panel: appearance, motion, vision mode and data retention. */
export function SettingsSheet({
  open,
  onClose,
  preferences,
  onChange,
  onReset,
}: SettingsSheetProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="sheet-right"
      title="Settings"
      description="Preferences are stored on this device only."
      labelledBy="settings-title"
    >
      <div className="settings">
        <section className="settings__group" aria-label="Appearance">
          <h3 className="settings__group-title">Appearance</h3>
          <Segmented<ThemePref>
            label="Theme"
            hint="Match the system or pick a fixed appearance."
            name="theme"
            value={preferences.theme}
            onChange={(value) => onChange('theme', value)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <Segmented<Density>
            label="Density"
            hint="Compact tightens spacing for smaller windows."
            name="density"
            value={preferences.density}
            onChange={(value) => onChange('density', value)}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
          <Toggle
            label="Reduce motion"
            hint="Minimise animations and transitions."
            checked={preferences.reducedMotion}
            onChange={(value) => onChange('reducedMotion', value)}
          />
        </section>

        <section className="settings__group" aria-label="Vision">
          <h3 className="settings__group-title">Vision</h3>
          <Segmented<VisionMode>
            label="Default vision mode"
            hint="Online uses the cloud model; Offline keeps analysis local."
            name="vision"
            value={preferences.visionMode}
            onChange={(value) => onChange('visionMode', value)}
            options={[
              { value: 'online', label: 'Online' },
              { value: 'offline', label: 'Offline' },
            ]}
          />
        </section>

        <section className="settings__group" aria-label="Data">
          <h3 className="settings__group-title">Data &amp; privacy</h3>
          <Segmented<string>
            label="Keep conversations"
            hint="Older, unpinned chats are removed automatically."
            name="retention"
            value={String(preferences.retentionDays)}
            onChange={(value) => onChange('retentionDays', Number(value))}
            options={[
              { value: '0', label: 'Forever' },
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
            ]}
          />
        </section>

        <div className="settings__footer">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      </div>
    </Overlay>
  )
}
