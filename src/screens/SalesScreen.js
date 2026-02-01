import React, { useEffect, useState } from 'react';
import { 
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Platform, Modal, Button, ActivityIndicator, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print'; 
import { supabase } from '../lib/supabase';

const COLORS = {
  primary: '#10B981', 
  background: '#F3F4F6',
  card: '#FFFFFF',
  text: '#1F2937',
  subText: '#6B7280'
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

  // --- FETCH SALES ---
  const fetchSales = async () => {
    if (!refreshing) setLoading(true);
    
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const startISO = start.toISOString();

    const end = new Date(endDate);
    end.setHours(23,59,59,999);
    const endISO = end.toISOString();

    // ✅ FIX: Explicitly asking for 'store_name' from the database
    const { data, error } = await supabase
      .from('sales')
      .select(`
        id, total_amount, sale_date, store_name,
        sales_items (quantity, unit_price, products (name))
      `)
      .gte('sale_date', startISO)
      .lte('sale_date', endISO)
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

  useEffect(() => { fetchSales(); }, [startDate, endDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSales();
  };

  // --- PRINTING LOGIC ---
  const handlePrintReceipt = async (item) => {
    try {
      const date = new Date(item.sale_date).toLocaleString();
      
      // ✅ FIX: Use the downloaded store name. Fallback only if empty.
      const storeName = item.store_name ? item.store_name.toUpperCase() : "MY STORE POS";

      const itemsHtml = item.sales_items.map(sItem => `
        <div class="row">
          <span>${sItem.quantity}x ${sItem.products?.name || "Item"}</span>
          <span>P${(sItem.quantity * sItem.unit_price).toFixed(2)}</span>
        </div>
      `).join('');

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Courier New', monospace; text-align: center; padding: 20px; font-size: 14px; }
              .header { font-size: 22px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
              .sub { font-size: 12px; color: #555; margin-bottom: 15px; }
              .line { border-bottom: 1px dashed #000; margin: 10px 0; }
              .row { display: flex; justify-content: space-between; margin: 5px 0; }
              .total { font-size: 18px; font-weight: bold; margin-top: 10px; border-top: 2px solid #000; padding-top: 10px; }
              .footer { font-size: 12px; margin-top: 20px; color: #555; }
            </style>
          </head>
          <body>
            <div class="header">${storeName}</div>
            <div class="sub">OFFICIAL RECEIPT</div>
            <div class="line"></div>
            
            <div style="text-align:left;">Date: ${date}</div>
            <div style="text-align:left;">Ref #: ${item.id}</div>
            <div class="line"></div>

            ${itemsHtml}

            <div class="line"></div>
            <div class="row total">
              <span>TOTAL</span>
              <span>P${item.total_amount.toFixed(2)}</span>
            </div>
            
            <div class="footer">
              Thank you for your purchase!<br/>
              Please come again.
            </div>
          </body>
        </html>
      `;

      await Print.printAsync({ html });
      
    } catch (error) {
      Alert.alert("Printing Error", error.message);
    }
  };

  // --- RENDERERS ---
  const onChangeAndroid = (event, selectedDate, type) => {
    if (type === 'start') setShowStartPicker(false);
    if (type === 'end') setShowEndPicker(false);
    if (event.type === 'set' && selectedDate) {
      type === 'start' ? setStartDate(selectedDate) : setEndDate(selectedDate);
    }
  };

  const confirmIOSDate = (type) => {
    if (type === 'start') { setStartDate(tempDate); setShowStartPicker(false); }
    else { setEndDate(tempDate); setShowEndPicker(false); }
  };

  const renderItem = ({ item }) => {
    const firstItem = item.sales_items?.[0];
    const productName = firstItem?.products?.name || "Sale";
    const quantity = firstItem?.quantity || 1;
    const moreItems = item.sales_items?.length > 1 ? ` +${item.sales_items.length - 1} more` : '';

    return (
      <TouchableOpacity style={styles.card} onPress={() => handlePrintReceipt(item)}>
        <View style={styles.iconContainer}>
          <Ionicons name="print-outline" size={24} color={COLORS.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.productName}>{quantity}x {productName}{moreItems}</Text>
          <Text style={styles.date}>
            {new Date(item.sale_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.amount}>+ P{item.total_amount.toFixed(2)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Sales History</Text>
      <View style={styles.filterContainer}>
        <View style={styles.dateWrapper}>
          <Text style={styles.label}>From:</Text>
          <TouchableOpacity onPress={() => { setTempDate(startDate); setShowStartPicker(true); }} style={styles.dateButton}>
            <Text>{startDate.toLocaleDateString()}</Text>
            <Ionicons name="calendar" size={16} color="#555" />
          </TouchableOpacity>
        </View>
        <View style={styles.dateWrapper}>
          <Text style={styles.label}>To:</Text>
          <TouchableOpacity onPress={() => { setTempDate(endDate); setShowEndPicker(true); }} style={styles.dateButton}>
            <Text>{endDate.toLocaleDateString()}</Text>
            <Ionicons name="calendar" size={16} color="#555" />
          </TouchableOpacity>
        </View>
      </View>
      {Platform.OS === 'android' && showStartPicker && <DateTimePicker value={startDate} mode="date" display="default" onChange={(e, d) => onChangeAndroid(e, d, 'start')} />}
      {Platform.OS === 'android' && showEndPicker && <DateTimePicker value={endDate} mode="date" display="default" onChange={(e, d) => onChangeAndroid(e, d, 'end')} />}
      {Platform.OS === 'ios' && (
        <Modal transparent visible={showStartPicker || showEndPicker} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={(e, d) => setTempDate(d || tempDate)} />
              <View style={styles.modalButtons}>
                <Button title="Cancel" onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }} color="red" />
                <Button title="Confirm" onPress={() => confirmIOSDate(showStartPicker ? 'start' : 'end')} />
              </View>
            </View>
          </View>
        </Modal>
      )}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Revenue</Text>
        <Text style={styles.totalValue}>P{periodTotal.toFixed(2)}</Text>
      </View>
      <Text style={styles.sectionTitle}>Tap item to Print</Text>
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.primary} />
      ) : (
        <FlatList 
          data={sales} 
          renderItem={renderItem} 
          keyExtractor={item => item.id.toString()} 
          contentContainerStyle={styles.list} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={<Text style={{textAlign:'center', marginTop: 20, color: '#888'}}>No sales found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 50, paddingHorizontal: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  filterContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  dateWrapper: { flex: 1, marginHorizontal: 5 },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 5, color: '#555' },
  dateButton: { backgroundColor: '#fff', padding: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  totalCard: { backgroundColor: COLORS.primary, padding: 20, borderRadius: 15, alignItems: 'center', marginBottom: 20, elevation: 5 },
  totalLabel: { color: 'white', fontSize: 14, fontWeight: '600' },
  totalValue: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#555' },
  list: { paddingBottom: 20 },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center', elevation: 2 },
  iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  info: { flex: 1 },
  productName: { fontWeight: 'bold', fontSize: 16 },
  date: { color: '#888', fontSize: 12 },
  amount: { fontWeight: 'bold', color: COLORS.primary, fontSize: 16 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalContent: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }
});