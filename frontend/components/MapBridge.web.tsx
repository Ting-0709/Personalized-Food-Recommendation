import React from 'react';

export default function MapBridge() {
  // Web 平台不載入 react-native-maps，以防止打包編譯錯誤。
  // Web 版的地圖推薦會在 recommend.tsx 中使用雷達掃描模擬器渲染。
  return null;
}
