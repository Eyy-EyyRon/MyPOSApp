import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, Modal, TextInput, StatusBar, 
  SafeAreaView, Platform, RefreshControl, Image, ActivityIndicator, Animated 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker'; 
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics'; 

// ✅ BUCKET NAME
const BUCKET_NAME = 'product-images'; 

const COLORS = {
  primary: '#0e0b4d', secondary: '#1E1B4B', accent: '#F59E0B',
  success: '#10B981', danger: '#EF4444', dark: '#111827',       
  gray: '#9CA3AF', light: '#F3F4F6', white: '#FFFFFF',
  cardShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }
};

// ✨ FANCY ALERT COMPONENT
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
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
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
            <TouchableOpacity style={styles.alertBtnCancel} onPress={onCancel}>
              <Text style={styles.alertBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertBtnConfirm, { backgroundColor: type === 'danger' ? COLORS.danger : COLORS.primary }]} onPress={onConfirm}>
              <Text style={styles.alertBtnConfirmText}>{type === 'danger' ? "Delete" : "Confirm"}</Text>
            </TouchableOpacity>
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
  
  // Data
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [myStore, setMyStore] = useState(null);

  // Forms
  const [modalVisible, setModalVisible] = useState(false);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  
  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // State for Editing
  const [editingId, setEditingId] = useState(null); 

  // Inputs
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodImage, setProdImage] = useState(null); 
  
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');

  // Merchant Detail Stats
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [merchantStats, setMerchantStats] = useState({ totalSales: 0, lastActive: 'Never' });
  const [statsLoading, setStatsLoading] = useState(false);

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

  // --- 📸 PICKER WITH CROP (Native Editor) ---
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission Denied', 'Please allow access to your photos.');
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true, // ✅ ENABLED: This opens the Crop tool
        aspect: [1, 1],      // ✅ FORCE SQUARE: Locks crop box to square
        quality: 0.8,        // Good quality for thumbnails
      });

      if (!result.canceled) {
        setProdImage(result.assets[0].uri);
      }
    } catch (error) {
      console.log("Picker Error:", error);
      Alert.alert("Gallery Error", "Could not open gallery.");
    }
  };

  // --- ☁️ UPLOAD (FormData) ---
  const uploadImageToSupabase = async (uri) => {
    try {
      if (!uri || !uri.startsWith('file://')) return uri; 

      const fileExt = uri.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`; 

      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        name: fileName,
        type: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
      });

      console.log(`Uploading to: ${BUCKET_NAME}`);

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, formData);

      if (error) throw error;

      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      return urlData.publicUrl;

    } catch (error) {
      console.log("Upload Failed:", error);
      Alert.alert("Upload Failed", error.message || "Network Error");
      return null;
    }
  };

  // --- ACTIONS ---
  const openAddModal = () => {
    setEditingId(null); 
    setProdName(''); setProdPrice(''); setProdStock(''); setProdImage(null);
    setModalVisible(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id); 
    setProdName(item.name);
    setProdPrice(item.price ? item.price.toString() : '');
    const currentStock = item.stock_quantity !== undefined ? item.stock_quantity : item.stock;
    setProdStock(currentStock ? currentStock.toString() : '0');
    setProdImage(item.image_url); 
    setModalVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!prodName || !prodPrice || !prodStock) return Alert.alert("Error", "Fill all fields");
    setLoading(true);

    let publicUrl = prodImage; 
    
    if (prodImage && prodImage.startsWith('file://')) {
       publicUrl = await uploadImageToSupabase(prodImage);
       if (!publicUrl) {
         setLoading(false);
         return; 
       }
    }

    const productData = {
      name: prodName,
      price: parseFloat(prodPrice),
      stock: parseInt(prodStock), 
      stock_quantity: parseInt(prodStock),
      store_name: myStore,
      image_url: publicUrl
    };

    let error;
    if (editingId) {
      const { error: updateError } = await supabase.from('products').update(productData).eq('id', editingId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('products').insert([productData]);
      error = insertError;
    }

    if (error) Alert.alert("Error", error.message);
    else {
      setModalVisible(false);
      fetchData();
    }
    setLoading(false);
  };

  const confirmDelete = (id) => {
    setItemToDelete(id);
    setAlertVisible(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setAlertVisible(false);
    await supabase.from('products').delete().eq('id', itemToDelete);
    setItemToDelete(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    fetchData();
  };

  const handleAddStaff = async () => {
    if (!staffEmail || !staffPassword || !staffName) return Alert.alert("Error", "Fill all fields");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: staffEmail, password: staffPassword,
      options: { data: { first_name: staffName, store_name: myStore.trim(), role: 'merchant', status: 'active' } }
    });
    if (error) Alert.alert("Error", error.message);
    else { Alert.alert("Success", "Account created!"); setStaffModalVisible(false); fetchData(); }
    setLoading(false);
  };

  const openMerchantDetails = async (merchant) => {
    setSelectedMerchant(merchant);
    setDetailModalVisible(true);
    setStatsLoading(true);
    try {
      const { data: sales } = await supabase.from('sales').select('total_amount, sale_date').eq('store_name', myStore).eq('cashier_name', merchant.first_name);
      const total = (sales || []).reduce((sum, s) => sum + s.total_amount, 0);
      const lastSale = sales && sales.length > 0 ? new Date(Math.max(...sales.map(s => new Date(s.sale_date)))).toLocaleDateString() : "No sales yet";
      setMerchantStats({ totalSales: total, lastActive: lastSale });
    } catch (e) { console.log(e); } finally { setStatsLoading(false); }
  };

  const toggleStaffStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
    setStaff(staff.map(s => s.id === id ? { ...s, status: newStatus } : s));
    if (selectedMerchant?.id === id) setSelectedMerchant(prev => ({ ...prev, status: newStatus }));
  };

  // --- RENDERERS ---
  const renderProduct = ({ item }) => (
    <View style={styles.cardRow}>
      <View style={styles.iconBox}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.prodThumb} />
        ) : (
          <Ionicons name="cube-outline" size={24} color={COLORS.primary} />
        )}
      </View>
      <View style={{flex: 1, paddingHorizontal: 12}}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Text style={styles.rowSub}>Stock: {item.stock_quantity ?? item.stock} • ₱{item.price}</Text>
      </View>
      
      {/* Edit Button */}
      <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
         <View style={styles.editBadge}>
            <Ionicons name="pencil" size={16} color="#FFF" />
         </View>
      </TouchableOpacity>
      
      {/* Delete Button */}
      <TouchableOpacity onPress={() => confirmDelete(item.id)} style={styles.actionBtn}>
        <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );

  const renderStaff = ({ item }) => (
    <TouchableOpacity style={styles.cardRow} onPress={() => openMerchantDetails(item)}>
      <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}>
        <Text style={{fontSize: 18, fontWeight: 'bold', color: COLORS.primary}}>{item.first_name[0]}</Text>
      </View>
      <View style={{flex: 1, paddingHorizontal: 12}}>
        <Text style={styles.rowTitle}>{item.first_name}</Text>
        <Text style={[styles.rowSub, { color: item.status === 'active' ? COLORS.success : COLORS.danger }]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{myStore || "Manager Dashboard"}</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'inventory' && styles.activeTab]} onPress={() => setActiveTab('inventory')}>
            <Text style={[styles.tabText, activeTab === 'inventory' && styles.activeTabText]}>Inventory</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'staff' && styles.activeTab]} onPress={() => setActiveTab('staff')}>
            <Text style={[styles.tabText, activeTab === 'staff' && styles.activeTabText]}>My Staff</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTENT */}
      <View style={styles.body}>
        {activeTab === 'inventory' ? (
          <>
            <View style={styles.listHeader}>
               <Text style={styles.listTitle}>Products ({products.length})</Text>
               <TouchableOpacity style={styles.addBtnSmall} onPress={openAddModal}>
                 <Ionicons name="add" size={20} color="#fff" />
                 <Text style={styles.addBtnText}>Add Item</Text>
               </TouchableOpacity>
            </View>
            <FlatList 
              data={products} renderItem={renderProduct} keyExtractor={item => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          </>
        ) : (
          <>
            <View style={styles.listHeader}>
               <Text style={styles.listTitle}>Merchants ({staff.length})</Text>
               <TouchableOpacity style={styles.addBtnSmall} onPress={() => setStaffModalVisible(true)}>
                 <Ionicons name="person-add" size={18} color="#fff" />
                 <Text style={styles.addBtnText}>Register</Text>
               </TouchableOpacity>
            </View>
            <FlatList 
              data={staff} renderItem={renderStaff} keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          </>
        )}
      </View>

      {/* ✨ FANCY ALERT */}
      <CustomAlert 
        visible={alertVisible} 
        title="Delete Product?" 
        message="This action cannot be undone. Are you sure you want to remove this item?" 
        onCancel={() => setAlertVisible(false)}
        onConfirm={handleDelete}
        type="danger"
      />

      {/* MODAL: ADD/EDIT PRODUCT */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? "Edit Product" : "New Product"}</Text>
            
            <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn}>
               {prodImage ? (
                 <Image source={{ uri: prodImage }} style={styles.imagePreview} />
               ) : (
                 <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={30} color={COLORS.gray} />
                    <Text style={styles.imageText}>Upload Image</Text>
                 </View>
               )}
            </TouchableOpacity>

            <TextInput placeholder="Product Name" style={styles.input} value={prodName} onChangeText={setProdName} />
            <TextInput placeholder="Price (₱)" style={styles.input} keyboardType="numeric" value={prodPrice} onChangeText={setProdPrice} />
            <TextInput placeholder="Stock Qty" style={styles.input} keyboardType="numeric" value={prodStock} onChangeText={setProdStock} />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={{color: COLORS.gray}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProduct}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{color: '#fff', fontWeight: 'bold'}}>{editingId ? "Update" : "Save"}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ADD STAFF */}
      <Modal visible={staffModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Register Merchant</Text>
            <TextInput placeholder="Full Name" style={styles.input} value={staffName} onChangeText={setStaffName} />
            <TextInput placeholder="Email Address" style={styles.input} autoCapitalize="none" value={staffEmail} onChangeText={setStaffEmail} />
            <TextInput placeholder="Password" style={styles.input} secureTextEntry value={staffPassword} onChangeText={setStaffPassword} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStaffModalVisible(false)}><Text style={{color: COLORS.gray}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddStaff}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{color: '#fff', fontWeight: 'bold'}}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: MERCHANT DETAILS */}
      <Modal visible={detailModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailCard}>
             <View style={styles.detailHeader}>
                <View style={styles.detailAvatar}><Text style={{fontSize: 24, fontWeight: 'bold', color: '#fff'}}>{selectedMerchant?.first_name?.[0]}</Text></View>
                <Text style={styles.detailName}>{selectedMerchant?.first_name} {selectedMerchant?.last_name}</Text>
                <Text style={styles.detailRole}>Merchant</Text>
             </View>
             <View style={styles.statsRow}>
                <View style={styles.statBox}><Text style={styles.statLabel}>Total Sales</Text><Text style={styles.statNum}>₱{merchantStats.totalSales.toLocaleString()}</Text></View>
                <View style={styles.statBox}><Text style={styles.statLabel}>Last Active</Text><Text style={styles.statNum}>{merchantStats.lastActive}</Text></View>
             </View>
             <TouchableOpacity style={[styles.banBtn, { backgroundColor: selectedMerchant?.status === 'active' ? '#FEF2F2' : '#ECFDF5' }]} onPress={() => toggleStaffStatus(selectedMerchant.id, selectedMerchant.status)}>
               <Text style={[styles.banText, { color: selectedMerchant?.status === 'active' ? COLORS.danger : COLORS.success }]}>{selectedMerchant?.status === 'active' ? "Revoke Access (Ban)" : "Activate Account"}</Text>
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
  header: { backgroundColor: COLORS.primary, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 15 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  tabContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  activeTabText: { color: COLORS.primary, fontWeight: 'bold' },
  body: { flex: 1, padding: 20 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  listTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  addBtnSmall: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignItems: 'center', gap: 4 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, ...COLORS.cardShadow },
  iconBox: { width: 50, height: 50, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  prodThumb: { width: '100%', height: '100%' }, 
  rowTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  rowSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  actionBtn: { padding: 8, marginLeft: 5 },
  editBadge: { backgroundColor: COLORS.primary, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, 
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 350, borderRadius: 20, padding: 25 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginBottom: 10 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16 },
  imagePickerBtn: { width: '100%', height: 150, backgroundColor: '#F3F4F6', borderRadius: 12, marginBottom: 15, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderStyle: 'dashed', borderWidth: 1, borderColor: '#D1D5DB' },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center' },
  imageText: { color: COLORS.gray, marginTop: 5, fontSize: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  cancelBtn: { padding: 12 },
  saveBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  detailCard: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 24, padding: 25, alignItems: 'center' },
  detailHeader: { alignItems: 'center', marginBottom: 20 },
  detailAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 10, ...COLORS.cardShadow },
  detailName: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  detailRole: { fontSize: 14, color: COLORS.gray },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 20, backgroundColor: '#F9FAFB', padding: 15, borderRadius: 16 },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 4 },
  statNum: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  banBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 15, borderRadius: 12, marginBottom: 15, gap: 8 },
  banText: { fontWeight: 'bold' },
  closeDetailBtn: { padding: 10 },

  // Fancy Alert
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertContainer: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 24, padding: 24, alignItems: 'center', ...COLORS.cardShadow },
  alertIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  alertTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginBottom: 8, textAlign: 'center' },
  alertMessage: { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  alertBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.light, alignItems: 'center' },
  alertBtnCancelText: { fontWeight: 'bold', color: COLORS.gray },
  alertBtnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertBtnConfirmText: { fontWeight: 'bold', color: '#fff' },
});