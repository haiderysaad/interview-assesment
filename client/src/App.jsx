import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SessionList from "./pages/admin/SessionList";
import CreateSession from "./pages/admin/CreateSession";
import AptitudeBuilder from "./pages/admin/AptitudeBuilder";
import AdminGate from "./pages/admin/AdminGate";
import SessionDetail from "./pages/admin/SessionDetail";
import TakeTest from "./pages/candidate/TakeTest";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route element={<AdminGate />}>
          <Route path="/admin" element={<SessionList />} />
          <Route path="/admin/sessions/new" element={<CreateSession />} />
          <Route path="/admin/sessions/:id" element={<SessionDetail />} />
          <Route path="/admin/sessions/:id/aptitude" element={<AptitudeBuilder />} />
        </Route>
        <Route path="/test/:token" element={<TakeTest />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
