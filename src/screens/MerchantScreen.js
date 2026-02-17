import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, TextInput, StatusBar, 
  SafeAreaView, Platform, RefreshControl, Image, Animated, Easing, Keyboard, KeyboardAvoidingView, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; 
import * as Haptics from 'expo-haptics'; 
import { CameraView, useCameraPermissions } from 'expo-camera'; 
import { supabase } from '../lib/supabase';

// --- CONSTANTS ---
const { width } = Dimensions.get('window');
const GRID_SPACING = 10;
const GRID_ITEM_WIDTH = (width - 30 - (GRID_SPACING * 2)) / 3; 
const LOW_STOCK_THRESHOLD = 5;

const COLORS = {
  primary: '#0b0844', secondary: '#1E1B4B', accent: '#F59E0B',
  success: '#10B981', danger: '#EF4444', dark: '#111827',       
  gray: '#9CA3AF', light: '#F3F4F6', lighter: '#F9FAFB', white: '#FFFFFF',
  cardShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  modalShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 }
};

const DENOMINATIONS = [20, 50, 100, 200, 500, 1000];
const GRID_COLORS = ['#EEF2FF', '#ECFDF5', '#FEF3C7', '#FEF2F2', '#F3E8FF', '#E0F2FE'];

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
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [heldOrders, setHeldOrders] = useState([]); 
  const [lastTransaction, setLastTransaction] = useState(null);
  const [currentShift, setCurrentShift] = useState(null); 
  
  // 📢 ANNOUNCEMENT STATE
  const [announcement, setAnnouncement] = useState(null);
  
  const [viewMode, setViewMode] = useState('list'); 
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [recallModalVisible, setRecallModalVisible] = useState(false);
  const [shiftModalVisible, setShiftModalVisible] = useState(false); 
  const [isEndingShift, setIsEndingShift] = useState(false); 
  
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions(); 
  const [scanned, setScanned] = useState(false);

  const [storeName, setStoreName] = useState("Loading...");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftSales, setShiftSales] = useState(0);

  const [cashReceived, setCashReceived] = useState('');
  const [changeDue, setChangeDue] = useState(0);
  const [cashCountInput, setCashCountInput] = useState(''); 

  const scaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => { fetchData(); }, [user])
  );

  // --- 📢 REAL-TIME ANNOUNCEMENT LISTENER ---
  useEffect(() => {
    // 1. Get the latest active announcement on load
    const fetchLatestAnnouncement = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setAnnouncement(data);
    };

    fetchLatestAnnouncement();

    // 2. Subscribe to new announcements
    const subscription = supabase
      .channel('public:announcements')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, payload => {
          setAnnouncement(payload.new);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

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

        const { data: activeShift } = await supabase.from('shifts').select('*').eq('user_id', user.id).eq('status', 'open').single();

        if (activeShift) {
          setCurrentShift(activeShift);
          setShiftModalVisible(false); 
          const { data: salesInShift } = await supabase.from('sales').select('total_amount').eq('store_name', currentStore).eq('cashier_name', user.first_name).gte('sale_date', activeShift.start_time);
          const total = (salesInShift || []).reduce((sum, s) => sum + s.total_amount, 0);
          setShiftSales(total);
        } else {
          setCurrentShift(null);
          setIsEndingShift(false);
          setShiftModalVisible(true);
        }
      }
    } catch (e) { 
        if (!currentShift) { setIsEndingShift(false); setShiftModalVisible(true); }
    } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchData(); };
  
  const filteredProducts = viewMode === 'list' 
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : products.slice(0, 21); 

  // --- 📸 BARCODE LOGIC ---
  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    const product = products.find(p => p.barcode === data);
    if (product) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addToCart(product);
        Alert.alert("Added!", `${product.name} added to cart.`, [
            { text: "Keep Scanning", onPress: () => setScanned(false) },
            { text: "Done", onPress: () => setScannerVisible(false) }
        ]);
    } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Not Found", `No product found with barcode: ${data}`, [
            { text: "Try Again", onPress: () => setScanned(false) },
            { text: "Cancel", onPress: () => setScannerVisible(false) }
        ]);
    }
  };

  const openScanner = async () => {
      if (!permission) return;
      if (!permission.granted) {
        const { granted } = await requestPermission();
        if (!granted) return Alert.alert("No Access", "Camera permission is required.");
      }
      setScanned(false);
      setScannerVisible(true);
  };

  // --- SHIFT LOGIC ---
  const handleStartShift = async () => {
    if (!cashCountInput) return Alert.alert("Required", "Please enter starting cash.");
    setLoading(true);
    try {
        const { data, error } = await supabase.from('shifts').insert([{
            user_id: user.id, store_name: storeName, starting_cash: parseFloat(cashCountInput), status: 'open', start_time: new Date().toISOString()
        }]).select().single();
        if (error) throw error;
        setCurrentShift(data); setShiftModalVisible(false); setCashCountInput(''); setShiftSales(0);
        Alert.alert("Shift Started", `Go get 'em! Starting cash: ₱${data.starting_cash}`);
    } catch (e) { Alert.alert("Error", e.message); } finally { setLoading(false); }
  };

  const handleEndShift = async () => {
      if (!cashCountInput) return Alert.alert("Required", "Please count the cash.");
      setLoading(true);
      const actualCash = parseFloat(cashCountInput);
      const startingCash = parseFloat(currentShift.starting_cash || 0);
      const expectedCash = startingCash + shiftSales;
      const discrepancy = actualCash - expectedCash;
      try {
          const { error } = await supabase.from('shifts').update({
              end_time: new Date().toISOString(), ending_cash: actualCash, total_sales: shiftSales, cash_discrepancy: discrepancy, status: 'closed'
          }).eq('id', currentShift.id);
          if (error) throw error;
          let msg = `Sales: ₱${shiftSales.toFixed(2)}\nExpected: ₱${expectedCash.toFixed(2)}\nActual: ₱${actualCash.toFixed(2)}\n\n`;
          if (discrepancy === 0) msg += "✅ PERFECT MATCH";
          else if (discrepancy > 0) msg += `⚠️ OVERAGE: +₱${discrepancy.toFixed(2)}`;
          else msg += `🚨 SHORTAGE: -₱${Math.abs(discrepancy).toFixed(2)}`;
          Alert.alert("Shift Closed", msg, [{ text: "OK", onPress: () => { setCurrentShift(null); setIsEndingShift(false); setCashCountInput(''); setShiftModalVisible(true); }}]);
      } catch (e) { Alert.alert("Error", e.message); } finally { setLoading(false); }
  };

  const openEndShiftModal = () => { setIsEndingShift(true); setCashCountInput(''); setShiftModalVisible(true); };

  // --- CART ---
  const addToCart = (product) => {
    if ((product.stock || 0) <= 0) return Alert.alert("Out of Stock", "Cannot sell this item.");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.1, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();
    const existing = cart.find(item => item.id === product.id);
    if (existing && existing.qty + 1 > product.stock) return Alert.alert("Low Stock", `Only ${product.stock} available.`);
    if (existing) setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    else setCart([...cart, { ...product, qty: 1 }]);
  };

  const updateQty = (item, change) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.qty + change < 1) setCart(cart.filter(p => p.id !== item.id));
    else {
      if (change > 0 && item.qty + 1 > item.stock) return; 
      setCart(cart.map(p => p.id === item.id ? { ...p, qty: p.qty + change } : p));
    }
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  const holdOrder = () => {
    if (cart.length === 0) return;
    Alert.alert("Hold Order", "Save order?", [{ text: "Cancel", style: "cancel" }, { text: "Hold", onPress: () => {
        setHeldOrders([...heldOrders, { id: Date.now(), items: [...cart], time: new Date().toLocaleTimeString(), total: calculateTotal() }]);
        setCart([]); setCartModalVisible(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }}]);
  };

  const recallOrder = (order) => {
    if (cart.length > 0) return Alert.alert("Cart not empty", "Please clear.");
    setCart(order.items); setHeldOrders(heldOrders.filter(h => h.id !== order.id)); setRecallModalVisible(false); setCartModalVisible(true);
  };

  const openPaymentModal = () => { setCashReceived(''); setChangeDue(0); setCartModalVisible(false); setPaymentModalVisible(true); };
  const handleQuickCash = (amount) => {
    const total = parseFloat(calculateTotal()); const newCash = (parseFloat(cashReceived || 0) + amount).toString();
    setCashReceived(newCash); setChangeDue(Math.max(0, parseFloat(newCash) - total));
  };
  const handleExactAmount = () => { const total = calculateTotal(); setCashReceived(total); setChangeDue(0); };
  
  const finalizeTransaction = async () => {
    if (cart.length === 0) return;
    const total = parseFloat(calculateTotal()); const cash = parseFloat(cashReceived || 0);
    if (cash < total) return Alert.alert("Insufficient Cash", "Cash received is less than total.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const { data: saleData, error } = await supabase.from('sales').insert([{ store_name: storeName, cashier_name: user?.first_name || "Merchant", total_amount: total, sale_date: new Date().toISOString() }]).select().single();
    if (error) { Alert.alert("Error", error.message); return; }
    const salesItemsData = cart.map(item => ({ sale_id: saleData.id, product_id: item.id, quantity: item.qty, unit_price: item.price }));
    await supabase.from('sales_items').insert(salesItemsData);
    for (const item of cart) { await supabase.from('products').update({ stock: item.stock - item.qty }).eq('id', item.id); }
    setLastTransaction({ id: saleData.id.toString(), date: new Date().toLocaleString(), items: [...cart], total: total.toFixed(2), cash: cash.toFixed(2), change: (cash - total).toFixed(2) });
    setShiftSales(prev => prev + total); setPaymentModalVisible(false); setReceiptVisible(true); setCart([]); fetchData(); 
  };

  const handlePrint = async () => {
    if (!lastTransaction) return;
    const itemsHtml = lastTransaction.items.map(item => `<div class="row"><span>${item.qty}x ${item.name}</span><span>P${(item.qty * item.price).toFixed(2)}</span></div>`).join('');
    const html = `<html><body><div style="text-align:center;"><h3>${storeName}</h3><p>${lastTransaction.date}</p><hr/>${itemsHtml}<hr/><p>Total: P${lastTransaction.total}</p><p>Cash: P${lastTransaction.cash}</p><p>Change: P${lastTransaction.change}</p></div></body></html>`;
    await Print.printAsync({ html });
  };

  const renderListItem = ({ item, index }) => {
    const stock = item.stock || 0;
    const isOutOfStock = stock <= 0;
    const isLowStock = stock > 0 && stock < LOW_STOCK_THRESHOLD;
    let stockTextStyle = styles.stockOk;
    let buttonColor = '#EEF2FF';
    let iconColor = COLORS.primary;
    let buttonIcon = "add";
    if (isOutOfStock) { stockTextStyle = styles.stockError; buttonColor = '#FEF2F2'; iconColor = COLORS.danger; buttonIcon = "ban"; }
    else if (isLowStock) { stockTextStyle = styles.stockLow; buttonColor = '#FEF3C7'; iconColor = '#D97706'; buttonIcon = "alert"; }
    return (
      <AnimatedProductRow index={index}>
        <TouchableOpacity style={[styles.productRow, isOutOfStock && styles.rowDisabled]} onPress={() => addToCart(item)} disabled={isOutOfStock}>
          <View style={styles.rowImageContainer}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.rowImage} /> : <View style={styles.rowPlaceholder}><Ionicons name="fast-food-outline" size={24} color="#CBD5E1" /></View>}</View>
          <View style={styles.rowDetails}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowPrice}>₱{item.price}</Text><Text style={stockTextStyle}>{isOutOfStock ? "Out of Stock" : isLowStock ? `Low Stock (${stock})` : `${stock} left`}</Text></View>
          <View style={[styles.rowButton, { backgroundColor: buttonColor }]}><Ionicons name={buttonIcon} size={24} color={iconColor} /></View>
        </TouchableOpacity>
      </AnimatedProductRow>
    );
  };

  const renderGridItem = ({ item, index }) => {
     const isOutOfStock = (item.stock || 0) <= 0;
     const isLowStock = item.stock > 0 && item.stock < LOW_STOCK_THRESHOLD;
     const fallbackColor = GRID_COLORS[index % GRID_COLORS.length]; 
     let badgeBg = 'rgba(255,255,255,0.9)';
     if (isOutOfStock) badgeBg = COLORS.danger;
     else if (isLowStock) badgeBg = COLORS.accent;
     return (
       <AnimatedProductRow index={index}>
         <TouchableOpacity style={[styles.gridItem, isOutOfStock && styles.rowDisabled]} onPress={() => addToCart(item)} disabled={isOutOfStock}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.gridImageFull} resizeMode="cover" /> : <View style={[styles.gridImageFallback, { backgroundColor: fallbackColor }]}><Ionicons name="fast-food-outline" size={32} color="rgba(0,0,0,0.1)" /></View>}
            <View style={[styles.gridStockBadge, { backgroundColor: badgeBg }]}><Text style={[styles.gridStockText, (isOutOfStock || isLowStock) && {color:'#fff'}]}>{isOutOfStock ? "0" : item.stock}</Text></View>
            <View style={styles.gridTextOverlay}><Text style={styles.gridOverlayTitle} numberOfLines={1}>{item.name}</Text><Text style={styles.gridOverlayPrice}>₱{item.price}</Text></View>
         </TouchableOpacity>
       </AnimatedProductRow>
     );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{flexDirection:'row', alignItems:'center'}}>
             {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.avatarText}>{user?.first_name?.[0]}</Text></View>}
             <View style={{marginLeft: 12}}><Text style={styles.welcomeText}>Hello, {user?.first_name}</Text><Text style={styles.storeText}>{storeName}</Text></View>
          </View>
          <TouchableOpacity style={styles.endShiftBtn} onPress={openEndShiftModal}><Ionicons name="power" size={18} color="#fff" /><Text style={styles.endShiftText}>End Shift</Text></TouchableOpacity>
        </View>

        <View style={{flexDirection:'row', gap:10}}>
            <View style={styles.viewToggleContainer}>
                <TouchableOpacity style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]} onPress={() => setViewMode('list')}><Ionicons name="list" size={18} color={viewMode === 'list' ? COLORS.primary : COLORS.gray} /></TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]} onPress={() => setViewMode('grid')}><Ionicons name="grid" size={18} color={viewMode === 'grid' ? COLORS.primary : COLORS.gray} /></TouchableOpacity>
            </View>
            <View style={styles.searchContainer}><Ionicons name="search" size={20} color={COLORS.gray} style={{marginRight: 10}} /><TextInput style={styles.searchInput} placeholder="Search..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor={COLORS.gray} /></View>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}><Ionicons name="qr-code-outline" size={20} color={COLORS.primary} /></TouchableOpacity>
            {heldOrders.length > 0 && <TouchableOpacity style={styles.recallBtn} onPress={() => setRecallModalVisible(true)}><Ionicons name="time" size={22} color="#fff" /><View style={styles.recallBadge}><Text style={styles.recallBadgeText}>{heldOrders.length}</Text></View></TouchableOpacity>}
        </View>
      </View>

      {/* 📢 ANNOUNCEMENT BANNER */}
      {announcement && (
        <View style={styles.announcementBar}>
            <Ionicons name="megaphone" size={18} color={COLORS.white} style={{marginRight: 10}} />
            <Text style={styles.announcementText} numberOfLines={1}>{announcement.message}</Text>
            <TouchableOpacity onPress={() => setAnnouncement(null)} style={{padding: 5}}>
                <Ionicons name="close" size={18} color={COLORS.white} />
            </TouchableOpacity>
        </View>
      )}

      {/* BODY */}
      <FlatList 
        key={viewMode} 
        data={filteredProducts} 
        renderItem={viewMode === 'list' ? renderListItem : renderGridItem} 
        keyExtractor={item => item.id.toString()}
        numColumns={viewMode === 'list' ? 1 : 3} 
        contentContainerStyle={{ paddingBottom: 120, paddingTop: announcement ? 5 : 15, paddingHorizontal: 15 }}
        columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      {/* FLOAT BUTTON */}
      {cart.length > 0 && (
        <View style={styles.floatContainer}>
          <TouchableOpacity onPress={() => setCartModalVisible(true)} activeOpacity={0.9}>
            <Animated.View style={[styles.floatBtn, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.cartIconBadge}><Text style={styles.badgeText}>{totalItems}</Text></View><Text style={styles.floatText}>View Order</Text><Text style={styles.floatPrice}>₱{calculateTotal()}</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}

      {/* MODALS (SCANNER, CART, PAYMENT, SHIFT, RECALL, RECEIPT) RETAINED FROM PREVIOUS STATE... */}
      <Modal visible={scannerVisible} animationType="slide">
        <View style={styles.scannerContainer}>
            <CameraView onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} style={StyleSheet.absoluteFillObject} barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "upc_e"] }} />
            <View style={styles.scannerOverlay}>
                <View style={styles.scannerHeader}><Text style={styles.scannerText}>Scan Product</Text><TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.closeScannerBtn}><Ionicons name="close" size={30} color="#fff" /></TouchableOpacity></View>
                <View style={styles.scannerTarget} /><View style={styles.scannerFooter}><Text style={{color:'#fff', textAlign:'center'}}>Align barcode within the frame</Text></View>
            </View>
        </View>
      </Modal>

      <Modal visible={cartModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Current Order</Text>
            <View style={{flexDirection:'row', gap: 15}}><TouchableOpacity onPress={holdOrder}><Ionicons name="pause-circle-outline" size={28} color={COLORS.accent} /></TouchableOpacity><TouchableOpacity onPress={() => setCartModalVisible(false)}><Ionicons name="close-circle" size={28} color={COLORS.gray} /></TouchableOpacity></View>
          </View>
          <FlatList data={cart} renderItem={({item}) => (<View style={styles.cartRow}><View><Text style={styles.cartItemName}>{item.name}</Text><Text style={styles.cartItemPrice}>₱{(item.price * item.qty).toFixed(2)}</Text></View><View style={styles.qtyControls}><TouchableOpacity onPress={() => updateQty(item, -1)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={COLORS.dark} /></TouchableOpacity><Text style={styles.qtyNum}>{item.qty}</Text><TouchableOpacity onPress={() => updateQty(item, 1)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={COLORS.dark} /></TouchableOpacity></View></View>)} keyExtractor={item => item.id.toString()} contentContainerStyle={{paddingVertical: 10}} />
          <View style={styles.checkoutArea}><View style={styles.totalRow}><Text style={styles.totalLabel}>Total Amount</Text><Text style={styles.totalBig}>₱{calculateTotal()}</Text></View><TouchableOpacity style={styles.checkoutBtn} onPress={openPaymentModal}><Text style={styles.checkoutText}>PROCEED TO PAY</Text><Ionicons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity></View>
        </View>
      </Modal>

      <Modal visible={paymentModalVisible} animationType="fade" transparent>
         <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalPopupCard}>
                <View style={styles.popupHeader}><Text style={styles.popupTitle}>Payment</Text><TouchableOpacity onPress={() => setPaymentModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity></View>
                <View style={styles.payDisplayContainer}><View style={styles.payDisplayHalf}><Text style={styles.payLabelSmall}>TOTAL DUE</Text><Text style={styles.payAmountBig}>₱{calculateTotal()}</Text></View><View style={[styles.payDisplayHalf, {alignItems:'flex-end', borderLeftWidth:1, borderLeftColor: COLORS.light}]}><Text style={styles.payLabelSmall}>CHANGE</Text><Text style={[styles.payAmountBig, {color: COLORS.success}]}>₱{changeDue.toFixed(2)}</Text></View></View>
                <Text style={styles.inputLabelBold}>Cash Received</Text>
                <View style={styles.bigCashInputRow}><Text style={styles.currencySymbol}>₱</Text><TextInput style={styles.bigCashInput} keyboardType="numeric" value={cashReceived} onChangeText={(t) => { setCashReceived(t); setChangeDue(Math.max(0, parseFloat(t || 0) - parseFloat(calculateTotal()))); }} autoFocus placeholder="0.00" placeholderTextColor={COLORS.gray} />{cashReceived !== '' && <TouchableOpacity onPress={() => {setCashReceived(''); setChangeDue(0);}}><Ionicons name="close-circle" size={22} color={COLORS.gray} /></TouchableOpacity>}</View>
                <View style={styles.denomGrid}><TouchableOpacity style={[styles.denomBtn, {backgroundColor: COLORS.accent, flex: 2}]} onPress={handleExactAmount}><Text style={[styles.denomText, {color: '#fff'}]}>Exact Amount</Text></TouchableOpacity>{DENOMINATIONS.map(denom => (<TouchableOpacity key={denom} style={styles.denomBtn} onPress={() => handleQuickCash(denom)}><Text style={styles.denomText}>+{denom}</Text></TouchableOpacity>))}</View>
                <TouchableOpacity style={[styles.checkoutBtn, {marginTop: 20, opacity: parseFloat(cashReceived || 0) >= parseFloat(calculateTotal()) ? 1 : 0.5}]} onPress={finalizeTransaction} disabled={parseFloat(cashReceived || 0) < parseFloat(calculateTotal())}><Text style={styles.checkoutText}>COMPLETE SALE</Text></TouchableOpacity>
            </View>
         </KeyboardAvoidingView>
      </Modal>

      <Modal visible={shiftModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalPopupCard}>
                <View style={{alignItems:'center', marginBottom:25}}><View style={[styles.shiftHeaderIcon, { backgroundColor: isEndingShift ? COLORS.danger : COLORS.success }]}><Ionicons name={isEndingShift ? "log-out" : "power"} size={40} color="#fff" /></View><Text style={styles.shiftTitle}>{isEndingShift ? "Close Shift" : "Start Shift"}</Text><Text style={styles.shiftSubtitle}>{isEndingShift ? "Finalize sales and count the drawer." : "Enter petty cash to begin selling."}</Text></View>
                {isEndingShift && (<View style={styles.shiftSummaryBlock}><View style={styles.shiftSummaryRow}><Text style={styles.summaryLabel}>Starting Cash</Text><Text style={styles.summaryValue}>₱{parseFloat(currentShift?.starting_cash || 0).toFixed(2)}</Text></View><View style={[styles.shiftSummaryRow, { borderBottomWidth:0 }]}><Text style={styles.summaryLabel}>Shift Sales</Text><Text style={[styles.summaryValue, {color: COLORS.success}]}>+₱{shiftSales.toFixed(2)}</Text></View></View>)}
                <Text style={styles.inputLabelBold}>{isEndingShift ? "Final Cash Count (Actual)" : "Starting Petty Cash"}</Text>
                <View style={styles.bigCashInputRow}><Text style={styles.currencySymbol}>₱</Text><TextInput style={styles.bigCashInput} keyboardType="numeric" value={cashCountInput} onChangeText={setCashCountInput} placeholder="0.00" placeholderTextColor={COLORS.gray} /></View>
                <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: isEndingShift ? COLORS.danger : COLORS.success }]} onPress={isEndingShift ? handleEndShift : handleStartShift}><Text style={styles.mainActionText}>{isEndingShift ? "CLOSE SHIFT" : "OPEN REGISTER"}</Text></TouchableOpacity>
                {isEndingShift && <TouchableOpacity onPress={() => setShiftModalVisible(false)} style={styles.cancelTextBtn}><Text style={{color: COLORS.gray, fontWeight:'600'}}>Cancel closing</Text></TouchableOpacity>}
            </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={recallModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalPopupCard}>
                <View style={styles.popupHeader}><Text style={styles.popupTitle}>Held Orders</Text><TouchableOpacity onPress={() => setRecallModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity></View>
                <FlatList data={heldOrders} keyExtractor={item => item.id.toString()} contentContainerStyle={{paddingVertical: 10}} renderItem={({item}) => (<TouchableOpacity style={styles.heldItemCard} onPress={() => recallOrder(item)}><View style={styles.heldItemIcon}><Ionicons name="receipt" size={24} color={COLORS.primary} /></View><View style={{flex:1}}><Text style={styles.heldOrderTitle}>Order #{item.id.toString().slice(-4)}</Text><Text style={styles.heldOrderSub}>{item.items.length} items • {item.time}</Text></View><Text style={styles.heldOrderTotal}>₱{item.total}</Text></TouchableOpacity>)} ListEmptyComponent={<View style={{alignItems:'center', padding: 30}}><Ionicons name="ticket-outline" size={50} color={COLORS.light}/><Text style={{textAlign:'center', marginTop: 10, color: COLORS.gray}}>No held orders right now.</Text></View>} />
            </View>
        </View>
      </Modal>

      <Modal visible={receiptVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalPopupCard}>
            <View style={styles.successIconCircle}><Ionicons name="checkmark" size={50} color="#fff" /></View><Text style={styles.successTitle}>Sale Complete!</Text><Text style={styles.successSub}>Change due: <Text style={{fontWeight:'bold', color: COLORS.dark}}>₱{lastTransaction?.change}</Text></Text>
            <View style={{width:'100%', gap: 12}}><TouchableOpacity style={[styles.mainActionBtn, {backgroundColor: COLORS.secondary, flexDirection:'row', gap:10}]} onPress={handlePrint}><Ionicons name="print" size={20} color="#fff" /><Text style={styles.mainActionText}>Print Receipt</Text></TouchableOpacity><TouchableOpacity style={[styles.mainActionBtn, {backgroundColor: COLORS.lighter}]} onPress={() => setReceiptVisible(false)}><Text style={[styles.mainActionText, {color: COLORS.dark}]}>Next Order</Text></TouchableOpacity></View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lighter },
  header: { backgroundColor: COLORS.secondary, paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  welcomeText: { color: COLORS.gray, fontSize: 12 },
  storeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  endShiftBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'rgba(255,255,255,0.15)', paddingVertical:8, paddingHorizontal:14, borderRadius:20, gap:6 },
  endShiftText: { color:'#fff', fontWeight:'bold', fontSize:12 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, color: COLORS.dark, fontSize: 15 },
  recallBtn: { width: 45, height: 45, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  recallBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: COLORS.danger, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  recallBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  
  // 📢 ANNOUNCEMENT BAR
  announcementBar: { backgroundColor: COLORS.accent, marginHorizontal: 15, marginTop: 10, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', ...COLORS.cardShadow },
  announcementText: { flex: 1, color: COLORS.white, fontWeight: 'bold', fontSize: 13 },

  viewToggleContainer: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginRight: 10, padding: 3 },
  toggleBtn: { padding: 8, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: COLORS.light },
  scanBtn: { width: 45, height: 45, backgroundColor: '#fff', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'space-between' },
  scannerHeader: { paddingTop: 60, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  scannerText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  closeScannerBtn: { padding: 10 },
  scannerTarget: { width: 280, height: 280, borderWidth: 2, borderColor: '#fff', alignSelf: 'center', marginTop: 100, borderRadius: 20 },
  scannerFooter: { paddingBottom: 50, paddingHorizontal: 20, alignItems: 'center' },
  productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 10, marginBottom: 10, ...COLORS.cardShadow },
  rowDisabled: { opacity: 0.6 },
  rowImageContainer: { width: 60, height: 60, borderRadius: 12, backgroundColor: COLORS.lighter, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  rowImage: { width: '100%', height: '100%' },
  rowPlaceholder: { opacity: 0.5 },
  rowDetails: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: COLORS.dark, marginBottom: 2 },
  rowPrice: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  stockOk: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  stockLow: { fontSize: 11, color: '#D97706', marginTop: 2, fontWeight: 'bold' },
  stockError: { fontSize: 11, color: COLORS.danger, fontWeight: 'bold', marginTop: 2 },
  rowButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  gridItem: { width: GRID_ITEM_WIDTH, height: GRID_ITEM_WIDTH * 1.25, borderRadius: 16, overflow: 'hidden', marginBottom: 10, ...COLORS.cardShadow, shadowOpacity: 0.1 },
  gridImageFull: { width: '100%', height: '100%', position: 'absolute' },
  gridImageFallback: { width: '100%', height: '100%', justifyContent:'center', alignItems:'center' },
  gridStockBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, zIndex: 10 },
  gridStockText: { fontSize: 10, fontWeight: 'bold', color: COLORS.dark },
  gridTextOverlay: { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.6)', padding: 8 },
  gridOverlayTitle: { color:'#fff', fontSize: 11, fontWeight:'bold', marginBottom: 2 },
  gridOverlayPrice: { color: COLORS.success, fontSize: 13, fontWeight:'bold' },
  floatContainer: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  floatBtn: { backgroundColor: COLORS.dark, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...COLORS.modalShadow },
  cartIconBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  floatText: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  floatPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalPopupCard: { backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 26, padding: 25, ...COLORS.modalShadow },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  popupTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark },
  mainActionBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  mainActionText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
  cancelTextBtn: { padding: 15, alignItems:'center', marginTop: 5 },
  payDisplayContainer: { flexDirection: 'row', backgroundColor: COLORS.lighter, borderRadius: 16, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  payDisplayHalf: { flex: 1, paddingHorizontal: 10 },
  payLabelSmall: { fontSize: 11, fontWeight:'bold', color: COLORS.gray, marginBottom: 4, letterSpacing: 1 },
  payAmountBig: { fontSize: 22, fontWeight: '900', color: COLORS.dark },
  inputLabelBold: { fontSize: 14, fontWeight:'bold', color: COLORS.dark, marginBottom: 8 },
  bigCashInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 15, height: 55, marginBottom: 20, backgroundColor:'#fff' },
  currencySymbol: { fontSize: 24, fontWeight:'bold', color: COLORS.dark, marginRight: 5 },
  bigCashInput: { flex: 1, fontSize: 24, fontWeight: 'bold', color: COLORS.dark, height:'100%' },
  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  denomBtn: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EEF2FF', flexGrow: 1, alignItems: 'center', justifyContent:'center' },
  denomText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 15 },
  shiftHeaderIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 15, ...COLORS.cardShadow },
  shiftTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginBottom: 5 },
  shiftSubtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', paddingHorizontal: 20 },
  shiftSummaryBlock: { backgroundColor: COLORS.lighter, borderRadius: 16, padding: 15, marginBottom: 20 },
  shiftSummaryRow: { flexDirection:'row', justifyContent:'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  summaryLabel: { fontSize: 14, color: COLORS.gray },
  summaryValue: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  successIconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', marginBottom: 20, alignSelf:'center', ...COLORS.cardShadow },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginBottom: 5, textAlign:'center' },
  successSub: { fontSize: 16, color: COLORS.gray, marginBottom: 25, textAlign:'center' },
  heldItemCard: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: COLORS.lighter, borderRadius: 16, marginBottom: 10 },
  heldItemIcon: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#fff', justifyContent:'center', alignItems:'center', marginRight: 15 },
  heldOrderTitle: { fontWeight: 'bold', fontSize: 16, color: COLORS.dark },
  heldOrderSub: { color: COLORS.gray, fontSize: 13 },
  heldOrderTotal: { fontWeight: 'bold', fontSize: 18, color: COLORS.primary },
  modalContainer: { flex: 1, backgroundColor: COLORS.lighter },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth:1, borderBottomColor: COLORS.lighter },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, marginBottom: 10, borderRadius: 12, marginHorizontal: 20, ...COLORS.cardShadow },
  cartItemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.dark },
  cartItemPrice: { color: COLORS.gray, marginTop: 2, fontSize: 13 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lighter, borderRadius: 8, borderWidth:1, borderColor:'#E5E7EB' },
  qtyBtn: { padding: 8 },
  qtyNum: { fontWeight: 'bold', fontSize: 14, width: 30, textAlign: 'center' },
  checkoutArea: { padding: 25, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', ...COLORS.modalShadow },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  totalLabel: { fontSize: 15, color: COLORS.gray },
  totalBig: { fontSize: 28, fontWeight: '900', color: COLORS.dark },
  checkoutBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  checkoutText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
});