import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Landing } from './pages/Landing';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { HandoffPage } from './pages/HandoffPage';
import { AdminShell } from './portals/admin/AdminShell';
import {
  AdminHoldsPage,
  AdminHome,
  AdminRatesPage,
  AdminSettingsPage,
  AdminTransactionsPage,
  AdminUsersPage,
  AdminWalletsPage,
} from './portals/admin/pages';
import { UserShell } from './portals/user/UserShell';
import {
  BanksPage,
  BuyBoard,
  SellBoard,
  TradeDetailPage,
  TradesListPage,
  TransactionsPage,
  TransferPage,
  UserHome,
  WalletsPage,
} from './portals/user/pages';

function RequireAuth({
  children,
  admin,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const { user, userSession, adminSession, loading } = useAuth();
  if (loading) return <p style={{ padding: '2rem' }}>로딩…</p>;
  if (admin) {
    if (!adminSession || adminSession.role !== 'admin') {
      return <Navigate to="/login" replace />;
    }
    return children;
  }
  // User portal: only the user-slot session (admin token does not unlock /app)
  if (!userSession) return <Navigate to="/login" replace />;
  // Keep `user` aligned for nested hooks (path is under /app)
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/handoff" element={<HandoffPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <UserShell />
          </RequireAuth>
        }
      >
        <Route index element={<UserHome />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="banks" element={<BanksPage />} />
        <Route path="buy" element={<BuyBoard />} />
        <Route path="sell" element={<SellBoard />} />
        <Route path="transfer" element={<TransferPage />} />
        <Route path="trades" element={<TradesListPage />} />
        <Route path="trades/:id" element={<TradeDetailPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireAuth admin>
            <AdminShell />
          </RequireAuth>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="wallets" element={<AdminWalletsPage />} />
        <Route path="holds" element={<AdminHoldsPage />} />
        <Route path="transactions" element={<AdminTransactionsPage />} />
        <Route path="rates" element={<AdminRatesPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
