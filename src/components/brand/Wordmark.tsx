type WordmarkProps = {
  className?: string;
};

export default function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={["c-lockup-wm", className].filter(Boolean).join(" ")}>
      Owl<em>Market</em>
    </span>
  );
}
