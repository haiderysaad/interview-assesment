import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SessionList from "./pages/admin/SessionList";
import CreateSession from "./pages/admin/CreateSession";
import AptitudeBuilder from "./pages/admin/AptitudeBuilder";
import TechnicalBuilder from "./pages/admin/TechnicalBuilder";
import AdminGate from "./pages/admin/AdminGate";
import SessionDetail from "./pages/admin/SessionDetail";
import TechnicalReview from "./pages/admin/TechnicalReview";
import TakeTest from "./pages/candidate/TakeTest";
import TechnicalRound from "./pages/candidate/TechnicalRound";
import JoinTest from "./pages/candidate/JoinTest";
import NotAllowed from "./pages/candidate/NotAllowed";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route element={<AdminGate />}>
          <Route path="/admin" element={<SessionList />} />
          <Route path="/admin/sessions/new" element={<CreateSession />} />
          <Route path="/admin/sessions/:id" element={<SessionDetail />} />
          <Route path="/admin/sessions/:id/technical-review" element={<TechnicalReview />} />
          <Route path="/admin/sessions/:id/aptitude" element={<AptitudeBuilder />} />
          <Route path="/admin/sessions/:id/technical" element={<TechnicalBuilder />} />
        </Route>
        <Route path="/join/:shareToken" element={<JoinTest />} />
        <Route path="/not-allowed" element={<NotAllowed />} />
        <Route path="/test/:token" element={<TakeTest />} />
        <Route path="/test/:token/technical" element={<TechnicalRound />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
