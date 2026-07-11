import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface MapBridgeProps {
  location: { lat: number; lng: number };
  restaurants: Array<{
    restaurant_id: string;
    restaurant_name: string;
    restaurant_lat: number;
    restaurant_lng: number;
    distance_km: number;
  }>;
  onSelectRestaurant: (id: string) => void;
  selectedRestaurantId?: string | null;
}

export default function MapBridge({
  location,
  restaurants,
  onSelectRestaurant,
  selectedRestaurantId,
}: MapBridgeProps) {
  const mapContainerRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // 1. 動態加載 Leaflet CSS (如果不曾載入過)
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // 2. 動態加載 Leaflet JS (並回傳全域變數 L)
    const loadLeaflet = () => {
      return new Promise<any>((resolve, reject) => {
        if ((window as any).L) {
          resolve((window as any).L);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => resolve((window as any).L);
        script.onerror = () => reject(new Error('Leaflet load failed'));
        document.body.appendChild(script);
      });
    };

    loadLeaflet().then((L) => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      // 初始化 Leaflet 地圖實例
      const map = L.map(mapContainerRef.current).setView([location.lat, location.lng], 15);
      mapInstanceRef.current = map;

      // 載入符合本專案暗黑科技風格的 CartoDB Dark Matter 深色圖資
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CARTO',
      }).addTo(map);

      // 設定我的位置發光綠色標記
      const myLocationIcon = L.divIcon({
        className: 'custom-my-location',
        html: `<div style="background-color: #10B981; width: 14px; height: 14px; border-radius: 7px; border: 2px solid #fff; box-shadow: 0 0 10px #10B981; animation: map-pulse 2s infinite;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([location.lat, location.lng], { icon: myLocationIcon }).addTo(map).bindPopup('我的位置');

      // 注入動畫樣式
      if (!document.getElementById('leaflet-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'leaflet-custom-styles';
        style.innerHTML = `
          @keyframes map-pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
          .leaflet-bar { border: none !important; box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important; }
          .leaflet-bar a { background-color: #1E293B !important; color: #F8FAFC !important; border-bottom: 1px solid #334155 !important; }
          .leaflet-popup-content-wrapper { background-color: #1E293B !important; color: #F8FAFC !important; border-radius: 8px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important; }
          .leaflet-popup-tip { background-color: #1E293B !important; }
        `;
        document.head.appendChild(style);
      }
    });

    return () => {
      // 卸載時銷毀地圖實例防止記憶體洩漏
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [location.lat, location.lng]);

  // 連動與標記刷新
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    // 清除既有餐廳標記
    Object.values(markersRef.current).forEach((marker) => map.removeLayer(marker));
    markersRef.current = {};

    restaurants.forEach((r) => {
      const isActive = r.restaurant_id === selectedRestaurantId;

      const restIcon = L.divIcon({
        className: `rest-icon-${r.restaurant_id}`,
        html: `<div style="background-color: ${isActive ? '#22D3EE' : '#64748B'}; width: ${isActive ? '16px' : '12px'}; height: ${isActive ? '16px' : '12px'}; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 ${isActive ? '12px #22D3EE' : '4px rgba(0,0,0,0.4)'}; transition: all 0.2s ease-in-out;"></div>`,
        iconSize: isActive ? [16, 16] : [12, 12],
        iconAnchor: isActive ? [8, 8] : [6, 6],
      });

      const marker = L.marker([r.restaurant_lat, r.restaurant_lng], { icon: restIcon })
        .addTo(map)
        .bindPopup(`<b>${r.restaurant_name}</b><br/>距離 ${r.distance_km} km`);

      marker.on('click', () => {
        onSelectRestaurant(r.restaurant_id);
      });

      markersRef.current[r.restaurant_id] = marker;

      // 如果選中此餐廳，將地圖視角平移至此並開啟氣泡框
      if (isActive) {
        map.panTo([r.restaurant_lat, r.restaurant_lng]);
        marker.openPopup();
      }
    });
  }, [restaurants, selectedRestaurantId]);

  return <View ref={mapContainerRef} style={StyleSheet.absoluteFillObject} />;
}
