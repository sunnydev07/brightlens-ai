import { Camera, Command, Mic, Sparkles } from 'lucide-react'
import { Overlay } from './ui/Overlay'
import { BrandMark } from './BrandMark'

interface OnboardingProps {
  open: boolean
  onDismiss: () => void
}

const FEATURES = [
  {
    icon: Mic,
    title: 'Talk to it',
    body: 'Hold Shift anywhere, or press and hold the mic, to speak your request.',
  },
  {
    icon: Camera,
    title: 'Capture context',
    body: 'Grab your screen so Brightlens can see exactly what you are working on.',
  },
  {
    icon: Sparkles,
    title: 'Custom modes',
    body: 'Create personas with their own system prompts for repeatable workflows.',
  },
  {
    icon: Command,
    title: 'Command palette',
    body: 'Press Cmd/Ctrl + K to jump to any action or conversation instantly.',
  },
]

/** First-run welcome explaining the core capabilities. */
export function Onboarding({ open, onDismiss }: OnboardingProps) {
  return (
    <Overlay
      open={open}
      onClose={onDismiss}
      variant="center"
      title="Welcome to Brightlens AI"
      description="Your on-screen assistant for seeing, understanding and acting."
      labelledBy="onboarding-title"
      className="overlay__panel--onboarding"
    >
      <div className="onboarding">
        <div className="onboarding__hero" aria-hidden="true">
          <BrandMark size={48} />
        </div>
        <ul className="onboarding__features">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="onboarding__feature">
              <span className="onboarding__feature-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <h3 className="onboarding__feature-title">{title}</h3>
                <p className="onboarding__feature-body">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--primary btn--block" onClick={onDismiss}>
          Get started
        </button>
      </div>
    </Overlay>
  )
}
