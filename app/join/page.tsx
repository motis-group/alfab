'use client';

import '@root/global.scss';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import Button from '@components/Button';
import Card from '@components/Card';
import DefaultLayout from '@components/page/DefaultLayout';
import Divider from '@components/Divider';
import Grid from '@components/Grid';
import Input from '@components/Input';
import Text from '@components/Text';

interface InviteInfo {
  email: string | null;
  role: string;
  expiresAt: string;
}

export default function JoinPage() {
  const router = useRouter();

  const [token, setToken] = useState('');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextToken = params.get('token') || '';
    setToken(nextToken);
  }, []);

  useEffect(() => {
    async function loadInvite() {
      if (!token) {
        setError('Missing invite token.');
        setLoadingInvite(false);
        return;
      }

      setLoadingInvite(true);
      setError(null);

      try {
        const response = await fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const data = (await response.json().catch(() => null)) as { valid?: boolean; invite?: InviteInfo; error?: string } | null;

        if (!response.ok || !data?.valid || !data.invite) {
          throw new Error(data?.error || 'Invite link is invalid.');
        }

        setInvite(data.invite);
      } catch (loadError: any) {
        setInvite(null);
        setError(loadError?.message || 'Invite link is invalid.');
      } finally {
        setLoadingInvite(false);
      }
    }

    loadInvite();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const username = formData.get('username')?.toString() || '';
    const password = formData.get('password')?.toString() || '';

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          username,
          password,
        }),
      });

      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to accept invite.');
      }

      router.push('/');
      router.refresh();
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to accept invite.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DefaultLayout previewPixelSRC="https://intdev-global.s3.us-west-2.amazonaws.com/template-app-icon.png">
      <Grid>
        <Card title="JOIN WORKSPACE">
          {loadingInvite ? (
            <Text>Validating invite...</Text>
          ) : invite ? (
            <form onSubmit={handleSubmit}>
              <Text>
                Invited role: <span className="status-pill status-pill-success">{invite.role.toUpperCase()}</span>
              </Text>
              <Text>Expires: {new Date(invite.expiresAt).toLocaleString()}</Text>
              {invite.email ? <Text>Invite email: {invite.email}</Text> : null}
              <br />

              <Input autoComplete="username" label="USERNAME" placeholder="choose username" name="username" type="text" required />
              <Input autoComplete="new-password" label="PASSWORD" placeholder="minimum 8 characters" name="password" type="password" required />

              {error && (
                <>
                  <br />
                  <Text>
                    <span className="status-error">{error}</span>
                  </Text>
                </>
              )}

              <br />
              <Button type="submit">{submitting ? 'Joining...' : 'Accept Invite'}</Button>
            </form>
          ) : (
            <>
              <Text>
                <span className="status-error">{error || 'Invite link is invalid.'}</span>
              </Text>
              <br />
              <Divider />
              <br />
              <Button onClick={() => router.push('/login')}>Go to Login</Button>
            </>
          )}
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
