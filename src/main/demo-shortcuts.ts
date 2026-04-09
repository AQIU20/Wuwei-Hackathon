interface DemoShortcut {
  id: string
  matchers: string[]
  reply: string
}

export interface DemoShortcutMatch {
  id: string
  promptText: string
  reply: string
}

const DEMO_SHORTCUTS: DemoShortcut[] = [
  {
    id: 'demo-mood-bad-rainbow-ring',
    matchers: ['我今天心情很不好'],
    reply: '别难过，看点五彩斑斓的开心点～',
  },
]

function normalizeQuery(text: string): string {
  return text.trim().replace(/\s+/g, '')
}

function buildDemoPrompt(inputText: string, shortcut: DemoShortcut): string {
  return [
    `The user's original message was: "${inputText}"`,
    `A removable live demo shortcut matched with id "${shortcut.id}".`,
    'Reply in Simplified Chinese.',
    'Before replying, control the ring light module "heap_c13de8" and make it colorful with a rainbow-style dynamic light effect.',
    'Use the normal hardware/device tool chain that already works for user light-control requests.',
    'If a tool call is needed, do it before the reply.',
    `Reply exactly with this sentence and nothing else: "${shortcut.reply}"`,
  ].join('\n')
}

export async function applyDemoShortcut(args: {
  text: string
}): Promise<DemoShortcutMatch | null> {
  const normalizedText = normalizeQuery(args.text)
  const shortcut = DEMO_SHORTCUTS.find((item) =>
    item.matchers.some((matcher) => normalizedText.includes(normalizeQuery(matcher))),
  )

  if (!shortcut) {
    return null
  }

  return {
    id: shortcut.id,
    promptText: buildDemoPrompt(args.text, shortcut),
    reply: shortcut.reply,
  }
}
