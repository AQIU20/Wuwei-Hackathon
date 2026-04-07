export function formatArgs(args: Record<string, unknown>): string {
  if (args.command) return String(args.command)
  if (args.file_path) return String(args.file_path)
  if (args.path) return String(args.path)
  if (args.query) return String(args.query)

  const keys = Object.keys(args)
  if (keys.length === 0) return ''

  return keys
    .slice(0, 3)
    .map((key) => {
      const value = JSON.stringify(args[key])
      return `${key}=${value.length > 50 ? `${value.slice(0, 50)}…` : value}`
    })
    .join(' ')
}
