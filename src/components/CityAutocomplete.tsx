import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Colors } from '../constants';
import { CityOption, loadBrazilCities, searchBrazilCities } from '../services/locations';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (city: CityOption) => void;
}

export default function CityAutocomplete({ value, onChangeText, onSelect }: Props) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [suggestions, setSuggestions] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    if (value.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setLoadError(false);
    loadBrazilCities()
      .then((items) => {
        if (!active) return;
        setCities(items);
        setSuggestions(searchBrazilCities(items, value));
      })
      .catch(() => {
        if (active) {
          setSuggestions([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [value]);

  useEffect(() => {
    if (cities.length > 0) setSuggestions(searchBrazilCities(cities, value));
  }, [cities, value]);

  const showSuggestions = focused && value.trim().length >= 2 && (loading || suggestions.length > 0 || loadError);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Cidade de atuação</Text>
      <View style={styles.inputRow}>
        <View style={styles.icon}><MapPin size={18} color="#999" /></View>
        <TextInput
          accessibilityLabel="Cidade de atuação"
          autoCapitalize="words"
          autoCorrect={false}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder="Digite a cidade..."
          placeholderTextColor="#B0B0B0"
          style={styles.input}
          value={value}
        />
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>
      <View style={styles.line} />
      {showSuggestions && (
        <View style={styles.suggestions}>
          {suggestions.map((city) => (
            <TouchableOpacity
              key={city.id}
              activeOpacity={0.75}
              onPress={() => {
                onSelect(city);
                setSuggestions([]);
                setFocused(false);
              }}
              style={styles.suggestion}
            >
              <MapPin size={15} color={Colors.primary} />
              <Text style={styles.cityName}>{city.name}</Text>
              <Text style={styles.state}>{city.state}</Text>
            </TouchableOpacity>
          ))}
          {!loading && suggestions.length === 0 && (
            <Text style={styles.empty}>{loadError ? 'Não foi possível carregar as cidades. Você pode digitar manualmente.' : 'Nenhuma cidade encontrada.'}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20, zIndex: 5 },
  label: { color: '#888888', fontFamily: 'Poppins_500Medium', fontSize: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42 },
  icon: { width: 30, alignItems: 'flex-start' },
  input: { flex: 1, color: '#1A1A1A', fontFamily: 'Poppins_400Regular', fontSize: 15, paddingVertical: 8 },
  line: { height: 1, backgroundColor: '#E0E0E0' },
  suggestions: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cityName: { flex: 1, color: '#1A1A1A', fontFamily: 'Poppins_500Medium', fontSize: 14 },
  state: { color: Colors.textMuted, fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  empty: { color: Colors.textMuted, fontFamily: 'Poppins_400Regular', fontSize: 12, padding: 12 },
});
