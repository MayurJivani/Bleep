import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/outfit';
import '@fontsource-variable/martian-mono';
import '@fontsource/doto/700.css';
import './styles.css';
import { usePath } from './net';
import { Landing } from './Landing';
import { Seat } from './Controller';
import { ConsoleScreen } from './Console';

function App() {
  const [room, sub] = usePath().split('/').filter(Boolean);
  const code = room?.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (!code) return <Landing />;
  return sub === 'console' ? <ConsoleScreen room={code} /> : <Seat room={code} key={code} />;
}

createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><App /></MotionConfig>);
