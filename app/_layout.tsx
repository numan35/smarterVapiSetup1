// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  // While testing, start directly on /test-brain so you don’t need to navigate.
  // Later, you can switch this to "jason-chat" or remove initialRouteName.
  return <Stack initialRouteName="test-brain" />;
}
