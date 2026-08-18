import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { ChevronDown, Search, X, Check } from 'lucide-react-native';
import { Colors, Radius } from '../constants';
import { fipeBrands, fipeModels, fipeYears, fipePrice, getFipeYearInfo, type FipeItem, type FipeResult, type FipeKind } from '../services/fipe';

interface Props {
  onSelected: (r: FipeResult) => void;
  /** Which FIPE table to query — cars (default) or motorcycles. */
  kind?: FipeKind;
  /** Minimum configured calendar year; FIPE's 0-km entry is always allowed. */
  minYear?: number | null;
}

type Level = 'brand' | 'model' | 'year';

export default function FipePicker({ onSelected, kind = 'cars', minYear }: Props) {
  const [open, setOpen] = useState<Level | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [brand, setBrand] = useState<FipeItem | null>(null);
  const [model, setModel] = useState<FipeItem | null>(null);
  const [year, setYear] = useState<FipeItem | null>(null);
  const [list, setList] = useState<FipeItem[]>([]);
  const [result, setResult] = useState<FipeResult | null>(null);
  const requestId = useRef(0);

  const load = async (fn: () => Promise<FipeItem[]>) => {
    const currentRequest = ++requestId.current;
    setLoading(true); setList([]);
    try {
      const items = await fn();
      if (currentRequest === requestId.current) setList(items);
    } catch {
      if (currentRequest === requestId.current) setList([]);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  const openLevel = (lvl: Level) => {
    setSearch(''); setOpen(lvl);
    if (lvl === 'brand') load(() => fipeBrands(kind));
    else if (lvl === 'model' && brand) load(() => fipeModels(brand.code, kind));
    else if (lvl === 'year' && brand && model) load(() => fipeYears(brand.code, model.code, kind));
  };

  const pick = async (item: FipeItem) => {
    if (open === 'brand') { setBrand(item); setModel(null); setYear(null); setResult(null); }
    else if (open === 'model') { setModel(item); setYear(null); setResult(null); }
    else if (open === 'year' && brand && model) {
      setYear(item); setOpen(null); setLoading(true);
      try {
        const r = await fipePrice(brand.code, model.code, item.code, kind);
        setResult(r); onSelected(r);
      } catch { /* keep manual fallback */ } finally { setLoading(false); }
      return;
    }
    setOpen(null);
  };

  const filtered = list.filter((i) => {
    const displayName = open === 'year' ? getFipeYearInfo(i).label : i.name;
    const yearInfo = open === 'year' ? getFipeYearInfo(i) : null;
    const meetsConfiguredYear = !yearInfo || yearInfo.isZeroKm || !minYear || yearInfo.rawYear >= minYear;
    return meetsConfiguredYear && `${i.name} ${displayName}`.toLowerCase().includes(search.toLowerCase());
  });

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
    <View style={{ gap: 12, marginBottom: 12 }}>
      <Field lvl="brand" label="Marca (tabela FIPE)" value={brand?.name} />
      <Field lvl="model" label="Modelo" value={model?.name} disabled={!brand} />
      <Field lvl="year" label="Ano / situacao" value={year ? getFipeYearInfo(year).label : undefined} disabled={!model} />

      {result && (
        <View style={styles.result}>
          <Check size={16} color={Colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.resultText} numberOfLines={2}>
              {result.brand} {result.model} - {result.yearLabel}
            </Text>
            <Text style={styles.resultText}>
            Valor FIPE: R$ {result.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {result.code}
          </Text>
          </View>
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
            {open === 'year' && minYear && (
              <Text style={styles.ruleHint}>
                Exibindo anos a partir de {minYear}; a opção 0 km permanece disponível.
              </Text>
            )}
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(i) => i.code}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={filtered.length > 0 ? <Text style={styles.listHint}>{filtered.length} opções FIPE encontradas</Text> : null}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.row} onPress={() => pick(item)} activeOpacity={0.7}>
                    <Text style={styles.rowText}>
                      {open === 'year' ? getFipeYearInfo(item).label : item.name}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.empty}>
                  {open === 'year' && minYear
                    ? `Nenhum ano a partir de ${minYear} encontrado para este modelo.`
                    : 'Nada encontrado'}
                </Text>}
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  fieldLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888888' },
  fieldValue: { fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#1A1A1A', marginTop: 4 },
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
  listHint: { color: Colors.textMuted, fontFamily: 'Poppins_500Medium', fontSize: 11, paddingVertical: 4 },
  ruleHint: { color: Colors.textSecondary, fontFamily: 'Poppins_400Regular', fontSize: 12, marginBottom: 4 },
});
