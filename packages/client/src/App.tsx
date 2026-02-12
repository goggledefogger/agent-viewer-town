import { Scene } from './components/Scene';
import { Sidebar } from './components/Sidebar';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  const state = useWebSocket('ws://localhost:3001/ws');

  return (
    <div className="app">
      <Scene state={state} />
      <Sidebar state={state} />
    </div>
  );
}
