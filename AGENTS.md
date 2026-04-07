# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

- use Bun for the project
- use Tailwind CSS for styling
- frontend performance principle:
  keep high-frequency state updates scoped to the smallest necessary subtree, and isolate expensive UI subtrees from unrelated updates
- prefer this order:
  first remove unnecessary re-renders with state placement, component boundaries, or memoization; then consider virtualization or heavier optimizations if rendering is still expensive
- when analyzing rendering performance:
  optimize update paths before optimizing component internals; focus on which state changes cause which subtrees to re-render
- component splitting principles:
  prefer splitting by responsibility and state/update boundaries, not just by visual similarity
  extract shared components when structure and behavior are repeated and stable, especially when the parent becomes simpler after extraction
  prefer shared layout/shell primitives over premature business abstraction; avoid components that only stay "shared" through many variants, flags, or conditionals
  keep high-frequency state close to the smallest subtree that needs it, and do not lift state merely to force reuse
  if an extraction makes data flow, naming, or render behavior harder to follow, keep the code local until the pattern becomes clearer
  before introducing new UI patterns or rewriting existing ones, check `src/renderer/src/components` for reusable atomic components and prefer reusing or extending them over creating parallel implementations
