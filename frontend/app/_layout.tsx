import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { Palette } from '@/constants/theme';
import { useStore } from '@/store/useStore';

// Force dark mode for the entire app
const NutriLensDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Palette.accent.green,
    background: Palette.bg.primary,
    card: Palette.bg.secondary,
    text: Palette.text.primary,
    border: Palette.border.subtle,
    notification: Palette.accent.orange,
  },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const token = useStore((state) => state.token);
  const loadStoredSession = useStore((state) => state.loadStoredSession);
  const [isLoaded, setIsLoaded] = useState(false);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadStoredSession().then(() => {
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!token && !inAuthGroup) {
      // Not logged in, redirect to auth
      router.replace('/auth');
    } else if (token && inAuthGroup) {
      // Logged in, redirect to main application
      router.replace('/(tabs)');
    }
  }, [token, isLoaded, segments]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' }}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <ThemeProvider value={NutriLensDarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
