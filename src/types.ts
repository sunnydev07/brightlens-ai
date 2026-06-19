export type ThemeName = "default" | "dracula" | "githubDark";

export type ThemeTokens = {
  label: string;
  appIcon: string;
  appIconShadow: string;
  topPillBg: string;
  panel: string;
  modal: string;
  overlay: string;
  border: string;
  borderSoft: string;
  shadow: string;
  insetShadow: string;
  control: string;
  controlActive: string;
  button: string;
  buttonHover: string;
  input: string;
  response: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  placeholder: string;
  heading: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentGlow: string;
  smartBg: string;
  smartText: string;
  success: string;
  danger: string;
  dangerText: string;
  dangerSoft: string;
  markdown: {
    text: string;
    muted: string;
    heading: string;
    headingSoft: string;
    link: string;
    codeBg: string;
    inlineCodeBg: string;
  };
};

export interface Mode {
  name: string;
  systemPrompt: string | null;
}
