import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Import from './pages/Import';
import Review from './pages/Review';
import Exceptions from './pages/Exceptions';
import Export from './pages/Export';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/import" element={<Import />} />
          <Route path="/review" element={<Review />} />
          <Route path="/exceptions" element={<Exceptions />} />
          <Route path="/export" element={<Export />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
