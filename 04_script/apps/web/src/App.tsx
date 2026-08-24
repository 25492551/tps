import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Landing } from './pages/Landing';
import { AdminLoginPage, LoginPage, LoginCaptchaPage, RegisterPage } from './pages/AuthPages';
import { HandoffPage } from './pages/HandoffPage';
import { AdminShell } from './portals/admin/AdminShell';
import {
  AdminAgentFeesPage,
  AdminAgentSettlementsPage,
  AdminBankRequestsPage,
  AdminHoldsPage,
  AdminHome,
  AdminRatesPage,
  AdminSettingsPage,
  AdminTransactionsPage,
  AdminUsersPage,
  AdminWalletsPage,
} from './portals/admin/pages';
import { AdminApiGuidePage } from './portals/admin/ApiGuidePage';
import { AdminAgentTreePage } from './portals/admin/AgentTreePage';
import { AdminAgentStatsPage } from './portals/admin/AgentStatsPage';
import { AdminSolutionKeysPage } from './portals/admin/SolutionKeysPage';
import { AgentShell } from './portals/agent/AgentShell';
import {
  AgentHome,
  AgentMembersPage,
  AgentSettlementsPage,
  AgentTransactionsPage,
} from './portals/agent/pages';
import { MemberDetailPage } from './portals/shared/MemberDetailPage';
import { UserShell } from './portals/user/UserShell';
import {
  BanksPage,
  BuyBoard,
  ProfilePage,
  SellBoard,
  TradeDetailPage,
  TradesListPage,
  TransactionsPage,
  TransferPage,
  WalletsPage,
} from './portals/user/pages';

function RequireAuth({
  children,
  portal,
}: {
  children: React.ReactNode;
  portal: 'user' | 'admin' | 'agent';
}) {
  const { userSession, adminSession, agentSession, loading } = useAuth();
  if (loading) return <p style={{ padding: '2rem' }}>로딩…</p>;
  if (portal === 'admin') {
    if (!adminSession || adminSession.role !== 'admin') return <Navigate to="/admin-login" replace />;
    return children;
  }
  if (portal === 'agent') {
    if (!agentSession || agentSession.role !== 'agent') return <Navigate to="/login" replace />;
    return children;
  }
  if (!userSession || userSession.role !== 'member') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/login/captcha" element={<LoginCaptchaPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/handoff" element={<HandoffPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth portal="user">
            <UserShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="wallets" replace />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="me" element={<ProfilePage />} />
        <Route path="banks" element={<BanksPage />} />
        <Route path="buy" element={<BuyBoard />} />
        <Route path="sell" element={<SellBoard />} />
        <Route path="transfer" element={<TransferPage />} />
        <Route path="trades" element={<TradesListPage />} />
        <Route path="trades/:id" element={<TradeDetailPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
      </Route>
      <Route
        path="/agent/member/:loginId"
        element={
          <RequireAuth portal="agent">
            <MemberDetailPage portal="agent" />
          </RequireAuth>
        }
      />
      <Route
        path="/agent"
        element={
          <RequireAuth portal="agent">
            <AgentShell />
          </RequireAuth>
        }
      >
        <Route index element={<AgentHome />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="me" element={<ProfilePage />} />
        <Route path="buy" element={<BuyBoard />} />
        <Route path="sell" element={<SellBoard />} />
        <Route path="transfer" element={<TransferPage />} />
        <Route path="trades" element={<TradesListPage />} />
        <Route path="trades/:id" element={<TradeDetailPage />} />
        <Route path="my-transactions" element={<TransactionsPage />} />
        <Route path="transactions" element={<AgentTransactionsPage />} />
        <Route path="members" element={<AgentMembersPage />} />
        <Route path="settlements" element={<AgentSettlementsPage />} />
      </Route>
      <Route
        path="/admin/member/:loginId"
        element={
          <RequireAuth portal="admin">
            <MemberDetailPage portal="admin" />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth portal="admin">
            <AdminShell />
          </RequireAuth>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="bank-requests" element={<AdminBankRequestsPage />} />
        <Route path="wallets" element={<AdminWalletsPage />} />
        <Route path="holds" element={<AdminHoldsPage />} />
        <Route path="transactions" element={<AdminTransactionsPage />} />
        <Route path="agent-fees" element={<AdminAgentFeesPage />} />
        <Route path="agent-tree" element={<AdminAgentTreePage />} />
        <Route path="agent-stats" element={<AdminAgentStatsPage />} />
        <Route path="agent-settlements" element={<AdminAgentSettlementsPage />} />
        <Route path="rates" element={<AdminRatesPage />} />
        <Route path="api-guide" element={<AdminApiGuidePage />} />
        <Route path="solution-keys" element={<AdminSolutionKeysPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
