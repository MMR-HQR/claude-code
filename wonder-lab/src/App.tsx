import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './routes/Landing';
import { ParentHome } from './routes/ParentHome';
import { SessionSetup } from './routes/SessionSetup';
import { WonderRoom } from './routes/WonderRoom';
import { Journal } from './routes/Journal';
import { MemoryDetail } from './routes/MemoryDetail';
import { Archive } from './routes/Archive';
import { Privacy } from './routes/Privacy';
import { ParentLayout } from './components/ParentLayout';

// HashRouter: works from any static host or a Home Screen PWA without server rewrites.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/parent" element={<ParentLayout><ParentHome /></ParentLayout>} />
        <Route path="/parent/session" element={<ParentLayout><SessionSetup /></ParentLayout>} />
        <Route path="/parent/journal" element={<ParentLayout><Journal /></ParentLayout>} />
        <Route path="/parent/journal/:memoryId" element={<ParentLayout><MemoryDetail /></ParentLayout>} />
        <Route path="/parent/archive" element={<ParentLayout><Archive /></ParentLayout>} />
        <Route path="/wonder/:sessionId" element={<WonderRoom />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
