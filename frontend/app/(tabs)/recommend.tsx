import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Palette, Typography, Spacing, Radius, Shadows } from '@/constants/theme';
import { useStore } from '@/store/useStore';
import { useResponsive } from '@/hooks/useResponsive';
import AppContainer from '@/components/AppContainer';
import {
  fetchHealthyFoodRecommendations,
  fetchRecommendations,
  saveRecord,
  type HealthyFoodResponse,
  type RecommendationItem,
  type RecommendationResponse,
  type HealthyFoodRecommendation,
} from '@/lib/api';

import MapBridge from '@/components/MapBridge';

const AlertWeb = Platform.OS === 'web'
  ? { alert: (title: string, message?: string) => alert(message ? `${title}\n\n${message}` : title) }
  : Alert;

function formatReason(item: RecommendationItem) {
  if (!item.reasons || item.reasons.length === 0) return '已由安全規則排除';
  return item.reasons.join('、');
}

export default function RecommendScreen() {
  const { rs, wp, isSmall } = useResponsive();
  const { user, apiBaseUrl, addMealFromScan } = useStore();
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [healthyData, setHealthyData] = useState<HealthyFoodResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthyLoading, setHealthyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthyError, setHealthyError] = useState<string | null>(null);
  const [budget, setBudget] = useState('300'); // 保留 budget 做相容性，但 UI 部分我們用 radius
  const [radius, setRadius] = useState('1.0');
  const [locationLabel, setLocationLabel] = useState('尚未取得定位');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  // 雷達掃描動畫相關
  const [radarScanning, setRadarScanning] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRecommendations(apiBaseUrl, user.userId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, user.userId]);

  // 雷達旋轉動畫
  useEffect(() => {
    if (radarScanning) {
      rotateAnim.setValue(0);
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        })
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      ).start();
    } else {
      rotateAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [radarScanning]);

  const recommended = data?.recommended || [];
  const filteredOut = data?.filtered_out || [];
  const totalFiltered = data?.total_filtered ?? filteredOut.length;
  const sourceCounts = data?.source_counts;
  const preferenceProfile = data?.preference_profile;
  const remaining = data?.remaining_calories ?? user.dailyCalorieTarget;

  const handleHealthyFoodSearch = async (overrideRadius?: string) => {
    setHealthyLoading(true);
    setHealthyError(null);
    setRadarScanning(true);
    
    let lat = 25.0338;
    let lng = 121.5645;
    let isMock = false;

    try {
      if (Platform.OS === 'web') {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.granted) {
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
            setLocationLabel(`目前定位：${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          } else {
            isMock = true;
            setLocationLabel('已啟用模擬定位 (台北信義區)');
          }
        } catch {
          isMock = true;
          setLocationLabel('已啟用模擬定位 (台北信義區)');
        }
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          isMock = true;
          setLocationLabel('權限不足，已啟用模擬定位 (台北信義區)');
        } else {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
          setLocationLabel(`目前定位：${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      }
    } catch (e) {
      isMock = true;
      setLocationLabel('定位異常，已啟用模擬定位 (台北信義區)');
    }

    try {
      const activeRadius = Number(overrideRadius ?? radius) || 1.0;
      const result = await fetchHealthyFoodRecommendations(apiBaseUrl, user.userId, {
        radius: activeRadius,
        lat,
        lng,
      });

      // 延遲 1.2 秒讓雷達掃描動畫有流暢的科幻效果
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setHealthyData(result);
      if (result.recommended && result.recommended.length > 0) {
        setSelectedRestaurantId(result.recommended[0].restaurant_id);
      } else {
        setSelectedRestaurantId(null);
      }
    } catch (err: any) {
      setHealthyError(err?.message || '無法取得健康餐點推薦');
    } finally {
      setHealthyLoading(false);
      setRadarScanning(false);
    }
  };

  // 當使用者切換到美食地圖且還沒有資料時，自動搜尋
  useEffect(() => {
    if (viewMode === 'map' && !healthyData && !healthyLoading) {
      handleHealthyFoodSearch();
    }
  }, [viewMode]);

  // 儲存餐點到飲食紀錄的通用方法
  const handleAddMeal = async (
    name: string,
    calories: number,
    protein: number,
    carbs: number,
    fat: number,
    sodium: number,
    sourceTag: string
  ) => {
    try {
      const foodItem = {
        id: `rec_${Date.now()}`,
        foodName: name,
        confidence: 100,
        source: sourceTag,
        needsConfirmation: false,
        estimatedWeight: 100,
        nutrition: { calories, protein, carbs, fat, sodium, fiber: 0 },
        gi: 'medium' as const,
        allergens: [],
        warnings: [],
      };

      // 1. 同步寫入後端資料庫
      await saveRecord({
        apiBaseUrl,
        userId: user.userId,
        foods: [foodItem],
        source: 'manual',
      });

      // 2. 同步更新前端本地 Store 的 dashboard 進度條
      addMealFromScan([foodItem]);

      AlertWeb.alert('儲存成功', `已將「${name}」成功加入你今日的飲食紀錄！`);
    } catch (e: any) {
      AlertWeb.alert('儲存失敗', e?.message || '無法儲存紀錄');
    }
  };

  // 將美食列表依餐廳進行分組
  const restaurantsMap: Record<string, {
    restaurant_id: string;
    restaurant_name: string;
    restaurant_lat: number;
    restaurant_lng: number;
    distance_km: number;
    tags: string[];
    items: HealthyFoodRecommendation[];
  }> = {};

  healthyData?.recommended?.forEach((item) => {
    const rId = item.restaurant_id;
    const latVal = item.restaurant_lat ?? 25.0338;
    const lngVal = item.restaurant_lng ?? 121.5645;
    if (!restaurantsMap[rId]) {
      restaurantsMap[rId] = {
        restaurant_id: rId,
        restaurant_name: item.restaurant_name,
        restaurant_lat: latVal,
        restaurant_lng: lngVal,
        distance_km: item.distance_km,
        tags: item.tags,
        items: [],
      };
    }
    restaurantsMap[rId].items.push(item);
  });

  const restaurantsList = Object.values(restaurantsMap);
  const activeRestaurant = selectedRestaurantId ? restaurantsMap[selectedRestaurantId] : null;

  // 雷達旋轉差值
  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <AppContainer>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: rs(isSmall ? 22 : 26) }]}>智慧推薦</Text>
        <Text style={[styles.subtitle, { fontSize: rs(13) }]}>基於個人健康條件與今日剩餘熱量，由 Gemini 精準分析推薦</Text>
      </View>

      {/* 雙模式切換開關 */}
      <View style={styles.tabContainer}>
        <Pressable
          onPress={() => setViewMode('list')}
          style={[styles.tabButton, viewMode === 'list' && styles.tabActiveButton]}
        >
          <Ionicons name="list" size={rs(16)} color={viewMode === 'list' ? Palette.text.inverse : Palette.text.secondary} />
          <Text style={[styles.tabButtonText, { fontSize: rs(12) }, viewMode === 'list' && styles.tabActiveButtonText]}>日常推薦</Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode('map')}
          style={[styles.tabButton, viewMode === 'map' && styles.tabActiveButton]}
        >
          <Ionicons name="map" size={rs(16)} color={viewMode === 'map' ? Palette.text.inverse : Palette.text.secondary} />
          <Text style={[styles.tabButtonText, { fontSize: rs(12) }, viewMode === 'map' && styles.tabActiveButtonText]}>美食地圖</Text>
        </Pressable>
      </View>

      {viewMode === 'list' ? (
        // ======= 清單推薦模式 =======
        <>
          {loading ? (
            <View style={[styles.emptyCard, { padding: rs(24) }]}>
              <ActivityIndicator size="large" color={Palette.accent.cyan} />
              <Text style={[styles.emptyText, { fontSize: rs(13) }]}>讀取推薦中...</Text>
            </View>
          ) : error ? (
            <View style={[styles.emptyCard, { padding: rs(24) }]}>
              <Ionicons name="cloud-offline-outline" size={rs(30)} color={Palette.status.warning} />
              <Text style={[styles.emptyText, { fontSize: rs(13) }]}>無法載入推薦資料：{error}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.summaryCard, { padding: rs(16) }]}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { fontSize: rs(10) }]}>剩餘熱量</Text>
                    <Text style={[styles.summaryValue, { fontSize: rs(18), color: Palette.accent.green }]}>{remaining} kcal</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { fontSize: rs(10) }]}>健康狀況</Text>
                    <View style={styles.conditionTags}>
                      {user.healthConditions.length > 0 ? (
                        user.healthConditions.map((c) => (
                          <View key={c} style={styles.conditionTag}>
                            <Text style={[styles.conditionTagText, { fontSize: rs(10) }]}>{c}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={[styles.noCondText, { fontSize: rs(11) }]}>無設定</Text>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.filterNotice}>
                  <Ionicons name="shield-checkmark" size={rs(14)} color={Palette.accent.green} />
                  <Text style={[styles.filterNoticeText, { fontSize: rs(11) }]}>Gemini 已自動排除不適合的餐點</Text>
                </View>
              </View>

              {preferenceProfile && preferenceProfile.food_count > 0 ? (
                <View style={[styles.sourceCard, { padding: rs(12), borderColor: 'rgba(244,114,182,0.22)' }]}>
                  <Ionicons name="sparkles-outline" size={rs(14)} color={Palette.accent.pink} />
                  <Text style={[styles.sourceText, { fontSize: rs(11) }]}>已參考你近期偏好與習慣進行客製化精準推薦</Text>
                </View>
              ) : null}

              <View style={styles.recHeader}>
                <Text style={[styles.sectionTitle, { fontSize: rs(16) }]}>為你推薦</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="sparkles" size={rs(12)} color={Palette.accent.pink} />
                  <Text style={[styles.recSort, { fontSize: rs(10) }]}>由 Gemini 綜合排序</Text>
                </View>
              </View>

              {recommended.length === 0 ? (
                <View style={[styles.emptyCard, { padding: rs(24) }]}>
                  <Ionicons name="restaurant-outline" size={rs(30)} color={Palette.text.tertiary} />
                  <Text style={[styles.emptyText, { fontSize: rs(13) }]}>目前找不到符合條件的推薦，請先調整個人條件。</Text>
                </View>
              ) : (
                recommended.map((meal, index) => (
                  <View key={`${meal.label}_${index}`} style={[styles.mealCard, { padding: rs(16) }]}>
                    <View style={styles.mealTop}>
                      <View style={[styles.mealEmoji, { width: rs(40), height: rs(40), borderRadius: rs(12) }]}>
                        <Text style={{ fontSize: rs(18) }}>🍽️</Text>
                      </View>
                      <View style={styles.mealInfo}>
                        <Text style={[styles.mealName, { fontSize: rs(15) }]}>{meal.name_zh}</Text>
                        <View style={styles.mealMeta}>
                          <Ionicons name="shield-checkmark-outline" size={rs(10)} color={Palette.text.tertiary} />
                          <Text style={[styles.mealMetaText, { fontSize: rs(10) }]}>{meal.source}</Text>
                          {meal.gi ? <Text style={[styles.mealMetaText, { fontSize: rs(10) }]}>GI {meal.gi === 'low' ? '低' : meal.gi === 'medium' ? '中' : '高'}</Text> : null}
                        </View>
                      </View>
                      <View style={styles.scoreContainer}>
                        <Text style={[styles.scoreValue, { fontSize: rs(20), color: Palette.accent.pink }]}>{meal.match_score}</Text>
                        <Text style={[styles.scoreLabel, { fontSize: rs(9) }]}>契合</Text>
                      </View>
                    </View>

                    <View style={styles.badgesRow}>
                      {(meal.safety_badges || []).map((badge) => (
                        <View key={badge} style={styles.safetyBadge}>
                          <Ionicons name="checkmark-circle" size={rs(10)} color={Palette.accent.green} />
                          <Text style={[styles.safetyBadgeText, { fontSize: rs(10) }]}>{badge}</Text>
                        </View>
                      ))}
                    </View>

                    {(meal.preference_reasons || []).length > 0 ? (
                      <View style={styles.preferenceReasonWrap}>
                        {(meal.preference_reasons || []).map((reason) => (
                          <Text key={reason} style={[styles.preferenceReasonText, { fontSize: rs(10) }]}>• {reason}</Text>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.mealNutritionRow}>
                      {[
                        { label: '熱量', value: `${meal.calories} kcal`, color: Palette.accent.green },
                        { label: '蛋白質', value: `${meal.protein} g`, color: Palette.accent.blue },
                        { label: '碳水', value: `${meal.carbs} g`, color: Palette.accent.orange },
                        { label: '鈉', value: `${meal.sodium} mg`, color: Palette.accent.pink },
                      ].map((n) => (
                        <View key={n.label} style={styles.mealNutritionItem}>
                          <Text style={[styles.mealNutritionLabel, { fontSize: rs(9) }]}>{n.label}</Text>
                          <Text style={[styles.mealNutritionValue, { fontSize: rs(12), color: n.color }]}>{n.value}</Text>
                        </View>
                      ))}
                    </View>

                    {/* 直接加入飲食紀錄按鈕 */}
                    <Pressable
                      onPress={() =>
                        handleAddMeal(
                          meal.name_zh,
                          meal.calories,
                          meal.protein,
                          meal.carbs,
                          meal.fat,
                          meal.sodium,
                          'Gemini 智慧推薦'
                        )
                      }
                      style={styles.addRecordButton}
                    >
                      <Ionicons name="add-circle-outline" size={rs(14)} color={Palette.text.inverse} />
                      <Text style={[styles.addRecordButtonText, { fontSize: rs(12) }]}>加入今日紀錄</Text>
                    </Pressable>
                  </View>
                ))
              )}

              {/* AI 排除的品項類別 */}
              {filteredOut.length > 0 && (
                <View style={[styles.filteredCard, { padding: rs(16), marginTop: Spacing.xl }]}>
                  <View style={styles.filteredHeader}>
                    <Ionicons name="warning-outline" size={rs(16)} color={Palette.status.error} />
                    <Text style={[styles.filteredTitle, { fontSize: rs(14) }]}>AI 已為您篩選並排除以下類型：</Text>
                  </View>
                  {filteredOut.map((fItem: any, fIdx: number) => (
                    <View key={fIdx} style={{ marginBottom: rs(10), opacity: 0.85 }}>
                      <Text style={{ fontSize: rs(13), fontWeight: 'bold', color: Palette.text.primary }}>
                        • {fItem.category || fItem.item_name}
                      </Text>
                      <Text style={[styles.filteredReason, { fontSize: rs(11), marginLeft: rs(10), marginTop: 2 }]}>
                        原因：{fItem.reason || fItem.reasons?.join('、') || '營養素契合度低'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </>
      ) : (
        // ======= 美食地圖模式 =======
        <>
          <View style={[styles.summaryCard, { padding: rs(16) }]}>
            <View style={styles.filteredHeader}>
              <Ionicons name="navigate" size={rs(16)} color={Palette.accent.cyan} />
              <Text style={[styles.filteredTitle, { fontSize: rs(13), color: Palette.accent.cyan }]}>搜尋附近健康餐點</Text>
            </View>
            <Text style={[styles.filteredReason, { fontSize: rs(11), marginBottom: rs(12) }]}>
              將依你的 GPS 定位，由 Gemini 針對附近特色店家的健康菜單做個人化分析與推薦。
            </Text>
            
            <View style={styles.quickBudgetContainer}>
              {[
                { label: '近鄰 500m', value: '0.5' },
                { label: '捷運 1km', value: '1.0' },
                { label: '單車 2km', value: '2.0' },
                { label: '車程 5km', value: '5.0' }
              ].map((opt) => {
                const isActive = radius === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setRadius(opt.value);
                      handleHealthyFoodSearch(opt.value);
                    }}
                    style={[
                      styles.quickBudgetBadge,
                      isActive && styles.quickBudgetBadgeActive
                    ]}
                  >
                    <Text style={[
                      styles.quickBudgetText,
                      isActive && styles.quickBudgetTextActive,
                      { fontSize: rs(11) }
                    ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.budgetRow}>
              <TextInput
                value={radius}
                onChangeText={setRadius}
                keyboardType="numeric"
                placeholder="輸入搜尋半徑 (km)"
                placeholderTextColor={Palette.text.tertiary}
                style={[styles.budgetInput, { fontSize: rs(13) }]}
              />
              <Text style={{ color: Palette.text.secondary, marginRight: 8, fontSize: rs(13), fontWeight: 'bold' }}>km</Text>
              <Pressable onPress={() => handleHealthyFoodSearch()} style={styles.locateButton}>
                {healthyLoading ? (
                  <ActivityIndicator size="small" color={Palette.text.inverse} />
                ) : (
                  <Text style={[styles.locateButtonText, { fontSize: rs(12) }]}>重新搜尋</Text>
                )}
              </Pressable>
            </View>
            <Text style={[styles.filteredReason, { fontSize: rs(10), marginTop: 8 }]}>{locationLabel}</Text>
            {healthyError ? (
              <Text style={[styles.filteredReason, { fontSize: rs(10), color: Palette.status.warning, marginTop: 6 }]}>
                {healthyError}
              </Text>
            ) : null}
          </View>

          {/* 雷達掃描中動畫 */}
          {radarScanning && (
            <View style={styles.radarContainer}>
              <Animated.View style={[styles.radarOuterRing, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.radarInnerRing}>
                  <Animated.View
                    style={[
                      styles.radarSweep,
                      {
                        transform: [{ rotate: spin }],
                      },
                    ]}
                  />
                  <View style={styles.radarCenterDot} />
                </View>
              </Animated.View>
              <Text style={styles.radarScanText}>正在掃描周邊 1km 的健康店家...</Text>
            </View>
          )}

          {!radarScanning && healthyData?.recommended?.length ? (
            <>
              {/* 地圖渲染區塊 (跨平台 MapBridge 支援：iOS/Android 使用 react-native-maps，Web 使用 Leaflet 開源互動地圖) */}
              <View style={styles.mapFrame}>
                <MapBridge
                  location={healthyData.location}
                  restaurants={restaurantsList}
                  onSelectRestaurant={setSelectedRestaurantId}
                  selectedRestaurantId={selectedRestaurantId}
                />
              </View>

              {/* 選中店家的推薦餐點 */}
              {activeRestaurant && (
                <View style={styles.restaurantDetailCard}>
                  <View style={styles.restaurantTitleRow}>
                    <View>
                      <Text style={[styles.restaurantName, { fontSize: rs(16) }]}>
                        {activeRestaurant.restaurant_name}
                      </Text>
                      <View style={styles.restaurantMeta}>
                        <Ionicons name="location-outline" size={12} color={Palette.text.tertiary} />
                        <Text style={[styles.restaurantMetaText, { fontSize: rs(11) }]}>
                          距離 {activeRestaurant.distance_km} km
                        </Text>
                        <Text style={styles.metaDivider}>|</Text>
                        <Text style={[styles.restaurantMetaText, { fontSize: rs(11) }]}>
                          {activeRestaurant.tags.join(' · ')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.activeSectionTitle, { fontSize: rs(13) }]}>Gemini 在該店推薦的餐點：</Text>

                  {activeRestaurant.items.map((item, index) => (
                    <View key={index} style={[styles.healthyItemRow, { padding: rs(12) }]}>
                      <View style={styles.healthyItemHeader}>
                        <Text style={[styles.healthyItemName, { fontSize: rs(14) }]}>{item.item_name}</Text>
                        <Text style={[styles.healthyItemPrice, { fontSize: rs(14), color: Palette.accent.cyan }]}>
                          ${item.price} 元
                        </Text>
                      </View>

                      {/* 契合分數與標籤 */}
                      <View style={styles.healthyScoreRow}>
                        <View style={styles.safetyBadge}>
                          <Ionicons name="sparkles" size={10} color={Palette.accent.green} />
                          <Text style={[styles.safetyBadgeText, { fontSize: rs(10) }]}>
                            契合度 {item.match_score}%
                          </Text>
                        </View>
                        {item.safety_badges?.map((badge) => (
                          <View key={badge} style={[styles.safetyBadge, { backgroundColor: 'rgba(6,182,212,0.08)' }]}>
                            <Text style={[styles.safetyBadgeText, { fontSize: rs(10), color: Palette.accent.cyan }]}>
                              {badge}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* 推薦原因 */}
                      <View style={styles.reasonsList}>
                        {item.reasons.map((r, rIdx) => (
                          <Text key={rIdx} style={[styles.reasonItemText, { fontSize: rs(11) }]}>
                            • {r}
                          </Text>
                        ))}
                      </View>

                      {/* 營養明細 */}
                      <View style={styles.menuNutritionGrid}>
                        <Text style={[styles.nutritionCell, { fontSize: rs(11) }]}>熱量: {item.calories} kcal</Text>
                        <Text style={[styles.nutritionCell, { fontSize: rs(11) }]}>蛋: {item.protein} g</Text>
                        <Text style={[styles.nutritionCell, { fontSize: rs(11) }]}>碳水: {item.carbs} g</Text>
                        <Text style={[styles.nutritionCell, { fontSize: rs(11) }]}>鈉: {item.sodium} mg</Text>
                      </View>

                      {/* 直接加入飲食紀錄 */}
                      <Pressable
                        onPress={() =>
                          handleAddMeal(
                            item.item_name,
                            item.calories,
                            item.protein,
                            item.carbs,
                            item.fat,
                            item.sodium,
                            activeRestaurant.restaurant_name
                          )
                        }
                        style={[styles.addRecordButton, { backgroundColor: Palette.accent.cyan }]}
                      >
                        <Ionicons name="add" size={rs(14)} color={Palette.text.inverse} />
                        <Text style={[styles.addRecordButtonText, { fontSize: rs(12) }]}>加入今日紀錄</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            !radarScanning && (
              <View style={[styles.emptyCard, { padding: rs(24) }]}>
                <Ionicons name="map-outline" size={rs(30)} color={Palette.text.tertiary} />
                <Text style={[styles.emptyText, { fontSize: rs(13) }]}>設定搜尋範圍並按下「重新搜尋」以偵測附近美食</Text>
              </View>
            )
          )}
        </>
      )}
    </AppContainer>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  title: { ...Typography.h1, color: Palette.text.primary, marginBottom: Spacing.xs },
  subtitle: { ...Typography.body, color: Palette.text.tertiary, lineHeight: 22 },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Palette.bg.elevated,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  tabActiveButton: {
    backgroundColor: Palette.text.primary,
  },
  tabButtonText: {
    ...Typography.bodyBold,
    color: Palette.text.secondary,
  },
  tabActiveButtonText: {
    color: Palette.text.inverse,
  },

  emptyCard: {
    backgroundColor: Palette.bg.card,
    borderRadius: Radius.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.card,
  },
  emptyText: { ...Typography.body, color: Palette.text.tertiary, textAlign: 'center' },

  summaryCard: {
    backgroundColor: Palette.bg.card,
    borderRadius: Radius.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    ...Shadows.card,
  },
  summaryRow: { flexDirection: 'row', marginBottom: Spacing.md },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { ...Typography.small, color: Palette.text.tertiary, marginBottom: 4 },
  summaryValue: { ...Typography.h2 },
  summaryDivider: { width: 1, backgroundColor: Palette.border.subtle },
  conditionTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' },
  conditionTag: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  conditionTagText: { ...Typography.small, color: Palette.status.error },
  noCondText: { ...Typography.caption, color: Palette.text.tertiary },
  filterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Palette.border.subtle,
  },
  filterNoticeText: { ...Typography.caption, color: Palette.accent.green },

  filteredCard: {
    backgroundColor: Palette.bg.card,
    borderRadius: Radius.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.bg.card,
    borderRadius: Radius.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
  },
  sourceText: { ...Typography.caption, color: Palette.text.secondary, flex: 1 },
  filteredHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  filteredTitle: { ...Typography.bodyBold, color: Palette.status.error },
  filteredReason: { ...Typography.caption, color: Palette.text.tertiary },

  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sectionTitle: { ...Typography.h3, color: Palette.text.primary },
  recSort: { ...Typography.small, color: Palette.accent.pink },

  mealCard: {
    backgroundColor: Palette.bg.card,
    borderRadius: Radius.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    ...Shadows.card,
  },
  mealTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  mealEmoji: {
    backgroundColor: Palette.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  mealInfo: { flex: 1 },
  mealName: { ...Typography.bodyBold, color: Palette.text.primary, marginBottom: 4 },
  mealMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  mealMetaText: { ...Typography.small, color: Palette.text.tertiary },
  scoreContainer: { alignItems: 'center' },
  scoreValue: { ...Typography.h2, fontWeight: '800' },
  scoreLabel: { ...Typography.small, color: Palette.text.tertiary },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.accent.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  safetyBadgeText: { ...Typography.small, color: Palette.accent.green },
  preferenceReasonWrap: {
    backgroundColor: 'rgba(244,114,182,0.08)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: 2,
  },
  preferenceReasonText: { ...Typography.small, color: Palette.accent.pink },

  mealNutritionRow: {
    flexDirection: 'row',
    backgroundColor: Palette.bg.elevated,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  mealNutritionItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRightWidth: 1,
    borderRightColor: Palette.border.subtle,
  },
  mealNutritionLabel: { ...Typography.small, color: Palette.text.tertiary, marginBottom: 4 },
  mealNutritionValue: { ...Typography.bodyBold },

  addRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.text.primary,
    borderRadius: Radius.md,
    paddingVertical: 10,
    marginTop: Spacing.md,
  },
  addRecordButtonText: {
    ...Typography.bodyBold,
    color: Palette.text.inverse,
  },

  budgetRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  budgetInput: {
    flex: 1,
    backgroundColor: Palette.bg.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    color: Palette.text.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  locateButton: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.accent.cyan,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  locateButtonText: { ...Typography.bodyBold, color: Palette.text.inverse },

  // === 地圖模式特別樣式 ===
  mapFrame: {
    height: 280,
    backgroundColor: Palette.bg.elevated,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    marginBottom: Spacing.xl,
  },

  // === 科幻雷達掃描與 Web 模擬地圖 ===
  radarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 280,
    backgroundColor: Palette.bg.elevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    marginBottom: Spacing.xl,
    padding: Spacing.xl,
  },
  radarOuterRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: 'rgba(6,182,212,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarInnerRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  radarCenterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.accent.cyan,
    position: 'absolute',
    zIndex: 10,
    shadowColor: Palette.accent.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  radarSweep: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 55,
    borderLeftWidth: 2,
    borderLeftColor: Palette.accent.cyan,
    backgroundColor: 'rgba(6,182,212,0.06)',
  },
  radarScanText: {
    marginTop: Spacing.md,
    ...Typography.body,
    color: Palette.accent.cyan,
    textAlign: 'center',
  },

  webMapContainer: {
    flex: 1,
    backgroundColor: '#07161a', // 經典極客墨綠/黑色背光
    position: 'relative',
    overflow: 'hidden',
  },
  gridLines: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
    borderWidth: 0.5,
    borderColor: Palette.accent.cyan,
    // 透過重疊多個格線來創造網格效果
    borderStyle: 'dashed',
  },
  radarCircles: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle1: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: Palette.accent.cyan,
    opacity: 0.25,
    position: 'absolute',
  },
  circle2: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: Palette.accent.cyan,
    opacity: 0.15,
    position: 'absolute',
  },
  circle3: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: Palette.accent.cyan,
    opacity: 0.08,
    position: 'absolute',
  },
  radarWebSweep: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 250,
    height: 250,
    marginLeft: -125,
    marginTop: -125,
    borderRadius: 125,
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(6,182,212,0.6)',
    backgroundColor: 'rgba(6,182,212,0.03)',
  },
  userPulseDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -8,
    marginTop: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(6,182,212,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userCoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accent.cyan,
  },
  webMarker: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    transform: [{ translateX: -16 }, { translateY: -16 }],
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.4)',
  },
  webMarkerActive: {
    backgroundColor: Palette.accent.cyan,
    borderColor: Palette.text.inverse,
    shadowColor: Palette.accent.cyan,
    shadowRadius: 8,
    shadowOpacity: 0.6,
  },
  webMarkerCallout: {
    position: 'absolute',
    top: 36,
    backgroundColor: 'rgba(7,22,26,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 0.5,
    borderColor: 'rgba(6,182,212,0.3)',
    minWidth: 90,
    alignItems: 'center',
  },
  webMarkerText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#e2f5f8',
    textAlign: 'center',
  },

  // 餐廳詳細卡片
  restaurantDetailCard: {
    backgroundColor: Palette.bg.card,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
    ...Shadows.card,
    marginBottom: Spacing.xl,
  },
  restaurantTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border.subtle,
    marginBottom: Spacing.md,
  },
  restaurantName: {
    ...Typography.h2,
    color: Palette.text.primary,
    marginBottom: 4,
  },
  restaurantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  restaurantMetaText: {
    ...Typography.small,
    color: Palette.text.secondary,
  },
  metaDivider: {
    color: Palette.border.subtle,
    fontSize: 10,
  },
  activeSectionTitle: {
    ...Typography.bodyBold,
    color: Palette.text.secondary,
    marginBottom: Spacing.md,
  },
  healthyItemRow: {
    backgroundColor: Palette.bg.elevated,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    borderWidth: 0.5,
    borderColor: Palette.border.subtle,
  },
  healthyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  healthyItemName: {
    ...Typography.bodyBold,
    color: Palette.text.primary,
  },
  healthyItemPrice: {
    ...Typography.bodyBold,
  },
  healthyScoreRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  reasonsList: {
    marginBottom: Spacing.md,
    gap: 2,
  },
  reasonItemText: {
    ...Typography.small,
    color: Palette.text.secondary,
    lineHeight: 18,
  },
  menuNutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Palette.bg.card,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  nutritionCell: {
    color: Palette.text.secondary,
    fontWeight: '500',
  },
  quickBudgetContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  quickBudgetBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Palette.bg.elevated,
    borderWidth: 1,
    borderColor: Palette.border.subtle,
  },
  quickBudgetBadgeActive: {
    backgroundColor: Palette.accent.cyan,
    borderColor: Palette.accent.cyan,
  },
  quickBudgetText: {
    color: Palette.text.secondary,
    fontWeight: '600',
  },
  quickBudgetTextActive: {
    color: Palette.text.inverse,
  },
});
