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

export default function LoginPage() {
  const router = useRouter();

  const [nextPath, setNextPath] = useState('/');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    setNextPath(next || '/');
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const username = formData.get('username')?.toString() || '';
    const password = formData.get('password')?.toString() || '';

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to sign in.');
      }

      router.push(nextPath || '/');
      router.refresh();
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DefaultLayout previewPixelSRC="https://intdev-global.s3.us-west-2.amazonaws.com/template-app-icon.png">
      <Grid>
        <Card title="LOGIN">
          <form onSubmit={handleSubmit}>
            <Input autoComplete="username" label="USERNAME" placeholder="username" type="text" name="username" />
            <Input autoComplete="current-password" label="PASSWORD" placeholder="Enter your password" type="password" name="password" required />

            {error && (
              <>
                <br />
                <Text>
                  <span className="status-error">{error}</span>
                </Text>
              </>
            )}

            <br />
            <Button type="submit">{isSubmitting ? 'Signing In...' : 'Sign In'}</Button>
            <br />
            <Divider />
            <br />
            <Text style={{ opacity: 0.75 }}>Use your invited username/password. Superadmins can also sign in with the master admin password.</Text>
          </form>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
