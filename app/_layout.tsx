// app/_layout.tsx
import { Stack } from "expo-router"
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

export default function RootLayout() {
  useFrameworkReady();
  // While testing, start directly on /test-brain so you don’t need to navigate.
  // Later, you can switch this to "jason-chat" or remove initialRouteName.
  return <Stack initialRouteName="index" />;
}
