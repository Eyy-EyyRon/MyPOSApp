import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, TextInput, StatusBar, 
  SafeAreaView, Platform, RefreshControl, Image, ActivityIndicator, Animated, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker'; 
import * as Haptics from 'expo-haptics'; 
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library'; 
import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'product-images'; 
const LOW_STOCK_THRESHOLD = 5; 

const COLORS = {
  primary: '#0e0b4d', secondary: '#1E1B4B', accent: '#F59E0B',
  success: '#10B981', danger: '#EF4444', dark: '#111827',       
  gray: '#9CA3AF', light: '#F3F4F6', lighter: '#F9FAFB', white: '#FFFFFF',
  cardShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  modalShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 }
};

// ... (CustomAlert component remains same)
const CustomAlert = ({ visible, title, message, onCancel, onConfirm, type = 'danger' }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();
    } else { scaleAnim.setValue(0); opacityAnim.setValue(0); }
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.alertOverlay}>
        <Animated.View style={[styles.alertContainer, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <View style={[styles.alertIconCircle, { backgroundColor: type === 'danger' ? '#FEF2F2' : '#EFF6FF' }]}>
            <Ionicons name={type === 'danger' ? "trash" : "information-circle"} size={32} color={type === 'danger' ? COLORS.danger : COLORS.primary} />
          </View>
          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>
          <View style={styles.alertBtnRow}>
            <TouchableOpacity style={styles.alertBtnCancel} onPress={onCancel}><Text style={styles.alertBtnCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.alertBtnConfirm, { backgroundColor: type === 'danger' ? COLORS.danger : COLORS.primary }]} onPress={onConfirm}><Text style={styles.alertBtnConfirmText}>{type === 'danger' ? "Delete" : "Confirm"}</Text></TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default function ManagerScreen() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [myStore, setMyStore] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [editingId, setEditingId] = useState(null); 

  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodBarcode, setProdBarcode] = useState(''); 
  const [prodImage, setProdImage] = useState(null); 
  
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');

  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [merchantStats, setMerchantStats] = useState({ totalSales: 0, lastActive: 'Never' });
  const [statsLoading, setStatsLoading] = useState(false);
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  // --- 🔄 REAL-TIME SYNC LOGIC ---
  useEffect(() => {
    if (!myStore) return;

    // Listen for any UPDATE to the products table for this specific store
    const productSubscription = supabase
      .channel('inventory-sync')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'products', filter: `store_name=eq.${myStore}` }, 
        (payload) => {
           // When a Merchant sells, update the local state immediately
           setProducts(currentProducts => 
             currentProducts.map(p => p.id === payload.new.id ? payload.new : p)
           );
        }
      )
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'products', filter: `store_name=eq.${myStore}` }, 
        () => fetchData() // Re-fetch on new items
      )
      .subscribe();

    return () => { supabase.removeChannel(productSubscription); };
  }, [myStore]);

  useFocusEffect(
    useCallback(() => { fetchData(); }, [])
  );

  const fetchData = async () => {
    try {
      if (refreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('store_name').eq('id', user.id).single();
      if (profile) {
        setMyStore(profile.store_name);
        const { data: prods } = await supabase.from('products').select('*').eq('store_name', profile.store_name).order('name');
        setProducts(prods || []);
        const { data: staffMembers } = await supabase.from('profiles').select('*').eq('store_name', profile.store_name).eq('role', 'merchant');
        setStaff(staffMembers || []);
      }
    } catch (e) { console.log(e); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // --- ACTIONS ---
  const generateBarcode = () => Math.floor(100000000000 + Math.random() * 900000000000).toString();
  const handleAutoGenerate = () => { setProdBarcode(generateBarcode()); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const handleDownloadBarcode = async (item) => {
    if (!item.barcode) return Alert.alert("No Barcode", "First generate a barcode.");
    if (!permissionResponse || permissionResponse.status !== 'granted') {
        const { status } = await requestPermission();
        if (status !== 'granted') return Alert.alert("Permission Required", "Gallery access required.");
    }
    try {
        setLoading(true);
        const barcodeApiUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=3&rotate=N&includetext&backgroundcolor=ffffff`;
        const sanitizedName = item.name.replace(/[^a-zA-Z0-9]/g, '_');
        const fileUri = FileSystem.documentDirectory + `${sanitizedName}_barcode.png`;
        const { uri } = await FileSystem.downloadAsync(barcodeApiUrl, fileUri);
        const asset = await MediaLibrary.createAssetAsync(uri);
        await MediaLibrary.createAlbumAsync("Inventory Barcodes", asset, false);
        Alert.alert("Saved!", "Barcode saved to gallery.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { Alert.alert("Save Failed", "Could not save image."); } finally { setLoading(false); }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Access photos required.');
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setProdImage(result.assets[0].uri);
  };

  const uploadImageToSupabase = async (uri) => {
    try {
      if (!uri || !uri.startsWith('file://')) return uri; 
      const fileName = `${Date.now()}.png`;
      const formData = new FormData();
      formData.append('file', { uri: uri, name: fileName, type: `image/png` });
      const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, formData);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (error) { return null; }
  };

  const openAddModal = () => { setEditingId(null); setProdName(''); setProdPrice(''); setProdStock(''); setProdBarcode(generateBarcode()); setProdImage(null); setModalVisible(true); };
  
  const openEditModal = (item) => { 
    setEditingId(item.id); 
    setProdName(item.name); 
    setProdPrice(item.price.toString()); 
    // 🔥 SYNC: Use the field updated by Merchant
    const currentStock = item.stock ?? item.stock_quantity ?? 0;
    setProdStock(currentStock.toString()); 
    setProdBarcode(item.barcode || generateBarcode()); 
    setProdImage(item.image_url); 
    setModalVisible(true); 
  };

  const handleSaveProduct = async () => {
    if (!prodName || !prodPrice || !prodStock) return Alert.alert("Error", "Fill all fields");
    setLoading(true);
    let publicUrl = prodImage; 
    if (prodImage && prodImage.startsWith('file://')) { publicUrl = await uploadImageToSupabase(prodImage); if (!publicUrl) { setLoading(false); return; } }
    
    const productData = { 
        name: prodName, 
        price: parseFloat(prodPrice), 
        stock: parseInt(prodStock), 
        stock_quantity: parseInt(prodStock), // 🔥 Update both to stay in sync
        store_name: myStore, 
        barcode: prodBarcode, 
        image_url: publicUrl 
    };

    const { error } = editingId ? await supabase.from('products').update(productData).eq('id', editingId) : await supabase.from('products').insert([productData]);
    if (error) Alert.alert("Error", error.message); else { setModalVisible(false); fetchData(); }
    setLoading(false);
  };

  const confirmDelete = (id) => { setItemToDelete(id); setAlertVisible(true); };
  const handleDelete = async () => { if (!itemToDelete) return; setAlertVisible(false); await supabase.from('products').delete().eq('id', itemToDelete); setItemToDelete(null); fetchData(); };

  const handleAddStaff = async () => {
    if (!staffEmail || !staffPassword || !staffName) return Alert.alert("Error", "Fill all fields");
    setLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.rpc('create_user_by_manager', { new_email: staffEmail, new_password: staffPassword, new_first_name: staffName, new_last_name: "Staff", new_store_name: myStore, manager_id: user.id });
        if (error) throw error;
        Alert.alert("Success", "Merchant Account created!");
        setStaffModalVisible(false); fetchData(); 
    } catch (error) { Alert.alert("Error", error.message); } finally { setLoading(false); }
  };

  const openMerchantDetails = async (merchant) => {
    setSelectedMerchant(merchant); setDetailModalVisible(true); setStatsLoading(true);
    const { data: sales } = await supabase.from('sales').select('total_amount, sale_date').eq('store_name', myStore).eq('cashier_name', merchant.first_name);
    const total = (sales || []).reduce((sum, s) => sum + s.total_amount, 0);
    const lastSale = sales?.length > 0 ? new Date(Math.max(...sales.map(s => new Date(s.sale_date)))).toLocaleDateString() : "No sales";
    setMerchantStats({ totalSales: total, lastActive: lastSale }); setStatsLoading(false);
  };

  const toggleStaffStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
    setStaff(staff.map(s => s.id === id ? { ...s, status: newStatus } : s));
  };

  const renderProduct = ({ item }) => {
    // 🔥 REAL-TIME STOCK LOGIC
    const stock = item.stock ?? item.stock_quantity ?? 0;
    const isOutOfStock = stock <= 0;
    const isLowStock = stock > 0 && stock < LOW_STOCK_THRESHOLD;

    return (
        <View style={[styles.cardRow, isOutOfStock && { borderColor: COLORS.danger, borderWidth: 1.5, backgroundColor: '#FFF5F5' }]}>
          <View style={styles.iconBox}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.prodThumb} /> : <Ionicons name="cube-outline" size={24} color={COLORS.primary} />}</View>
          <View style={{flex: 1, paddingHorizontal: 12}}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={[
                styles.rowSub, 
                isOutOfStock ? { color: COLORS.danger, fontWeight: 'bold' } : 
                isLowStock ? { color: COLORS.accent, fontWeight: 'bold' } : null
            ]}>
              {isOutOfStock ? "SOLD OUT" : isLowStock ? `LOW STOCK: ${stock}` : `Stock: ${stock}`} • ₱{item.price}
            </Text>
            {item.barcode && <Text style={styles.barcodeText}>||| {item.barcode}</Text>}
          </View>
          <TouchableOpacity onPress={() => handleDownloadBarcode(item)} style={styles.actionBtn}><View style={styles.downloadBadge}><Ionicons name="download-outline" size={16} color={COLORS.dark} /></View></TouchableOpacity>
          <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}><View style={styles.editBadge}><Ionicons name="pencil" size={16} color="#FFF" /></View></TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete(item.id)} style={styles.actionBtn}><Ionicons name="trash-outline" size={22} color={COLORS.danger} /></TouchableOpacity>
        </View>
    );
  };

  const renderStaff = ({ item }) => (
    <TouchableOpacity style={styles.cardRow} onPress={() => openMerchantDetails(item)}>
      <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}><Text style={{fontSize: 18, fontWeight: 'bold', color: COLORS.primary}}>{item.first_name?.[0] || '?'}</Text></View>
      <View style={{flex: 1, paddingHorizontal: 12}}><Text style={styles.rowTitle}>{item.first_name}</Text><Text style={[styles.rowSub, { color: item.status === 'active' ? COLORS.success : COLORS.danger }]}>{item.status ? item.status.toUpperCase() : 'UNKNOWN'}</Text></View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{myStore || "Manager Dashboard"}</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'inventory' && styles.activeTab]} onPress={() => setActiveTab('inventory')}><Text style={[styles.tabText, activeTab === 'inventory' && styles.activeTabText]}>Inventory</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'staff' && styles.activeTab]} onPress={() => setActiveTab('staff')}><Text style={[styles.tabText, activeTab === 'staff' && styles.activeTabText]}>My Staff</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {activeTab === 'inventory' ? (
          <>
            <View style={styles.listHeader}><Text style={styles.listTitle}>Products ({products.length})</Text><TouchableOpacity style={styles.addBtnSmall} onPress={openAddModal}><Ionicons name="add" size={20} color="#fff" /><Text style={styles.addBtnText}>Add Item</Text></TouchableOpacity></View>
            <FlatList data={products} renderItem={renderProduct} keyExtractor={item => item.id.toString()} contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} />
          </>
        ) : (
          <>
            <View style={styles.listHeader}><Text style={styles.listTitle}>Merchants ({staff.length})</Text><TouchableOpacity style={styles.addBtnSmall} onPress={() => setStaffModalVisible(true)}><Ionicons name="person-add" size={18} color="#fff" /><Text style={styles.addBtnText}>Register</Text></TouchableOpacity></View>
            <FlatList data={staff} renderItem={renderStaff} keyExtractor={item => item.id} contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} />
          </>
        )}
      </View>

      <CustomAlert visible={alertVisible} title="Delete Product?" message="Are you sure you want to remove this item?" onCancel={() => setAlertVisible(false)} onConfirm={handleDelete} type="danger" />

      {/* MODALS RETAINED FROM PREVIOUS STATE... */}
      <Modal visible={modalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{editingId ? "Edit Item" : "Add New Item"}</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity></View>
            <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn}>{prodImage ? <Image source={{ uri: prodImage }} style={styles.imagePreview} /> : <View style={styles.imagePlaceholder}><Ionicons name="cloud-upload-outline" size={32} color={COLORS.primary} /><Text style={styles.imageText}>Tap to upload image</Text></View>}</TouchableOpacity>
            <TextInput placeholder="Product Name" placeholderTextColor={COLORS.gray} style={styles.input} value={prodName} onChangeText={setProdName} />
            <View style={{flexDirection:'row', gap: 12}}><TextInput placeholder="Price" placeholderTextColor={COLORS.gray} style={[styles.input, {flex:1}]} keyboardType="numeric" value={prodPrice} onChangeText={setProdPrice} /><TextInput placeholder="Qty" placeholderTextColor={COLORS.gray} style={[styles.input, {flex:1}]} keyboardType="numeric" value={prodStock} onChangeText={setProdStock} /></View>
            <View style={styles.barcodeRow}><View style={styles.barcodeInputContainer}><Ionicons name="barcode-outline" size={20} color={COLORS.gray} /><TextInput placeholder="Barcode" placeholderTextColor={COLORS.gray} style={styles.barcodeInput} value={prodBarcode} onChangeText={setProdBarcode} keyboardType="numeric" /></View><TouchableOpacity style={styles.generateBtn} onPress={handleAutoGenerate}><Ionicons name="refresh" size={20} color="#fff" /></TouchableOpacity></View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProduct}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingId ? "Update Product" : "Save Product"}</Text>}</TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={staffModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Add New Merchant</Text><TouchableOpacity onPress={() => setStaffModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity></View>
            <View style={styles.inputIconContainer}><Ionicons name="person-outline" size={20} color={COLORS.gray} style={{marginRight:10}} /><TextInput placeholder="Full Name" placeholderTextColor={COLORS.gray} style={styles.inputPlain} value={staffName} onChangeText={setStaffName} /></View>
            <View style={styles.inputIconContainer}><Ionicons name="mail-outline" size={20} color={COLORS.gray} style={{marginRight:10}} /><TextInput placeholder="Email Address" placeholderTextColor={COLORS.gray} style={styles.inputPlain} autoCapitalize="none" value={staffEmail} onChangeText={setStaffEmail} /></View>
            <View style={styles.inputIconContainer}><Ionicons name="lock-closed-outline" size={20} color={COLORS.gray} style={{marginRight:10}} /><TextInput placeholder="Temp Password" placeholderTextColor={COLORS.gray} style={styles.inputPlain} secureTextEntry value={staffPassword} onChangeText={setStaffPassword} /></View>
            <TouchableOpacity style={[styles.saveBtn, {marginTop: 10}]} onPress={handleAddStaff}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Create Account</Text>}</TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={detailModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                 <View style={styles.detailAvatar}><Text style={{fontSize: 28, fontWeight: 'bold', color: '#fff'}}>{selectedMerchant?.first_name?.[0]}</Text></View>
                 <Text style={styles.detailName}>{selectedMerchant?.first_name} {selectedMerchant?.last_name}</Text>
                 <View style={styles.roleBadge}><Text style={styles.detailRole}>Merchant Staff</Text></View>
              </View>
              <View style={styles.statsRow}>
                 <View style={styles.statBox}><Text style={styles.statLabel}>TOTAL SALES</Text><Text style={styles.statNum}>₱{merchantStats.totalSales.toLocaleString()}</Text></View>
                 <View style={[styles.statBox, {borderLeftWidth:1, borderLeftColor: '#E5E7EB'}]}><Text style={styles.statLabel}>LAST ACTIVE</Text><Text style={styles.statNum}>{merchantStats.lastActive}</Text></View>
              </View>
              <TouchableOpacity style={[styles.banBtn, { backgroundColor: selectedMerchant?.status === 'active' ? '#FEF2F2' : '#ECFDF5' }]} onPress={() => toggleStaffStatus(selectedMerchant.id, selectedMerchant.status)}>
                <Ionicons name={selectedMerchant?.status === 'active' ? "ban" : "checkmark-circle"} size={18} color={selectedMerchant?.status === 'active' ? COLORS.danger : COLORS.success} />
                <Text style={[styles.banText, { color: selectedMerchant?.status === 'active' ? COLORS.danger : COLORS.success }]}>{selectedMerchant?.status === 'active' ? "Revoke Access" : "Re-activate Account"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeDetailBtn} onPress={() => setDetailModalVisible(false)}><Text style={{color: COLORS.gray, fontWeight: 'bold'}}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: COLORS.primary, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 15, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  tabContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  activeTabText: { color: COLORS.primary, fontWeight: 'bold' },
  body: { flex: 1, padding: 20 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  listTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  addBtnSmall: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: 'center', gap: 6, ...COLORS.cardShadow },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10, ...COLORS.cardShadow },
  iconBox: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  prodThumb: { width: '100%', height: '100%' }, 
  rowTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  rowSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  barcodeText: { fontSize: 10, color: COLORS.gray, marginTop: 2, letterSpacing: 1 },
  actionBtn: { padding: 8, marginLeft: 5 },
  editBadge: { backgroundColor: COLORS.primary, width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' }, 
  downloadBadge: { backgroundColor: '#E0F2FE', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, ...COLORS.modalShadow },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16, color: COLORS.dark },
  inputIconContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, height: 50, marginBottom: 12 },
  inputPlain: { flex: 1, fontSize: 16, color: COLORS.dark, height: '100%' },
  barcodeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  barcodeInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12 },
  barcodeInput: { flex: 1, height: 50, fontSize: 16, marginLeft: 8 },
  generateBtn: { width: 50, height: 50, backgroundColor: COLORS.accent, borderRadius: 12, justifyContent: 'center', alignItems: 'center', ...COLORS.cardShadow },
  imagePickerBtn: { width: '100%', height: 160, backgroundColor: '#F9FAFB', borderRadius: 16, marginBottom: 20, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderStyle: 'dashed', borderWidth: 2, borderColor: '#E5E7EB' },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', opacity: 0.6 },
  imageText: { color: COLORS.primary, marginTop: 8, fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center', ...COLORS.cardShadow },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
  detailCard: { backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 28, padding: 30, alignItems: 'center', ...COLORS.modalShadow },
  detailHeader: { alignItems: 'center', marginBottom: 25 },
  detailAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12, ...COLORS.cardShadow },
  detailName: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark, marginBottom: 4 },
  roleBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailRole: { fontSize: 12, color: COLORS.primary, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 25, backgroundColor: '#F9FAFB', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 11, color: COLORS.gray, marginBottom: 6, fontWeight: 'bold', letterSpacing: 0.5 },
  statNum: { fontSize: 18, fontWeight: '900', color: COLORS.dark },
  banBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 16, borderRadius: 14, marginBottom: 10, gap: 8 },
  banText: { fontWeight: 'bold', fontSize: 15 },
  closeDetailBtn: { padding: 10, marginTop: 5 },
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertContainer: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 24, padding: 24, alignItems: 'center', ...COLORS.modalShadow },
  alertIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  alertTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginBottom: 8, textAlign: 'center' },
  alertMessage: { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  alertBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.light, alignItems: 'center' },
  alertBtnCancelText: { fontWeight: 'bold', color: COLORS.gray },
  alertBtnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertBtnConfirmText: { fontWeight: 'bold', color: '#fff' },
});