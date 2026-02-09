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
import NetInfo from '@react-native-community/netinfo'; // 📡 NEW IMPORT
import { supabase } from '../lib/supabase';

// --- CONSTANTS ---
const COLORS = {
  primary: '#0b0844', secondary: '#1E1B4B', accent: '#F59E0B',
  success: '#10B981', danger: '#EF4444', dark: '#111827',       
  gray: '#9CA3AF', light: '#F3F4F6', white: '#FFFFFF',
  cardShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }
};

const DENOMINATIONS = [20, 50, 100, 200, 500, 1000];

// --- ANIMATED ROW ---
const AnimatedProductRow = ({ children, index }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay: index * 30, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: index * 30, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]).start();
  }, []);

  return <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>{children}</Animated.View>;
};

export default function MerchantScreen({ user }) {
  // Network State
  const [isConnected, setIsConnected] = useState(true); // 📡 NEW STATE

  // Data State
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [heldOrders, setHeldOrders] = useState([]); 
  const [lastTransaction, setLastTransaction] = useState(null);
  
  // UI State
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false); 
  const [recallModalVisible, setRecallModalVisible] = useState(false); 
  
  const [storeName, setStoreName] = useState("Loading...");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftSales, setShiftSales] = useState(0);

  // Payment Logic State
  const [cashReceived, setCashReceived] = useState('');
  const [changeDue, setChangeDue] = useState(0);

  // Animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // --- 📡 NETWORK LISTENER ---
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      if (state.isConnected) {
        // Auto-refresh when connection returns
        fetchData(); 
      }
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => { fetchData(); }, [user])
  );

  const fetchData = async () => {
    try {
      // 🛡️ Guard: Don't fetch if offline
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected) return; 

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

  const onRefresh = () => { 
    if (!isConnected) {
      Alert.alert("Offline", "Cannot refresh data while offline.");
      return;
    }
    setRefreshing(true); 
    fetchData(); 
  };
  
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- CART ACTIONS ---
  const addToCart = (product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const updateQty = (item, change) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.qty + change < 1) {
      setCart(cart.filter(p => p.id !== item.id));
    } else {
      if (change > 0 && item.qty + 1 > item.stock) return; 
      setCart(cart.map(p => p.id === item.id ? { ...p, qty: p.qty + change } : p));
    }
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  // --- HOLD & RECALL LOGIC ---
  const holdOrder = () => {
    if (cart.length === 0) return;
    Alert.alert("Hold Order", "Save this order and clear cart?", [
      { text: "Cancel", style: "cancel" },
      { text: "Hold", onPress: () => {
        const newHold = { id: Date.now(), items: [...cart], time: new Date().toLocaleTimeString(), total: calculateTotal() };
        setHeldOrders([...heldOrders, newHold]);
        setCart([]);
        setCartModalVisible(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }}
    ]);
  };

  const recallOrder = (order) => {
    if (cart.length > 0) return Alert.alert("Cart not empty", "Please clear or hold current cart first.");
    setCart(order.items);
    setHeldOrders(heldOrders.filter(h => h.id !== order.id));
    setRecallModalVisible(false);
    setCartModalVisible(true);
  };

  // --- PAYMENT LOGIC ---
  const openPaymentModal = () => {
    setCashReceived('');
    setChangeDue(0);
    setCartModalVisible(false);
    setPaymentModalVisible(true);
  };

  const handleQuickCash = (amount) => {
    const total = parseFloat(calculateTotal());
    const newCash = (parseFloat(cashReceived || 0) + amount).toString();
    setCashReceived(newCash);
    setChangeDue(Math.max(0, parseFloat(newCash) - total));
  };

  const handleExactAmount = () => {
    const total = calculateTotal();
    setCashReceived(total);
    setChangeDue(0);
  };

  const finalizeTransaction = async () => {
    if (cart.length === 0) return;

    // 🛡️ BLOCKING LOGIC: Check Internet
    if (!isConnected) {
        Alert.alert(
            "Offline Mode",
            "You are currently offline. Transactions cannot be processed until connection is restored.",
            [{ text: "OK" }]
        );
        return;
    }

    const total = parseFloat(calculateTotal());
    const cash = parseFloat(cashReceived || 0);
    
    if (cash < total) return Alert.alert("Insufficient Cash", "Cash received is less than total.");

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // --- Backend Logic ---
    const { data: saleData, error } = await supabase.from('sales').insert([{ store_name: storeName, cashier_name: user?.first_name || "Merchant", total_amount: total, sale_date: new Date().toISOString() }]).select().single();
    if (error) { Alert.alert("Error", error.message); return; }
    
    const salesItemsData = cart.map(item => ({ sale_id: saleData.id, product_id: item.id, quantity: item.qty, unit_price: item.price }));
    await supabase.from('sales_items').insert(salesItemsData);
    for (const item of cart) { await supabase.from('products').update({ stock: item.stock - item.qty }).eq('id', item.id); }

    setLastTransaction({ id: saleData.id.toString(), date: new Date().toLocaleString(), items: [...cart], total: total.toFixed(2), cash: cash.toFixed(2), change: (cash - total).toFixed(2) });
    setShiftSales(prev => prev + total);
    
    setPaymentModalVisible(false);
    setReceiptVisible(true);
    setCart([]); 
    fetchData(); 
  };

  const handlePrint = async () => {
    if (!lastTransaction) return;
    const itemsHtml = lastTransaction.items.map(item => `<div class="row"><span>${item.qty}x ${item.name}</span><span>P${(item.qty * item.price).toFixed(2)}</span></div>`).join('');
    const html = `<html><head><style>body{font-family:'Courier New';text-align:center;padding:20px}.header{font-size:22px;font-weight:bold;margin-bottom:5px}.line{border-bottom:1px dashed #000;margin:10px 0}.row{display:flex;justify-content:space-between;margin:5px 0}.total{font-size:18px;font-weight:bold;margin-top:10px;border-top:2px solid #000;padding-top:10px}</style></head><body><div class="header">${storeName}</div><div class="line"></div><div style="text-align:left">Date: ${lastTransaction.date}</div><div class="line"></div>${itemsHtml}<div class="line"></div><div class="row total"><span>TOTAL</span><span>P${lastTransaction.total}</span></div><div class="row"><span>Cash</span><span>P${lastTransaction.cash}</span></div><div class="row"><span>Change</span><span>P${lastTransaction.change}</span></div></body></html>`;
    await Print.printAsync({ html });
  };

  // --- RENDERERS ---
  const renderProduct = ({ item, index }) => {
    const isOutOfStock = (item.stock || 0) <= 0;
    return (
      <AnimatedProductRow index={index}>
        <TouchableOpacity style={[styles.productRow, isOutOfStock && styles.rowDisabled]} onPress={() => addToCart(item)} disabled={isOutOfStock}>
          <View style={styles.rowImageContainer}>
             {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.rowImage} /> : <View style={styles.rowPlaceholder}><Ionicons name="fast-food-outline" size={24} color="#CBD5E1" /></View>}
          </View>
          <View style={styles.rowDetails}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowPrice}>₱{item.price.toFixed(0)}</Text>
            <Text style={isOutOfStock ? styles.stockError : styles.stockOk}>{isOutOfStock ? "Out of Stock" : `${item.stock} left`}</Text>
          </View>
          <View style={styles.rowButton}><Ionicons name="add" size={24} color={COLORS.primary} /></View>
        </TouchableOpacity>
      </AnimatedProductRow>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      
      {/* 📡 OFFLINE BANNER */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={16} color="#fff" />
            <Text style={styles.offlineText}>Offline Mode • Transactions Paused</Text>
        </View>
      )}

      {/* HEADER */}
      <View style={[styles.header, !isConnected && { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
        <View style={styles.headerRow}>
          <View style={{flexDirection:'row', alignItems:'center'}}>
             {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.avatarText}>{user?.first_name?.[0]}</Text></View>}
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

        <View style={{flexDirection:'row', gap:10}}>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={COLORS.gray} style={{marginRight: 10}} />
              <TextInput style={styles.searchInput} placeholder="Search products..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor={COLORS.gray} />
            </View>
            {heldOrders.length > 0 && (
                <TouchableOpacity style={styles.recallBtn} onPress={() => setRecallModalVisible(true)}>
                    <Ionicons name="time" size={22} color="#fff" />
                    <View style={styles.recallBadge}><Text style={styles.recallBadgeText}>{heldOrders.length}</Text></View>
                </TouchableOpacity>
            )}
        </View>
      </View>

      {/* BODY */}
      <FlatList 
        data={filteredProducts} 
        renderItem={renderProduct} 
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 15, paddingHorizontal: 15 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      {/* FLOAT BUTTON */}
      {cart.length > 0 && (
        <View style={styles.floatContainer}>
          <TouchableOpacity onPress={() => setCartModalVisible(true)} activeOpacity={0.9}>
            <Animated.View style={[styles.floatBtn, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.cartIconBadge}><Text style={styles.badgeText}>{totalItems}</Text></View>
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
            <Text style={styles.modalTitle}>Current Order</Text>
            <View style={{flexDirection:'row', gap: 15}}>
                <TouchableOpacity onPress={holdOrder}><Ionicons name="pause-circle-outline" size={28} color={COLORS.accent} /></TouchableOpacity>
                <TouchableOpacity onPress={() => setCartModalVisible(false)}><Ionicons name="close-circle" size={28} color={COLORS.gray} /></TouchableOpacity>
            </View>
          </View>
          <FlatList 
            data={cart} 
            renderItem={({item}) => (
                <View style={styles.cartRow}>
                  <View><Text style={styles.cartItemName}>{item.name}</Text><Text style={styles.cartItemPrice}>₱{(item.price * item.qty).toFixed(2)}</Text></View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity onPress={() => updateQty(item, -1)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={COLORS.dark} /></TouchableOpacity>
                    <Text style={styles.qtyNum}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => updateQty(item, 1)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={COLORS.dark} /></TouchableOpacity>
                  </View>
                </View>
            )} 
            keyExtractor={item => item.id.toString()} 
          />
          <View style={styles.checkoutArea}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total Amount</Text><Text style={styles.totalBig}>₱{calculateTotal()}</Text></View>
            <TouchableOpacity style={styles.checkoutBtn} onPress={openPaymentModal}>
              <Text style={styles.checkoutText}>PROCEED TO PAY</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: PAYMENT */}
      <Modal visible={paymentModalVisible} animationType="slide" transparent>
         <View style={styles.overlay}>
            <View style={styles.paymentCard}>
                <View style={styles.paymentHeader}>
                    <Text style={styles.paymentTitle}>Payment</Text>
                    <TouchableOpacity onPress={() => setPaymentModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity>
                </View>

                {/* 🛡️ OFFLINE WARNING IN MODAL */}
                {!isConnected && (
                    <View style={{backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8, marginBottom: 15, flexDirection:'row', gap: 8, alignItems:'center'}}>
                        <Ionicons name="warning" size={18} color={COLORS.danger} />
                        <Text style={{color: COLORS.danger, fontSize: 12, flex: 1}}>Offline. Cannot process.</Text>
                    </View>
                )}

                <View style={styles.payDisplay}>
                    <View>
                        <Text style={styles.payLabel}>Total Due</Text>
                        <Text style={styles.payAmount}>₱{calculateTotal()}</Text>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                        <Text style={styles.payLabel}>Change</Text>
                        <Text style={[styles.payAmount, {color: COLORS.success}]}>₱{changeDue.toFixed(2)}</Text>
                    </View>
                </View>

                <Text style={styles.inputLabel}>Cash Received</Text>
                <View style={styles.cashInputRow}>
                    <Text style={{fontSize:20, fontWeight:'bold', color: COLORS.gray}}>₱</Text>
                    <TextInput 
                        style={styles.cashInput} 
                        keyboardType="numeric" 
                        value={cashReceived} 
                        onChangeText={(t) => {
                            setCashReceived(t);
                            const val = parseFloat(t || 0);
                            const tot = parseFloat(calculateTotal());
                            setChangeDue(Math.max(0, val - tot));
                        }}
                        autoFocus
                    />
                    {cashReceived !== '' && <TouchableOpacity onPress={() => {setCashReceived(''); setChangeDue(0);}}><Ionicons name="close-circle" size={20} color={COLORS.gray} /></TouchableOpacity>}
                </View>

                {/* Quick Denominations */}
                <View style={styles.denomGrid}>
                    <TouchableOpacity style={[styles.denomBtn, {backgroundColor: COLORS.accent}]} onPress={handleExactAmount}>
                        <Text style={[styles.denomText, {color: '#fff'}]}>Exact</Text>
                    </TouchableOpacity>
                    {DENOMINATIONS.map(denom => (
                        <TouchableOpacity key={denom} style={styles.denomBtn} onPress={() => handleQuickCash(denom)}>
                            <Text style={styles.denomText}>+{denom}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity 
                    style={[
                        styles.checkoutBtn, 
                        {marginTop: 20},
                        (parseFloat(cashReceived || 0) < parseFloat(calculateTotal()) || !isConnected) && {opacity: 0.5} 
                    ]} 
                    onPress={finalizeTransaction}
                    disabled={parseFloat(cashReceived || 0) < parseFloat(calculateTotal()) || !isConnected}
                >
                    <Text style={styles.checkoutText}>COMPLETE SALE</Text>
                </TouchableOpacity>
            </View>
         </View>
      </Modal>

      {/* MODAL: RECALL ORDERS */}
      <Modal visible={recallModalVisible} animationType="fade" transparent>
        <View style={styles.overlay}>
            <View style={styles.paymentCard}>
                <Text style={styles.paymentTitle}>Held Orders</Text>
                <FlatList 
                    data={heldOrders}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.heldItem} onPress={() => recallOrder(item)}>
                            <View>
                                <Text style={{fontWeight:'bold', fontSize:16}}>Order #{item.id.toString().slice(-4)}</Text>
                                <Text style={{color: COLORS.gray}}>{item.items.length} items • {item.time}</Text>
                            </View>
                            <Text style={{fontWeight:'bold', fontSize:16, color: COLORS.primary}}>₱{item.total}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', margin: 20, color: COLORS.gray}}>No held orders.</Text>}
                />
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: COLORS.light, marginTop: 10}]} onPress={() => setRecallModalVisible(false)}>
                    <Text style={{fontWeight:'bold'}}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* MODAL: RECEIPT */}
      <Modal visible={receiptVisible} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={styles.receiptCard}>
            <View style={styles.successIcon}><Ionicons name="checkmark" size={40} color="#fff" /></View>
            <Text style={styles.successTitle}>Transaction Complete</Text>
            <Text style={styles.successSub}>Change: ₱{lastTransaction?.change}</Text>
            <View style={styles.receiptActions}>
              <TouchableOpacity style={[styles.actionBtn, {backgroundColor: COLORS.secondary}]} onPress={handlePrint}><Ionicons name="print" size={20} color="#fff" /><Text style={{color:'#fff', fontWeight:'bold'}}>Receipt</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, {backgroundColor: COLORS.light}]} onPress={() => setReceiptVisible(false)}><Text style={{color: COLORS.dark, fontWeight:'bold'}}>Next Order</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  offlineBanner: { backgroundColor: COLORS.danger, padding: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingTop: Platform.OS === 'android' ? 35 : 10 },
  offlineText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  header: { backgroundColor: COLORS.secondary, paddingHorizontal: 20, paddingTop: 15, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  welcomeText: { color: COLORS.gray, fontSize: 12 },
  storeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dailyStat: { alignItems: 'flex-end' },
  statLabel: { color: COLORS.accent, fontSize: 10, fontWeight: 'bold' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, color: COLORS.dark, fontSize: 15 },
  recallBtn: { width: 45, height: 45, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  recallBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: COLORS.danger, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  recallBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
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
  
  // MODAL STYLES
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
  
  // PAYMENT CARD
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  paymentCard: { backgroundColor: '#fff', width: '100%', maxWidth: 350, borderRadius: 24, padding: 20 },
  paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  paymentTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  payDisplay: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F3F4F6', padding: 15, borderRadius: 12, marginBottom: 20 },
  payLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 4 },
  payAmount: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  inputLabel: { fontSize: 14, color: COLORS.gray, marginBottom: 8 },
  cashInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15, height: 50, marginBottom: 20 },
  cashInput: { flex: 1, fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginLeft: 8 },
  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  denomBtn: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, backgroundColor: '#EEF2FF', minWidth: 60, alignItems: 'center' },
  denomText: { color: COLORS.primary, fontWeight: 'bold' },
  
  // HELD ITEMS
  heldItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },

  // RECEIPT
  receiptCard: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 24, padding: 25, alignItems: 'center' },
  successIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  successTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark, marginBottom: 5 },
  successSub: { fontSize: 15, color: COLORS.gray, marginBottom: 20 },
  receiptActions: { flexDirection: 'row', gap: 10, width: '100%' },
  actionBtn: { flex: 1, padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
});