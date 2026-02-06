import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, TextInput, StatusBar, 
  Dimensions, SafeAreaView, Platform, RefreshControl, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; 
import * as Haptics from 'expo-haptics'; // ⚡ NEW: Tactile feedback
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const isTablet = width >= 768; 

const COLORS = {
  primary: '#4F46E5',    
  secondary: '#1E1B4B',
  accent: '#F59E0B',     // Gold for goals
  success: '#10B981',    
  danger: '#EF4444',     
  dark: '#111827',       
  gray: '#9CA3AF',       
  light: '#F3F4F6',      
  white: '#FFFFFF',
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  }
};

export default function MerchantScreen({ user }) {
  // --- STATE ---
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  
  // UI State
  const [storeName, setStoreName] = useState("Loading...");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Performance Stats
  const [shiftSales, setShiftSales] = useState(0);
  const [shiftCount, setShiftCount] = useState(0);

  // --- DATA LOADING ---
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user])
  );

  const fetchData = async () => {
    try {
      if (refreshing) setLoading(true);
      if (!user || !user.id) return;

      // 1. FETCH PROFILE
      const { data: profile } = await supabase
        .from('profiles')
        .select('store_name, avatar_url') 
        .eq('id', user.id)
        .single();
      
      const currentStore = profile?.store_name || user.store_name || "My Store";
      setStoreName(currentStore);
      if (profile?.avatar_url) setAvatarUrl(`${profile.avatar_url}?t=${Date.now()}`);

      // 2. FETCH PRODUCTS
      if (currentStore) {
        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('store_name', currentStore)
          .order('name');
        setProducts(prodData || []);

        // 3. FETCH TODAY'S STATS (Gamification)
        const today = new Date().toISOString().split('T')[0];
        const { data: salesToday } = await supabase
          .from('sales')
          .select('total_amount')
          .eq('store_name', currentStore)
          .gte('sale_date', today); // Sales since midnight
        
        const total = (salesToday || []).reduce((sum, s) => sum + s.total_amount, 0);
        setShiftSales(total);
        setShiftCount(salesToday?.length || 0);
      }

    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // --- FILTERING LOGIC ---
  // Extract unique categories dynamically
  const categories = useMemo(() => {
    const cats = ['All'];
    // If you have a 'category' column, uncomment the next line:
    // products.forEach(p => { if(p.category && !cats.includes(p.category)) cats.push(p.category) });
    // For now, let's fake it if column is missing, or just stick to 'All'
    return cats; 
  }, [products]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // --- CART FUNCTIONS ---
  const addToCart = (product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // ⚡ Haptic click
    
    const currentStock = product.stock ?? 0;
    if (currentStock <= 0) return Alert.alert("Out of Stock", "Item unavailable.");
    
    const existing = cart.find(item => item.id === product.id);
    if (existing && existing.qty + 1 > currentStock) return Alert.alert("Low Stock", `Only ${currentStock} available.`);
    
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQty = (item, change) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.qty + change < 1) return removeFromCart(item.id);
    // Check stock limit
    if (change > 0 && item.qty + 1 > item.stock) return; 

    setCart(cart.map(p => p.id === item.id ? { ...p, qty: p.qty + change } : p));
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  // --- CHECKOUT ---
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // ⚡ Success vibration

    const total = parseFloat(calculateTotal());
    
    const { data: saleData, error } = await supabase
      .from('sales')
      .insert([{
        store_name: storeName,
        cashier_name: user?.first_name || "Merchant",
        total_amount: total,
        sale_date: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) { Alert.alert("Error", error.message); return; }
    
    const salesItemsData = cart.map(item => ({
      sale_id: saleData.id, product_id: item.id, quantity: item.qty, unit_price: item.price
    }));

    await supabase.from('sales_items').insert(salesItemsData);

    // Update Stock
    for (const item of cart) {
      await supabase.from('products').update({ stock: item.stock - item.qty }).eq('id', item.id);
    }

    setLastTransaction({ id: saleData.id.toString(), date: new Date().toLocaleString(), items: [...cart], total: total.toFixed(2) });
    
    // Update Shift Stats Locally (Instant Feedback)
    setShiftSales(prev => prev + total);
    setShiftCount(prev => prev + 1);

    setReceiptVisible(true);
    setCart([]); 
    setCartModalVisible(false);
    fetchData(); // Sync background
  };

  // --- PRINT ---
  const handlePrint = async () => {
    if (!lastTransaction) return;
    const itemsHtml = lastTransaction.items.map(item => `<div class="row"><span>${item.qty}x ${item.name}</span><span>P${(item.qty * item.price).toFixed(2)}</span></div>`).join('');
    const html = `<html><head><style>body{font-family:'Courier New';text-align:center;padding:20px}.header{font-size:22px;font-weight:bold;margin-bottom:5px}.line{border-bottom:1px dashed #000;margin:10px 0}.row{display:flex;justify-content:space-between;margin:5px 0}.total{font-size:18px;font-weight:bold;margin-top:10px;border-top:2px solid #000;padding-top:10px}</style></head><body><div class="header">${storeName}</div><div class="line"></div><div style="text-align:left">Date: ${lastTransaction.date}</div><div class="line"></div>${itemsHtml}<div class="line"></div><div class="row total"><span>TOTAL</span><span>P${lastTransaction.total}</span></div></body></html>`;
    await Print.printAsync({ html });
  };

  // --- RENDERERS ---
  const renderProduct = ({ item }) => {
    const isOutOfStock = (item.stock || 0) <= 0;
    return (
      <TouchableOpacity 
        style={[styles.productCard, isOutOfStock && styles.cardDisabled]} 
        onPress={() => addToCart(item)} 
        disabled={isOutOfStock}
        activeOpacity={0.7}
      >
        <View style={styles.imgWrapper}>
           {item.image_url ? 
             <Image source={{ uri: item.image_url }} style={styles.prodImage} resizeMode="cover" /> : 
             <View style={styles.placeholderImg}><Ionicons name="fast-food-outline" size={30} color="#CBD5E1" /></View>
           }
           {isOutOfStock && <View style={styles.soldBadge}><Text style={styles.soldText}>SOLD OUT</Text></View>}
        </View>
        <View style={styles.prodInfo}>
          <Text style={styles.prodName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.prodPrice}>₱{item.price.toFixed(0)}</Text>
        </View>
        <View style={styles.addBtn}>
          <Ionicons name="add" size={20} color="#FFF" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartRow}>
      <View>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>₱{(item.price * item.qty).toFixed(2)}</Text>
      </View>
      <View style={styles.qtyControls}>
        <TouchableOpacity onPress={() => updateQty(item, -1)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={COLORS.dark} /></TouchableOpacity>
        <Text style={styles.qtyNum}>{item.qty}</Text>
        <TouchableOpacity onPress={() => updateQty(item, 1)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={COLORS.dark} /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      
      {/* 🚀 HEADER: "THE COCKPIT" */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{flexDirection:'row', alignItems:'center'}}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : 
              <View style={[styles.avatar, {backgroundColor: COLORS.primary, justifyContent:'center', alignItems:'center'}]}>
                <Text style={{color:'#fff', fontWeight:'bold'}}>{user?.first_name?.[0]}</Text>
              </View>
            }
            <View style={{marginLeft: 10}}>
              <Text style={styles.greeting}>Good shift, {user?.first_name}!</Text>
              <Text style={styles.storeLabel}>{storeName}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={fetchData} style={styles.refreshBtn}>
             <Ionicons name="sync" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* 🏆 GAMIFICATION: SHIFT STATS */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>TODAY'S SALES</Text>
            <Text style={styles.statValue}>₱{shiftSales.toLocaleString()}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>ORDERS</Text>
            <Text style={styles.statValue}>{shiftCount}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
             <Text style={styles.statLabel}>GOAL</Text>
             {/* Dynamic Goal Message */}
             <Text style={[styles.statValue, {color: COLORS.accent}]}>
               {shiftSales > 5000 ? "🔥 ON FIRE" : "KEEP GOING"}
             </Text>
          </View>
        </View>
      </View>

      {/* 🔍 SEARCH & FILTER */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={COLORS.gray} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search menu..." 
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* 📋 MENU GRID */}
      <View style={styles.body}>
        <FlatList 
          data={filteredProducts} 
          renderItem={renderProduct} 
          keyExtractor={item => item.id.toString()}
          numColumns={isTablet ? 3 : 2} 
          columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 5 }}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={50} color={COLORS.gray} />
              <Text style={styles.emptyText}>No items found.</Text>
            </View>
          }
        />
      </View>

      {/* 🛒 FLOATING CART BAR (Bottom) */}
      {cart.length > 0 && (
        <View style={styles.floatBarContainer}>
          <TouchableOpacity style={styles.floatBar} onPress={() => setCartModalVisible(true)} activeOpacity={0.9}>
            <View style={styles.badge}><Text style={styles.badgeText}>{totalItems}</Text></View>
            <Text style={styles.viewOrderText}>Current Order</Text>
            <Text style={styles.floatTotal}>₱{calculateTotal()}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL: CART */}
      <Modal visible={cartModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Order Summary</Text>
            <TouchableOpacity onPress={() => setCartModalVisible(false)}><Ionicons name="close-circle" size={30} color={COLORS.gray} /></TouchableOpacity>
          </View>
          
          <FlatList data={cart} renderItem={renderCartItem} keyExtractor={item => item.id.toString()} contentContainerStyle={{padding: 20}} />
          
          <View style={styles.checkoutArea}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalBig}>₱{calculateTotal()}</Text>
            </View>
            <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
              <Text style={styles.checkoutText}>CONFIRM PAYMENT</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: RECEIPT */}
      <Modal visible={receiptVisible} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={styles.receiptCard}>
            <View style={styles.successIcon}><Ionicons name="checkmark" size={40} color="#fff" /></View>
            <Text style={styles.successTitle}>Payment Received!</Text>
            <Text style={styles.successSub}>Total: ₱{lastTransaction?.total}</Text>
            
            <View style={styles.receiptActions}>
              <TouchableOpacity style={[styles.actionBtn, {backgroundColor: COLORS.secondary}]} onPress={handlePrint}>
                <Ionicons name="print" size={20} color="#fff" />
                <Text style={{color:'#fff', fontWeight:'bold'}}>Print Receipt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, {backgroundColor: COLORS.light}]} onPress={() => setReceiptVisible(false)}>
                <Text style={{color: COLORS.dark, fontWeight:'bold'}}>New Sale</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  
  // HEADER
  header: { backgroundColor: COLORS.secondary, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...COLORS.cardShadow, zIndex: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  avatar: { width: 45, height: 45, borderRadius: 25, borderWidth: 2, borderColor: '#fff' },
  greeting: { color: COLORS.gray, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  storeLabel: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },

  // STATS BAR
  statsBar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 15, justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  statValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

  // SEARCH
  searchSection: { paddingHorizontal: 20, marginTop: -25, zIndex: 20 },
  searchBox: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 12, alignItems: 'center', ...COLORS.cardShadow },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: COLORS.dark },

  // BODY
  body: { flex: 1, paddingHorizontal: 15, marginTop: 10 },
  emptyState: { alignItems: 'center', marginTop: 50, opacity: 0.5 },
  emptyText: { marginTop: 10, fontSize: 16, fontWeight: 'bold' },

  // PRODUCT CARD (Unique Look)
  productCard: { backgroundColor: '#fff', width: '48%', borderRadius: 20, marginBottom: 15, padding: 10, ...COLORS.cardShadow, position: 'relative' },
  cardDisabled: { opacity: 0.6 },
  imgWrapper: { height: 120, borderRadius: 16, backgroundColor: '#F1F5F9', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  prodImage: { width: '100%', height: '100%' },
  placeholderImg: { opacity: 0.5 },
  soldBadge: { position: 'absolute', backgroundColor: COLORS.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  soldText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  prodInfo: { marginBottom: 10 },
  prodName: { fontSize: 14, fontWeight: '700', color: COLORS.dark, lineHeight: 18, marginBottom: 4 },
  prodPrice: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  addBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: COLORS.dark, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // FLOATING BAR
  floatBarContainer: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  floatBar: { backgroundColor: COLORS.dark, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...COLORS.cardShadow },
  badge: { backgroundColor: COLORS.primary, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  badgeText: { color: '#fff', fontWeight: 'bold' },
  viewOrderText: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  floatTotal: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // CART MODAL
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25, backgroundColor: '#fff' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, marginBottom: 10, borderRadius: 12, marginHorizontal: 20 },
  cartItemName: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  cartItemPrice: { color: COLORS.gray, marginTop: 4 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8 },
  qtyBtn: { padding: 10 },
  qtyNum: { fontWeight: 'bold', fontSize: 16, width: 20, textAlign: 'center' },
  checkoutArea: { padding: 25, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  totalLabel: { fontSize: 16, color: COLORS.gray },
  totalBig: { fontSize: 28, fontWeight: 'bold', color: COLORS.dark },
  checkoutBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  checkoutText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

  // RECEIPT MODAL
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  receiptCard: { backgroundColor: '#fff', width: '100%', maxWidth: 350, borderRadius: 24, padding: 30, alignItems: 'center' },
  successIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  successTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginBottom: 5 },
  successSub: { fontSize: 16, color: COLORS.gray, marginBottom: 25 },
  receiptActions: { flexDirection: 'row', gap: 10, width: '100%' },
  actionBtn: { flex: 1, padding: 15, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
});