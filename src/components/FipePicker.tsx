import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { ChevronDown, Search, X, Check } from 'lucide-react-native';
import { Colors, Radius } from '../constants';
import { fipeBrands, fipeModels, fipeYears, fipePrice, type FipeItem, type FipeResult } from '../services/fipe';

interface Props {
  onSelected: (r: FipeResult) => void;
}

type Level = 'brand' | 'model' | 'year';

export default function FipePicker({ onSelected }: Props) {
  const [open, setOpen] = useState<Level | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [brand, setBrand] = useState<FipeItem | null>(null);
  const [model, setModel] = useState<FipeItem | null>(null);
  const [year, setYear] = useState<FipeItem | null>(null);
  const [list, setList] = useState<FipeItem[]>([]);
  const [result, setResult] = useState<FipeResult | null>(null);

  const load = async (fn: () => Promise<FipeItem[]>) => {
    setLoading(true); setList([]);
    try { setList(await fn()); } catch { setList([]); } finally { setLoading(false); }
  };

  const openLevel = (lvl: Level) => {
    setSearch(''); setOpen(lvl);
    if (lvl === 'brand') load(fipeBrands);
    else if (lvl === 'model' && brand) load(() => fipeModels(brand.code));
    else if (lvl === 'year' && brand && model) load(() => fipeYears(brand.code, model.code));
  };

  const pick = async (item: FipeItem) => {
    if (open === 'brand') { setBrand(item); setModel(null); setYear(null); setResult(null); }
    else if (open === 'model') { setModel(item); setYear(null); setResult(null); }
    else if (open === 'year' && brand && model) {
      setYear(item); setOpen(null); setLoading(true);
      try {
        const r = await fipePrice(brand.code, model.code, item.code);
        setResult(r); onSelected(r);
      } catch { /* keep manual fallback */ } finally { setLoading(false); }
      return;
    }
    setOpen(null);
  };

  const filtered = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const Field = ({ lvl, label, value, disabled }: { lvl: Level; label: string; value?: string; disabled?: boolean }) => (
    <TouchableOpacity
      style={[styles.field, disabled && { opacity: 0.5 }]}
      onPress={() => !disabled && openLevel(lvl)}
      activeOpacity={0.8}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldValue, !value && { color: Colors.textMuted }]} numberOfLines={1}>
          {value || 'Selecionar'}
        </Text>
      </View>
      <ChevronDown size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: 10, marginBottom: 8 }}>
      <Field lvl="brand" label="Marca (FIPE)" value={brand?.name} />
      <Field lvl="model" label="Modelo" value={model?.name} disabled={!brand} />
      <Field lvl="year" label="Ano" value={year?.name} disabled={!model} />

      {result && (
        <View style={styles.result}>
          <Check size={16} color={Colors.success} />
          <Text style={styles.resultText}>
            Valor FIPE: R$ {result.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {result.code}
          </Text>
        </View>
      )}

      <Modal visible={open !== null} animationType="slide" transparent onRequestClose={() => setOpen(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>
                {open === 'brand' ? 'Marca' : open === 'model' ? 'Modelo' : 'Ano'}
              </Text>
              <TouchableOpacity onPress={() => setOpen(null)}><X size={22} color={Colors.textPrimary} /></TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
              <Search size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput} value={search} onChangeText={setSearch}
                placeholder="Buscar..." placeholderTextColor={Colors.textMuted} autoCorrect={false}
              />
            </View>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(i) => i.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.row} onPress={() => pick(item)} activeOpacity={0.7}>
                    <Text style={styles.rowText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.empty}>Nada encontrado</Text>}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border,
  },
  fieldLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: Colors.textMuted },
  fieldValue: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: Colors.textPrimary, marginTop: 2 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  resultText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary, flex: 1 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24, height: '75%',
  },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary },
  row: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowText: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 24, fontFamily: 'Poppins_400Regular' },
});
