import {
  LockOutlined,
  LoginOutlined,
  MailOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
  UserOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, signIn, signUp } = useAuth();
  const location = useLocation();

  if (user) {
    return <Navigate to={location.state?.from || '/leaderboard'} replace />;
  }

  async function handleFinish(values) {
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const result =
        mode === 'login'
          ? await signIn(values.email, values.password)
          : await signUp({
              email: values.email,
              password: values.password,
              displayName: values.displayName
            });

      if (result.error) throw result.error;
      if (mode === 'register' && !result.data.session) {
        setNotice('Check your email to confirm your account, then sign in.');
      }
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bbx-login-shell">
      <div className="bbx-login-watermark bbx-login-watermark-left" aria-hidden="true" />
      <div className="bbx-login-podium" aria-hidden="true">
        <TrophyMark />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-8">
        <Card className="bbx-login-card w-full" bordered>
          <div className="mb-6 flex items-center gap-4">
            <img
              src="/brand/zamboanga-fallen-logo.jpg"
              alt="Zamboanga Fallen logo"
              className="h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20"
            />
            <div className="min-w-0">
              <Typography.Title level={1} className="bbx-login-brand-title">
                PROJECT TOPCUT
              </Typography.Title>
              <div className="mt-2 text-base font-black uppercase tracking-normal text-bbx-red sm:text-xl">
                Zamboanga BBX Rankings
              </div>
            </div>
          </div>

          <div className="mb-6">
            <Typography.Title className="bbx-login-main-title" level={2}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </Typography.Title>
            <p className="mt-3 text-base text-bbx-muted sm:text-lg">
              {mode === 'login'
                ? 'Sign in to manage your rankings and tournament imports.'
                : 'Join the board and start submitting your tournament results.'}
            </p>
          </div>

          <div className="bbx-auth-tabs mb-8" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => setMode('login')}
              role="tab"
              aria-selected={mode === 'login'}
            >
              <LoginOutlined />
              <span>Login</span>
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => setMode('register')}
              role="tab"
              aria-selected={mode === 'register'}
            >
              <UserAddOutlined />
              <span>Register</span>
            </button>
          </div>

          {error ? <Alert className="mb-4" type="error" showIcon message={error.message} /> : null}
          {notice ? <Alert className="mb-4" type="success" showIcon message={notice} /> : null}

          <Form className="bbx-login-form" layout="vertical" onFinish={handleFinish}>
            {mode === 'register' ? (
              <Form.Item
                label="Display name"
                name="displayName"
                rules={[{ required: true, message: 'Enter your display name.' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="Name shown on rankings" />
              </Form.Item>
            ) : null}
            <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
              <Input prefix={<MailOutlined />} placeholder="you@example.com" />
            </Form.Item>
            <Form.Item label="Password" name="password" rules={[{ required: true, min: 6 }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" />
            </Form.Item>
            {mode === 'login' ? (
              <div className="-mt-3 mb-8 flex justify-end">
                <button className="text-sm font-semibold text-bbx-red underline" type="button">
                  Forgot password?
                </button>
              </div>
            ) : null}
            <Button type="primary" htmlType="submit" loading={submitting} block>
              {mode === 'login' ? <LoginOutlined /> : <UserAddOutlined />}
              {mode === 'login' ? 'Login' : 'Create account'}
            </Button>
          </Form>

          <div className="my-8 flex items-center gap-6 text-bbx-muted">
            <div className="h-px flex-1 bg-bbx-line" />
            <span className="text-sm">or</span>
            <div className="h-px flex-1 bg-bbx-line" />
          </div>

          <div className="text-center text-base text-bbx-muted">
            {mode === 'login' ? 'New to PROJECT TOPCUT?' : 'Already have an account?'}
            <button
              className="ml-3 font-bold text-bbx-red"
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
              <RightOutlined className="ml-2 text-sm" />
            </button>
          </div>
        </Card>

        <div className="mt-7 flex items-center gap-2 text-sm font-medium text-bbx-muted sm:text-base">
          <SafetyCertificateOutlined />
          <span>Secure</span>
          <span className="text-bbx-red">•</span>
          <span>Private</span>
          <span className="text-bbx-red">•</span>
          <span>Built for Zamboanga Fallen</span>
        </div>
      </main>
    </div>
  );
}

function TrophyMark() {
  return (
    <div className="relative h-80 w-72">
      <div className="absolute left-1/2 top-0 h-24 w-20 -translate-x-1/2 rounded-b-3xl border-[14px] border-bbx-line/60 border-t-0" />
      <div className="absolute left-[74px] top-9 h-16 w-12 rounded-l-full border-[10px] border-bbx-line/60 border-r-0" />
      <div className="absolute right-[74px] top-9 h-16 w-12 rounded-r-full border-[10px] border-bbx-line/60 border-l-0" />
      <div className="absolute left-1/2 top-24 h-16 w-5 -translate-x-1/2 bg-bbx-line/60" />
      <div className="absolute left-1/2 top-40 h-5 w-28 -translate-x-1/2 rounded bg-bbx-line/60" />
      <div className="absolute bottom-0 left-1/2 grid h-36 w-72 -translate-x-1/2 grid-cols-3 items-end gap-3">
        <div className="flex h-24 items-center justify-center rounded-t border border-bbx-line/60 text-4xl font-black text-bbx-line">
          2
        </div>
        <div className="flex h-36 items-center justify-center rounded-t border border-bbx-line/60 text-5xl font-black text-bbx-line">
          1
        </div>
        <div className="flex h-20 items-center justify-center rounded-t border border-bbx-line/60 text-4xl font-black text-bbx-line">
          3
        </div>
      </div>
    </div>
  );
}
