// 線條圖示（24×24，跟著文字顏色）。
type P = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

export const IconSparkle = ({ size = 22 }: P) =>
  svg(size, (
    <>
      <path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </>
  ));

export const IconBook = ({ size = 22 }: P) =>
  svg(size, (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </>
  ));

export const IconUser = ({ size = 22 }: P) =>
  svg(size, (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ));

export const IconPlus = ({ size = 18 }: P) => svg(size, <path d="M12 5v14M5 12h14" />);

export const IconSend = ({ size = 18 }: P) =>
  svg(size, (
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </>
  ));

export const IconArrow = ({ size = 16 }: P) => svg(size, <path d="M7 17L17 7M8 7h9v9" />);
