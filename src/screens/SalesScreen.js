import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; 
import { supabase } from '../lib/supabase';

// --- THEME ---
const COLORS = {
  primary: '#0b074d',    
  success: '#1eb910',    
  bg: '#F9FAFB',         
  white: '#FFFFFF',
  text: '#111827',       
  subText: '#6B7280',    
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  }
};

const FONTS = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  bold: 'Poppins-Bold',
};

export default function SalesScreen() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date()); 

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [storeName, setStoreName] = useState(null);

  // --- 1. INITIAL LOAD & USER CHECK ---
  useFocusEffect(
    useCallback(() => {
      fetchUserAndStore();
    }, [])
  );

  const fetchUserAndStore = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Get Store Name from Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('store_name')
        .eq('id', user.id)
        .single();
      
      if (profile?.store_name) {
        setStoreName(profile.store_name);
        // Once we have the store name, fetch sales for THIS store
        fetchSales(profile.store_name);
      }
    }
  };

  // --- 2. FETCH SALES (Filtered by Store) ---
  const fetchSales = async (specificStoreName) => {
    // Use passed name or state name
    const targetStore = specificStoreName || storeName;
    if (!targetStore) return;

    if (!refreshing) setLoading(true);
    
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end = new Date(endDate); end.setHours(23,59,59,999);

    const { data, error } = await supabase
      .from('sales')
      .select(`
        id, total_amount, sale_date, store_name,
        sales_items (quantity, unit_price, products (name))
      `)
      .eq('store_name', targetStore) // <--- CRITICAL: Data Isolation
      .gte('sale_date', start.toISOString())
      .lte('sale_date', end.toISOString())
      .order('sale_date', { ascending: false });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setSales(data || []);
      const total = (data || []).reduce((sum, item) => sum + (item.total_amount || 0), 0);
      setPeriodTotal(total);
    }
    setLoading(false);
    setRefreshing(false);
  };

  // --- 3. REAL-TIME SUBSCRIPTION (Filtered) ---
  useEffect(() => {
    if (!storeName) return;

    const subscription = supabase
      .channel('public:sales')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        
        // ✅ SECURITY CHECK: Only refresh if the sale belongs to MY store
        if (payload.new.store_name === storeName) {
          console.log("New sale detected for my store. Refreshing...");
          fetchSales(storeName);
        } else {
           console.log("Ignored sale from another store:", payload.new.store_name);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [storeName, startDate, endDate]); // Re-subscribe if store or dates change

  const onRefresh = () => {
    setRefreshing(true);
    fetchSales();
  };

  // --- PRINTING LOGIC ---
  const handlePrintReceipt = async (item) => {
    try {
      const date = new Date(item.sale_date).toLocaleString();
      const sName = item.store_name ? item.store_name.toUpperCase() : "MY STORE";
      const itemsHtml = item.sales_items.map(sItem => `
        <div class="row">
          <span>${sItem.quantity}x ${sItem.products?.name || "Item"}</span>
          <span>P${(sItem.quantity * sItem.unit_price).toFixed(2)}</span>
        </div>
      `).join('');
      
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: 'Courier New', monospace; text-align: center; padding: 20px; }
              .header { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
              .line { border-bottom: 1px dashed #000; margin: 10px 0; }
              .row { display: flex; justify-content: space-between; margin: 5px 0; }
              .total { font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">${sName}</div>
            <div>OFFICIAL RECEIPT</div>
            <div class="line"></div>
            <div style="text-align:left;">Date: ${date}</div>
            <div style="text-align:left;">Ref #: ${item.id}</div>
            <div class="line"></div>
            ${itemsHtml}
            <div class="line"></div>
            <div class="row total"><span>TOTAL</span><span>P${item.total_amount.toFixed(2)}</span></div>
            <div style="margin-top:20px;">Thank you!</div>
          </body>
        </html>
      `;
      await Print.printAsync({ html });
    } catch (error) { Alert.alert("Printing Error", error.message); }
  };

  // --- DATE PICKER HANDLERS ---
  const onChangeAndroid = (event, selectedDate, type) => {
    if (type === 'start') setShowStartPicker(false);
    if (type === 'end') setShowEndPicker(false);
    if (event.type === 'set' && selectedDate) {
      if (type === 'start') { setStartDate(selectedDate); setEndDate(selectedDate); } 
      else { setEndDate(selectedDate); }
    }
  };

  const confirmIOSDate = (type) => {
    if (type === 'start') { setStartDate(tempDate); setEndDate(tempDate); setShowStartPicker(false); }
    else { setEndDate(tempDate); setShowEndPicker(false); }
  };

  // --- RENDER ITEMS ---
  const renderItem = ({ item }) => {
    const dateObj = new Date(item.sale_date);
    const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const productCount = item.sales_items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
    const firstProduct = item.sales_items?.[0]?.products?.name || "Unknown Item";
    const moreCount = item.sales_items?.length > 1 ? `+${item.sales_items.length - 1} more` : '';

    return (
      <TouchableOpacity style={styles.card} onPress={() => handlePrintReceipt(item)} activeOpacity={0.7}>
        <View style={styles.cardLeft}>
          <View style={styles.iconBox}>
            <Ionicons name="receipt-outline" size={20} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.itemTitle}>{firstProduct} {moreCount}</Text>
            <Text style={styles.itemSub}>{productCount} items • {timeString}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.priceText}>+ ₱{item.total_amount.toFixed(2)}</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.subText} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sales History</Text>
      </View>

      {/* REVENUE SUMMARY CARD */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Revenue</Text>
        <Text style={styles.summaryValue}>₱{periodTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        <View style={styles.dateBadge}>
          <Ionicons name="calendar-outline" size={12} color="white" />
          <Text style={styles.dateBadgeText}>{startDate.toLocaleDateString()}</Text>
        </View>
      </View>

      {/* DATE FILTERS */}
      <View style={styles.filterRow}>
        <TouchableOpacity onPress={() => { setTempDate(startDate); setShowStartPicker(true); }} style={styles.filterBtn}>
          <Text style={styles.filterLabel}>Date</Text>
          <View style={styles.filterValueBox}>
            <Text style={styles.filterValue}>{startDate.toLocaleDateString()}</Text>
            <Ionicons name="caret-down" size={12} color={COLORS.subText} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setTempDate(endDate); setShowEndPicker(true); }} style={styles.filterBtn}>
          <Text style={styles.filterLabel}>End (Optional)</Text>
          <View style={styles.filterValueBox}>
            <Text style={styles.filterValue}>{endDate.toLocaleDateString()}</Text>
            <Ionicons name="caret-down" size={12} color={COLORS.subText} />
          </View>
        </TouchableOpacity>
      </View>

      {/* PICKERS */}
      {Platform.OS === 'android' && showStartPicker && <DateTimePicker value={startDate} mode="date" display="default" onChange={(e, d) => onChangeAndroid(e, d, 'start')} />}
      {Platform.OS === 'android' && showEndPicker && <DateTimePicker value={endDate} mode="date" display="default" minimumDate={startDate} onChange={(e, d) => onChangeAndroid(e, d, 'end')} />}
      {Platform.OS === 'ios' && (
        <Modal transparent visible={showStartPicker || showEndPicker} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{showStartPicker ? "Select Date" : "Select End Date"}</Text>
              <DateTimePicker value={tempDate} mode="date" display="spinner" minimumDate={showEndPicker ? startDate : null} onChange={(e, d) => setTempDate(d || tempDate)} />
              <TouchableOpacity style={styles.modalBtn} onPress={() => confirmIOSDate(showStartPicker ? 'start' : 'end')}>
                <Text style={styles.modalBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* LIST */}
      <Text style={styles.listHeader}>Recent Transactions</Text>
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList 
          data={sales} 
          renderItem={renderItem} 
          keyExtractor={item => item.id.toString()} 
          contentContainerStyle={styles.list} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No sales recorded for this date.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: Platform.OS === 'android' ? 40 : 20 },
  header: { paddingHorizontal: 20, marginBottom: 15 },
  headerTitle: { fontSize: 28, fontFamily: FONTS.bold, color: COLORS.text },

  summaryCard: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 20, borderRadius: 20, padding: 20, marginBottom: 20,
    ...COLORS.cardShadow, shadowColor: COLORS.primary, shadowOpacity: 0.3,
  },
  summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontFamily: FONTS.medium, marginBottom: 5 },
  summaryValue: { color: COLORS.white, fontSize: 32, fontFamily: FONTS.bold },
  dateBadge: { 
    position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 
  },
  dateBadgeText: { color: 'white', fontSize: 12, fontFamily: FONTS.medium, marginLeft: 4 },

  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 15, marginBottom: 20 },
  filterBtn: { flex: 1 },
  filterLabel: { fontSize: 12, color: COLORS.subText, fontFamily: FONTS.medium, marginBottom: 4 },
  filterValueBox: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    backgroundColor: COLORS.white, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' 
  },
  filterValue: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.text },

  listHeader: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text, marginHorizontal: 20, marginBottom: 10 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, padding: 16, borderRadius: 16, marginBottom: 12, ...COLORS.cardShadow
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.text },
  itemSub: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.subText },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.success },

  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONTS.regular, color: COLORS.subText, marginTop: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', width: '80%', padding: 20, borderRadius: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontFamily: FONTS.bold, marginBottom: 15 },
  modalBtn: { marginTop: 20, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  modalBtnText: { color: 'white', fontFamily: FONTS.bold },
});