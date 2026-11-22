import { Link, Route, Routes } from 'react-router-dom';
import { PreviewProvider } from './components/Preview.tsx';
import Home from './pages/Home.tsx';
import Lobby from './pages/Lobby.tsx';
import Builder from './pages/Builder.tsx';
import Results from './pages/Results.tsx';
import Resume from './pages/Resume.tsx';

export default function App() {
  return (
    <PreviewProvider>
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>◆</span> Sealed Together
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/p/:poolId" element={<Lobby />} />
        <Route path="/p/:poolId/build" element={<Builder />} />
        <Route path="/p/:poolId/results" element={<Results />} />
        <Route path="/p/:poolId/resume" element={<Resume />} />
        <Route path="*" element={<main className="page"><h1>Not found</h1><Link to="/">Go home</Link></main>} />
      </Routes>
    </PreviewProvider>
  );
}
