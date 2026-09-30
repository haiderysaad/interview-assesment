import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SessionList from "./pages/admin/SessionList";
import CreateSession from "./pages/admin/CreateSession";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" />} />
        <Route path="/admin" element={<SessionList />} />
        <Route path="/admin/sessions/new" element={<CreateSession />} />
      </Routes>
    </BrowserRouter>
  );
}
