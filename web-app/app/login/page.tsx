'use client';

import '@root/global.scss';
import { useRouter } from 'next/navigation';
import { FormEvent } from 'react';

import DefaultLayout from '@components/page/DefaultLayout';
import Grid from '@components/Grid';
import Card from '@components/Card';
import Input from '@components/Input';
import Button from '@components/Button';
import Divider from '@components/Divider';
import Text from '@components/Text';

export default function LoginPage() {
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const password = formData.get('password');

    try {
      console.log('Attempting login...');
      console.log('Password attempt:', password);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: password?.toString() }),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        alert(data.error || 'Invalid password');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  }

  return (
    <DefaultLayout previewPixelSRC="https://intdev-global.s3.us-west-2.amazonaws.com/template-app-icon.png">
      <Grid>
        <Card title="LOGIN">
          <form onSubmit={handleSubmit}>
            <Input autoComplete="off" label="PASSWORD" placeholder="Enter admin password" type="password" name="password" required />
            <br />
            <Button type="submit">Sign In</Button>
            <br />
            <Divider />
            <br />
            <Text style={{ opacity: 0.7 }}>This is a protected area. Please enter the admin password to continue.</Text>
          </form>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
