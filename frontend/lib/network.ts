import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

function extractHost(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/^https?:\/\//, '').replace(/^exp:\/\//, '').replace(/^exps:\/\//, '');
  const host = normalized.split('/')[0]?.split(':')[0];
  if (!host) return null;
  if (host.includes('expo.dev') || host.includes('exp.direct')) return null;
  return host;
}

function inferHostFromRuntime(): string | null {
  const sourceCodeUrl = NativeModules?.SourceCode?.scriptURL as string | undefined;
  const sourceCodeHost = extractHost(sourceCodeUrl);
  if (sourceCodeHost) return sourceCodeHost;

  const manifestDebuggerHost = (Constants as any)?.manifest?.debuggerHost as string | undefined;
  const manifest2DebuggerHost = (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost as string | undefined;
  const expoConfigHostUri = (Constants as any)?.expoConfig?.hostUri as string | undefined;

  return extractHost(manifestDebuggerHost) || extractHost(manifest2DebuggerHost) || extractHost(expoConfigHostUri);
}

export function resolveApiBaseUrl(): string {
  // 1. 優先讀取明確的環境變數
  const explicitUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (explicitUrl) return explicitUrl;

  // 2. 如果是 Web 平台，檢查是否在本地端開發
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000';
      }
    }
    // 非本地 Web 均預設指向部署在 Render 的雲端後端
    return 'https://nutrilens-backend-3uho.onrender.com';
  }

  // 3. 原生 App 平台 (iOS/Android)：開發模式下使用本機開發伺服器
  if (__DEV__) {
    const explicitHost = process.env.EXPO_PUBLIC_API_HOST?.trim();
    if (explicitHost) return `http://${explicitHost}:5000`;

    const runtimeHost = inferHostFromRuntime();
    if (runtimeHost && runtimeHost !== 'localhost') {
      return `http://${runtimeHost}:5000`;
    }

    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:5000';
    }
    return 'http://localhost:5000';
  }

  // 4. 生產/發佈模式預設指向 Render 的雲端後端
  return 'https://nutrilens-backend-3uho.onrender.com';
}
