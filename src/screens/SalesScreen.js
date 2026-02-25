import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator, RefreshControl, SafeAreaView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; 
import { supabase } from '../lib/supabase';
import { Calendar } from 'react-native-calendars';

import SalesChart from '../components/SalesChart';

const COLORS = {
  primary: '#F5C842',       // Gold
  success: '#F5C842',       // Gold for success/positive values
  bg: '#0C0E1A',            // Dark navy background
  white: '#161929',         // Card background (slightly lighter dark)
  text: '#F5C842',          // Gold text
  subText: '#A89B6A',       // Muted gold
  border: '#2A2D3E',        // Dark border
  cardShadow: {
    shadowColor: "#F5C842",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  }
};

export default function SalesScreen() {
  // Dates
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectingType, setSelectingType] = useState('start');

  // Data
  const [sales, setSales] = useState([]);
  const [chartData, setChartData] = useState([0,0,0,0,0]); 
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [storeName, setStoreName] = useState(null);

  useFocusEffect(
    useCallback(() => { fetchUserAndStore(); }, [])
  );

  const fetchUserAndStore = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('store_name').eq('id', user.id).single();
      if (profile?.store_name) {
        setStoreName(profile.store_name);
        fetchSales(profile.store_name);
      }
    }
  };

  const fetchSales = async (specificStoreName) => {
    const targetStore = specificStoreName || storeName;
    if (!targetStore) return;

    if (!refreshing) setLoading(true);
    
    const startStr = `${startDate}T00:00:00`;
    const endStr = `${endDate}T23:59:59`;

    const { data, error } = await supabase
      .from('sales')
      .select(`id, total_amount, sale_date, store_name, sales_items (quantity, unit_price, products (name))`)
      .eq('store_name', targetStore)
      .gte('sale_date', startStr)
      .lte('sale_date', endStr)
      .order('sale_date', { ascending: false });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setSales(data || []);
      const total = (data || []).reduce((sum, item) => sum + (item.total_amount || 0), 0);
      setPeriodTotal(total);

      const reversedData = [...(data || [])].reverse();
      const amounts = reversedData.map(item => item.total_amount);
      setChartData(amounts.length > 0 ? amounts : [0, 0, 0, 0, 0]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => { setRefreshing(true); fetchSales(); };

  const openCalendar = (type) => {
    setSelectingType(type);
    setShowCalendar(true);
  };

  const onDayPress = (day) => {
    if (selectingType === 'start') {
      setStartDate(day.dateString);
      if (new Date(day.dateString) > new Date(endDate)) {
        setEndDate(day.dateString);
      }
      setSelectingType('end');
    } else {
      setEndDate(day.dateString);
      setShowCalendar(false);
    }
  };

  const renderItem = ({ item }) => {
    const dateObj = new Date(item.sale_date);
    const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const firstProduct = item.sales_items?.[0]?.products?.name || "Unknown Item";
    const productCount = item.sales_items?.reduce((sum, i) => sum + i.quantity, 0) || 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.iconBox}><Ionicons name="receipt" size={20} color={COLORS.primary} /></View>
          <View>
            <Text style={styles.itemTitle}>{firstProduct}</Text>
            <Text style={styles.itemSub}>{productCount} items • {timeString}</Text>
          </View>
        </View>
        <Text style={styles.priceText}>+₱{item.total_amount.toFixed(2)}</Text>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={{ marginBottom: 20 }}>
      {/* HERO CARD */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
           <View>
              <Text style={styles.heroLabel}>Total Revenue</Text>
              <Text style={styles.heroValue}>₱{periodTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
           </View>
           <View style={styles.trendBadge}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
              <Text style={styles.trendText}>{startDate} / {endDate}</Text>
           </View>
        </View>
        <View style={styles.chartWrapper}>
            <SalesChart data={chartData} />
        </View>
      </View>

      {/* DATE PICKERS */}
      <View style={styles.filterRow}>
        <TouchableOpacity onPress={() => openCalendar('start')} style={[styles.filterPill, selectingType === 'start' && showCalendar && styles.activePill]}>
          <Text style={styles.pillLabel}>From</Text>
          <Text style={styles.pillValue}>{startDate}</Text>
          <Ionicons name="chevron-down" size={14} color={COLORS.subText} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openCalendar('end')} style={[styles.filterPill, selectingType === 'end' && showCalendar && styles.activePill]}>
          <Text style={styles.pillLabel}>To</Text>
          <Text style={styles.pillValue}>{endDate}</Text>
          <Ionicons name="chevron-down" size={14} color={COLORS.subText} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Transaction History</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.screenTitle}>Sales Overview</Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList 
          data={sales} 
          renderItem={renderItem} 
          keyExtractor={item => item.id.toString()} 
          contentContainerStyle={styles.listContainer} 
          ListHeaderComponent={renderHeader}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="bar-chart-outline" size={48} color={COLORS.subText} />
              <Text style={styles.emptyText}>No sales found for this period.</Text>
            </View>
          }
        />
      )}

      {/* 🗓️ CALENDAR MODAL */}
      <Modal visible={showCalendar} animationType="fade" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCalendar(false)}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
               <Text style={styles.modalTitle}>Select {selectingType === 'start' ? 'Start' : 'End'} Date</Text>
               <TouchableOpacity onPress={() => setShowCalendar(false)}>
                 <Ionicons name="close-circle" size={28} color={COLORS.subText} />
               </TouchableOpacity>
            </View>
            
            <Calendar
              current={selectingType === 'start' ? startDate : endDate}
              onDayPress={onDayPress}
              markedDates={{
                [startDate]: {startingDay: true, color: COLORS.primary, textColor: '#0C0E1A'},
                [endDate]: {endingDay: true, color: COLORS.primary, textColor: '#0C0E1A'},
              }}
              markingType={'period'}
              theme={{
                calendarBackground: '#161929',
                dayTextColor: '#F5C842',
                textDisabledColor: '#3A3D4E',
                monthTextColor: '#F5C842',
                selectedDayBackgroundColor: '#F5C842',
                selectedDayTextColor: '#0C0E1A',
                todayTextColor: '#F5C842',
                todayBackgroundColor: '#2A2D3E',
                arrowColor: '#F5C842',
                textDayFontWeight: '600',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: '600',
                textDayHeaderColor: '#A89B6A',
                dotColor: '#F5C842',
              }}
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={() => setShowCalendar(false)}>
              <Text style={styles.confirmBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerContainer: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 10 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  listContainer: { paddingHorizontal: 20, paddingBottom: 100 },

  // HERO CARD
  heroCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2A2D3E', ...COLORS.cardShadow },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  heroLabel: { fontSize: 13, color: COLORS.subText, textTransform: 'uppercase', fontWeight: '600' },
  heroValue: { fontSize: 32, fontWeight: '800', color: COLORS.primary },
  trendBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1A0E', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 4, borderWidth: 1, borderColor: '#3A3010' },
  trendText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  chartWrapper: { marginTop: 10, alignItems: 'center' },

  // FILTERS
  filterRow: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  filterPill: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, gap: 8, borderWidth: 1, borderColor: '#2A2D3E' },
  activePill: { borderColor: COLORS.primary, borderWidth: 2 },
  pillLabel: { fontSize: 12, color: COLORS.subText },
  pillValue: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },

  // LIST ITEMS
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2A2D3E' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1E1A0E', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.subText },
  priceText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: COLORS.subText, marginTop: 10, fontSize: 14 },

  // CALENDAR MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  calendarModal: { backgroundColor: '#161929', width: '100%', maxWidth: 360, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#2A2D3E', ...COLORS.cardShadow },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  confirmBtn: { marginTop: 15, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#0C0E1A', fontWeight: 'bold', fontSize: 16 },
});