import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

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
}

export default function MapBridge({ location, restaurants, onSelectRestaurant }: MapBridgeProps) {
  return (
    <MapView
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: location.lat,
        longitude: location.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }}
    >
      {/* 我的位置 */}
      <Marker
        coordinate={{
          latitude: location.lat,
          longitude: location.lng,
        }}
        title="我的位置"
        pinColor="#06b6d4"
      />

      {/* 餐廳 */}
      {restaurants.map((r) => (
        <Marker
          key={r.restaurant_id}
          coordinate={{
            latitude: r.restaurant_lat,
            longitude: r.restaurant_lng,
          }}
          title={r.restaurant_name}
          description={`距離 ${r.distance_km} km`}
          onPress={() => onSelectRestaurant(r.restaurant_id)}
        />
      ))}
    </MapView>
  );
}
