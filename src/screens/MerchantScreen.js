import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, TextInput, StatusBar, 
  SafeAreaView, Platform, RefreshControl, Image, Animated, Easing 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; 
import * as Haptics from 'expo-haptics'; 
import { supabase } from '../lib/supabase';

const COLORS = {
  primary: '#0b0844', secondary: '#1E1B4B', accent: '#F59E0B',
  success: '#10B981', danger: '#EF4444', dark: '#111827',       
  gray: '#9CA3AF', light: '#F3F4F6', white: '#FFFFFF',
  cardShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }
};

// --- ANIMATED COMPONENT: FADE IN ROW ---
const AnimatedProductRow = ({ children, index }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;  // Opacity
  const slideAnim = useRef(new Animated.Value(50)).current; // Position Y

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay: index * 50, // Stagger effect (items appear one by one)
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay: index * 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
};

export default function MerchantScreen({ user }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  
  const [storeName, setStoreName] = useState("Loading...");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftSales, setShiftSales] = useState(0);

  // Animation for Cart Button
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => { fetchData(); }, [user])
  );

  const fetchData = async () => {
    try {
      if (refreshing) setLoading(true);
      if (!user || !user.id) return;

      const { data: profile } = await supabase.from('profiles').select('store_name, avatar_url').eq('id', user.id).single();
      const currentStore = profile?.store_name || user.store_name || "My Store";
      setStoreName(currentStore);
      if (profile?.avatar_url) setAvatarUrl(`${profile.avatar_url}?t=${Date.now()}`);

      if (currentStore) {
        const { data: prodData } = await supabase.from('products').select('*').eq('store_name', currentStore).order('name');
        setProducts(prodData || []);

        const today = new Date().toISOString().split('T')[0];
        const { data: salesToday } = await supabase.from('sales').select('total_amount').eq('store_name', currentStore).gte('sale_date', today);
        const total = (salesToday || []).reduce((sum, s) => sum + s.total_amount, 0);
        setShiftSales(total);
      }
    } catch (e) { console.log(e); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchData(); };
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const addToCart = (product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Animate Cart Button Bounce
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.1, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    const currentStock = product.stock ?? 0;
    if (currentStock <= 0) return Alert.alert("Out of Stock", "Item unavailable.");
    
    const existing = cart.find(item => item.id === product.id);
    if (existing && existing.qty + 1 > currentStock) return Alert.alert("Low Stock", `Only ${currentStock} available.`);
    
    if (existing) setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    else setCart([...cart, { ...product, qty: 1 }]);
  };

  const removeFromCart = (productId) => setCart(cart.filter(item => item.id !== productId));

  const updateQty = (item, change) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.qty + change < 1) return removeFromCart(item.id);
    if (change > 0 && item.qty + 1 > item.stock) return; 
    setCart(cart.map(p => p.id === item.id ? { ...p, qty: p.qty + change } : p));
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const total = parseFloat(calculateTotal());
    const { data: saleData, error } = await supabase.from('sales').insert([{ store_name: storeName, cashier_name: user?.first_name || "Merchant", total_amount: total, sale_date: new Date().toISOString() }]).select().single();
    if (error) { Alert.alert("Error", error.message); return; }
    
    const salesItemsData = cart.map(item => ({ sale_id: saleData.id, product_id: item.id, quantity: item.qty, unit_price: item.price }));
    await supabase.from('sales_items').insert(salesItemsData);
    for (const item of cart) { await supabase.from('products').update({ stock: item.stock - item.qty }).eq('id', item.id); }

    setLastTransaction({ id: saleData.id.toString(), date: new Date().toLocaleString(), items: [...cart], total: total.toFixed(2) });
    setShiftSales(prev => prev + total);
    setReceiptVisible(true);
    setCart([]); 
    setCartModalVisible(false);
    fetchData(); 
  };

  const handlePrint = async () => {
    if (!lastTransaction) return;
    const itemsHtml = lastTransaction.items.map(item => `<div class="row"><span>${item.qty}x ${item.name}</span><span>P${(item.qty * item.price).toFixed(2)}</span></div>`).join('');
    const html = `<html><head><style>body{font-family:'Courier New';text-align:center;padding:20px}.header{font-size:22px;font-weight:bold;margin-bottom:5px}.line{border-bottom:1px dashed #000;margin:10px 0}.row{display:flex;justify-content:space-between;margin:5px 0}.total{font-size:18px;font-weight:bold;margin-top:10px;border-top:2px solid #000;padding-top:10px}</style></head><body><div class="header">${storeName}</div><div class="line"></div><div style="text-align:left">Date: ${lastTransaction.date}</div><div class="line"></div>${itemsHtml}<div class="line"></div><div class="row total"><span>TOTAL</span><span>P${lastTransaction.total}</span></div></body></html>`;
    await Print.printAsync({ html });
  };

  // --- RENDERERS ---
  const renderProduct = ({ item, index }) => {
    const isOutOfStock = (item.stock || 0) <= 0;
    return (
      <AnimatedProductRow index={index}>
        <TouchableOpacity 
          style={[styles.productRow, isOutOfStock && styles.rowDisabled]} 
          onPress={() => addToCart(item)} 
          disabled={isOutOfStock}
          activeOpacity={0.7}
        >
          <View style={styles.rowImageContainer}>
             {item.image_url ? 
               <Image source={{ uri: item.image_url }} style={styles.rowImage} resizeMode="cover" /> : 
               <View style={styles.rowPlaceholder}><Ionicons name="fast-food-outline" size={24} color="#CBD5E1" /></View>
             }
          </View>
          <View style={styles.rowDetails}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowPrice}>₱{item.price.toFixed(0)}</Text>
            {isOutOfStock ? 
              <Text style={styles.stockError}>Out of Stock</Text> : 
              <Text style={styles.stockOk}>{item.stock} left</Text>
            }
          </View>
          <View style={styles.rowButton}>
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </View>
        </TouchableOpacity>
      </AnimatedProductRow>
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
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{flexDirection:'row', alignItems:'center'}}>
             {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : 
               <View style={styles.avatarPlaceholder}><Text style={styles.avatarText}>{user?.first_name?.[0]}</Text></View>}
             <View style={{marginLeft: 12}}>
               <Text style={styles.welcomeText}>Hello, {user?.first_name}</Text>
               <Text style={styles.storeText}>{storeName}</Text>
             </View>
          </View>
          <View style={styles.dailyStat}>
            <Text style={styles.statLabel}>TODAY</Text>
            <Text style={styles.statValue}>₱{shiftSales.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.gray} style={{marginRight: 10}} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search products..." 
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={COLORS.gray}
          />
        </View>
      </View>

      {/* PRODUCT LIST */}
      <View style={styles.body}>
        <FlatList 
          data={filteredProducts} 
          renderItem={renderProduct} 
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 15 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={50} color={COLORS.gray} />
              <Text style={styles.emptyText}>No items found.</Text>
            </View>
          }
        />
      </View>

      {/* ANIMATED CART BUTTON */}
      {cart.length > 0 && (
        <View style={styles.floatContainer}>
          <TouchableOpacity onPress={() => setCartModalVisible(true)} activeOpacity={0.9}>
            <Animated.View style={[styles.floatBtn, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.cartIconBadge}>
                <Text style={styles.badgeText}>{totalItems}</Text>
              </View>
              <Text style={styles.floatText}>View Order</Text>
              <Text style={styles.floatPrice}>₱{calculateTotal()}</Text>
            </Animated.View>
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
                <Text style={{color:'#fff', fontWeight:'bold'}}>Receipt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, {backgroundColor: COLORS.light}]} onPress={() => setReceiptVisible(false)}>
                <Text style={{color: COLORS.dark, fontWeight:'bold'}}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: COLORS.secondary, paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  welcomeText: { color: COLORS.gray, fontSize: 12 },
  storeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dailyStat: { alignItems: 'flex-end' },
  statLabel: { color: COLORS.accent, fontSize: 10, fontWeight: 'bold' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, color: COLORS.dark, fontSize: 15 },
  body: { flex: 1, paddingHorizontal: 15 },
  emptyState: { alignItems: 'center', marginTop: 60, opacity: 0.5 },
  emptyText: { marginTop: 10, fontSize: 16 },
  productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 10, marginBottom: 10, ...COLORS.cardShadow },
  rowDisabled: { opacity: 0.6 },
  rowImageContainer: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#F3F4F6', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  rowImage: { width: '100%', height: '100%' },
  rowPlaceholder: { opacity: 0.5 },
  rowDetails: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: COLORS.dark, marginBottom: 2 },
  rowPrice: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  stockOk: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  stockError: { fontSize: 11, color: COLORS.danger, fontWeight: 'bold', marginTop: 2 },
  rowButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  floatContainer: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  floatBtn: { backgroundColor: COLORS.dark, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...COLORS.cardShadow },
  cartIconBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  floatText: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  floatPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, marginBottom: 10, borderRadius: 12, marginHorizontal: 20 },
  cartItemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.dark },
  cartItemPrice: { color: COLORS.gray, marginTop: 2, fontSize: 13 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8 },
  qtyBtn: { padding: 8 },
  qtyNum: { fontWeight: 'bold', fontSize: 14, width: 25, textAlign: 'center' },
  checkoutArea: { padding: 25, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  totalLabel: { fontSize: 15, color: COLORS.gray },
  totalBig: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark },
  checkoutBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  checkoutText: { color: '#fff', fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  receiptCard: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 24, padding: 25, alignItems: 'center' },
  successIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  successTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark, marginBottom: 5 },
  successSub: { fontSize: 15, color: COLORS.gray, marginBottom: 20 },
  receiptActions: { flexDirection: 'row', gap: 10, width: '100%' },
  actionBtn: { flex: 1, padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
});