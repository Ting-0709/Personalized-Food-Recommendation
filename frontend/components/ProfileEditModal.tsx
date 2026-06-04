import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, Typography, Spacing, Radius } from '@/constants/theme';
import { ACTIVITY_LEVELS, DIET_TYPE_OPTIONS } from '@/constants/mock-data';

export type EditField =
  | { type: 'number'; key: string; label: string; unit: string; value: number }
  | { type: 'gender'; value: 'male' | 'female' }
  | { type: 'activity'; value: string; multiplier: number }
  | { type: 'dietType'; value: string }
  | { type: 'text'; key: string; label: string; placeholder: string; value: string }
  | { type: 'goalNumber'; key: string; label: string; unit: string; value: number };

type Props = {
  field: EditField | null;
  onSave: (key: string, value: any, extra?: Record<string, any>) => void;
  onClose: () => void;
};

export default function ProfileEditModal({ field, onSave, onClose }: Props) {
  const [textValue, setTextValue] = useState('');

  React.useEffect(() => {
    if (!field) return;
    if (field.type === 'number' || field.type === 'goalNumber') setTextValue(String(field.value));
    if (field.type === 'text') setTextValue(field.value || '');
  }, [field]);

  if (!field) return null;

  // ── Gender picker ──
  if (field.type === 'gender') {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>選擇性別</Text>
            {(['male', 'female'] as const).map((g) => (
              <Pressable key={g} style={[s.option, field.value === g && s.optionActive]}
                onPress={() => { onSave('gender', g); onClose(); }}>
                <Ionicons name={g === 'male' ? 'male' : 'female'} size={20}
                  color={g === 'male' ? Palette.accent.blue : Palette.accent.pink} />
                <Text style={[s.optionText, field.value === g && s.optionTextActive]}>
                  {g === 'male' ? '男性' : '女性'}
                </Text>
                {field.value === g && <Ionicons name="checkmark-circle" size={20} color={Palette.accent.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    );
  }

  // ── Activity level picker ──
  if (field.type === 'activity') {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>選擇活動量</Text>
            <FlatList
              data={ACTIVITY_LEVELS}
              keyExtractor={(item) => item.label}
              renderItem={({ item }) => {
                const active = item.label === field.value;
                return (
                  <Pressable style={[s.option, active && s.optionActive]}
                    onPress={() => { onSave('activityLevel', item.label, { activityMultiplier: item.multiplier }); onClose(); }}>
                    <Text style={[s.optionText, active && s.optionTextActive]}>{item.label}</Text>
                    <Text style={s.optionSub}>×{item.multiplier}</Text>
                    {active && <Ionicons name="checkmark-circle" size={20} color={Palette.accent.green} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    );
  }

  // ── Diet type picker ──
  if (field.type === 'dietType') {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>選擇飲食型態</Text>
            {DIET_TYPE_OPTIONS.map((dt) => (
              <Pressable key={dt} style={[s.option, field.value === dt && s.optionActive]}
                onPress={() => { onSave('dietType', dt); onClose(); }}>
                <Text style={[s.optionText, field.value === dt && s.optionTextActive]}>{dt}</Text>
                {field.value === dt && <Ionicons name="checkmark-circle" size={20} color={Palette.accent.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    );
  }

  // ── Text input (preferences) ──
  if (field.type === 'text') {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
          <Pressable style={s.backdrop} onPress={onClose}>
            <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={s.sheetTitle}>編輯{field.label}</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, { textAlign: 'left', fontSize: 16 }]}
                  value={textValue}
                  onChangeText={setTextValue}
                  autoFocus
                  selectTextOnFocus
                  placeholder={field.placeholder}
                  placeholderTextColor={Palette.text.tertiary}
                />
              </View>
              <Pressable style={s.saveBtn} onPress={() => {
                onSave(field.key, textValue);
                onClose();
              }}>
                <Text style={s.saveBtnText}>確認</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ── Number input (body stats & goals) ──
  const label = field.type === 'number' ? field.label : field.label;
  const unit = field.type === 'number' ? field.unit : field.unit;
  const key = field.type === 'number' ? field.key : field.key;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>編輯{label}</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={textValue}
                onChangeText={setTextValue}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
                placeholderTextColor={Palette.text.tertiary}
              />
              <Text style={s.inputUnit}>{unit}</Text>
            </View>
            <Pressable style={s.saveBtn} onPress={() => {
              const num = parseFloat(textValue);
              if (!isNaN(num) && num > 0) { onSave(key, num); onClose(); }
            }}>
              <Text style={s.saveBtnText}>確認</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Palette.bg.secondary, borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    padding: Spacing['2xl'], paddingBottom: Spacing['5xl'], maxHeight: '60%',
  },
  sheetTitle: {
    ...Typography.h2, color: Palette.text.primary, marginBottom: Spacing.xl, textAlign: 'center',
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.lg, borderRadius: Radius.lg, marginBottom: Spacing.sm,
    backgroundColor: Palette.bg.card, borderWidth: 1, borderColor: Palette.border.subtle,
  },
  optionActive: {
    borderColor: Palette.accent.green + '60', backgroundColor: Palette.accent.greenDim,
  },
  optionText: { ...Typography.body, color: Palette.text.secondary, flex: 1 },
  optionTextActive: { color: Palette.text.primary, fontWeight: '600' },
  optionSub: { ...Typography.caption, color: Palette.text.tertiary },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl,
  },
  input: {
    flex: 1, ...Typography.h1, color: Palette.text.primary,
    backgroundColor: Palette.bg.card, borderRadius: Radius.lg,
    padding: Spacing.lg, borderWidth: 1, borderColor: Palette.border.medium,
    textAlign: 'center',
  },
  inputUnit: { ...Typography.body, color: Palette.text.tertiary, minWidth: 40 },
  saveBtn: {
    backgroundColor: Palette.accent.green, borderRadius: Radius.lg,
    padding: Spacing.lg, alignItems: 'center',
  },
  saveBtnText: { ...Typography.bodyBold, color: Palette.text.inverse },
});
