import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ImportTournamentPage from './pages/ImportTournamentPage.jsx';
import TournamentDetailsPage from './pages/TournamentDetailsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminReviewPage from './pages/AdminReviewPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/leaderboard" replace />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/import" element={<Navigate to="/tournaments" replace />} />
        <Route path="/tournaments" element={<ImportTournamentPage />} />
        <Route path="/tournaments/:sourceId" element={<TournamentDetailsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/players/:userId" element={<ProfilePage />} />
        <Route
          path="/admin/review"
          element={
            <AdminRoute>
              <AdminReviewPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/leaderboard" replace />} />
    </Routes>
  );
}
