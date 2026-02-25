import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, TextInput, StatusBar, ActivityIndicator, ScrollView,
  SafeAreaView, Platform, RefreshControl, Image, Animated, Easing, KeyboardAvoidingView, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print'; 
import * as Haptics from 'expo-haptics'; 
import { CameraView, useCameraPermissions } from 'expo-camera'; 
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const LOW_STOCK_THRESHOLD = 5;

// ─── 💎 PREMIUM DESIGN TOKENS ─────────────────────────────────────────────
const C = {
  bg:          '#0A0D14', // Deep Space Blue
  surface:     '#131722', // Elevated dark
  surfaceUp:   '#1A1F2E', // Higher elevation
  border:      '#232A3B', // Soft borders
  gold:        '#FFB800', // Vibrant Gold
  goldDim:     '#CC9300',
  goldBg:      '#332700',
  success:     '#10B981',
  successBg:   '#062D1F',
  danger:      '#FF4A4A',
  dangerBg:    '#330F0F',
  info:        '#3B82F6',
  infoBg:      '#0C1A33',
  textPrimary: '#FFFFFF',
  textSec:     '#94A3B8',
  textMuted:   '#64748B',
  white:       '#FFFFFF',
  navy:        '#05070A',
  shadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  glow: { shadowColor: '#FFB800', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 10 },
};

const DENOMINATIONS = [20, 50, 100, 200, 500, 1000];

// ─── ✨ SMOOTH ANIMATED ROW ────────────────────────────────────────────────
const AnimatedProductRow = ({ children, index }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay: index * 50, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 50, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, delay: index * 50, useNativeDriver: true })
    ]).start();
  }, []);

  return <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>{children}</Animated.View>;
};

export default function MerchantScreen({ user }) {
  // --- APP STATE ---
  const [activeMode, setActiveMode] = useState('lobby'); 
  const [activeStore, setActiveStore] = useState(null); 
  const [localProfile, setLocalProfile] = useState(user);
  
  // --- LOBBY STATE ---
  const [myMemberships, setMyMemberships] = useState([]); 
  const [availableManagers, setAvailableManagers] = useState([]); 
  const [pendingApplications, setPendingApplications] = useState([]); 
  const [invitations, setInvitations] = useState([]); 
  const [storeSearch, setStoreSearch] = useState(''); 

  // --- ANNOUNCEMENTS STATE ---
  const [announcements, setAnnouncements] = useState([]);
  const [hiddenAnnouncements, setHiddenAnnouncements] = useState([]);
  const [announcementsModalVisible, setAnnouncementsModalVisible] = useState(false);
  
  // --- POS STATE ---
  const [products, setProducts] = useState([]);
  const [storeFilter, setStoreFilter] = useState('All'); 
  const [cart, setCart] = useState([]);
  const [heldOrders, setHeldOrders] = useState([]); 
  const [currentShift, setCurrentShift] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastTransaction, setLastTransaction] = useState(null);

  // --- DISCOUNT STATE ---
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountType, setDiscountType] = useState('percent'); 
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null); 

  // --- CAMERA & BARCODE STATE ---
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // --- POS UI/CASH STATE ---
  const [cashReceived, setCashReceived] = useState('');
  const [changeDue, setChangeDue] = useState(0);
  const [cashCountInput, setCashCountInput] = useState(''); 
  const [shiftSales, setShiftSales] = useState(0);

  // --- MODAL STATE ---
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [shiftModalVisible, setShiftModalVisible] = useState(false); 
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [isEndingShift, setIsEndingShift] = useState(false); 
  const [printPreviewVisible, setPrintPreviewVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const cartScaleAnim = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => { if (activeMode === 'lobby') fetchLobbyData(); }, [activeMode])
  );

  useEffect(() => {
    if (activeMode === 'lobby') {
      const sub = supabase.channel('merchant:announcements')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, 
          () => { fetchLobbyData(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); })
        .subscribe();
      return () => supabase.removeChannel(sub);
    }
  }, [activeMode]);

  const fetchLobbyData = async () => {
    setRefreshing(true);
    try {
      const { data: updatedProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (updatedProfile) setLocalProfile({ ...updatedProfile, avatar_url: updatedProfile.avatar_url ? `${updatedProfile.avatar_url}?t=${Date.now()}` : null });

      const { data: memberships } = await supabase.from('store_memberships').select('*, manager:manager_id(id, first_name, last_name)').eq('merchant_id', user.id).eq('status', 'active');
      const activeMems = memberships || [];
      setMyMemberships(activeMems);
      const joinedIds = activeMems.map(m => m.manager_id?.id);
      const joinedNames = activeMems.map(m => m.store_name);

      const { data: apps } = await supabase.from('store_applications').select('*').eq('merchant_id', user.id);
      setPendingApplications(apps?.filter(a => a.status === 'pending').map(a => a.manager_id) || []);
      setInvitations(apps?.filter(a => a.status === 'invited') || []);

      const { data: managers } = await supabase.from('profiles').select('id, store_name, first_name, last_name').eq('role', 'manager').not('store_name', 'is', null);
      setAvailableManagers((managers || []).filter(m => !joinedIds.includes(m.id) && !joinedNames.includes(m.store_name)));

      let queryStr = `target_store.eq.ALL`;
      if (joinedNames.length > 0) queryStr += `,${joinedNames.map(n => `target_store.eq.${n}`).join(',')}`;

      const { data: annData } = await supabase.from('announcements').select('*').or(queryStr).eq('is_active', true).order('created_at', { ascending: false });
      setAnnouncements(annData || []);
    } catch (error) { console.error(error); } 
    finally { setRefreshing(false); }
  };

  const handleEnterUnified = async () => {
    setLoading(true);
    try {
      const joinedNames = myMemberships.map(m => m.store_name);
      const { data: allProducts } = await supabase.from('products').select('*').in('store_name', joinedNames).eq('is_active', true);
      setProducts(allProducts || []);
      const { data: shift } = await supabase.from('shifts').select('*').eq('user_id', user.id).eq('store_name', 'Unified POS').eq('status', 'open').single();
      if (shift) {
        setCurrentShift(shift);
        const { data: salesInShift } = await supabase.from('sales').select('total_amount').eq('cashier_name', localProfile.first_name).gte('sale_date', shift.start_time);
        setShiftSales((salesInShift || []).reduce((sum, s) => sum + s.total_amount, 0));
        setShiftModalVisible(false);
      } else { setCurrentShift(null); setIsEndingShift(false); setShiftModalVisible(true); }
      setActiveMode('unified');
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  const handleEnterSingle = async (store) => {
    setLoading(true);
    try {
      const { data: storeProducts } = await supabase.from('products').select('*').eq('store_name', store.store_name).eq('is_active', true);
      setProducts(storeProducts || []);
      const { data: shift } = await supabase.from('shifts').select('*').eq('user_id', user.id).eq('store_name', store.store_name).eq('status', 'open').single();
      if (shift) {
        setCurrentShift(shift);
        const { data: salesInShift } = await supabase.from('sales').select('total_amount').eq('store_name', store.store_name).eq('cashier_name', localProfile.first_name).gte('sale_date', shift.start_time);
        setShiftSales((salesInShift || []).reduce((sum, s) => sum + s.total_amount, 0));
        setShiftModalVisible(false);
      } else { setCurrentShift(null); setIsEndingShift(false); setShiftModalVisible(true); }
      setActiveStore(store); setActiveMode('single');
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  const handleLeaveStore = () => { setActiveMode('lobby'); setActiveStore(null); setCart([]); setAppliedDiscount(null); setStoreFilter('All'); };

  const respondToInvite = async (invite, response) => {
    setLoading(true);
    try {
      if (response === 'accept') await supabase.from('store_memberships').insert([{ merchant_id: user.id, manager_id: invite.manager_id, store_name: invite.store_name, status: 'active' }]);
      await supabase.from('store_applications').delete().eq('id', invite.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(response === 'accept' ? "Welcome!" : "Declined", response === 'accept' ? `You've joined ${invite.store_name}.` : "Invitation removed.");
      fetchLobbyData();
    } catch (error) { Alert.alert("Error", error.message); } 
    finally { setLoading(false); }
  };

  const applyToStore = async (manager) => {
    if (pendingApplications.includes(manager.id)) return;
    setPendingApplications(prev => [...prev, manager.id]);
    const { error } = await supabase.from('store_applications').insert([{ merchant_id: user.id, manager_id: manager.id, store_name: manager.store_name, status: 'pending' }]);
    if (!error) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Application Sent", "The manager will review your request."); fetchLobbyData(); }
    else { setPendingApplications(prev => prev.filter(id => id !== manager.id)); Alert.alert("Error", error.message); }
  };

  const dismissAnnouncement = (id) => { setHiddenAnnouncements(prev => [...prev, id]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const openScanner = async () => {
    if (!permission?.granted) { const { granted } = await requestPermission(); if (!granted) return Alert.alert("No Camera Access", "Camera permission is required."); }
    setScanned(false); setScannerVisible(true);
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    const product = products.find(p => p.barcode === data);
    if (product) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addToCart(product);
      Alert.alert("Product Found", `${product.name} added to cart.`, [
        { text: "Keep Scanning", onPress: () => setScanned(false) },
        { text: "Done", onPress: () => setScannerVisible(false), style: 'cancel' }
      ]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Not Found", `Barcode: ${data}`, [
        { text: "Try Again", onPress: () => setScanned(false) },
        { text: "Cancel", onPress: () => setScannerVisible(false), style: 'cancel' }
      ]);
    }
  };

  const addToCart = (product) => {
    if ((product.stock || 0) <= 0) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    cartScaleAnim.setValue(0.85);
    Animated.spring(cartScaleAnim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }).start();

    const discountPercent = product.discount_percent || 0;
    const finalPrice = product.price - (product.price * (discountPercent / 100));
    const existing = cart.find(item => item.id === product.id);
    
    if (existing) {
      if (existing.qty + 1 > product.stock) return Alert.alert("Low Stock", `Only ${product.stock} left.`);
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else { setCart([...cart, { ...product, original_price: product.price, price: finalPrice, qty: 1 }]); }
  };

  const updateQty = (item, change) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.qty + change < 1) setCart(cart.filter(p => p.id !== item.id));
    else setCart(cart.map(p => p.id === item.id ? { ...p, qty: p.qty + change } : p));
  };

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const calculateDiscountAmount = () => {
    if (!appliedDiscount) return 0;
    const subtotal = calculateSubtotal();
    return appliedDiscount.type === 'percent' ? subtotal * (appliedDiscount.value / 100) : appliedDiscount.value;
  };
  const calculateTotal = () => Math.max(0, calculateSubtotal() - calculateDiscountAmount()).toFixed(2);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  const applyDiscount = () => {
    const val = parseFloat(discountInput);
    if (isNaN(val) || val <= 0) return Alert.alert("Invalid", "Enter a valid discount value.");
    if (discountType === 'percent' && val > 100) return Alert.alert("Invalid", "Percentage cannot exceed 100%.");
    if (discountType === 'fixed' && val > calculateSubtotal()) return Alert.alert("Invalid", "Discount cannot exceed subtotal.");
    setAppliedDiscount({ type: discountType, value: val });
    setDiscountModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const removeDiscount = () => { setAppliedDiscount(null); setDiscountInput(''); setDiscountModalVisible(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const holdOrder = () => {
    if (cart.length === 0) return;
    setHeldOrders([...heldOrders, { id: Date.now(), items: [...cart], time: new Date().toLocaleTimeString(), total: calculateTotal(), discount: appliedDiscount }]);
    setCart([]); setAppliedDiscount(null); setCartModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDiscardOrder = () => {
    if (cart.length === 0) return;
    Alert.alert("Discard Order", "Clear all items?", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => { setCart([]); setAppliedDiscount(null); setCartModalVisible(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } }
    ]);
  };

  const handleQuickCash = (amount) => {
    const newCash = (parseFloat(cashReceived || 0) + amount).toString();
    setCashReceived(newCash);
    setChangeDue(Math.max(0, parseFloat(newCash) - parseFloat(calculateTotal())));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const handleExactAmount = () => { setCashReceived(calculateTotal()); setChangeDue(0); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const finalizeTransaction = async () => {
    const total = parseFloat(calculateTotal());
    const cash = parseFloat(cashReceived || 0);
    if (cash < total) return Alert.alert("Insufficient Cash", "Amount received is less than the total.");
    setLoading(true);
    try {
      const subtotal = calculateSubtotal();
      const totalDiscountAmt = calculateDiscountAmount();
      const groupedCart = cart.reduce((acc, item) => { if(!acc[item.store_name]) acc[item.store_name] = []; acc[item.store_name].push(item); return acc; }, {});
      
      for (const [storeName, items] of Object.entries(groupedCart)) {
        const storeSubtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const storeShareRatio = subtotal > 0 ? (storeSubtotal / subtotal) : 0;
        const storeFinalTotal = storeSubtotal - (totalDiscountAmt * storeShareRatio);
        const { data: saleData, error: saleError } = await supabase.from('sales').insert([{ store_name: storeName, cashier_name: localProfile?.first_name || "Merchant", total_amount: storeFinalTotal, sale_date: new Date().toISOString() }]).select().single();
        if (saleError) throw saleError;
        await supabase.from('sales_items').insert(items.map(i => ({ sale_id: saleData.id, product_id: i.id, quantity: i.qty, unit_price: i.price })));
      }
      for (const item of cart) { const ns = item.stock - item.qty; await supabase.from('products').update({ stock: ns, stock_quantity: ns }).eq('id', item.id); }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastTransaction({ change: changeDue.toFixed(2), total: total.toFixed(2), discount: totalDiscountAmt, items: [...cart], storeName: activeMode === 'unified' ? 'Unified POS' : activeStore?.store_name, cashier: localProfile?.first_name || 'Merchant', date: new Date().toLocaleString() });
      setShiftSales(prev => prev + total);
      setReceiptVisible(true); setPaymentModalVisible(false); setCart([]); setAppliedDiscount(null); setCashReceived('');
      
      if (activeMode === 'unified') handleEnterUnified();
      else if (activeMode === 'single') handleEnterSingle(activeStore);
    } catch (e) { Alert.alert("Transaction Error", e.message); } 
    finally { setLoading(false); }
  };

  const handleStartShift = async () => {
    if (!cashCountInput) return Alert.alert("Required", "Please enter starting cash.");
    setLoading(true);
    const shiftStoreName = activeMode === 'unified' ? 'Unified POS' : activeStore.store_name;
    try {
      const { data, error } = await supabase.from('shifts').insert([{ user_id: user.id, store_name: shiftStoreName, starting_cash: parseFloat(cashCountInput), status: 'open', start_time: new Date().toISOString() }]).select().single();
      if (error) throw error;
      setCurrentShift(data); setShiftModalVisible(false); setCashCountInput(''); setShiftSales(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { Alert.alert("Error", e.message); } 
    finally { setLoading(false); }
  };

  const handleEndShift = async () => {
    if (!cashCountInput) return Alert.alert("Required", "Please count the cash.");
    setLoading(true);
    const actualCash = parseFloat(cashCountInput);
    const expectedCash = parseFloat(currentShift.starting_cash || 0) + shiftSales;
    const discrepancy = actualCash - expectedCash;
    try {
      const { error } = await supabase.from('shifts').update({ end_time: new Date().toISOString(), ending_cash: actualCash, total_sales: shiftSales, cash_discrepancy: discrepancy, status: 'closed' }).eq('id', currentShift.id);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      let msg = `Expected: ₱${expectedCash.toFixed(2)}\nActual: ₱${actualCash.toFixed(2)}\n\n`;
      msg += discrepancy === 0 ? "✅ PERFECT MATCH" : discrepancy > 0 ? `⚠️ OVERAGE: +₱${discrepancy.toFixed(2)}` : `🚨 SHORTAGE: -₱${Math.abs(discrepancy).toFixed(2)}`;
      Alert.alert("Shift Closed", msg, [{ text: "OK", onPress: () => { setCurrentShift(null); setIsEndingShift(false); setCashCountInput(''); setShiftModalVisible(false); }}]);
    } catch (e) { Alert.alert("Error", e.message); } 
    finally { setLoading(false); }
  };

  const generateReceiptHTML = () => {
    if (!lastTransaction) return '';
    const itemsHtml = lastTransaction.items.map(item => `
      <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px;">
        <span style="flex: 1; padding-right: 10px; color: #111;">${item.qty}x ${item.name}</span>
        <span style="font-weight: bold; color: #000;">₱${(item.price * item.qty).toFixed(2)}</span>
      </div>
    `).join('');

    return `
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; background-color: #fff; width: 100%; max-width: 320px; margin: auto; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #333; padding-bottom: 20px; }
          .footer { text-align: center; margin-top: 25px; border-top: 2px dashed #333; padding-top: 20px; font-size: 14px; color: #333; }
          h2 { margin: 0 0 8px 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; }
          p { margin: 3px 0; font-size: 13px; color: #555; }
          .totals-section { border-top: 2px dashed #333; padding-top: 15px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${lastTransaction.storeName}</h2>
          <p>${lastTransaction.date}</p>
          <p>Cashier: ${lastTransaction.cashier}</p>
        </div>
        <div style="margin-bottom: 25px;">${itemsHtml}</div>
        <div class="totals-section">
          <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 20px; margin-bottom: 10px;">
            <span>TOTAL</span><span>₱${lastTransaction.total}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px; color: #444;">
            <span>Discount</span><span>-₱${lastTransaction.discount.toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 5px; color: #444;">
            <span>Change Due</span><span>₱${lastTransaction.change}</span>
          </div>
        </div>
        <div class="footer">
          <p style="font-weight: 900; color: #000; font-size: 16px;">Thank You!</p>
          <p>Please come again.</p>
        </div>
      </body>
      </html>
    `;
  };

  const handleExecutePrint = async () => {
    setIsPrinting(true);
    setTimeout(async () => {
      try { await Print.printAsync({ html: generateReceiptHTML() }); } 
      catch (error) { Alert.alert("Print Error", error.message); } 
      finally { setIsPrinting(false); setPrintPreviewVisible(false); }
    }, 800);
  };

  const displayProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStore = storeFilter === 'All' || p.store_name === storeFilter;
    return matchesSearch && matchesStore;
  });

  const filteredLobby = availableManagers.filter(m => m.store_name.toLowerCase().includes(storeSearch.toLowerCase()));
  const activeAnnouncements = announcements.filter(a => !hiddenAnnouncements.includes(a.id));

  // ═══════════════════════════════════════════════════════
  // 1️⃣  LOBBY UI
  // ═══════════════════════════════════════════════════════
  if (activeMode === 'lobby') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        <View style={styles.lobbyHeader}>
          <View>
            <Text style={styles.headerEyebrow}>MERCHANT DASHBOARD</Text>
            <Text style={styles.headerTitle}>Welcome, {localProfile?.first_name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={() => setAnnouncementsModalVisible(true)} style={styles.bellBtn}>
              <Ionicons name="notifications" size={22} color={C.gold} />
              {activeAnnouncements.length > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{activeAnnouncements.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.avatarWrapper}>
              {localProfile?.avatar_url
                ? <Image source={{ uri: localProfile.avatar_url }} style={styles.avatarImage} />
                : <Text style={styles.avatarText}>{localProfile?.first_name?.[0]}</Text>
              }
            </View>
          </View>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchLobbyData} tintColor={C.gold} />}>

          {/* Unified Card */}
          <View style={{ marginBottom: 30 }}>
            <Text style={styles.sectionTitle}>Network Selling</Text>
            {myMemberships.length > 1 ? (
              <TouchableOpacity style={styles.unifiedCard} onPress={handleEnterUnified} activeOpacity={0.85}>
                <View style={styles.unifiedIcon}><Ionicons name="grid" size={26} color={C.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unifiedTitle}>Start Unified Shift</Text>
                  <Text style={styles.unifiedSub}>Sell for all {myMemberships.length} linked stores</Text>
                </View>
                <Ionicons name="arrow-forward" size={24} color={C.gold} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.unifiedCard, { borderColor: C.border, opacity: 0.6 }]}>
                <View style={[styles.unifiedIcon, { backgroundColor: C.surfaceUp }]}>
                  <Ionicons name="lock-closed" size={22} color={C.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.unifiedTitle, { color: C.textMuted }]}>Feature Locked</Text>
                  <Text style={[styles.unifiedSub, { color: C.textMuted }]}>Owner must assign you to multiple stores.</Text>
                </View>
              </View>
            )}
          </View>

          {/* Invitations */}
          {invitations.length > 0 && (
            <View style={{ marginBottom: 28 }}>
              <Text style={styles.sectionTitle}>Shift Invitations ({invitations.length})</Text>
              {invitations.map(invite => (
                <View key={invite.id} style={styles.inviteCard}>
                  <View style={styles.inviteIcon}><Ionicons name="mail" size={22} color={C.gold} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeName}>{invite.store_name}</Text>
                    <Text style={styles.storeManager}>Unified Shift Request</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => respondToInvite(invite, 'accept')}>
                      {loading ? <ActivityIndicator size="small" color={C.navy} /> : <Ionicons name="checkmark" size={18} color={C.navy} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => respondToInvite(invite, 'decline')}>
                      <Ionicons name="close" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* My Stores */}
          {myMemberships.length > 0 && (
            <View style={{ marginBottom: 28 }}>
              <Text style={styles.sectionTitle}>Assigned Stores</Text>
              {myMemberships.map(item => (
                <TouchableOpacity key={item.id} style={styles.storeCard} onPress={() => handleEnterSingle(item)} activeOpacity={0.8}>
                  <View style={styles.storeIcon}><Ionicons name="briefcase" size={22} color={C.textPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeName}>{item.store_name}</Text>
                    <Text style={styles.storeManager}>Manager: {item.manager?.first_name}</Text>
                  </View>
                  <View style={styles.enterBtn}>
                    <Text style={styles.enterText}>Enter POS</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Find Store */}
          <Text style={styles.sectionTitle}>Discover Stores</Text>
          <View style={styles.lobbySearch}>
            <Ionicons name="search" size={18} color={C.textMuted} />
            <TextInput style={styles.searchInputLobby} placeholder="Search the network..." placeholderTextColor={C.textMuted} value={storeSearch} onChangeText={setStoreSearch} />
          </View>

          {filteredLobby.length > 0 ? filteredLobby.map(item => {
            const isPending = pendingApplications.includes(item.id);
            return (
              <View key={item.id} style={styles.storeCard}>
                <View style={[styles.storeIcon, { backgroundColor: C.surfaceUp }]}>
                  <Ionicons name="storefront" size={20} color={C.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName}>{item.store_name}</Text>
                  <Text style={styles.storeManager}>{item.first_name} {item.last_name}</Text>
                </View>
                {isPending ? (
                  <View style={styles.pendingBadge}><Text style={styles.pendingText}>Pending</Text></View>
                ) : (
                  <TouchableOpacity style={styles.applyBtn} onPress={() => applyToStore(item)}>
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="search-outline" size={32} color={C.textMuted} /></View>
              <Text style={styles.emptyTitle}>No stores found.</Text>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Announcements Modal */}
        <Modal visible={announcementsModalVisible} animationType="slide" transparent>
          <View style={styles.sheetOverlay}>
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetIconBox}><Ionicons name="notifications" size={18} color={C.gold} /></View>
                <Text style={styles.sheetTitle}>Inbox & Alerts</Text>
                <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setAnnouncementsModalVisible(false)}>
                  <Ionicons name="close" size={18} color={C.textSec} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
                {activeAnnouncements.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><Ionicons name="mail-open-outline" size={32} color={C.textMuted} /></View>
                    <Text style={styles.emptyTitle}>All clear. No new messages.</Text>
                  </View>
                ) : activeAnnouncements.map(ann => {
                  const isUrgent = ann.type === 'urgent';
                  const ac = isUrgent ? C.danger : C.info;
                  const acBg = isUrgent ? C.dangerBg : C.infoBg;
                  return (
                    <View key={ann.id} style={[styles.inboxCard, { borderLeftColor: ac, backgroundColor: acBg + '66' }]}>
                      <View style={styles.inboxCardTop}>
                        <View style={[styles.inboxTypeIcon, { backgroundColor: acBg }]}>
                          <Ionicons name={isUrgent ? 'warning' : 'information-circle'} size={16} color={ac} />
                        </View>
                        <Text style={[styles.inboxTypeText, { color: ac }]}>{isUrgent ? 'URGENT' : 'UPDATE'}</Text>
                        <Text style={styles.inboxDate}>{new Date(ann.created_at).toLocaleDateString()}</Text>
                      </View>
                      <Text style={styles.inboxMsg}>{ann.message}</Text>
                      <TouchableOpacity style={styles.markReadBtn} onPress={() => dismissAnnouncement(ann.id)}>
                        <Ionicons name="checkmark-done" size={14} color={C.textMuted} />
                        <Text style={styles.markReadText}>Mark as Read</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════
  // 2️⃣  POS UI
  // ═══════════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* POS Header */}
      <View style={styles.posHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleLeaveStore}>
            <Ionicons name="arrow-back" size={22} color={C.gold} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.posStoreName}>{activeMode === 'unified' ? "Unified System" : activeStore?.store_name}</Text>
            <Text style={styles.posUser}>Cashier: {localProfile?.first_name}</Text>
          </View>
          
          {/* 🌟 REFINED END SHIFT PILL BUTTON */}
          <TouchableOpacity style={styles.endShiftBtn} onPress={() => { setIsEndingShift(true); setCashCountInput(''); setShiftModalVisible(true); }}>
            <Ionicons name="log-out-outline" size={14} color={C.danger} />
            <Text style={styles.endShiftText}>END SHIFT</Text>
          </TouchableOpacity>

        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={C.textMuted} style={{ marginLeft: 16, marginRight: 10 }} />
          <TextInput style={styles.searchInputPOS} placeholder="Search products..." placeholderTextColor={C.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 10 }}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
            <Ionicons name="barcode-outline" size={22} color={C.gold} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Strip */}
      {activeMode === 'unified' && myMemberships.length > 0 && (
        <View style={styles.filterStripContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
            <TouchableOpacity style={[styles.filterChip, storeFilter === 'All' && styles.filterChipActive]} onPress={() => { setStoreFilter('All'); Haptics.selectionAsync(); }}>
              <Text style={[styles.filterChipText, storeFilter === 'All' && styles.filterChipTextActive]}>All Stores</Text>
            </TouchableOpacity>
            {myMemberships.map(m => (
              <TouchableOpacity key={m.id} style={[styles.filterChip, storeFilter === m.store_name && styles.filterChipActive]} onPress={() => { setStoreFilter(m.store_name); Haptics.selectionAsync(); }}>
                <Text style={[styles.filterChipText, storeFilter === m.store_name && styles.filterChipTextActive]}>{m.store_name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ─── PRODUCT LIST ─── */}
      <FlatList
        data={displayProducts}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const hasDiscount = item.discount_percent && item.discount_percent > 0;
          const finalPrice = hasDiscount ? (item.price - (item.price * (item.discount_percent / 100))).toFixed(2) : item.price.toFixed(2);
          const isOutOfStock = (item.stock || 0) <= 0;
          const isLowStock = !isOutOfStock && item.stock <= LOW_STOCK_THRESHOLD;

          return (
            <AnimatedProductRow index={index}>
              <TouchableOpacity
                style={[styles.productCard, isOutOfStock && styles.productCardOutOfStock]}
                activeOpacity={isOutOfStock ? 1 : 0.8}
                onPress={() => !isOutOfStock && addToCart(item)}
              >
                <View style={styles.productThumbBox}>
                  {item.image_url
                    ? <Image source={{ uri: item.image_url }} style={styles.productThumb} />
                    : <View style={styles.productThumbPlaceholder}><Ionicons name="cube-outline" size={26} color={C.textMuted} /></View>
                  }
                </View>
                
                <View style={styles.productContentBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productName, isOutOfStock && { color: C.textMuted }]} numberOfLines={2}>{item.name}</Text>
                    {activeMode === 'unified' && (
                      <View style={styles.storeTagBadge}>
                        <Text style={styles.storeTagText}>{item.store_name}</Text>
                      </View>
                    )}
                    
                    <View style={styles.stockRow}>
                      {isOutOfStock ? (
                        <View style={[styles.stockBadge, { backgroundColor: C.dangerBg, borderColor: C.danger + '44' }]}>
                          <View style={[styles.stockDot, { backgroundColor: C.danger }]} />
                          <Text style={[styles.stockText, { color: C.danger }]}>Out of Stock</Text>
                        </View>
                      ) : isLowStock ? (
                        <View style={[styles.stockBadge, { backgroundColor: C.goldBg, borderColor: C.gold + '44' }]}>
                          <View style={[styles.stockDot, { backgroundColor: C.gold }]} />
                          <Text style={[styles.stockText, { color: C.gold }]}>Low · {item.stock} left</Text>
                        </View>
                      ) : (
                        <View style={[styles.stockBadge, { backgroundColor: C.successBg, borderColor: C.success + '44' }]}>
                          <View style={[styles.stockDot, { backgroundColor: C.success }]} />
                          <Text style={[styles.stockText, { color: C.success }]}>{item.stock} in stock</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  
                  <View style={styles.productRightCol}>
                    {hasDiscount ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={styles.promoBadgeInline}>
                          <Text style={styles.promoText}>{item.discount_percent}% OFF</Text>
                        </View>
                        <Text style={styles.strikePrice}>₱{item.price.toFixed(2)}</Text>
                        <Text style={styles.promoPrice}>₱{finalPrice}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.normalPrice, isOutOfStock && { color: C.textMuted }]}>₱{finalPrice}</Text>
                    )}

                    {!isOutOfStock && (
                      <View style={styles.addBtnCard}>
                        <Ionicons name="add" size={20} color={C.navy} />
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            </AnimatedProductRow>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="cube-outline" size={32} color={C.textMuted} /></View>
            <Text style={styles.emptyTitle}>No products found.</Text>
          </View>
        }
      />

      {/* Floating Cart Pill */}
      {cart.length > 0 && (
        <Animated.View style={[styles.floatPillContainer, { transform: [{ scale: cartScaleAnim }] }]}>
          <TouchableOpacity style={styles.floatPillBtn} activeOpacity={0.85} onPress={() => setCartModalVisible(true)}>
            <View style={styles.floatPillLeft}>
              <View style={styles.cartCountPill}><Text style={styles.cartCountPillText}>{totalItems}</Text></View>
              <Text style={styles.floatPillText}>View Order</Text>
            </View>
            <View style={styles.floatPillRight}>
              <Text style={styles.floatPillTotal}>₱{calculateTotal()}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Scanner Modal */}
      <Modal visible={scannerVisible} animationType="slide">
        <View style={styles.scannerContainer}>
          <CameraView onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} style={StyleSheet.absoluteFillObject} barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "upc_e", "code128"] }} />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerText}>Scan Barcode</Text>
              <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.closeScannerBtn}>
                <Ionicons name="close" size={30} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.scannerTarget} />
            <View style={styles.scannerFooter}>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 15, fontWeight: '600' }}>Align barcode within the frame</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── CART MODAL ─── */}
      <Modal visible={cartModalVisible} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}><Ionicons name="receipt" size={18} color={C.gold} /></View>
              <Text style={styles.sheetTitle}>Current Order</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.sheetActionBtn, { borderColor: C.danger + '44' }]} onPress={handleDiscardOrder}>
                  <Ionicons name="trash" size={16} color={C.danger} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sheetActionBtn, { borderColor: C.gold + '44' }]} onPress={holdOrder}>
                  <Ionicons name="pause" size={16} color={C.gold} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setCartModalVisible(false)}>
                  <Ionicons name="close" size={18} color={C.textSec} />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={cart}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.cartItemRow}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    {activeMode === 'unified' && (
                      <View style={[styles.storeTagBadge, { marginTop: 4, marginBottom: 4 }]}>
                        <Text style={styles.storeTagText}>{item.store_name}</Text>
                      </View>
                    )}
                    {item.discount_percent > 0 && (
                      <Text style={styles.cartItemPromo}>{item.discount_percent}% Manager Promo</Text>
                    )}
                    <Text style={styles.cartItemPrice}>₱{(item.price * item.qty).toFixed(2)}</Text>
                  </View>
                  <View style={styles.qtyController}>
                    <TouchableOpacity onPress={() => updateQty(item, -1)} style={styles.qtyBtn}>
                      <Ionicons name="remove" size={16} color={C.gold} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => updateQty(item, 1)} style={styles.qtyBtn}>
                      <Ionicons name="add" size={16} color={C.gold} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />

            <View style={styles.checkoutFooter}>
              <View style={styles.summaryBlock}>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>₱{calculateSubtotal().toFixed(2)}</Text>
                </View>

                <TouchableOpacity style={styles.discountLine} onPress={() => setDiscountModalVisible(true)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.discountIcon, { backgroundColor: appliedDiscount ? C.goldBg : C.surfaceUp, borderColor: appliedDiscount ? C.gold + '44' : C.border }]}>
                      <Ionicons name="pricetag" size={12} color={appliedDiscount ? C.gold : C.textMuted} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: appliedDiscount ? C.gold : C.textMuted }]}>
                      {appliedDiscount
                        ? `Discount (${appliedDiscount.type === 'percent' ? appliedDiscount.value + '%' : '₱' + appliedDiscount.value})`
                        : 'Add Discount'}
                    </Text>
                  </View>
                  <Text style={[styles.summaryValue, { color: appliedDiscount ? C.gold : C.textMuted }]}>
                    {appliedDiscount ? `- ₱${calculateDiscountAmount().toFixed(2)}` : '₱0.00'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.summaryDivider} />
                <View style={styles.totalDueRow}>
                  <View>
                    <Text style={styles.totalDueLabel}>Total Due</Text>
                    <Text style={styles.totalDueValue}>₱{calculateTotal()}</Text>
                  </View>
                  <View style={styles.itemCountBadge}>
                    <Text style={styles.itemCountText}>{totalItems} item{totalItems !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity style={styles.checkoutBtn} activeOpacity={0.85} onPress={() => { setCartModalVisible(false); setPaymentModalVisible(true); }}>
                <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── DISCOUNT MODAL ─── */}
      <Modal visible={discountModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.centerOverlay}>
          <View style={styles.centerCard}>
            <TouchableOpacity style={styles.centerCloseBtn} onPress={() => setDiscountModalVisible(false)}>
              <Ionicons name="close" size={22} color={C.textSec} />
            </TouchableOpacity>
            <View style={styles.centerIconRing}>
              <Ionicons name="pricetag" size={30} color={C.gold} />
            </View>
            <Text style={styles.centerTitle}>Apply Discount</Text>

            <View style={styles.segmentedControl}>
              <TouchableOpacity style={[styles.segmentBtn, discountType === 'percent' && styles.segmentBtnActive]} onPress={() => setDiscountType('percent')}>
                <Text style={[styles.segmentText, discountType === 'percent' && styles.segmentTextActive]}>Percentage (%)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segmentBtn, discountType === 'fixed' && styles.segmentBtnActive]} onPress={() => setDiscountType('fixed')}>
                <Text style={[styles.segmentText, discountType === 'fixed' && styles.segmentTextActive]}>Amount (₱)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cashInputBox}>
              <Text style={styles.currencyPrefix}>{discountType === 'fixed' ? '₱' : '%'}</Text>
              <TextInput style={styles.cashInputField} keyboardType="numeric" placeholder="0" placeholderTextColor={C.textMuted} value={discountInput} onChangeText={setDiscountInput} />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={applyDiscount}>
              <Text style={styles.primaryBtnText}>Apply Discount</Text>
            </TouchableOpacity>
            {appliedDiscount && (
              <TouchableOpacity style={styles.dangerSecBtn} onPress={removeDiscount}>
                <Ionicons name="trash-outline" size={16} color={C.danger} />
                <Text style={styles.dangerSecBtnText}>Remove Discount</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── PAYMENT MODAL (FULL SCREEN) ─── */}
      <Modal visible={paymentModalVisible} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.paymentScreen}>
          <SafeAreaView style={{ flex: 1 }}>

            <View style={styles.paymentNav}>
              <TouchableOpacity style={styles.paymentBackBtn} onPress={() => setPaymentModalVisible(false)}>
                <Ionicons name="arrow-back" size={20} color={C.gold} />
              </TouchableOpacity>
              <Text style={styles.paymentNavTitle}>Cash Payment</Text>
              <View style={styles.paymentNavRight}>
                <Ionicons name="cash" size={20} color={C.textMuted} />
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.paymentScrollContent}>
              <View style={styles.paymentHeroCard}>
                <Text style={styles.paymentHeroEyebrow}>TOTAL DUE</Text>
                <Text style={styles.paymentHeroAmount}>₱{calculateTotal()}</Text>

                <View style={styles.paymentHeroRow}>
                  <View style={styles.paymentHeroStat}>
                    <Text style={styles.paymentHeroStatLabel}>CASH IN</Text>
                    <Text style={styles.paymentHeroStatValue}>
                      {cashReceived ? `₱${parseFloat(cashReceived).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                    </Text>
                  </View>
                  <View style={styles.paymentHeroDivider} />
                  <View style={styles.paymentHeroStat}>
                    <Text style={styles.paymentHeroStatLabel}>CHANGE</Text>
                    <Text style={[styles.paymentHeroStatValue, { color: changeDue > 0 ? C.success : C.textMuted }]}>
                      {cashReceived ? `₱${changeDue.toFixed(2)}` : '—'}
                    </Text>
                  </View>
                </View>

                {cashReceived.length > 0 && (
                  <View style={[styles.paymentSufficiencyBadge, { backgroundColor: parseFloat(cashReceived) >= parseFloat(calculateTotal()) ? C.successBg : C.dangerBg, borderColor: parseFloat(cashReceived) >= parseFloat(calculateTotal()) ? C.success + '55' : C.danger + '55' }]}>
                    <Ionicons name={parseFloat(cashReceived) >= parseFloat(calculateTotal()) ? 'checkmark-circle' : 'alert-circle'} size={14} color={parseFloat(cashReceived) >= parseFloat(calculateTotal()) ? C.success : C.danger} />
                    <Text style={[styles.paymentSufficiencyText, { color: parseFloat(cashReceived) >= parseFloat(calculateTotal()) ? C.success : C.danger }]}>
                      {parseFloat(cashReceived) >= parseFloat(calculateTotal()) ? 'Sufficient' : `Short ₱${(parseFloat(calculateTotal()) - parseFloat(cashReceived)).toFixed(2)}`}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.paymentSection}>
                <Text style={styles.paymentSectionLabel}>CASH RECEIVED</Text>
                <View style={styles.paymentCashInput}>
                  <Text style={styles.paymentCurrencySign}>₱</Text>
                  <TextInput
                    style={styles.paymentCashField}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    autoFocus
                    value={cashReceived}
                    onChangeText={(t) => {
                      setCashReceived(t);
                      setChangeDue(Math.max(0, parseFloat(t || 0) - parseFloat(calculateTotal())));
                    }}
                  />
                  {cashReceived.length > 0 && (
                    <TouchableOpacity onPress={() => { setCashReceived(''); setChangeDue(0); }} style={styles.paymentClearBtn}>
                      <Ionicons name="close-circle" size={24} color={C.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.paymentSection}>
                <Text style={styles.paymentSectionLabel}>QUICK CASH</Text>
                <TouchableOpacity style={styles.exactBtn} onPress={handleExactAmount}>
                  <Ionicons name="checkmark-done" size={16} color={C.navy} />
                  <Text style={styles.exactBtnText}>Exact Amount  —  ₱{calculateTotal()}</Text>
                </TouchableOpacity>

                <View style={styles.denomGrid}>
                  {DENOMINATIONS.map(d => (
                    <TouchableOpacity key={d} style={styles.denomBtn} onPress={() => handleQuickCash(d)}>
                      <Text style={styles.denomBtnLabel}>+₱{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.paymentFooter}>
              <TouchableOpacity
                style={[styles.completeSaleBtn, { opacity: parseFloat(cashReceived || 0) >= parseFloat(calculateTotal()) ? 1 : 0.4 }]}
                onPress={finalizeTransaction}
                disabled={loading || parseFloat(cashReceived || 0) < parseFloat(calculateTotal())}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color={C.navy} size="small" /> : <Text style={styles.completeSaleBtnText}>Complete Sale</Text>}
              </TouchableOpacity>
            </View>

          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── SHIFT MODAL ─── */}
      <Modal visible={shiftModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.centerOverlay}>
          <View style={styles.centerCard}>
            <TouchableOpacity style={styles.centerCloseBtn} onPress={() => setShiftModalVisible(false)}>
              <Ionicons name="close" size={22} color={C.textSec} />
            </TouchableOpacity>
            <View style={[styles.centerIconRing, { backgroundColor: isEndingShift ? C.dangerBg : C.successBg, borderColor: (isEndingShift ? C.danger : C.success) + '44' }]}>
              <Ionicons name={isEndingShift ? "log-out" : "cash"} size={36} color={isEndingShift ? C.danger : C.success} />
            </View>
            <Text style={styles.centerTitle}>{isEndingShift ? "End Shift" : "Start Shift"}</Text>
            <Text style={styles.centerSub}>
              {isEndingShift
                ? `Count your cash drawer for ${activeMode === 'unified' ? 'Unified POS' : activeStore?.store_name}.`
                : `Enter starting petty cash to open your ${activeMode === 'unified' ? 'unified' : 'store'} shift.`}
            </Text>
            <View style={styles.cashInputBox}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput style={styles.cashInputField} keyboardType="numeric" placeholder="0.00" placeholderTextColor={C.textMuted} value={cashCountInput} onChangeText={setCashCountInput} />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: isEndingShift ? C.danger : C.success }]} onPress={isEndingShift ? handleEndShift : handleStartShift} disabled={loading}>
              {loading ? <ActivityIndicator color={C.navy} /> : <Text style={[styles.primaryBtnText, {color: '#fff'}]}>{isEndingShift ? "Close Register" : "Open Register"}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── TRANSACTION SUCCESS MODAL ─── */}
      <Modal visible={receiptVisible} animationType="fade" transparent>
        <View style={styles.centerOverlay}>
          <View style={styles.centerCard}>
            <View style={[styles.centerIconRing, { backgroundColor: C.successBg, borderColor: C.success + '44' }]}>
              <Ionicons name="checkmark-circle" size={44} color={C.success} />
            </View>
            <Text style={styles.centerTitle}>Transaction Complete</Text>
            <Text style={styles.receiptTotal}>₱{lastTransaction?.total}</Text>
            <View style={styles.receiptChangeBox}>
              <Text style={styles.receiptChangeLabel}>CHANGE DUE</Text>
              <Text style={styles.receiptChangeValue}>₱{lastTransaction?.change}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setReceiptVisible(false)}>
              <Text style={styles.primaryBtnText}>Next Customer</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setReceiptVisible(false); setPrintPreviewVisible(true); }}>
              <Ionicons name="print-outline" size={18} color={C.gold} />
              <Text style={styles.secondaryBtnText}>Print Receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🌟 PRINT PREVIEW MODAL */}
      <Modal visible={printPreviewVisible} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}><Ionicons name="print" size={18} color={C.gold} /></View>
              <Text style={styles.sheetTitle}>Receipt Printer</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setPrintPreviewVisible(false)}>
                <Ionicons name="close" size={18} color={C.textSec} />
              </TouchableOpacity>
            </View>
            
            <View style={{ padding: 20 }}>
              {/* Receipt Preview Window */}
              <View style={styles.receiptPreviewBox}>
                  <Text style={styles.receiptPreviewStore}>{lastTransaction?.storeName}</Text>
                  <Text style={styles.receiptPreviewDate}>{lastTransaction?.date}</Text>
                  <View style={{height: 1, backgroundColor: '#ddd', borderStyle: 'dashed', marginVertical: 10}} />
                  
                  <ScrollView style={{maxHeight: 120}}>
                    {lastTransaction?.items?.map((item, idx) => (
                        <View key={idx} style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                            <Text style={styles.receiptPreviewText}>{item.qty}x {item.name}</Text>
                            <Text style={styles.receiptPreviewText}>₱{(item.price * item.qty).toFixed(2)}</Text>
                        </View>
                    ))}
                  </ScrollView>
                  
                  <View style={{height: 1, backgroundColor: '#ddd', borderStyle: 'dashed', marginVertical: 10}} />
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <Text style={[styles.receiptPreviewText, {fontWeight: 'bold'}]}>TOTAL</Text>
                      <Text style={[styles.receiptPreviewText, {fontWeight: 'bold'}]}>₱{lastTransaction?.total}</Text>
                  </View>
              </View>

              {/* Instructions */}
              <View style={styles.bluetoothInstructionBox}>
                  <Ionicons name="bluetooth" size={24} color={C.info} style={{marginRight: 10}} />
                  <Text style={styles.bluetoothInstructionText}>Ensure your Thermal Printer is paired via Bluetooth or Wi-Fi. Pressing Print will open the system dialog.</Text>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleExecutePrint} disabled={isPrinting}>
                {isPrinting ? <ActivityIndicator color={C.navy} /> : (
                  <>
                    <Ionicons name="print" size={20} color={C.navy} />
                    <Text style={styles.primaryBtnText}>Print Now</Text>
                  </>
                )}
              </TouchableOpacity>

            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Lobby Header ──
  lobbyHeader: {
    backgroundColor: C.surface,
    paddingHorizontal: 20, paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerEyebrow: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: C.textPrimary },

  bellBtn: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: C.surfaceUp,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: C.danger, borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.surface,
  },
  bellBadgeText: { color: C.white, fontSize: 9, fontWeight: '900' },

  avatarWrapper: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: C.goldBg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1.5, borderColor: C.gold + '66',
  },
  avatarText: { color: C.gold, fontSize: 18, fontWeight: '900' },
  avatarImage: { width: '100%', height: '100%' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: C.textMuted,
    letterSpacing: 2, marginBottom: 14, textTransform: 'uppercase',
  },

  // ── Unified Card ──
  unifiedCard: {
    backgroundColor: C.surface, padding: 18, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: C.gold + '33', ...C.glow,
  },
  unifiedIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.goldBg, alignItems: 'center', justifyContent: 'center',
  },
  unifiedTitle: { color: C.gold, fontSize: 17, fontWeight: '800', marginBottom: 3 },
  unifiedSub: { color: C.textMuted, fontSize: 12 },

  // ── Invite Card ──
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    padding: 16, borderRadius: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.gold + '44', borderLeftWidth: 3, borderLeftColor: C.gold,
  },
  inviteIcon: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: C.goldBg, alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  acceptBtn: { backgroundColor: C.gold, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { backgroundColor: C.dangerBg, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.danger + '44' },

  storeCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    padding: 16, borderRadius: 18, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  storeIcon: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: C.surfaceUp, alignItems: 'center', justifyContent: 'center', marginRight: 14,
    borderWidth: 1, borderColor: C.border
  },
  storeName: { fontSize: 15, fontWeight: '800', color: C.textPrimary },
  storeManager: { fontSize: 12, color: C.textMuted, marginTop: 3 },

  enterBtn: {
    backgroundColor: C.gold, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  enterText: { color: C.navy, fontWeight: '800', fontSize: 13 },

  lobbySearch: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    paddingHorizontal: 14, height: 50, borderRadius: 14, marginBottom: 16,
    borderWidth: 1, borderColor: C.border, gap: 10,
  },
  searchInputLobby: { flex: 1, fontSize: 15, color: C.textPrimary },

  applyBtn: { backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: C.gold + '44' },
  applyBtnText: { color: C.gold, fontWeight: '800', fontSize: 13 },
  pendingBadge: { backgroundColor: C.goldBg, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: C.gold + '33' },
  pendingText: { color: C.gold, fontWeight: '700', fontSize: 12 },

  // ── Inbox ──
  inboxCard: {
    borderRadius: 16, padding: 16, marginBottom: 12, marginTop: 8,
    borderLeftWidth: 4, borderWidth: 1, borderColor: C.border,
  },
  inboxCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  inboxTypeIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  inboxTypeText: { fontSize: 11, fontWeight: '800', flex: 1, letterSpacing: 0.8 },
  inboxDate: { fontSize: 10, color: C.textMuted },
  inboxMsg: { fontSize: 13, color: C.textSec, lineHeight: 19, marginBottom: 12 },
  markReadBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  markReadText: { fontSize: 12, color: C.textMuted, fontWeight: '700' },

  // ── POS Header ──
  posHeader: {
    backgroundColor: C.surface, paddingHorizontal: 16, paddingBottom: 14,
    paddingTop: Platform.OS === 'android' ? 44 : 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: C.surfaceUp,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  posStoreName: { color: C.textPrimary, fontSize: 20, fontWeight: '900' },
  posUser: { color: C.textMuted, fontSize: 12, marginTop: 1 },
  
  // 🌟 REFINED PILL BUTTON
  endShiftBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surfaceUp, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
  },
  endShiftText: { color: C.textSec, fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceUp,
    borderRadius: 14, height: 50, borderWidth: 1, borderColor: C.border,
  },
  searchInputPOS: { flex: 1, fontSize: 15, color: C.textPrimary },
  scanBtn: {
    height: '100%', paddingHorizontal: 14,
    borderTopRightRadius: 14, borderBottomRightRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderLeftWidth: 1, borderLeftColor: C.border, backgroundColor: C.goldBg + '66',
  },

  // ── Filter Strip ──
  filterStripContainer: { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: C.surfaceUp, borderWidth: 1, borderColor: C.border,
  },
  filterChipActive: { backgroundColor: C.gold, borderColor: C.gold },
  filterChipText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  filterChipTextActive: { color: C.navy },

  // ── Product Card (Aesthetic layout) ──
  productCard: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 20, marginBottom: 14,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', padding: 12, alignItems: 'center'
  },
  productCardOutOfStock: { opacity: 0.5, borderColor: C.danger + '44' },
  
  productThumbBox: {
    width: 76, height: 76, borderRadius: 14, backgroundColor: C.surfaceUp,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', flexShrink: 0,
  },
  productThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  productThumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  productContentBox: { flex: 1, flexDirection: 'row', marginLeft: 14 },
  productName: { fontSize: 16, fontWeight: '800', color: C.textPrimary, lineHeight: 22, marginBottom: 4 },

  storeTagBadge: {
    alignSelf: 'flex-start', backgroundColor: C.surfaceUp,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1, borderColor: C.border, marginBottom: 6,
  },
  storeTagText: { fontSize: 9, color: C.textSec, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  stockRow: { flexDirection: 'row', marginTop: 4 },
  stockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  stockDot: { width: 5, height: 5, borderRadius: 3 },
  stockText: { fontSize: 10, fontWeight: '700' },

  productRightCol: { alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: 10 },
  normalPrice: { fontSize: 18, fontWeight: '900', color: C.gold, letterSpacing: -0.5 },
  
  promoBadgeInline: {
    backgroundColor: C.goldBg, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: C.gold + '44', marginBottom: 2
  },
  promoText: { color: C.gold, fontSize: 9, fontWeight: '900' },
  strikePrice: { fontSize: 11, color: C.textMuted, textDecorationLine: 'line-through' },
  promoPrice: { fontSize: 18, color: C.gold, fontWeight: '900', letterSpacing: -0.5 },

  addBtnCard: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: C.gold,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },

  // ── Floating Cart (Pill Style) ──
  floatPillContainer: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, alignSelf: 'center', zIndex: 100 },
  floatPillBtn: {
    backgroundColor: C.gold, borderRadius: 30, height: 60, width: width * 0.85,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20,
    ...C.glow
  },
  floatPillLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cartCountPill: { backgroundColor: C.navy, width: 30, height: 30, borderRadius: 15, justifyContent:'center', alignItems:'center' },
  cartCountPillText: { color: C.gold, fontWeight: '900', fontSize: 14 },
  floatPillText: { color: C.navy, fontSize: 16, fontWeight: '800' },
  floatPillRight: { backgroundColor: 'rgba(5, 7, 10, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  floatPillTotal: { color: C.navy, fontSize: 18, fontWeight: '900' },

  // ── Bottom Sheet (Cart & Modals) ──
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingTop: 16, maxHeight: height * 0.90, borderWidth: 1, borderColor: C.border, borderBottomWidth: 0,
  },
  sheetHandle: { width: 44, height: 5, backgroundColor: C.textMuted, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  sheetHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 12,
  },
  sheetIconBox: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: C.goldBg,
    borderWidth: 1, borderColor: C.gold + '44', alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: C.textPrimary },
  sheetCloseBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceUp,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  sheetActionBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceUp,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },

  // ── Cart Items ──
  cartItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  cartItemInfo: { flex: 1, paddingRight: 12 },
  cartItemName: { fontWeight: '800', fontSize: 15, color: C.textPrimary, marginBottom: 2 },
  cartItemPromo: { fontSize: 10, color: C.gold, fontWeight: '700', marginBottom: 3 },
  cartItemPrice: { color: C.gold, fontWeight: '800', fontSize: 15, marginTop: 4 },
  qtyController: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceUp,
    borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.border, gap: 2,
  },
  qtyBtn: {
    width: 34, height: 34, backgroundColor: C.surface, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  qtyValue: { fontWeight: '800', width: 34, textAlign: 'center', fontSize: 16, color: C.textPrimary },

  // ── Checkout Footer ──
  checkoutFooter: { padding: 24, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  summaryBlock: {
    backgroundColor: C.surfaceUp, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: C.border, marginBottom: 20,
  },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  summaryLabel: { fontSize: 14, color: C.textSec, fontWeight: '600' },
  summaryValue: { fontSize: 16, color: C.textPrimary, fontWeight: '700' },
  discountLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border,
    borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 14,
  },
  discountIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  summaryDivider: { height: 1, backgroundColor: C.border, marginBottom: 14 },
  totalDueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalDueLabel: { fontSize: 12, color: C.textMuted, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' },
  totalDueValue: { fontSize: 32, fontWeight: '900', color: C.gold, letterSpacing: -1 },
  itemCountBadge: { backgroundColor: C.goldBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.gold + '44' },
  itemCountText: { color: C.gold, fontSize: 12, fontWeight: '800' },
  checkoutBtn: {
    backgroundColor: C.gold, height: 60, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    ...C.glow
  },
  checkoutBtnText: { color: C.navy, fontSize: 18, fontWeight: '900' },

  // ── Payment Full Screen ──
  paymentScreen: { flex: 1, backgroundColor: C.bg },
  paymentNav: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 14,
  },
  paymentBackBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  paymentNavTitle: { flex: 1, fontSize: 20, fontWeight: '900', color: C.textPrimary },
  paymentNavRight: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  paymentScrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, gap: 24 },

  paymentHeroCard: {
    backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.gold + '44',
    padding: 28, alignItems: 'center', ...C.glow
  },
  paymentHeroEyebrow: { fontSize: 12, fontWeight: '800', color: C.textMuted, letterSpacing: 2.5, marginBottom: 8 },
  paymentHeroAmount: { fontSize: 56, fontWeight: '900', color: C.gold, letterSpacing: -2, marginBottom: 28 },
  paymentHeroRow: { flexDirection: 'row', width: '100%', backgroundColor: C.surfaceUp, borderRadius: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  paymentHeroStat: { flex: 1, paddingVertical: 18, alignItems: 'center' },
  paymentHeroDivider: { width: 1, backgroundColor: C.border },
  paymentHeroStatLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  paymentHeroStatValue: { fontSize: 20, fontWeight: '900', color: C.textPrimary },
  paymentSufficiencyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  paymentSufficiencyText: { fontSize: 13, fontWeight: '800' },

  paymentSection: { gap: 14 },
  paymentSectionLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, letterSpacing: 2, marginBottom: 2 },
  paymentCashInput: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 20, borderWidth: 2, borderColor: C.gold, paddingHorizontal: 24, height: 80, ...C.glow
  },
  paymentCurrencySign: { fontSize: 34, fontWeight: '900', color: C.gold, marginRight: 10 },
  paymentCashField: { flex: 1, fontSize: 40, fontWeight: '900', color: C.textPrimary, letterSpacing: -1 },
  paymentClearBtn: { padding: 4 },

  exactBtn: { backgroundColor: C.gold, borderRadius: 18, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  exactBtnText: { color: C.navy, fontSize: 16, fontWeight: '900' },
  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  denomBtn: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 20, width: '31%', alignItems: 'center'
  },
  denomBtnLabel: { color: C.gold, fontWeight: '800', fontSize: 17 },

  paymentFooter: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 24, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  completeSaleBtn: { backgroundColor: C.gold, height: 64, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...C.glow },
  completeSaleBtnText: { color: C.navy, fontSize: 19, fontWeight: '900', textAlign: 'center' },

  // ── Center Modals ──
  centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  centerCard: { backgroundColor: C.surface, width: '100%', maxWidth: 360, borderRadius: 32, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: C.border, ...C.shadow },
  centerCloseBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceUp, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  centerIconRing: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.goldBg, borderWidth: 1.5, borderColor: C.gold + '44', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  centerTitle: { fontSize: 24, fontWeight: '900', color: C.textPrimary, marginBottom: 10, textAlign: 'center' },
  centerSub: { color: C.textSec, textAlign: 'center', marginBottom: 24, fontSize: 14, lineHeight: 22 },

  // ── Receipt Preview ──
  receiptPreviewBox: { backgroundColor: '#F8FAFC', padding: 24, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#CBD5E1' },
  receiptPreviewStore: { fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  receiptPreviewDate: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 10 },
  receiptPreviewText: { fontSize: 15, color: '#1E293B', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  bluetoothInstructionBox: { flexDirection: 'row', backgroundColor: C.infoBg, padding: 18, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: C.info + '55', alignItems: 'center' },
  bluetoothInstructionText: { color: C.info, flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },

  // ── Segmented Control ──
  segmentedControl: { flexDirection: 'row', backgroundColor: C.surfaceUp, borderRadius: 16, padding: 6, marginBottom: 24, width: '100%', borderWidth: 1, borderColor: C.border },
  segmentBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
  segmentBtnActive: { backgroundColor: C.gold },
  segmentText: { fontWeight: '800', color: C.textMuted, fontSize: 14 },
  segmentTextActive: { color: C.navy },
  cashInputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: C.gold, borderRadius: 18, paddingHorizontal: 20, height: 72, marginBottom: 24, backgroundColor: C.surfaceUp, width: '100%' },

  // ── Receipt ──
  receiptTotal: { fontSize: 40, fontWeight: '900', color: C.gold, marginBottom: 20, letterSpacing: -1 },
  receiptChangeBox: { backgroundColor: C.successBg, padding: 18, borderRadius: 18, width: '100%', alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: C.success + '44' },
  receiptChangeLabel: { fontSize: 11, color: C.success, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  receiptChangeValue: { fontSize: 28, color: C.success, fontWeight: '900' },

  // ── Shared Buttons ──
  primaryBtn: { backgroundColor: C.gold, height: 60, borderRadius: 18, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, ...C.glow },
  primaryBtnText: { color: C.navy, fontSize: 17, fontWeight: '900' },
  secondaryBtn: { backgroundColor: C.surfaceUp, height: 56, borderRadius: 16, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: C.gold + '44' },
  secondaryBtnText: { color: C.gold, fontSize: 16, fontWeight: '800' },
  dangerSecBtn: { backgroundColor: C.dangerBg, height: 52, borderRadius: 14, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: C.danger + '33' },
  dangerSecBtnText: { color: C.danger, fontSize: 15, fontWeight: '800' },

  // ── Scanner ──
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'space-between' },
  scannerHeader: { paddingTop: Platform.OS === 'android' ? 60 : 40, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(10, 13, 20, 0.8)' },
  scannerText: { color: C.gold, fontSize: 24, fontWeight: '900' },
  closeScannerBtn: { padding: 12 },
  scannerTarget: { width: 280, height: 280, borderWidth: 3, borderColor: C.gold, alignSelf: 'center', marginTop: 100, borderRadius: 30, backgroundColor: 'rgba(255, 184, 0, 0.1)' },
  scannerFooter: { paddingBottom: 60, paddingHorizontal: 24, alignItems: 'center', backgroundColor: 'rgba(10, 13, 20, 0.8)', paddingTop: 24 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 12 },
  emptyIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.textSec, textAlign: 'center' },
});