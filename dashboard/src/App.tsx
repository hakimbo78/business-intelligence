import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { NewOrder } from './pages/NewOrder';
import { ProjectDetails } from './pages/ProjectDetails';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new-order" element={<NewOrder />} />
          <Route path="/projects/:id" element={<ProjectDetails />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
