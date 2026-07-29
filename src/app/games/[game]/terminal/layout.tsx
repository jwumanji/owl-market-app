// Game-scoped mirror of the Terminal segment layout. Next resolves layouts by
// filesystem segment, so /games/[game]/terminal needs its own file — but the
// layout itself is re-exported, not copied. Edit src/app/terminal/layout.tsx.
export { default } from "@/app/terminal/layout";
