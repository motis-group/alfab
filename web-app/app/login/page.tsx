import '@root/global.scss';

import DefaultLayout from '@components/page/DefaultLayout';
import Grid from '@components/Grid';
import Card from '@components/Card';
import Input from '@components/Input';
import Button from '@components/Button';
import Checkbox from '@components/Checkbox';
import ActionListItem from '@components/ActionListItem';
import Divider from '@components/Divider';
import Text from '@components/Text';

export const dynamic = 'force-static';

export default async function LoginPage() {
  return (
    <DefaultLayout previewPixelSRC="https://intdev-global.s3.us-west-2.amazonaws.com/template-app-icon.png">
      <Grid>
        <Card title="LOGIN">
          <Input autoComplete="off" label="USERNAME" placeholder="Enter your username" name="username" />
          <Input autoComplete="off" label="PASSWORD" placeholder="Enter your password" type="password" name="password" />
          <br />
          <Checkbox name="remember">Remember me on this device</Checkbox>
          <br />
          <Button>Sign In</Button>
          <br />
          <Divider />
          <br />
          <Text style={{ opacity: 0.7 }}>Don't have an account?</Text>
          <ActionListItem icon={`⭢`} href="/signup">
            Create a new account
          </ActionListItem>
          <ActionListItem icon={`⭢`} href="/forgot-password">
            Forgot your password?
          </ActionListItem>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
