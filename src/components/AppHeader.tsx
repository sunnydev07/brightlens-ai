import { Cloud, History, PenSquare, Settings, Wifi, WifiOff } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { ModePicker } from './ModePicker'
import { IconButton } from './ui/IconButton'
import type { BrightlensMode, VisionMode } from '../lib/types'

interface AppHeaderProps {
  modes: BrightlensMode[]
  activeMode: string
  onSelectMode: (name: string) => void
  onCreateMode: () => void
  visionMode: VisionMode
  onToggleVision: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
  onNewChat: () => void
  busy: boolean
}

/** Top application bar: brand, persona picker, vision toggle and actions. */
export function AppHeader({
  modes,
  activeMode,
  onSelectMode,
  onCreateMode,
  visionMode,
  onToggleVision,
  onOpenHistory,
  onOpenSettings,
  onNewChat,
  busy,
}: AppHeaderProps) {
  const online = visionMode === 'online'
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo">
          <BrandMark size={24} />
        </span>
        <span className="app-header__name">
          Brightlens<span className="app-header__name-accent">AI</span>
        </span>
      </div>

      <div className="app-header__center">
        <ModePicker
          modes={modes}
          activeName={activeMode}
          onSelect={onSelectMode}
          onCreate={onCreateMode}
          disabled={busy}
        />
      </div>

      <div className="app-header__actions">
        <button
          type="button"
          className={`vision-toggle ${online ? 'is-online' : 'is-offline'}`}
          onClick={onToggleVision}
          aria-pressed={online}
          aria-label={`Vision mode: ${online ? 'Online' : 'Offline'}. Click to switch.`}
          title={online ? 'Online vision (cloud)' : 'Offline vision (local)'}
        >
          <span className="vision-toggle__icon">
            {online ? <Cloud size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
          </span>
          <span className="vision-toggle__label">{online ? 'Online' : 'Offline'}</span>
          <span className="vision-toggle__net" aria-hidden="true">
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          </span>
        </button>

        <span className="app-header__divider" aria-hidden="true" />

        <IconButton label="New chat" onClick={onNewChat} disabled={busy}>
          <PenSquare size={17} aria-hidden="true" />
        </IconButton>
        <IconButton label="History" onClick={onOpenHistory}>
          <History size={17} aria-hidden="true" />
        </IconButton>
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings size={17} aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  )
}
