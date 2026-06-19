import { BarChartOutlined, FlagOutlined, UnorderedListOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Layout } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const { Content, Sider } = Layout;

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isAdmin, signOut } = useAuth();
  const displayName = profile?.display_name || 'BBX Player';

  const navItems = [
    {
      path: '/leaderboard',
      icon: <BarChartOutlined />,
      label: 'Leaderboard'
    },
    {
      path: '/tournaments',
      icon: <UnorderedListOutlined />,
      label: 'Tournaments'
    },
    {
      path: '/profile',
      icon: <UserOutlined />,
      label: 'My Profile'
    },
    ...(isAdmin
      ? [
          {
            path: '/admin/review',
            icon: <FlagOutlined />,
            label: 'Admin Review'
          }
        ]
      : [])
  ];

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <Layout className="min-h-screen">
      <Sider width={300} breakpoint="lg" collapsedWidth="0" className="bbx-app-sider border-r border-bbx-line bg-white">
        <div className="bbx-sidebar-brand">
          <img src="/brand/zamboanga-pincers-logo.jpg" alt="Zamboanga Pincers logo" className="bbx-sidebar-brand-logo" />
          <div className="min-w-0">
            <div className="brand-title bbx-sidebar-brand-title">PROJECT PINCERS</div>
            <div className="bbx-sidebar-brand-subtitle">ZC BBX LOCAL RANKINGS</div>
          </div>
        </div>

        <nav className="bbx-sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`bbx-sidebar-nav-item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="bbx-sidebar-nav-icon">{item.icon}</span>
                <span className="bbx-sidebar-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="bbx-sidebar-account">
          <div className="bbx-sidebar-account-card">
            <div className="bbx-sidebar-account-row">
              <div className="bbx-sidebar-account-meta">
                <div className="bbx-sidebar-account-name">{displayName}</div>
                <div className="bbx-sidebar-account-role">{isAdmin ? 'Admin' : 'Blader'}</div>
              </div>
              <Button
                type="text"
                className="bbx-sidebar-account-action"
                icon={<LogoutOutlined />}
                aria-label="Sign out"
                onClick={handleSignOut}
              />
            </div>
          </div>
        </div>
      </Sider>
      <Layout>
        <Content className="px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-[1536px]">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
