import React, { useState, useCallback } from 'react'; // <--- Added useCallback
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, ScrollView, ActivityIndicator, StatusBar, 
  Dimensions, SafeAreaView, Platform, RefreshControl, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native'; // <--- NEW IMPORT
import * as Print from 'expo-print'; 
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const isTablet = width >= 768; 

const COLORS = {
  primary: '#4F46E5',    
  success: '#10B981',    
  danger: '#EF4444',     
  warning: '#F59E0B',
  dark: '#111827',       
  gray: '#9CA3AF',       
  light: '#F3F4F6',      
  white: '#FFFFFF',
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  }
};

export default function MerchantScreen({ user }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [storeName, setStoreName] = useState("MY STORE");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);

  // --- REPLACED useEffect WITH useFocusEffect ---
  // This ensures data reloads EVERY time you switch to this tab
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user])
  );

  const fetchData = async () => {
    // We don't set loading=true here to avoid a "flash" every time you switch tabs
    // unless it is an explicit pull-to-refresh
    if (refreshing) setLoading(true);

    // A. Fetch Products
    const { data: prodData, error: prodError } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (prodError) Alert.alert("Error", prodError.message);
    else setProducts(prodData || []);

    // B. Fetch Store Name
    if (user?.store_name) {
      setStoreName(user.store_name);
    } 
    else if (user?.id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('store_name')
        .eq('id', user.id)
        .single();
      
      if (profileData?.store_name) {
        setStoreName(profileData.store_name);
      }
    }

    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // --- CART LOGIC ---
  const addToCart = (product) => {
    const currentStock = product.stock ?? 0;
    if (currentStock <= 0) return Alert.alert("Out of Stock", "Item unavailable.");
    
    const existing = cart.find(item => item.id === product.id);
    if (existing && existing.qty + 1 > currentStock) {
      return Alert.alert("Low Stock", `Only ${currentStock} available.`);
    }
    
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  // --- CHECKOUT ---
  const handleCheckout = async () => {
    if (cart.length === 0) return Alert.alert("Empty Cart", "Add items to start.");
    setProcessing(true);
    const total = parseFloat(calculateTotal());
    
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert([{
        store_name: storeName,
        cashier_name: user?.first_name || "Merchant",
        total_amount: total,
        sale_date: new Date().toISOString()
      }])
      .select()
      .single();

    if (saleError) {
      Alert.alert("Sale Error", saleError.message);
      setProcessing(false);
      return;
    }
    const saleId = saleData.id;

    const salesItemsData = cart.map(item => ({
      sale_id: saleId,
      product_id: item.id,
      quantity: item.qty,
      unit_price: item.price
    }));

    const { error: itemsError } = await supabase.from('sales_items').insert(salesItemsData);
    if (itemsError) {
      Alert.alert("Item Error", itemsError.message);
      setProcessing(false);
      return;
    }

    // Update Inventory
    for (const item of cart) {
      const currentStock = item.stock || 0;
      const newStock = currentStock - item.qty;
      await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
    }

    await fetchData(); 

    const transaction = {
      id: saleId.toString(),
      date: new Date().toLocaleString(),
      store_name: storeName,
      items: [...cart],
      total: total.toFixed(2),
    };

    setLastTransaction(transaction);
    setReceiptVisible(true);
    setCart([]); 
    setCartModalVisible(false);
    setProcessing(false);
  };

  // --- PRINTING ---
  const handlePrint = async () => {
    if (!lastTransaction) return;
    try {
      const itemsHtml = lastTransaction.items.map(item => `
        <div class="row">
          <span>${item.qty}x ${item.name}</span>
          <span>P${(item.qty * item.price).toFixed(2)}</span>
        </div>
      `).join('');

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: 'Courier New', monospace; text-align: center; padding: 20px; }
              .header { font-size: 22px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
              .sub { font-size: 12px; color: #555; margin-bottom: 15px; }
              .line { border-bottom: 1px dashed #000; margin: 10px 0; }
              .row { display: flex; justify-content: space-between; margin: 5px 0; }
              .total { font-size: 18px; font-weight: bold; margin-top: 10px; border-top: 2px solid #000; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">${storeName}</div>
            <div class="sub">OFFICIAL RECEIPT</div>
            <div class="line"></div>
            <div style="text-align:left;">Date: ${lastTransaction.date}</div>
            <div style="text-align:left;">Ref #: ${lastTransaction.id}</div>
            <div class="line"></div>
            ${itemsHtml}
            <div class="line"></div>
            <div class="row total"><span>TOTAL</span><span>P${lastTransaction.total}</span></div>
            <div style="margin-top:20px; font-size:12px; color:#555;">Thank you!</div>
          </body>
        </html>
      `;
      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert("Printing Error", error.message);
    }
  };

  // --- RENDERERS ---
  const renderProduct = ({ item }) => {
    const stockCount = item.stock ?? 0;
    const isOutOfStock = stockCount <= 0;
    const isLowStock = stockCount > 0 && stockCount <= 5;

    return (
      <TouchableOpacity 
        style={[isTablet ? styles.cardTablet : styles.cardMobile, isOutOfStock && styles.cardDisabled]} 
        onPress={() => addToCart(item)}
        activeOpacity={0.8}
        disabled={isOutOfStock}
      >
        <View style={styles.imageContainer}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Ionicons name="image-outline" size={40} color="#CBD5E1" />
            </View>
          )}
          
          {/* BADGES */}
          {isOutOfStock && (
            <View style={styles.badgeOverlay}>
              <Text style={styles.badgeText}>SOLD OUT</Text>
            </View>
          )}
          {!isOutOfStock && isLowStock && (
            <View style={[styles.badgeOverlay, { backgroundColor: COLORS.warning }]}>
              <Text style={styles.badgeText}>LOW STOCK</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardPrice}>₱{item.price.toFixed(2)}</Text>
            <Text style={styles.stockLabel}>{stockCount} left</Text>
          </View>
        </View>

        {!isOutOfStock && (
          <View style={styles.floatingAddBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartRow}>
      <View style={styles.qtyBadge}><Text style={styles.qtyText}>{item.qty}</Text></View>
      <View style={styles.cartDetails}>
        <Text style={styles.cartName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartPrice}>₱{(item.price * item.qty).toFixed(2)}</Text>
      </View>
      <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.trashBtn}>
        <Ionicons name="close-circle" size={24} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeText}>Welcome,</Text>
          <Text style={styles.cashierName} numberOfLines={1}>{user?.first_name || "Merchant"}</Text>
        </View>
        <View style={styles.storeBadge}>
          <Ionicons name="storefront" size={14} color={COLORS.white} />
          <Text style={styles.storeText} numberOfLines={1}>{storeName}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* PRODUCTS GRID */}
        <View style={isTablet ? styles.leftPane : styles.fullPane}>
          <Text style={styles.sectionHeader}>Menu</Text>
          {loading && !refreshing ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : (
            <FlatList 
              data={products}
              renderItem={renderProduct}
              keyExtractor={item => item.id.toString()}
              numColumns={isTablet ? 3 : 2}
              columnWrapperStyle={{ justifyContent: 'space-between' }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 120, paddingTop: 5 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
              ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyStateText}>No products found.</Text></View>}
            />
          )}
        </View>

        {/* TABLET SIDEBAR */}
        {isTablet && (
          <View style={styles.rightPane}>
            <View style={styles.cartHeader}>
              <Text style={styles.sectionHeader}>Order</Text>
              <TouchableOpacity onPress={() => setCart([])}><Text style={styles.clearText}>Clear</Text></TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <FlatList data={cart} renderItem={renderCartItem} keyExtractor={item => item.id.toString()} />
              <View style={styles.checkoutSection}>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>₱{calculateTotal()}</Text></View>
                <TouchableOpacity style={[styles.checkoutBtn, (cart.length === 0 || processing) && styles.disabledBtn]} onPress={handleCheckout} disabled={cart.length === 0 || processing}>
                  {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.checkoutText}>CONFIRM SALE</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* MOBILE BOTTOM BAR */}
      {!isTablet && cart.length > 0 && (
        <View style={styles.bottomBarContainer}>
          <TouchableOpacity style={styles.bottomBar} onPress={() => setCartModalVisible(true)} activeOpacity={0.9}>
            <View style={styles.badgeContainer}><Text style={styles.badgeText}>{totalItems}</Text></View>
            <Text style={styles.viewCartText}>View Order</Text>
            <Text style={styles.bottomBarTotal}>₱{calculateTotal()}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CART MODAL */}
      <Modal visible={cartModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.mobileModalContainer}>
          <View style={styles.mobileModalHeader}>
            <Text style={styles.mobileModalTitle}>Current Order</Text>
            <TouchableOpacity onPress={() => setCartModalVisible(false)} style={styles.closeModalBtn}>
              <Ionicons name="close" size={24} color={COLORS.dark} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: 20 }}>
            <FlatList data={cart} renderItem={renderCartItem} keyExtractor={item => item.id.toString()} />
            <View style={styles.checkoutSection}>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>₱{calculateTotal()}</Text></View>
              <TouchableOpacity style={[styles.checkoutBtn, (cart.length === 0 || processing) && styles.disabledBtn]} onPress={handleCheckout} disabled={cart.length === 0 || processing}>
                {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.checkoutText}>CONFIRM SALE</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RECEIPT MODAL */}
      <Modal visible={receiptVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.receiptContainer}>
            <View style={styles.receiptHeader}>
              <Ionicons name="checkmark-circle" size={40} color={COLORS.white} />
              <Text style={styles.receiptHeaderTitle}>Transaction Complete</Text>
            </View>
            <View style={styles.receiptBody}>
              <Text style={styles.receiptStore}>{storeName}</Text>
              <Text style={styles.receiptTime}>{lastTransaction?.date}</Text>
              <View style={styles.divider} />
              <ScrollView style={styles.receiptList}>
                {lastTransaction?.items.map((item, index) => (
                  <View key={index} style={styles.receiptItemRow}>
                    <Text style={styles.recItemText} numberOfLines={1}>{item.qty} x {item.name}</Text>
                    <Text style={styles.recItemPrice}>₱{(item.price * item.qty).toFixed(2)}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.divider} />
              <View style={styles.receiptTotalRow}><Text style={styles.recTotalLabel}>TOTAL PAID</Text><Text style={styles.recTotalValue}>₱{lastTransaction?.total}</Text></View>
              <View style={styles.receiptActions}>
                <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
                  <Ionicons name="print-outline" size={20} color={COLORS.white} />
                  <Text style={styles.printBtnText}>Print Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.newSaleBtn} onPress={() => setReceiptVisible(false)}>
                  <Text style={styles.newSaleText}>New Sale</Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.dark} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: COLORS.dark, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', ...COLORS.cardShadow },
  welcomeText: { color: COLORS.gray, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  cashierName: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  storeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 12 },
  storeText: { color: COLORS.white, marginLeft: 5, fontWeight: '600', fontSize: 11 },
  body: { flex: 1, flexDirection: 'row', padding: 15 },
  leftPane: { flex: 0.65, paddingRight: 10 }, 
  fullPane: { flex: 1 }, 
  rightPane: { flex: 0.35, backgroundColor: COLORS.white, borderRadius: 16, padding: 15, ...COLORS.cardShadow },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 15 },
  
  // CARD STYLES
  cardMobile: { 
    backgroundColor: COLORS.white, width: '48%', borderRadius: 16, marginBottom: 15, 
    ...COLORS.cardShadow, overflow: 'hidden', minHeight: 220 
  },
  cardTablet: { 
    backgroundColor: COLORS.white, width: '32%', borderRadius: 16, marginBottom: 15, 
    ...COLORS.cardShadow, overflow: 'hidden', minHeight: 240 
  },
  cardDisabled: { opacity: 0.6 },
  imageContainer: { height: 140, width: '100%', backgroundColor: '#F3F4F6', position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  placeholderImage: { justifyContent: 'center', alignItems: 'center' },
  badgeOverlay: { 
    position: 'absolute', top: 10, left: 10, backgroundColor: COLORS.danger, 
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, zIndex: 10 
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  cardInfo: { padding: 12, flex: 1, justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  cardPrice: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  stockLabel: { fontSize: 11, color: COLORS.gray },
  floatingAddBtn: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: COLORS.dark, width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3
  },

  // CART & MODALS
  cartListContainer: { flex: 1 },
  emptyCart: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 },
  emptyCartText: { color: COLORS.gray, marginTop: 10 },
  cartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 10 },
  qtyBadge: { backgroundColor: COLORS.dark, width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  qtyText: { color: COLORS.white, fontSize: 12, fontWeight: 'bold' },
  cartDetails: { flex: 1 },
  cartName: { fontSize: 13, fontWeight: '600', color: COLORS.dark },
  cartPrice: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  bottomBarContainer: { position: 'absolute', bottom: 20, left: 20, right: 20, elevation: 10, zIndex: 999 },
  bottomBar: { backgroundColor: COLORS.dark, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  badgeContainer: { backgroundColor: COLORS.primary, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  viewCartText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  bottomBarTotal: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  checkoutSection: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 15 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  totalLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray },
  totalValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark },
  checkoutBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', ...COLORS.cardShadow },
  disabledBtn: { backgroundColor: '#C7D2FE' },
  checkoutText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  clearText: { color: COLORS.danger, fontWeight: 'bold' },
  mobileModalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  mobileModalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  mobileModalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  closeModalBtn: { padding: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  receiptContainer: { width: '85%', maxWidth: 400, borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff' },
  receiptHeader: { backgroundColor: COLORS.success, padding: 20, alignItems: 'center', justifyContent: 'center' },
  receiptHeaderTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18, marginTop: 10 },
  receiptBody: { padding: 25 },
  receiptStore: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, textAlign: 'center' },
  receiptTime: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginBottom: 20, marginTop: 5 },
  divider: { width: '100%', height: 1, backgroundColor: '#E5E7EB', marginVertical: 15 },
  receiptList: { maxHeight: 150 },
  receiptItemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  recItemText: { fontSize: 14, color: COLORS.dark, flex: 1 },
  recItemPrice: { fontSize: 14, fontWeight: 'bold', color: COLORS.dark },
  receiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  recTotalLabel: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  recTotalValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.success },
  receiptActions: { marginTop: 25, gap: 10 },
  printBtn: { backgroundColor: COLORS.print, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  printBtnText: { color: '#fff', fontWeight: 'bold' },
  newSaleBtn: { backgroundColor: '#F3F4F6', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  newSaleText: { color: COLORS.dark, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyStateText: { color: COLORS.gray, marginTop: 10, fontSize: 12 },
});