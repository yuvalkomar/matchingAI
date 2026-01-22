import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Import from './pages/Import';
import Matching from './pages/Matching';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/import" element={<Import />} />
          <Route path="/matching" element={<Matching />} />
          {/* Legacy routes - redirect to new matching page */}
          <Route path="/review" element={<Navigate to="/matching" replace />} />
          <Route path="/exceptions" element={<Navigate to="/matching" replace />} />
          <Route path="/export" element={<Navigate to="/matching" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
