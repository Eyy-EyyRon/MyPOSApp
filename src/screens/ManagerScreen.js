import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, Modal, TextInput, StatusBar,
  SafeAreaView, Platform, RefreshControl, Image, ActivityIndicator,
  Animated, KeyboardAvoidingView, ScrollView, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import { supabase } from '../lib/supabase';

const { height } = Dimensions.get('window');
const BUCKET_NAME = 'product-images';
const LOW_STOCK_THRESHOLD = 5;

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:          '#0C0E1A',
  surface:     '#141728',
  surfaceUp:   '#1C2038',
  border:      '#252A45',
  navy:        '#130F5F',
  indigo:      '#1E1B4B',
  indigoMid:   '#312E81',
  gold:        '#F59E0B',
  goldDim:     '#78490A',
  goldBg:      '#2D1E00',
  success:     '#10B981',
  successBg:   '#052E1F',
  danger:      '#EF4444',
  dangerBg:    '#2D0E0E',
  warning:     '#F59E0B',
  warnBg:      '#2D1E00',
  info:        '#3B82F6',
  infoBg:      '#0D1F3C',
  textPrimary: '#F0F2FF',
  textSec:     '#8892B0',
  textMuted:   '#4A5270',
  white:       '#FFFFFF',
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
};

// ─── ANIMATED ROW ─────────────────────────────────────────────────────────────
const AnimatedProductRow = ({ children, index }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 35, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 35, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
};

// ─── CUSTOM ALERT ─────────────────────────────────────────────────────────────
const CustomAlert = ({ visible, title, message, onCancel, onConfirm, type = 'danger' }) => {
  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else { scaleAnim.setValue(0.85); opacityAnim.setValue(0); }
  }, [visible]);

  if (!visible) return null;
  const accentColor = type === 'danger' ? C.danger : C.gold;
  const accentBg    = type === 'danger' ? C.dangerBg : C.goldBg;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.alertOverlay, { opacity: opacityAnim }]}>
        <Animated.View style={[styles.alertContainer, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.alertIconRing, { backgroundColor: accentBg, borderColor: accentColor + '44' }]}>
            <Ionicons name={type === 'danger' ? 'trash' : 'information-circle'} size={28} color={accentColor} />
          </View>
          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>
          <View style={styles.alertBtnRow}>
            <TouchableOpacity style={styles.alertBtnCancel} onPress={onCancel}>
              <Text style={styles.alertBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertBtnConfirm, { backgroundColor: accentColor }]} onPress={onConfirm}>
              <Text style={styles.alertBtnConfirmText}>{type === 'danger' ? 'Delete' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ─── SECTION LABEL ────────────────────────────────────────────────────────────
const SectionLabel = ({ text }) => (
  <View style={styles.sectionLabelRow}>
    <View style={styles.sectionLabelDot} />
    <Text style={styles.sectionLabelText}>{text}</Text>
    <View style={styles.sectionLabelLine} />
  </View>
);

// ─── FLOATING INPUT ───────────────────────────────────────────────────────────
const FloatingInput = ({ label, value, onChange, keyboardType = 'default', placeholder, multiline, style: extraStyle }) => {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const onFocus = () => { setFocused(true);  Animated.timing(borderAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start(); };
  const onBlur  = () => { setFocused(false); Animated.timing(borderAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start(); };
  const borderColor = borderAnim.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.gold] });

  return (
    <View style={styles.floatOuter}>
      {label && <Text style={[styles.floatLabel, focused && { color: C.gold }]}>{label}</Text>}
      <Animated.View style={[styles.floatWrap, { borderColor }, extraStyle]}>
        <TextInput
          style={[styles.floatInput, multiline && { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
          placeholder={placeholder || label}
          placeholderTextColor={C.textMuted}
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          keyboardType={keyboardType}
          multiline={multiline}
          autoCapitalize="none"
        />
      </Animated.View>
    </View>
  );
};

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function ManagerScreen() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [loading,   setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [products, setProducts] = useState([]);
  const [staff,    setStaff]    = useState([]);
  const [pendingApps, setPendingApps] = useState([]);
  const [externalUnifiedMerchants, setExternalUnifiedMerchants] = useState([]);

  const [announcements,             setAnnouncements]             = useState([]);
  const [announcementsModalVisible, setAnnouncementsModalVisible] = useState(false);

  const [myStore,    setMyStore]    = useState(null);
  const [managerId,  setManagerId]  = useState(null);

  const [modalVisible,      setModalVisible]      = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [alertVisible,      setAlertVisible]      = useState(false);
  const [printModalVisible, setPrintModalVisible] = useState(false);

  const [itemToDelete,       setItemToDelete]       = useState(null);
  const [editingId,          setEditingId]          = useState(null);
  const [selectedPrintItem,  setSelectedPrintItem]  = useState(null);
  const [printQty,           setPrintQty]           = useState('1');

  const [prodName,     setProdName]     = useState('');
  const [prodPrice,    setProdPrice]    = useState('');
  const [prodDiscount, setProdDiscount] = useState('');
  const [prodStock,    setProdStock]    = useState('');
  const [prodBarcode,  setProdBarcode]  = useState('');
  const [prodImage,    setProdImage]    = useState(null);

  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [merchantStats,    setMerchantStats]    = useState({ totalSales: 0, lastActive: 'Never' });
  const [statsLoading,     setStatsLoading]     = useState(false);
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  // Tab slide anim
  const tabSlide = useRef(new Animated.Value(0)).current;
  const switchTab = (tab) => {
    const target = tab === 'inventory' ? 0 : 1;
    Animated.spring(tabSlide, { toValue: target, tension: 100, friction: 14, useNativeDriver: false }).start();
    setActiveTab(tab);
    Haptics.selectionAsync();
  };

  useEffect(() => {
    if (!myStore || !managerId) return;
    const productSub = supabase.channel('inventory-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `store_name=eq.${myStore}` },
        (payload) => { if (payload.eventType === 'UPDATE') setProducts(c => c.map(p => p.id === payload.new.id ? payload.new : p)); else fetchData(); })
      .subscribe();
    const appSub = supabase.channel('manager:applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_applications', filter: `manager_id=eq.${managerId}` },
        () => fetchApplications(managerId))
      .subscribe();
    const annSub = supabase.channel('manager:announcements')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' },
        () => { fetchAnnouncements(myStore); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); })
      .subscribe();
    const flagSub = supabase.channel('manager:flags')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_flags', filter: `store_name=eq.${myStore}` },
        () => { fetchAnnouncements(myStore); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); })
      .subscribe();
    return () => { supabase.removeChannel(productSub); supabase.removeChannel(appSub); supabase.removeChannel(annSub); supabase.removeChannel(flagSub); };
  }, [myStore, managerId]);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const fetchData = async () => {
    try {
      if (refreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setManagerId(user.id);
      const { data: profile } = await supabase.from('profiles').select('store_name').eq('id', user.id).single();
      if (profile) {
        setMyStore(profile.store_name);
        const { data: prods } = await supabase.from('products').select('*').eq('store_name', profile.store_name).order('name');
        setProducts(prods || []);
        const { data: members } = await supabase.from('store_memberships')
          .select(`id, status, merchant:profiles!merchant_id (id, first_name, last_name, email, status, avatar_url)`)
          .eq('manager_id', user.id);
        setStaff((members || []).map(m => ({ ...m.merchant, membership_id: m.id, status: m.status, id: m.merchant.id })));
        const { data: extInvites } = await supabase.from('store_applications')
          .select(`id, status, merchant:profiles!merchant_id (id, first_name, last_name, avatar_url)`)
          .eq('manager_id', user.id).eq('status', 'invited');
        setExternalUnifiedMerchants(extInvites || []);
        fetchApplications(user.id);
        fetchAnnouncements(profile.store_name);
      }
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const fetchApplications = async (uid) => {
    if (!uid) return;
    const { data } = await supabase.from('store_applications')
      .select(`*, merchant:profiles!merchant_id (id, first_name, last_name, email, avatar_url)`)
      .eq('manager_id', uid).eq('status', 'pending');
    setPendingApps(data || []);
  };

  const fetchAnnouncements = async (storeName) => {
    const { data: annData } = await supabase.from('announcements').select('*')
      .or(`target_store.eq.ALL,target_store.eq.${storeName}`).eq('is_active', true);
    const { data: flagData } = await supabase.from('system_flags').select('*')
      .eq('store_name', storeName).eq('type', 'admin_action');
    const combined = [
      ...(annData  || []).map(a => ({ ...a, inboxType: 'announcement' })),
      ...(flagData || []).map(f => ({ ...f, inboxType: 'flag', message: f.description })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setAnnouncements(combined);
  };

  const handleApplication = async (app, status) => {
    setLoading(true);
    try {
      if (status === 'approved') {
        await supabase.from('store_memberships').insert([{ merchant_id: app.merchant_id, manager_id: app.manager_id, store_name: app.store_name, status: 'active' }]);
      }
      await supabase.from('store_applications').delete().eq('id', app.id);
      Haptics.notificationAsync(status === 'approved' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Success', status === 'approved' ? 'Merchant Approved!' : 'Application Rejected');
      fetchData();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };

  const dismissAnnouncement = async (ann) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistically remove from UI immediately
    setAnnouncements(prev => prev.filter(a => a.id !== ann.id));
    try {
      if (ann.inboxType === 'flag') {
        // Permanently delete the system_flag row
        await supabase.from('system_flags').delete().eq('id', ann.id);
      } else {
        // Mark announcement as inactive so it won't reappear on refresh
        await supabase.from('announcements').update({ is_active: false }).eq('id', ann.id);
      }
    } catch (e) {
      // Restore the item if DB op failed
      setAnnouncements(prev => [...prev, ann].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      Alert.alert('Error', 'Could not mark as read. Please try again.');
    }
  };
  const onRefresh = () => { setRefreshing(true); fetchData(); };
  const generateBarcode = () => Math.floor(100000000000 + Math.random() * 900000000000).toString();
  const handleAutoGenerate = () => { setProdBarcode(generateBarcode()); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const openPrintModal = (item) => { setSelectedPrintItem(item); setPrintQty('1'); setPrintModalVisible(true); };

  const handleDownloadBarcode = async () => {
    const item = selectedPrintItem;
    if (!item || !item.barcode) return Alert.alert('No Barcode', 'This product has no barcode.');
    if (!permissionResponse || permissionResponse.status !== 'granted') {
      const { status } = await requestPermission();
      if (status !== 'granted') return Alert.alert('Permission Required', 'Gallery access is required.');
    }
    try {
      setLoading(true);
      const barcodeApiUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=5&rotate=N&includetext&backgroundcolor=ffffff`;
      const sanitizedName = item.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileUri = FileSystem.documentDirectory + `${sanitizedName}_barcode.png`;
      const { uri } = await FileSystem.downloadAsync(barcodeApiUrl, fileUri);
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('Product Barcodes', asset, false);
      Alert.alert('Saved!', 'Barcode saved to gallery.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { Alert.alert('Save Failed', 'Could not download image.'); }
    finally { setLoading(false); }
  };

  const handlePrintTags = async () => {
    const qty = parseInt(printQty);
    if (isNaN(qty) || qty <= 0) return Alert.alert('Invalid', 'Enter a valid number.');
    const item = selectedPrintItem;
    if (!item) return;
    setLoading(true);
    const hasDiscount = item.discount_percent && item.discount_percent > 0;
    const finalPrice  = hasDiscount ? (item.price - item.price * (item.discount_percent / 100)).toFixed(2) : item.price.toFixed(2);
    const barcodeVal  = item.barcode || generateBarcode();
    const barcodeUrl  = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeVal}&scale=3&rotate=N&includetext&backgroundcolor=ffffff`;
    let tagsHtml = '';
    for (let i = 0; i < qty; i++) {
      tagsHtml += `<div style="border:2px dashed #333;padding:20px;width:220px;text-align:center;border-radius:12px;display:flex;flex-direction:column;align-items:center;break-inside:avoid;">
        <div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:bold;letter-spacing:1px;margin-bottom:8px;">${myStore}</div>
        <div style="font-size:16px;font-weight:bold;color:#000;margin-bottom:8px;line-height:1.2;">${item.name}</div>
        ${hasDiscount ? `<div style="font-size:12px;color:#d97706;font-weight:bold;margin-bottom:2px;">PROMO: ${item.discount_percent}% OFF</div><div style="font-size:14px;text-decoration:line-through;color:#888;">₱${item.price}</div>` : ''}
        <div style="font-size:26px;font-weight:900;color:#000;margin-bottom:15px;">₱${finalPrice}</div>
        <img src="${barcodeUrl}" style="max-width:100%;height:50px;" />
      </div>`;
    }
    const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"/><style>body{font-family:'Helvetica Neue',sans-serif;display:flex;flex-wrap:wrap;gap:20px;padding:20px;margin:0;}@media print{body{padding:0;}}</style></head><body>${tagsHtml}</body></html>`;
    try { await Print.printAsync({ html }); setPrintModalVisible(false); }
    catch (e) { Alert.alert('Print Error', e.message); }
    finally { setLoading(false); }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Access photos required.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) setProdImage(result.assets[0].uri);
  };

  const uploadImageToSupabase = async (uri) => {
    try {
      if (!uri || !uri.startsWith('file://')) return uri;
      const fileName = `${Date.now()}.png`;
      const formData = new FormData();
      formData.append('file', { uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri, name: fileName, type: 'image/png' });
      const { error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, formData, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch { return null; }
  };

  const openAddModal = () => {
    setEditingId(null); setProdName(''); setProdPrice(''); setProdDiscount('');
    setProdStock(''); setProdBarcode(generateBarcode()); setProdImage(null); setModalVisible(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id); setProdName(item.name); setProdPrice(item.price.toString());
    setProdDiscount(item.discount_percent ? item.discount_percent.toString() : '');
    setProdStock((item.stock ?? item.stock_quantity ?? 0).toString());
    setProdBarcode(item.barcode || generateBarcode()); setProdImage(item.image_url); setModalVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!prodName || !prodPrice || !prodStock) return Alert.alert('Required', 'Fill in Name, Price, and Quantity.');
    const discountVal = parseFloat(prodDiscount) || 0;
    if (discountVal < 0 || discountVal > 100) return Alert.alert('Invalid Promo', 'Discount must be 0–100%.');
    setLoading(true);
    let publicUrl = prodImage;
    if (prodImage && prodImage.startsWith('file://')) {
      publicUrl = await uploadImageToSupabase(prodImage);
      if (!publicUrl) { setLoading(false); Alert.alert('Error', 'Failed to upload image.'); return; }
    }
    const productData = { name: prodName, price: parseFloat(prodPrice), discount_percent: discountVal, stock: parseInt(prodStock), stock_quantity: parseInt(prodStock), store_name: myStore, barcode: prodBarcode, image_url: publicUrl, user_id: managerId };
    const { error } = editingId
      ? await supabase.from('products').update(productData).eq('id', editingId)
      : await supabase.from('products').insert([productData]);
    if (error) Alert.alert('Error', error.message);
    else { setModalVisible(false); fetchData(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    setLoading(false);
  };

  const confirmDelete = (id) => { setItemToDelete(id); setAlertVisible(true); };
  const handleDelete = async () => {
    if (!itemToDelete) return; setAlertVisible(false);
    await supabase.from('products').delete().eq('id', itemToDelete);
    setItemToDelete(null); fetchData(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openMerchantDetails = async (merchant) => {
    setSelectedMerchant(merchant); setDetailModalVisible(true); setStatsLoading(true);
    const { data: sales } = await supabase.from('sales').select('total_amount, sale_date').eq('store_name', myStore).eq('cashier_name', merchant.first_name);
    const total   = (sales || []).reduce((sum, s) => sum + s.total_amount, 0);
    const lastSale = sales?.length > 0 ? new Date(Math.max(...sales.map(s => new Date(s.sale_date)))).toLocaleDateString() : 'No sales yet';
    setMerchantStats({ totalSales: total, lastActive: lastSale }); setStatsLoading(false);
  };

  const toggleStaffStatus = async (id, currentStatus, membershipId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    await supabase.from('store_memberships').update({ status: newStatus }).eq('id', membershipId);
    setStaff(staff.map(s => s.membership_id === membershipId ? { ...s, status: newStatus } : s));
    if (selectedMerchant?.membership_id === membershipId) setSelectedMerchant(prev => ({ ...prev, status: newStatus }));
  };

  // ── RENDER PRODUCT (NEW CARD LAYOUT) ────────────────────────────────────────
  const renderProduct = ({ item, index }) => {
    const hasDiscount     = item.discount_percent && item.discount_percent > 0;
    const finalPrice      = hasDiscount
      ? (item.price - item.price * (item.discount_percent / 100)).toFixed(2)
      : item.price.toFixed(2);
    const isDisabledByOwner = item.is_active === false;
    const isOutOfStock    = !isDisabledByOwner && (item.stock || 0) <= 0;
    const isLowStock      = !isDisabledByOwner && item.stock > 0 && item.stock <= LOW_STOCK_THRESHOLD;

    // Determine border accent color for the card
    const cardAccent = isDisabledByOwner
      ? C.danger + '55'
      : isOutOfStock
        ? C.danger + '44'
        : hasDiscount
          ? C.gold + '66'
          : C.border;

    return (
      <AnimatedProductRow index={index}>
        <View style={[
          styles.productCard,
          { borderLeftColor: cardAccent, borderLeftWidth: 3 },
          isDisabledByOwner && styles.productCardDisabled,
        ]}>

          {/* ── TOP ROW: image + name + status badge ── */}
          <View style={styles.productCardTop}>
            {/* Thumbnail */}
            <View style={styles.productThumbBox}>
              {item.image_url
                ? <Image source={{ uri: item.image_url }} style={styles.productThumb} />
                : <View style={styles.productThumbPlaceholder}>
                    <Ionicons name="cube" size={28} color={isDisabledByOwner ? C.danger + '66' : C.textMuted} />
                  </View>
              }
              {isDisabledByOwner && (
                <View style={styles.productLockedOverlay}>
                  <Ionicons name="ban" size={16} color={C.danger} />
                </View>
              )}
            </View>

            {/* Name + status badge */}
            <View style={styles.productTitleBlock}>
              <Text style={[styles.productName, (isDisabledByOwner || isOutOfStock) && { color: C.textMuted }]} numberOfLines={2}>
                {item.name}
              </Text>

              {/* Stock status badge */}
              <View style={styles.stockRow}>
                {isDisabledByOwner ? (
                  <View style={[styles.stockBadge, { backgroundColor: C.dangerBg, borderColor: C.danger + '44' }]}>
                    <Ionicons name="lock-closed" size={9} color={C.danger} />
                    <Text style={[styles.stockText, { color: C.danger }]}>Disabled by Owner</Text>
                  </View>
                ) : isOutOfStock ? (
                  <View style={[styles.stockBadge, { backgroundColor: C.dangerBg, borderColor: C.danger + '44' }]}>
                    <View style={[styles.stockDot, { backgroundColor: C.danger }]} />
                    <Text style={[styles.stockText, { color: C.danger }]}>SOLD OUT</Text>
                  </View>
                ) : isLowStock ? (
                  <View style={[styles.stockBadge, { backgroundColor: C.warnBg, borderColor: C.warning + '44' }]}>
                    <View style={[styles.stockDot, { backgroundColor: C.warning }]} />
                    <Text style={[styles.stockText, { color: C.warning }]}>Low Stock · {item.stock}</Text>
                  </View>
                ) : (
                  <View style={[styles.stockBadge, { backgroundColor: C.successBg, borderColor: C.success + '44' }]}>
                    <View style={[styles.stockDot, { backgroundColor: C.success }]} />
                    <Text style={[styles.stockText, { color: C.success }]}>In Stock · {item.stock}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* ── BOTTOM ROW: price block + action buttons ── */}
          <View style={styles.productCardBottom}>
            {/* Price section */}
            <View style={styles.productPriceBlock}>
              {isDisabledByOwner ? (
                <Text style={[styles.normalPrice, { color: C.textMuted, fontSize: 13 }]}>Unavailable</Text>
              ) : hasDiscount ? (
                <View style={styles.promoPriceBlock}>
                  <View style={styles.promoBadgeInline}>
                    <Ionicons name="pricetag" size={9} color={C.gold} />
                    <Text style={styles.promoText}>{item.discount_percent}% OFF</Text>
                  </View>
                  <View style={styles.priceStack}>
                    <Text style={styles.strikePrice}>₱{item.price.toFixed(2)}</Text>
                    <Text style={styles.promoPrice}>₱{finalPrice}</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.normalPrice}>₱{finalPrice}</Text>
              )}
            </View>

            {/* Action buttons */}
            {isDisabledByOwner ? (
              <TouchableOpacity
                onPress={() => Alert.alert('Locked', 'The Owner has disabled this product. Check Inbox for details.')}
                style={styles.lockedBtn}
              >
                <Ionicons name="lock-closed" size={18} color={C.danger} />
                <Text style={styles.lockedBtnText}>Locked</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.actionGroup}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.infoBg, borderColor: C.info + '33' }]} onPress={() => openPrintModal(item)}>
                  <Ionicons name="print-outline" size={16} color={C.info} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.surfaceUp, borderColor: C.border }]} onPress={() => openEditModal(item)}>
                  <Ionicons name="pencil-outline" size={16} color={C.textSec} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.dangerBg, borderColor: C.danger + '33' }]} onPress={() => confirmDelete(item.id)}>
                  <Ionicons name="trash-outline" size={16} color={C.danger} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </AnimatedProductRow>
    );
  };

  // ── RENDER STAFF ────────────────────────────────────────────────────────────
  const renderStaff = ({ item }) => (
    <TouchableOpacity style={styles.staffCard} onPress={() => openMerchantDetails(item)} activeOpacity={0.8}>
      <View style={[styles.staffAvatar, { backgroundColor: item.status === 'active' ? '#1E3A5F' : C.dangerBg }]}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
          : <Text style={[styles.staffInitials, { color: item.status === 'active' ? C.info : C.danger }]}>
              {item.first_name?.[0]?.toUpperCase() || '?'}
            </Text>
        }
      </View>
      <View style={styles.staffInfo}>
        <Text style={styles.staffName}>{item.first_name} {item.last_name}</Text>
        <View style={[styles.staffStatusPill, { backgroundColor: item.status === 'active' ? C.successBg : C.dangerBg, borderColor: (item.status === 'active' ? C.success : C.danger) + '44' }]}>
          <View style={[styles.staffStatusDot, { backgroundColor: item.status === 'active' ? C.success : C.danger }]} />
          <Text style={[styles.staffStatusText, { color: item.status === 'active' ? C.success : C.danger }]}>
            {(item.status || 'UNKNOWN').toUpperCase()}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );

  const activeAnnouncements = announcements;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>STORE DASHBOARD</Text>
            <Text style={styles.headerTitle}>{myStore || 'My Store'}</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setAnnouncementsModalVisible(true)}>
            <Ionicons name="notifications" size={20} color={C.gold} />
            {activeAnnouncements.length > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{activeAnnouncements.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Animated tab bar */}
        <View style={styles.tabBarWrap}>
          <Animated.View style={[
            styles.tabIndicator,
            { transform: [{ translateX: tabSlide.interpolate({ inputRange: [0, 1], outputRange: [0, (styles.tabBtn?.width || 0)] }) }] }
          ]} />
          {['inventory', 'staff'].map((tab, idx) => {
            const isActive = activeTab === tab;
            const icons = { inventory: ['cube-outline', 'cube'], staff: ['people-outline', 'people'] };
            return (
              <TouchableOpacity key={tab} style={styles.tabBtn} onPress={() => switchTab(tab)}>
                <Ionicons name={isActive ? icons[tab][1] : icons[tab][0]} size={15} color={isActive ? C.navy : C.textMuted} />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>
        {activeTab === 'inventory' ? (
          <>
            {/* List header */}
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.listTitle}>Products</Text>
                <Text style={styles.listSub}>{products.length} items in inventory</Text>
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
                <Ionicons name="add" size={18} color={C.navy} />
                <Text style={styles.addBtnText}>Add Item</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={products}
              renderItem={renderProduct}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 110 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="cube-outline" size={36} color={C.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>No Products Yet</Text>
                  <Text style={styles.emptyDesc}>Tap "Add Item" to start building your inventory.</Text>
                </View>
              }
            />
          </>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}>

            {/* Unified shift partners */}
            {externalUnifiedMerchants.length > 0 && (
              <View style={{ marginBottom: 28 }}>
                <SectionLabel text={`UNIFIED SHIFT PARTNERS (${externalUnifiedMerchants.length})`} />
                <Text style={styles.sectionDesc}>Assigned by Owner to sell your products.</Text>
                {externalUnifiedMerchants.map(invite => (
                  <View key={invite.id} style={[styles.staffCard, { borderLeftWidth: 3, borderLeftColor: C.gold }]}>
                    <View style={[styles.staffAvatar, { backgroundColor: C.goldBg }]}>
                      {invite.merchant?.avatar_url
                        ? <Image source={{ uri: invite.merchant.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        : <Text style={[styles.staffInitials, { color: C.gold }]}>{invite.merchant?.first_name?.[0]?.toUpperCase()}</Text>
                      }
                    </View>
                    <View style={styles.staffInfo}>
                      <Text style={styles.staffName}>{invite.merchant?.first_name} {invite.merchant?.last_name}</Text>
                      <Text style={styles.awaitingText}>Awaiting Acceptance</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Pending applications */}
            {pendingApps.length > 0 && (
              <View style={{ marginBottom: 28 }}>
                <SectionLabel text={`PENDING REQUESTS (${pendingApps.length})`} />
                {pendingApps.map(app => (
                  <View key={app.id} style={styles.appCard}>
                    <View style={styles.appCardTop}>
                      <View style={[styles.staffAvatar, { backgroundColor: C.goldBg }]}>
                        {app.merchant?.avatar_url
                          ? <Image source={{ uri: app.merchant.avatar_url }} style={{ width: '100%', height: '100%' }} />
                          : <Text style={[styles.staffInitials, { color: C.gold }]}>{app.merchant?.first_name?.[0]?.toUpperCase()}</Text>
                        }
                      </View>
                      <View style={{ marginLeft: 14 }}>
                        <Text style={styles.appName}>{app.merchant?.first_name} {app.merchant?.last_name}</Text>
                        <Text style={styles.appSubLabel}>Wants to join your store</Text>
                      </View>
                    </View>
                    <View style={styles.appBtnRow}>
                      <TouchableOpacity style={styles.appAcceptBtn} onPress={() => handleApplication(app, 'approved')}>
                        <Ionicons name="checkmark" size={14} color={C.navy} />
                        <Text style={styles.appAcceptText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.appDeclineBtn} onPress={() => handleApplication(app, 'rejected')}>
                        <Text style={styles.appDeclineText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Active staff */}
            <SectionLabel text={`ACTIVE STAFF (${staff.length})`} />
            {staff.length > 0
              ? staff.map(member => <View key={member.id}>{renderStaff({ item: member })}</View>)
              : <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Ionicons name="people-outline" size={36} color={C.textMuted} /></View>
                  <Text style={styles.emptyTitle}>No Staff Yet</Text>
                  <Text style={styles.emptyDesc}>Approve merchant applications to build your team.</Text>
                </View>
            }
          </ScrollView>
        )}
      </View>

      <CustomAlert
        visible={alertVisible}
        title="Delete Product?"
        message="This will permanently remove the item from your inventory."
        onCancel={() => setAlertVisible(false)}
        onConfirm={handleDelete}
        type="danger"
      />

      {/* ── Inbox Modal ── */}
      <Modal visible={announcementsModalVisible} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}>
                <Ionicons name="notifications" size={18} color={C.gold} />
              </View>
              <Text style={styles.sheetTitle}>Inbox & Alerts</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setAnnouncementsModalVisible(false)}>
                <Ionicons name="close" size={18} color={C.textSec} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
              {activeAnnouncements.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Ionicons name="notifications-off-outline" size={36} color={C.textMuted} /></View>
                  <Text style={styles.emptyTitle}>All Clear</Text>
                  <Text style={styles.emptyDesc}>No new announcements or alerts.</Text>
                </View>
              ) : activeAnnouncements.map(ann => {
                const isUrgent = ann.type === 'urgent' || ann.inboxType === 'flag';
                const accentColor = isUrgent ? C.danger : C.info;
                const accentBg    = isUrgent ? C.dangerBg : C.infoBg;
                return (
                  <View key={ann.id} style={[styles.inboxCard, { borderLeftColor: accentColor, backgroundColor: accentBg + '66' }]}>
                    <View style={styles.inboxCardTop}>
                      <View style={[styles.inboxTypeIcon, { backgroundColor: accentBg }]}>
                        <Ionicons name={isUrgent ? 'warning' : 'information-circle'} size={16} color={accentColor} />
                      </View>
                      <Text style={[styles.inboxTypeText, { color: accentColor }]}>
                        {ann.inboxType === 'flag' ? 'OWNER ALERT' : ann.type === 'urgent' ? 'URGENT' : 'INFO'}
                      </Text>
                      <Text style={styles.inboxDate}>{new Date(ann.created_at).toLocaleDateString()}</Text>
                    </View>
                    {ann.inboxType === 'flag' && <Text style={styles.inboxFlagTitle}>{ann.title}</Text>}
                    <Text style={styles.inboxMsg}>{ann.message}</Text>
                    <TouchableOpacity style={styles.markReadBtn} onPress={() => dismissAnnouncement(ann)}>
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

      {/* ── Print Modal ── */}
      <Modal visible={printModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}>
                <Ionicons name="print" size={18} color={C.gold} />
              </View>
              <Text style={styles.sheetTitle}>Print Options</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setPrintModalVisible(false)}>
                <Ionicons name="close" size={18} color={C.textSec} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
              <View style={styles.printTargetCard}>
                <View style={styles.printTargetIcon}>
                  <Ionicons name="pricetag" size={22} color={C.gold} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.printTargetName} numberOfLines={1}>{selectedPrintItem?.name}</Text>
                  <Text style={styles.printTargetSub}>Barcode: {selectedPrintItem?.barcode || 'None'}</Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Number of Tags</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setPrintQty(String(Math.max(1, parseInt(printQty || 0) - 1)))}>
                  <Ionicons name="remove" size={22} color={C.gold} />
                </TouchableOpacity>
                <TextInput style={styles.qtyInput} keyboardType="numeric" value={printQty} onChangeText={setPrintQty} textAlign="center" />
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setPrintQty(String(parseInt(printQty || 0) + 1))}>
                  <Ionicons name="add" size={22} color={C.gold} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handlePrintTags} disabled={loading}>
                {loading ? <ActivityIndicator color={C.navy} /> : <>
                  <Ionicons name="print" size={18} color={C.navy} />
                  <Text style={styles.primaryBtnText}>Print Price Tags</Text>
                </>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={handleDownloadBarcode} disabled={loading}>
                <Ionicons name="download-outline" size={18} color={C.gold} />
                <Text style={styles.secondaryBtnText}>Save Barcode as Image</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add / Edit Product Modal ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <View style={[styles.bottomSheet, { maxHeight: height * 0.92 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}>
                <Ionicons name={editingId ? 'pencil' : 'add-circle'} size={18} color={C.gold} />
              </View>
              <Text style={styles.sheetTitle}>{editingId ? 'Edit Product' : 'Add Product'}</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={18} color={C.textSec} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
              <TouchableOpacity onPress={pickImage} style={styles.imagePicker} activeOpacity={0.8}>
                {prodImage
                  ? <Image source={{ uri: prodImage }} style={styles.imagePreview} />
                  : <View style={styles.imagePlaceholder}>
                      <View style={styles.uploadIconRing}>
                        <Ionicons name="image-outline" size={26} color={C.gold} />
                      </View>
                      <Text style={styles.imagePickerText}>Upload Product Photo</Text>
                    </View>
                }
              </TouchableOpacity>

              <FloatingInput label="Product Name" value={prodName} onChange={setProdName} />

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <FloatingInput label="Price (₱)" value={prodPrice} onChange={setProdPrice} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <FloatingInput label="Discount %" value={prodDiscount} onChange={setProdDiscount} keyboardType="numeric" style={prodDiscount ? { borderColor: C.gold } : {}} />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <FloatingInput label="Stock Qty" value={prodStock} onChange={setProdStock} keyboardType="numeric" />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.inputLabel}>Barcode</Text>
                  <View style={styles.barcodeRow}>
                    <TextInput
                      style={styles.barcodeInput}
                      placeholder="Scan or generate..."
                      placeholderTextColor={C.textMuted}
                      value={prodBarcode}
                      onChangeText={setProdBarcode}
                      keyboardType="numeric"
                    />
                    <TouchableOpacity style={styles.genBtn} onPress={handleAutoGenerate}>
                      <Ionicons name="refresh" size={16} color={C.navy} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 8 }]} onPress={handleSaveProduct} disabled={loading}>
                {loading ? <ActivityIndicator color={C.navy} /> : <>
                  <Ionicons name={editingId ? 'checkmark' : 'save'} size={18} color={C.navy} />
                  <Text style={styles.primaryBtnText}>{editingId ? 'Update Product' : 'Save Product'}</Text>
                </>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Merchant Detail Modal ── */}
      <Modal visible={detailModalVisible} animationType="fade" transparent>
        <View style={styles.centerOverlay}>
          <View style={styles.detailCard}>
            <TouchableOpacity style={[styles.sheetCloseBtn, { position: 'absolute', top: 16, right: 16, zIndex: 10 }]} onPress={() => setDetailModalVisible(false)}>
              <Ionicons name="close" size={18} color={C.textSec} />
            </TouchableOpacity>

            <View style={styles.detailAvatarWrap}>
              <View style={[styles.detailAvatar, { backgroundColor: selectedMerchant?.status === 'active' ? '#1E3A5F' : C.dangerBg }]}>
                {selectedMerchant?.avatar_url
                  ? <Image source={{ uri: selectedMerchant.avatar_url }} style={{ width: '100%', height: '100%' }} />
                  : <Text style={[styles.detailAvatarText, { color: selectedMerchant?.status === 'active' ? C.info : C.danger }]}>
                      {selectedMerchant?.first_name?.[0]?.toUpperCase()}
                    </Text>
                }
              </View>
              <Text style={styles.detailName}>{selectedMerchant?.first_name} {selectedMerchant?.last_name}</Text>
              <View style={styles.merchantRoleBadge}>
                <Text style={styles.merchantRoleText}>MERCHANT STAFF</Text>
              </View>
            </View>

            <View style={styles.detailStatsRow}>
              <View style={styles.detailStatBox}>
                <Text style={styles.detailStatLabel}>TOTAL SALES</Text>
                {statsLoading
                  ? <ActivityIndicator color={C.gold} size="small" />
                  : <Text style={styles.detailStatVal}>₱{merchantStats.totalSales.toLocaleString()}</Text>
                }
              </View>
              <View style={styles.detailStatDivider} />
              <View style={styles.detailStatBox}>
                <Text style={styles.detailStatLabel}>LAST ACTIVE</Text>
                {statsLoading
                  ? <ActivityIndicator color={C.gold} size="small" />
                  : <Text style={styles.detailStatValSm}>{merchantStats.lastActive}</Text>
                }
              </View>
            </View>

            <TouchableOpacity
              style={[styles.banBtn, { backgroundColor: selectedMerchant?.status === 'active' ? C.dangerBg : C.successBg, borderColor: (selectedMerchant?.status === 'active' ? C.danger : C.success) + '44' }]}
              onPress={() => toggleStaffStatus(selectedMerchant.id, selectedMerchant.status, selectedMerchant.membership_id)}
            >
              <Ionicons name={selectedMerchant?.status === 'active' ? 'ban' : 'checkmark-circle'} size={18} color={selectedMerchant?.status === 'active' ? C.danger : C.success} />
              <Text style={[styles.banText, { color: selectedMerchant?.status === 'active' ? C.danger : C.success }]}>
                {selectedMerchant?.status === 'active' ? 'Revoke Access' : 'Re-activate Account'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 0,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '800', color: C.textMuted,
    letterSpacing: 2, marginTop: Platform.OS === 'android' ? 24 : 8, marginBottom: 4,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: C.gold, letterSpacing: -0.5 },
  bellBtn: {
    marginTop: Platform.OS === 'android' ? 28 : 12,
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: C.surfaceUp, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: C.danger, borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.surface,
  },
  bellBadgeText: { color: C.white, fontSize: 9, fontWeight: '900' },

  // ── Tab Bar ──
  tabBarWrap: { flexDirection: 'row', height: 50, position: 'relative' },
  tabIndicator: {
    position: 'absolute', bottom: 6, left: 4,
    width: '48%', height: 38,
    backgroundColor: C.textPrimary,
    borderRadius: 10, zIndex: 0,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, zIndex: 1,
  },
  tabLabel: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabLabelActive: { color: C.navy },

  // ── Body ──
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  // ── List Header ──
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  listTitle: { fontSize: 20, fontWeight: '900', color: C.gold },
  listSub:   { fontSize: 12, color: C.textMuted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.gold, paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 13, ...C.shadow,
  },
  addBtnText: { color: C.navy, fontSize: 13, fontWeight: '800' },

  // ── Product Card (NEW TWO-ROW LAYOUT) ──────────────────────────────────────
  productCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  productCardDisabled: {
    opacity: 0.75,
  },

  // TOP ROW: image + name/badge
  productCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 10,
  },

  productThumbBox: {
    width: 70,
    height: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  productThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  productThumbPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: C.surfaceUp,
    alignItems: 'center', justifyContent: 'center',
  },
  productLockedOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  productTitleBlock: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
    color: C.gold,
    lineHeight: 21,
    marginBottom: 8,
  },

  // BOTTOM ROW: price + action buttons
  productCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.border + '88',
    backgroundColor: C.surfaceUp + '66',
  },

  productPriceBlock: {
    flex: 1,
    marginRight: 12,
  },

  // Normal price
  normalPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: C.gold,
    letterSpacing: -0.3,
  },

  // Promo price layout
  promoPriceBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  promoBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.goldBg,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.gold + '44',
  },
  promoText: { color: C.gold, fontSize: 10, fontWeight: '900' },
  priceStack: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  strikePrice: {
    fontSize: 12,
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
  promoPrice: {
    fontSize: 18,
    color: C.gold,
    fontWeight: '900',
    letterSpacing: -0.3,
  },

  // Stock badge (in top row)
  stockRow: { flexDirection: 'row' },
  stockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
    alignSelf: 'flex-start',
  },
  stockDot:  { width: 5, height: 5, borderRadius: 3 },
  stockText: { fontSize: 10, fontWeight: '700' },

  // Action buttons (in bottom row)
  actionGroup: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Locked state button
  lockedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.danger + '33',
  },
  lockedBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.danger,
  },

  // ── Staff Tab ──
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  sectionLabelDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold },
  sectionLabelText: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5 },
  sectionLabelLine: { flex: 1, height: 1, backgroundColor: C.border },
  sectionDesc: { fontSize: 12, color: C.textMuted, marginBottom: 14, marginTop: -8 },

  staffCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, padding: 16,
    borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  staffAvatar: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  staffInitials: { fontSize: 18, fontWeight: '900' },
  staffInfo: { flex: 1, marginLeft: 14 },
  staffName: { fontSize: 15, fontWeight: '800', color: C.gold },
  staffStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, marginTop: 6, borderWidth: 1,
  },
  staffStatusDot: { width: 5, height: 5, borderRadius: 3 },
  staffStatusText: { fontSize: 10, fontWeight: '800' },
  awaitingText: { fontSize: 12, color: C.gold, fontWeight: '700', marginTop: 3 },

  appCard: {
    backgroundColor: C.surface, borderRadius: 18, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3, borderLeftColor: C.gold,
  },
  appCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  appName: { fontSize: 16, fontWeight: '800', color: C.gold },
  appSubLabel: { fontSize: 12, color: C.textMuted, marginTop: 3 },
  appBtnRow: { flexDirection: 'row', gap: 10 },
  appAcceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.gold, paddingVertical: 12, borderRadius: 12,
  },
  appAcceptText: { color: C.navy, fontWeight: '800', fontSize: 14 },
  appDeclineBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.surfaceUp, borderWidth: 1, borderColor: C.border,
  },
  appDeclineText: { color: C.textSec, fontWeight: '700', fontSize: 14 },

  // ── Bottom Sheet ──
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 16, maxHeight: height * 0.9,
    borderWidth: 1, borderColor: C.border, borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: C.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  sheetHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 12,
  },
  sheetIconBox: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: C.gold },
  sheetCloseBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.surfaceUp, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },

  // ── Inbox Card ──
  inboxCard: {
    borderRadius: 16, padding: 16, marginBottom: 12, marginTop: 8,
    borderLeftWidth: 4, borderWidth: 1, borderColor: C.border,
  },
  inboxCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  inboxTypeIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  inboxTypeText: { fontSize: 11, fontWeight: '800', flex: 1, letterSpacing: 0.8 },
  inboxDate: { fontSize: 10, color: C.textMuted },
  inboxFlagTitle: { fontSize: 15, fontWeight: '800', color: C.gold, marginBottom: 6 },
  inboxMsg: { fontSize: 13, color: C.textSec, lineHeight: 19, marginBottom: 12 },
  markReadBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  markReadText: { fontSize: 12, color: C.textMuted, fontWeight: '700' },

  // ── Print Modal ──
  printTargetCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceUp, borderRadius: 16, padding: 16,
    marginBottom: 24, borderWidth: 1, borderColor: C.border, marginTop: 20,
  },
  printTargetIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  printTargetName: { fontSize: 16, fontWeight: '800', color: C.gold },
  printTargetSub:  { fontSize: 12, color: C.textMuted, marginTop: 4 },

  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5, marginBottom: 10 },

  qtyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceUp, borderRadius: 16,
    padding: 6, marginBottom: 24, borderWidth: 1, borderColor: C.border,
  },
  qtyBtn: {
    width: 56, height: 56, backgroundColor: C.surface,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  qtyInput: { flex: 1, fontSize: 24, fontWeight: '900', color: C.gold, textAlign: 'center' },

  // ── Product Form ──
  imagePicker: {
    width: '100%', height: 150,
    backgroundColor: C.surfaceUp, borderRadius: 18, marginBottom: 24, marginTop: 8,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    borderStyle: 'dashed', borderWidth: 2, borderColor: C.border,
  },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', gap: 10 },
  uploadIconRing: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  imagePickerText: { color: C.gold, fontSize: 14, fontWeight: '700' },

  inputRow: { flexDirection: 'row', gap: 14 },

  floatOuter: { marginBottom: 18 },
  floatLabel: {
    fontSize: 10, fontWeight: '800', color: C.textMuted,
    letterSpacing: 1.2, marginBottom: 8,
  },
  floatWrap: {
    backgroundColor: C.surfaceUp, borderRadius: 14,
    borderWidth: 1.5, paddingHorizontal: 16, height: 52,
    justifyContent: 'center',
  },
  floatInput: { fontSize: 15, color: C.gold },

  barcodeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceUp, borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    paddingRight: 6, height: 52,
  },
  barcodeInput: { flex: 1, fontSize: 14, color: C.gold, paddingHorizontal: 16 },
  genBtn: {
    width: 38, height: 38, backgroundColor: C.gold,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.gold, paddingVertical: 16, borderRadius: 14,
    marginBottom: 12,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { color: C.navy, fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.surfaceUp, paddingVertical: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.gold + '44',
  },
  secondaryBtnText: { color: C.gold, fontWeight: '800', fontSize: 15 },

  // ── Merchant Detail Modal ──
  centerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  detailCard: {
    backgroundColor: C.surface, width: '100%', maxWidth: 340,
    borderRadius: 28, padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, ...C.shadow,
  },
  detailAvatarWrap: { alignItems: 'center', marginBottom: 22, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: C.border, width: '100%' },
  detailAvatar: {
    width: 76, height: 76, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: C.border,
  },
  detailAvatarText: { fontSize: 28, fontWeight: '900' },
  detailName: { fontSize: 22, fontWeight: '900', color: C.gold, marginBottom: 8 },
  merchantRoleBadge: {
    backgroundColor: C.goldBg, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: C.gold + '44',
  },
  merchantRoleText: { fontSize: 11, color: C.gold, fontWeight: '800', letterSpacing: 0.8 },

  detailStatsRow: {
    flexDirection: 'row', width: '100%',
    backgroundColor: C.surfaceUp, borderRadius: 18,
    padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: C.border,
  },
  detailStatBox:    { flex: 1, alignItems: 'center' },
  detailStatDivider:{ width: 1, backgroundColor: C.border, marginHorizontal: 10 },
  detailStatLabel:  { fontSize: 9, color: C.textMuted, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  detailStatVal:    { fontSize: 20, fontWeight: '900', color: C.gold },
  detailStatValSm:  { fontSize: 15, fontWeight: '700', color: C.gold, marginTop: 3 },

  banBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', padding: 16, borderRadius: 14,
    borderWidth: 1, gap: 8,
  },
  banText: { fontWeight: '800', fontSize: 15 },

  // ── Alert ──
  alertOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center', padding: 30,
  },
  alertContainer: {
    backgroundColor: C.surface, width: '100%',
    borderRadius: 24, padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, ...C.shadow,
  },
  alertIconRing: {
    width: 64, height: 64, borderRadius: 20, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  alertTitle:   { fontSize: 20, fontWeight: '900', color: C.gold, marginBottom: 8, textAlign: 'center' },
  alertMessage: { fontSize: 13, color: C.textSec, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  alertBtnRow:  { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.surfaceUp, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  alertBtnCancelText:  { fontWeight: '700', color: C.textSec, fontSize: 14 },
  alertBtnConfirm:     { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  alertBtnConfirmText: { fontWeight: '800', color: C.navy, fontSize: 14 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.textSec },
  emptyDesc:  { fontSize: 13, color: C.textMuted, textAlign: 'center', maxWidth: 240 },
});